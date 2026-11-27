import json
import subprocess
import threading
from pathlib import Path
from typing import Dict, Any, List, Tuple
import cv2
import numpy as np

from ..database import DATA_DIR

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"}
BROWSER_CODECS = {"h264", "vp8", "vp9", "av1"}
BROWSER_PIX_FMTS = {"yuv420p", "yuvj420p", ""}
BROWSER_CONTAINERS = {".mp4", ".m4v", ".webm"}

_preview_lock = threading.Lock()
_preview_jobs: Dict[int, Dict[str, Any]] = {}
_codec_cache: Dict[str, bool] = {}


def probe_video(file_path: str) -> Dict[str, Any]:
    """Extract duration, fps, total_frames, width, height via OpenCV (with ffprobe fallback)."""
    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        raise ValueError(f"Unable to open video: {file_path}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    cap.release()

    duration = (total_frames / fps) if fps > 0 and total_frames > 0 else 0.0

    # Try ffprobe for more accurate duration if needed
    try:
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            file_path,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if res.returncode == 0:
            info = json.loads(res.stdout)
            fmt_dur = float(info.get("format", {}).get("duration") or 0)
            if fmt_dur > 0:
                duration = fmt_dur
            for s in info.get("streams", []):
                if s.get("codec_type") == "video":
                    width = int(s.get("width") or width)
                    height = int(s.get("height") or height)
                    r_fps = s.get("r_frame_rate", "0/1")
                    if "/" in r_fps:
                        num, den = r_fps.split("/")
                        if float(den) > 0:
                            parsed_fps = float(num) / float(den)
                            if parsed_fps > 0:
                                fps = parsed_fps
                    break
    except Exception:
        pass

    if fps <= 0:
        fps = 30.0
    if total_frames <= 0 and duration > 0:
        total_frames = int(duration * fps)

    return {
        "duration": round(duration, 3),
        "fps": round(fps, 3),
        "total_frames": total_frames,
        "width": width,
        "height": height,
    }


def _hist_similarity(img1: np.ndarray, img2: np.ndarray) -> float:
    """Fast grayscale histogram correlation for near-duplicate frame detection."""
    g1 = cv2.cvtColor(cv2.resize(img1, (160, 90)), cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(cv2.resize(img2, (160, 90)), cv2.COLOR_BGR2GRAY)
    h1 = cv2.calcHist([g1], [0], None, [64], [0, 256])
    h2 = cv2.calcHist([g2], [0], None, [64], [0, 256])
    cv2.normalize(h1, h1)
    cv2.normalize(h2, h2)
    return float(cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL))


def extract_clip_frames(
    video_path: str,
    start_sec: float,
    end_sec: float,
    out_dir: Path,
    mode: str = "fps",
    value: float = 2.0,
    skip_duplicates: bool = False,
    dup_threshold: float = 0.985,
    start_index: int = 0,
    progress_cb=None,
) -> List[Tuple[int, str, int, int]]:
    """
    Use FFmpeg fast-seeking to extract frames for [start_sec, end_sec] into out_dir,
    then optionally filter near-duplicate frames.
    Returns list of (frame_index, file_path, width, height).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = max(0.05, end_sec - start_sec)

    # Probe fps for every_n mode
    meta = probe_video(video_path)
    src_fps = meta["fps"] if meta["fps"] > 0 else 30.0

    if mode == "all":
        vf_filter = None
    elif mode == "fps":
        vf_filter = f"fps={value}"
    else:
        step = max(1, int(round(value)))
        vf_filter = f"select=not(mod(n\\,{step}))"

    temp_dir = out_dir / "_tmp_extract"
    temp_dir.mkdir(parents=True, exist_ok=True)
    # Clean any stale temp files
    for old in temp_dir.glob("*.jpg"):
        old.unlink(missing_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_sec:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        video_path,
    ]
    if vf_filter:
        cmd.extend(["-vf", vf_filter, "-vsync", "vfr" if mode == "every_n" else "cfr"])
    cmd.extend([
        "-q:v",
        "2",
        str(temp_dir / "raw_%06d.jpg"),
    ])
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg extraction failed: {res.stderr[-500:]}")

    raw_files = sorted(temp_dir.glob("raw_*.jpg"))
    total_raw = len(raw_files)
    saved: List[Tuple[int, str, int, int]] = []
    prev_img = None
    idx = start_index

    for i, rf in enumerate(raw_files):
        img = cv2.imread(str(rf))
        if img is None:
            rf.unlink(missing_ok=True)
            continue

        if skip_duplicates and prev_img is not None:
            sim = _hist_similarity(prev_img, img)
            if sim >= dup_threshold:
                rf.unlink(missing_ok=True)
                if progress_cb and total_raw > 0:
                    progress_cb((i + 1) / total_raw)
                continue

        h, w = img.shape[:2]
        final_name = f"frame_{idx:06d}.jpg"
        final_path = out_dir / final_name
        rf.rename(final_path)
        saved.append((idx, str(final_path), w, h))
        prev_img = img
        idx += 1

        if progress_cb and total_raw > 0:
            progress_cb((i + 1) / total_raw)

    # Remove temp dir
    try:
        temp_dir.rmdir()
    except OSError:
        pass

    return saved


def get_preview_path(video_id: int) -> Path:
    preview_dir = DATA_DIR / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    return preview_dir / f"video_{video_id}.mp4"


def delete_preview(video_id: int) -> None:
    with _preview_lock:
        _preview_jobs.pop(video_id, None)
    p = get_preview_path(video_id)
    p.unlink(missing_ok=True)
    p.with_suffix(".tmp.mp4").unlink(missing_ok=True)


def is_browser_playable(file_path: str) -> bool:
    """Return True if the video container/codec/pixel-format plays natively in HTML5 <video>."""
    if file_path in _codec_cache:
        return _codec_cache[file_path]

    p = Path(file_path)
    if p.suffix.lower() not in BROWSER_CONTAINERS:
        _codec_cache[file_path] = False
        return False

    playable = False
    try:
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,pix_fmt",
            file_path,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if res.returncode == 0:
            streams = json.loads(res.stdout).get("streams", [])
            if streams:
                codec = (streams[0].get("codec_name") or "").lower()
                pix_fmt = (streams[0].get("pix_fmt") or "").lower()
                playable = codec in BROWSER_CODECS and pix_fmt in BROWSER_PIX_FMTS
    except Exception:
        playable = False

    _codec_cache[file_path] = playable
    return playable


def _transcode_preview_worker(video_id: int, file_path: str, preview_path: Path) -> None:
    tmp_path = preview_path.with_suffix(".tmp.mp4")
    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            file_path,
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale=min(1280\\,iw):-2",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "26",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(tmp_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0 or not tmp_path.exists() or tmp_path.stat().st_size == 0:
            err = (res.stderr or "FFmpeg transcode failed")[-300:]
            tmp_path.unlink(missing_ok=True)
            with _preview_lock:
                _preview_jobs[video_id] = {"status": "error", "error": err}
            return

        tmp_path.replace(preview_path)
        with _preview_lock:
            _preview_jobs[video_id] = {"status": "ready", "path": str(preview_path)}
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        with _preview_lock:
            _preview_jobs[video_id] = {"status": "error", "error": str(exc)[:300]}


def ensure_browser_preview(video_id: int, file_path: str) -> Dict[str, Any]:
    """
    Ensure a browser-playable MP4 exists for video_id.
    Returns {'status': 'ready', 'path': ...} or {'status': 'transcoding'} or {'status': 'error', 'error': ...}.
    """
    if is_browser_playable(file_path):
        return {"status": "ready", "path": file_path}

    preview_path = get_preview_path(video_id)
    with _preview_lock:
        job = _preview_jobs.get(video_id)
        if job and job.get("status") == "transcoding":
            return {"status": "transcoding"}
        if preview_path.exists() and preview_path.stat().st_size > 0:
            _preview_jobs[video_id] = {"status": "ready", "path": str(preview_path)}
            return {"status": "ready", "path": str(preview_path)}
        _preview_jobs[video_id] = {"status": "transcoding"}

    t = threading.Thread(
        target=_transcode_preview_worker,
        args=(video_id, file_path, preview_path),
        daemon=True,
    )
    t.start()
    return {"status": "transcoding"}
