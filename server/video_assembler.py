import subprocess
import os
import tempfile
import time
import shutil
import urllib.request
from pathlib import Path

class VideoAssembler:
    def __init__(self, output_dir='./output'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True, parents=True)
    
    def run_ffmpeg(self, args: list, progress_callback=None) -> bool:
        cmd = ['ffmpeg', '-y'] + args
        print("Running: ", " ".join(cmd))
        try:
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
            for line in process.stdout:
                pass
            process.wait()
            return process.returncode == 0
        except Exception as e:
            print(f"FFmpeg error: {e}")
            return False
        
    def _download_if_remote(self, img_path: str) -> str:
        if img_path and (img_path.startswith("http://") or img_path.startswith("https://")):
            local_file = tempfile.mktemp(suffix='.jpg', dir=str(self.output_dir))
            try:
                urllib.request.urlretrieve(img_path, local_file)
                return local_file
            except Exception as e:
                print(f"Failed to download remote image {img_path}: {e}")
                return ""
        return img_path

    def apply_ken_burns(self, image_path: str, duration: float, effect: str = 'zoom_in') -> str:
        image_path = self._download_if_remote(image_path)
        if not image_path or not os.path.exists(image_path):
            # Create a blank fallback clip
            return self.create_title_card("Scene", "", duration)
            
        temp_out = tempfile.mktemp(suffix='.mp4', dir=str(self.output_dir))
        
        if effect == 'zoom_in':
            vf = f"scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.0015,1.3)':d={int(duration*25)}:s=1920x1080"
        else:
            vf = f"scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.3':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int(duration*25)}:s=1920x1080"
            
        args = [
            '-loop', '1',
            '-i', image_path,
            '-vf', vf,
            '-c:v', 'libx264',
            '-t', str(duration),
            '-pix_fmt', 'yuv420p',
            '-r', '25',
            temp_out
        ]
        self.run_ffmpeg(args)
        return temp_out

    def create_title_card(self, title: str, subtitle: str, duration: float = 2.0) -> str:
        temp_out = tempfile.mktemp(suffix='.mp4', dir=str(self.output_dir))
        # Escaped drawtext for safety
        safe_title = title.replace("'", "").replace(":", "")
        args = [
            '-f', 'lavfi',
            '-i', f'color=c=black:s=1920x1080:d={duration}',
            '-vf', f"drawtext=text='{safe_title}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2",
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            temp_out
        ]
        self.run_ffmpeg(args)
        return temp_out

    def create_outro_card(self, channel_name: str, duration: float = 5.0) -> str:
        temp_out = tempfile.mktemp(suffix='.mp4', dir=str(self.output_dir))
        safe_name = channel_name.replace("'", "").replace(":", "")
        args = [
            '-f', 'lavfi',
            '-i', f'color=c=black:s=1920x1080:d={duration}',
            '-vf', f"drawtext=text='Subscribe to {safe_name}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2",
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            temp_out
        ]
        self.run_ffmpeg(args)
        return temp_out

    def add_text_overlay(self, video_path: str, text: str, position: str, duration: float) -> str:
        temp_out = tempfile.mktemp(suffix='.mp4', dir=str(self.output_dir))
        safe_text = text.replace("'", "").replace(":", "")
        args = [
            '-i', video_path,
            '-vf', f"drawtext=text='{safe_text}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=50:shadowcolor=black:shadowx=2:shadowy=2",
            '-c:a', 'copy',
            temp_out
        ]
        self.run_ffmpeg(args)
        return temp_out

    def concatenate_clips(self, clip_paths: list, output_path: str) -> str:
        concat_file = tempfile.mktemp(suffix='.txt', dir=str(self.output_dir))
        with open(concat_file, 'w') as f:
            for p in clip_paths:
                f.write(f"file '{os.path.abspath(p)}'\n")
        
        args = [
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file,
            '-c', 'copy',
            output_path
        ]
        self.run_ffmpeg(args)
        if os.path.exists(concat_file):
            os.remove(concat_file)
        return output_path

    def add_audio_ducking(self, video_path: str, narration_path: str, bg_music_path: str = None) -> str:
        temp_out = tempfile.mktemp(suffix='.mp4', dir=str(self.output_dir))
        if bg_music_path and os.path.exists(bg_music_path):
            args = [
                '-i', video_path,
                '-i', narration_path,
                '-i', bg_music_path,
                '-filter_complex', '[2:a]volume=0.2[bg];[1:a][bg]amix=inputs=2:duration=first[aout]',
                '-map', '0:v',
                '-map', '[aout]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-shortest',
                temp_out
            ]
        else:
            args = [
                '-i', video_path,
                '-i', narration_path,
                '-map', '0:v',
                '-map', '1:a',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-shortest',
                temp_out
            ]
        self.run_ffmpeg(args)
        return temp_out

    def create_episode_video(
        self, 
        panels: list, 
        audio_path: str, 
        output_path: str,
        title: str,
        bg_music_path: str = None,
        progress_callback = None
    ) -> str:
        
        clips = []
        
        # 1. Title
        title_clip = self.create_title_card(title, "Episode 1", 2.0)
        clips.append(title_clip)
        
        # 2. Panels
        total_panels = len(panels) or 1
        for i, panel in enumerate(panels):
            p_img = panel.get('image_path') or panel.get('url')
            p_dur = panel.get('duration', 3.0)
            effect = 'zoom_in' if i % 2 == 0 else 'zoom_out'
            clip = self.apply_ken_burns(p_img, p_dur, effect)
            if clip:
                clips.append(clip)
            if progress_callback:
                progress_callback(int(((i + 1) / total_panels) * 50))
                
        # 3. Outro
        outro_clip = self.create_outro_card("ManhwaForge", 5.0)
        clips.append(outro_clip)
        
        # 4. Concat
        concat_out = tempfile.mktemp(suffix='.mp4', dir=str(self.output_dir))
        self.concatenate_clips(clips, concat_out)
        
        if progress_callback:
            progress_callback(75)
            
        # 5. Add audio
        final_video = concat_out
        if audio_path and os.path.exists(audio_path):
            audio_out = self.add_audio_ducking(concat_out, audio_path, bg_music_path)
            if os.path.exists(audio_out) and os.path.getsize(audio_out) > 0:
                final_video = audio_out
            
        shutil.copy(final_video, output_path)
            
        if progress_callback:
            progress_callback(100)
            
        # Cleanup temp clips
        for c in clips:
            if os.path.exists(c):
                try: os.remove(c)
                except: pass
        if os.path.exists(concat_out):
            try: os.remove(concat_out)
            except: pass
            
        return output_path

