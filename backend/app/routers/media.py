import shutil
import threading
import uuid
from pathlib import Path
from typing import List
import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..database import DATA_DIR, db_session
from ..models import ExtractClipsRequest, FolderImportRequest, VideoLinkRequest
from ..services.video_service import IMAGE_EXTS, VIDEO_EXTS, extract_clip_frames, probe_video

router = APIRouter(prefix="/api/projects/{project_id}", tags=["media"])


def _project_media_dir(project_id: int) -> Path:
    p = DATA_DIR / f"project_{project_id}"
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.get("/sequences")
def list_sequences(project_id: int):
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT s.*,
                (SELECT COUNT(*) FROM frames f WHERE f.sequence_id = s.id) AS frame_count,
                (SELECT COUNT(DISTINCT f.id) FROM frames f JOIN annotations a ON a.frame_id = f.id WHERE f.sequence_id = s.id) AS annotated_frames
            FROM media_sequences s
            WHERE s.project_id = ?
            ORDER BY s.id DESC
            """,
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.delete("/sequences/{sequence_id}")
def delete_sequence(project_id: int, sequence_id: int):
    with db_session() as conn:
        row = conn.execute(
            "SELECT source_path FROM media_sequences WHERE id = ? AND project_id = ?",
            (sequence_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Sequence not found")
        conn.execute(
            "DELETE FROM media_sequences WHERE id = ? AND project_id = ?",
            (sequence_id, project_id),
        )
    src_path = Path(row["source_path"]).resolve() if row["source_path"] else None
    proj_dir = _project_media_dir(project_id).resolve()
    if src_path and src_path.exists() and proj_dir in src_path.parents:
        shutil.rmtree(src_path, ignore_errors=True)
    return {"ok": True}


@router.post("/import/images-upload")
async def upload_images(
    project_id: int,
    sequence_name: str = Form("Uploaded Images"),
    files: List[UploadFile] = File(...),
):
    seq_dir = _project_media_dir(project_id) / f"seq_{uuid.uuid4().hex[:8]}"
    seq_dir.mkdir(parents=True, exist_ok=True)

    saved_items = []
    for idx, uf in enumerate(files):
        ext = Path(uf.filename or "").suffix.lower()
        if ext not in IMAGE_EXTS:
            continue
        dest = seq_dir / f"{idx:06d}_{Path(uf.filename or 'img.jpg').name}"
        with open(dest, "wb") as out:
            shutil.copyfileobj(uf.file, out)
        img = cv2.imread(str(dest))
        if img is None:
            dest.unlink(missing_ok=True)
            continue
        h, w = img.shape[:2]
        saved_items.append((len(saved_items), dest.name, str(dest), w, h))

    if not saved_items:
        raise HTTPException(400, "No valid images found in upload")

    with db_session() as conn:
        cur = conn.execute(
            "INSERT INTO media_sequences (project_id, name, source_type, source_path) VALUES (?, ?, 'images', ?)",
            (project_id, sequence_name, str(seq_dir)),
        )
        seq_id = cur.lastrowid
        conn.executemany(
            "INSERT INTO frames (project_id, sequence_id, frame_index, filename, file_path, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(project_id, seq_id, fidx, fname, fpath, w, h) for fidx, fname, fpath, w, h in saved_items],
        )
    return {"sequence_id": seq_id, "imported_count": len(saved_items)}


@router.post("/import/folder")
def import_local_folder(project_id: int, payload: FolderImportRequest):
    folder = Path(payload.folder_path).expanduser()
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(400, f"Folder not found: {payload.folder_path}")

    files = sorted([p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS])
    if not files:
        raise HTTPException(400, "No supported image files found in folder")

    seq_name = payload.sequence_name or folder.name
    saved_items = []
    for fpath in files:
        img = cv2.imread(str(fpath))
        if img is None:
            continue
        h, w = img.shape[:2]
        saved_items.append((len(saved_items), fpath.name, str(fpath), w, h))

    if not saved_items:
        raise HTTPException(400, "Could not decode any images in folder")

    with db_session() as conn:
        cur = conn.execute(
            "INSERT INTO media_sequences (project_id, name, source_type, source_path) VALUES (?, ?, 'images', ?)",
            (project_id, seq_name, str(folder)),
        )
        seq_id = cur.lastrowid
        conn.executemany(
            "INSERT INTO frames (project_id, sequence_id, frame_index, filename, file_path, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(project_id, seq_id, fidx, fname, fpath, w, h) for fidx, fname, fpath, w, h in saved_items],
        )
    return {"sequence_id": seq_id, "imported_count": len(saved_items)}


@router.get("/videos")
def list_videos(project_id: int):
    with db_session() as conn:
        rows = conn.execute(
            "SELECT * FROM videos WHERE project_id = ? ORDER BY id DESC",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/videos/upload")
async def upload_videos(project_id: int, files: List[UploadFile] = File(...)):
    vid_dir = _project_media_dir(project_id) / "videos"
    vid_dir.mkdir(parents=True, exist_ok=True)
    created = []

    for uf in files:
        ext = Path(uf.filename or "").suffix.lower()
        if ext not in VIDEO_EXTS:
            continue
        dest = vid_dir / f"{uuid.uuid4().hex[:8]}_{Path(uf.filename or 'video.mp4').name}"
        with open(dest, "wb") as out:
            shutil.copyfileobj(uf.file, out)
        meta = probe_video(str(dest))
        with db_session() as conn:
            cur = conn.execute(
                """
                INSERT INTO videos (project_id, name, file_path, duration, fps, total_frames, width, height)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    project_id,
                    uf.filename or dest.name,
                    str(dest),
                    meta["duration"],
                    meta["fps"],
                    meta["total_frames"],
                    meta["width"],
                    meta["height"],
                ),
            )
            row = conn.execute("SELECT * FROM videos WHERE id = ?", (cur.lastrowid,)).fetchone()
            created.append(dict(row))

    if not created:
        raise HTTPException(400, "No valid video files uploaded")
    return created


@router.post("/videos/link")
def link_local_video(project_id: int, payload: VideoLinkRequest):
    p = Path(payload.file_path).expanduser()
    if not p.exists() or not p.is_file():
        raise HTTPException(400, f"Video file not found: {payload.file_path}")
    meta = probe_video(str(p))
    with db_session() as conn:
        cur = conn.execute(
            """
            INSERT INTO videos (project_id, name, file_path, duration, fps, total_frames, width, height)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                payload.name or p.name,
                str(p),
                meta["duration"],
                meta["fps"],
                meta["total_frames"],
                meta["width"],
                meta["height"],
            ),
        )
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


@router.delete("/videos/{video_id}")
def delete_video(project_id: int, video_id: int):
    with db_session() as conn:
        row = conn.execute(
            "SELECT file_path FROM videos WHERE id = ? AND project_id = ?",
            (video_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Video not found")
        conn.execute("DELETE FROM videos WHERE id = ? AND project_id = ?", (video_id, project_id))
    vid_path = Path(row["file_path"]).resolve() if row["file_path"] else None
    proj_dir = _project_media_dir(project_id).resolve()
    if vid_path and vid_path.exists() and proj_dir in vid_path.parents:
        vid_path.unlink(missing_ok=True)
    return {"ok": True}


def _run_extraction_job(job_id: str, project_id: int, video: dict, req: ExtractClipsRequest):
    try:
        with db_session() as conn:
            conn.execute("UPDATE extraction_jobs SET status = 'running', message = 'Extracting clips...' WHERE id = ?", (job_id,))

        total_clips = len(req.clips)
        extracted_total = 0

        if req.merge_clips:
            seq_dir = _project_media_dir(project_id) / f"clip_merged_{uuid.uuid4().hex[:8]}"
            seq_name = req.sequence_name or f"{video['name']} (Merged Clips)"
            with db_session() as conn:
                cur = conn.execute(
                    "INSERT INTO media_sequences (project_id, name, source_type, source_path, fps) VALUES (?, ?, 'video_merged', ?, ?)",
                    (project_id, seq_name, str(seq_dir), req.value if req.mode == "fps" else video["fps"]),
                )
                seq_id = cur.lastrowid

            next_idx = 0
            for ci, clip in enumerate(req.clips):
                def _cb(frac, ci=ci):
                    overall = (ci + frac) / max(1, total_clips)
                    with db_session() as conn:
                        conn.execute("UPDATE extraction_jobs SET progress = ? WHERE id = ?", (round(overall, 3), job_id))

                saved = extract_clip_frames(
                    video_path=video["file_path"],
                    start_sec=clip.start,
                    end_sec=clip.end,
                    out_dir=seq_dir,
                    mode=req.mode,
                    value=req.value,
                    skip_duplicates=req.skip_duplicates,
                    dup_threshold=req.dup_threshold,
                    start_index=next_idx,
                    progress_cb=_cb,
                )
                if saved:
                    next_idx = saved[-1][0] + 1
                    extracted_total += len(saved)
                    with db_session() as conn:
                        conn.executemany(
                            "INSERT INTO frames (project_id, sequence_id, frame_index, filename, file_path, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)",
                            [(project_id, seq_id, fidx, Path(fpath).name, fpath, w, h) for fidx, fpath, w, h in saved],
                        )
        else:
            for ci, clip in enumerate(req.clips):
                seq_dir = _project_media_dir(project_id) / f"clip_{uuid.uuid4().hex[:8]}"
                label = clip.label or f"{clip.start:.1f}s-{clip.end:.1f}s"
                seq_name = f"{req.sequence_name or video['name']} [{label}]"

                def _cb(frac, ci=ci):
                    overall = (ci + frac) / max(1, total_clips)
                    with db_session() as conn:
                        conn.execute("UPDATE extraction_jobs SET progress = ? WHERE id = ?", (round(overall, 3), job_id))

                saved = extract_clip_frames(
                    video_path=video["file_path"],
                    start_sec=clip.start,
                    end_sec=clip.end,
                    out_dir=seq_dir,
                    mode=req.mode,
                    value=req.value,
                    skip_duplicates=req.skip_duplicates,
                    dup_threshold=req.dup_threshold,
                    start_index=0,
                    progress_cb=_cb,
                )
                with db_session() as conn:
                    cur = conn.execute(
                        "INSERT INTO media_sequences (project_id, name, source_type, source_path, fps) VALUES (?, ?, 'video_clip', ?, ?)",
                        (project_id, seq_name, str(seq_dir), req.value if req.mode == "fps" else video["fps"]),
                    )
                    seq_id = cur.lastrowid
                    conn.executemany(
                        "INSERT INTO frames (project_id, sequence_id, frame_index, filename, file_path, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [(project_id, seq_id, fidx, Path(fpath).name, fpath, w, h) for fidx, fpath, w, h in saved],
                    )
                extracted_total += len(saved)

        with db_session() as conn:
            conn.execute(
                "UPDATE videos SET processed = 1 WHERE id = ?",
                (video["id"],),
            )
            conn.execute(
                "UPDATE extraction_jobs SET status = 'completed', progress = 1.0, extracted_frames = ?, message = ? WHERE id = ?",
                (extracted_total, f"Extracted {extracted_total} frames across {total_clips} clip(s).", job_id),
            )
    except Exception as e:
        with db_session() as conn:
            conn.execute(
                "UPDATE extraction_jobs SET status = 'failed', message = ? WHERE id = ?",
                (str(e)[:400], job_id),
            )


@router.post("/videos/extract-clips")
def start_clip_extraction(project_id: int, payload: ExtractClipsRequest):
    if not payload.clips:
        raise HTTPException(400, "At least one clip range is required")
    with db_session() as conn:
        vid = conn.execute(
            "SELECT * FROM videos WHERE id = ? AND project_id = ?",
            (payload.video_id, project_id),
        ).fetchone()
        if not vid:
            raise HTTPException(404, "Video not found")
        video_dict = dict(vid)
        job_id = uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO extraction_jobs (id, project_id, status, progress, message) VALUES (?, ?, 'pending', 0, 'Queued')",
            (job_id, project_id),
        )

    t = threading.Thread(target=_run_extraction_job, args=(job_id, project_id, video_dict, payload), daemon=True)
    t.start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/jobs/{job_id}")
def get_job_status(project_id: int, job_id: int | str):
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM extraction_jobs WHERE id = ? AND project_id = ?",
            (str(job_id), project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Job not found")
        return dict(row)
