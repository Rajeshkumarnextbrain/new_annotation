import json
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Tuple
import cv2
import numpy as np


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"}


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
