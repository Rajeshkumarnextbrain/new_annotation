from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .database import db_session, init_db
from .routers import annotations, dataset, media, projects
from .services.video_service import ensure_browser_preview

app = FastAPI(title="YOLO Data Annotation Tool", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


app.include_router(projects.router)
app.include_router(media.router)
app.include_router(annotations.router)
app.include_router(dataset.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/media/frame/{frame_id}")
def serve_frame_image(frame_id: int):
    with db_session() as conn:
        row = conn.execute("SELECT file_path FROM frames WHERE id = ?", (frame_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Frame not found")
        p = Path(row["file_path"])
        if not p.exists():
            raise HTTPException(404, "Frame file missing on disk")
        return FileResponse(str(p))


@app.get("/api/media/video/{video_id}/status")
def get_video_playback_status(video_id: int):
    with db_session() as conn:
        row = conn.execute("SELECT file_path FROM videos WHERE id = ?", (video_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Video not found")
        p = Path(row["file_path"])
        if not p.exists():
            raise HTTPException(404, "Video file missing on disk")
    res = ensure_browser_preview(video_id, str(p))
    return {"status": res["status"], "error": res.get("error")}


@app.get("/api/media/video/{video_id}")
def serve_video_file(video_id: int):
    with db_session() as conn:
        row = conn.execute("SELECT file_path FROM videos WHERE id = ?", (video_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Video not found")
        p = Path(row["file_path"])
        if not p.exists():
            raise HTTPException(404, "Video file missing on disk")
    res = ensure_browser_preview(video_id, str(p))
    if res["status"] == "ready":
        return FileResponse(res["path"], media_type="video/mp4")
    if res["status"] == "error":
        raise HTTPException(500, res.get("error") or "Failed to prepare video preview")
    return JSONResponse({"status": "transcoding"}, status_code=202)
