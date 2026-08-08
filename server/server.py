from fastapi import FastAPI, BackgroundTasks, WebSocket, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import asyncio
import uuid
import os
import json
import urllib.request
from pathlib import Path
from scraper import WebtoonScraper
from video_assembler import VideoAssembler
from tts_engine import TTSEngine
from youtube_uploader import YouTubeUploader

app = FastAPI(title='ManhwaForge Backend', version='1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage
jobs = {}
logs = []
connected_clients = []

TEMP_DIR = Path("./temp")
TEMP_DIR.mkdir(exist_ok=True)
OUTPUT_DIR = Path("./output")
OUTPUT_DIR.mkdir(exist_ok=True)

scraper = WebtoonScraper()
assembler = VideoAssembler(output_dir=str(OUTPUT_DIR))
tts = TTSEngine()
uploader = YouTubeUploader()

async def broadcast_log(msg: str):
    logs.append(msg)
    # keep log size manageable
    if len(logs) > 500:
        logs.pop(0)
    for client in list(connected_clients):
        try:
            await client.send_text(json.dumps({"log": msg}))
        except:
            if client in connected_clients:
                connected_clients.remove(client)

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0"}

@app.get("/api/scrape-stories")
def scrape_stories(site: str = "Webtoons"):
    try:
        results = scraper.scrape_site(site)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def run_video_job(job_id: str, data: dict, loop: asyncio.AbstractEventLoop):
    jobs[job_id] = {"status": "processing", "progress": 0, "videoPath": None, "error": None}
    try:
        await broadcast_log(f"Job {job_id} started.")
        
        panels = data.get("panels", [])
        audio_path = data.get("audio_path")
        title = data.get("story_title", "Untitled Story")
        
        def progress_cb(pct):
            jobs[job_id]["progress"] = pct
            loop.call_soon_threadsafe(
                asyncio.create_task,
                broadcast_log(f"Job {job_id} progress: {pct}%")
            )

        output_file = str(OUTPUT_DIR / f"{job_id}.mp4")
        
        result_path = await loop.run_in_executor(
            None,
            assembler.create_episode_video,
            panels,
            audio_path,
            output_file,
            title,
            data.get("bg_music_path"),
            progress_cb
        )
        
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["videoPath"] = result_path
        await broadcast_log(f"Job {job_id} completed successfully.")
        
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        await broadcast_log(f"Job {job_id} failed: {str(e)}")

@app.post("/api/create-video")
async def create_video(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    job_id = str(uuid.uuid4())
    loop = asyncio.get_running_loop()
    background_tasks.add_task(run_video_job, job_id, data, loop)
    return {"jobId": job_id}

@app.get("/api/video-status/{job_id}")
def video_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@app.get("/api/download-video/{job_id}")
def download_video(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    path = jobs[job_id]["videoPath"]
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Video file not found or not ready")
    return FileResponse(path, media_type="video/mp4", filename=f"{job_id}.mp4")

@app.post("/api/upload-assets")
async def upload_assets(files: list[UploadFile] = File(...)):
    saved_paths = []
    for file in files:
        file_path = TEMP_DIR / file.filename
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        saved_paths.append(str(file_path))
    return {"paths": saved_paths}

@app.post("/api/tts")
async def create_tts(request: Request):
    data = await request.json()
    text = data.get("text", "")
    voice = data.get("voice", "female")
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
        
    out_path = str(TEMP_DIR / f"{uuid.uuid4()}.mp3")
    try:
        final_path = tts.generate_speech(text, voice, out_path)
        return FileResponse(final_path, media_type="audio/mpeg", filename=os.path.basename(final_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload-youtube")
async def upload_youtube(request: Request):
    data = await request.json()
    video_path = data.get("videoPath")
    metadata = data.get("metadata", {})
    
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=400, detail="Invalid video path")
        
    try:
        uploader.authenticate()
        res = uploader.upload_video(
            video_path=video_path,
            title=metadata.get("title", "Manhwa Recap"),
            description=metadata.get("description", ""),
            tags=metadata.get("tags", []),
            privacy_status=metadata.get("privacy", "private"),
            publish_at=metadata.get("publishAt")
        )
        return {"success": True, "result": res}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/yt-refresh-token")
async def refresh_youtube_token(request: Request):
    """Proxy Google token refresh to avoid CORS restrictions in browser."""
    data = await request.json()
    try:
        req_data = json.dumps({
            "client_id": data.get("client_id", ""),
            "client_secret": data.get("client_secret", ""),
            "refresh_token": data.get("refresh_token", ""),
            "grant_type": "refresh_token"
        }).encode('utf-8')
        
        req = urllib.request.Request(
            "https://oauth2.googleapis.com/token",
            data=req_data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as response:
            resp_body = response.read().decode('utf-8')
            return JSONResponse(content=json.loads(resp_body))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    try:
        for log in logs[-50:]:
            await websocket.send_text(json.dumps({"log": log}))
        while True:
            await websocket.receive_text()
    except:
        if websocket in connected_clients:
            connected_clients.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)

