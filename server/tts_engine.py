import requests
import os
import tempfile
import subprocess
import wave
import math
import struct
from pathlib import Path

class TTSEngine:
    def __init__(self, deepgram_key=None, groq_key=None):
        self.deepgram_key = deepgram_key or os.getenv("DEEPGRAM_API_KEY")
        self.groq_key = groq_key or os.getenv("GROQ_API_KEY")
        self.temp_dir = Path("./temp_audio")
        self.temp_dir.mkdir(exist_ok=True)
    
    def generate_speech(self, text: str, voice: str = 'female', output_path: str = None) -> str:
        if not output_path:
            output_path = str(self.temp_dir / "tts_output.mp3")
            
        audio_bytes = None
        if self.deepgram_key:
            try:
                audio_bytes = self.deepgram_tts(text)
            except Exception as e:
                print(f"Deepgram failed: {e}")
                
        if not audio_bytes and self.groq_key:
            try:
                audio_bytes = self.groq_tts(text)
            except Exception as e:
                print(f"Groq failed: {e}")
                
        if not audio_bytes:
            try:
                audio_bytes = self.gtts_tts(text)
            except Exception as e:
                print(f"gTTS failed: {e}, using fallback tone/wav")
                audio_bytes = self.fallback_tone_tts(text)
            
        with open(output_path, "wb") as f:
            f.write(audio_bytes)
            
        return output_path
    
    def deepgram_tts(self, text: str, model: str = 'aura-asteria-en') -> bytes:
        if not self.deepgram_key:
            raise ValueError("No Deepgram key")
        url = f"https://api.deepgram.com/v1/speak?model={model}"
        headers = {
            "Authorization": f"Token {self.deepgram_key}",
            "Content-Type": "application/json"
        }
        res = requests.post(url, headers=headers, json={"text": text}, timeout=10)
        res.raise_for_status()
        return res.content
    
    def groq_tts(self, text: str, voice: str = 'Fritz-PlayAI') -> bytes:
        if not self.groq_key:
            raise ValueError("No Groq key")
        url = "https://api.groq.com/openai/v1/audio/speech"
        headers = {
            "Authorization": f"Bearer {self.groq_key}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "playai-tts",
            "input": text,
            "voice": voice
        }
        res = requests.post(url, headers=headers, json=data, timeout=10)
        res.raise_for_status()
        return res.content
    
    def gtts_tts(self, text: str) -> bytes:
        from gtts import gTTS
        tts = gTTS(text=text, lang='en', slow=False)
        temp_file = tempfile.mktemp(suffix='.mp3')
        tts.save(temp_file)
        with open(temp_file, "rb") as f:
            data = f.read()
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return data

    def fallback_tone_tts(self, text: str) -> bytes:
        """Generates a clean 3-second soft audio beep/wav file as fallback."""
        temp_file = tempfile.mktemp(suffix='.wav')
        sample_rate = 22050
        duration_sec = max(2.0, min(10.0, len(text) * 0.08))
        num_samples = int(sample_rate * duration_sec)
        
        with wave.open(temp_file, 'w') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            for i in range(num_samples):
                # Gentle 440Hz sine wave
                value = int(1000 * math.sin(2 * math.pi * 440 * i / sample_rate))
                wav_file.writeframesraw(struct.pack('<h', value))
                
        with open(temp_file, "rb") as f:
            data = f.read()
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return data
    
    def split_text_chunks(self, text: str, max_chars: int = 1000) -> list:
        sentences = text.replace('!', '.').replace('?', '.').split('.')
        chunks = []
        current = ""
        for s in sentences:
            if len(current) + len(s) < max_chars:
                current += s + "."
            else:
                if current:
                    chunks.append(current.strip())
                current = s + "."
        if current:
            chunks.append(current.strip())
        return [c for c in chunks if c]
    
    def concatenate_audio(self, audio_files: list, output_path: str) -> str:
        concat_file = tempfile.mktemp(suffix='.txt', dir=str(self.temp_dir))
        with open(concat_file, 'w') as f:
            for p in audio_files:
                f.write(f"file '{os.path.abspath(p)}'\n")
        
        args = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file,
            '-c', 'copy',
            output_path
        ]
        subprocess.run(args, check=True)
        if os.path.exists(concat_file):
            os.remove(concat_file)
        return output_path

