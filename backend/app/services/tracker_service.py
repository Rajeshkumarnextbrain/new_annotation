from typing import List, Dict, Any, Tuple
import cv2
import numpy as np


def interpolate_track_boxes(
    frames: List[Dict[str, Any]],
    keyframes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Linearly interpolate bounding boxes between consecutive keyframes for a track_id.
    """
    if len(keyframes) < 2:
        return []

    frame_idx_by_id = {f["id"]: f["frame_index"] for f in frames}
    frame_id_by_idx = {f["frame_index"]: f["id"] for f in frames}

    kfs = sorted(keyframes, key=lambda k: frame_idx_by_id.get(k["frame_id"], 0))
    results: List[Dict[str, Any]] = []

    for i in range(len(kfs) - 1):
        k1 = kfs[i]
        k2 = kfs[i + 1]
        idx1 = frame_idx_by_id.get(k1["frame_id"])
        idx2 = frame_idx_by_id.get(k2["frame_id"])
        if idx1 is None or idx2 is None or idx2 <= idx1 + 1:
            continue

        span = idx2 - idx1
        for f_idx in range(idx1 + 1, idx2):
            fid = frame_id_by_idx.get(f_idx)
            if fid is None:
                continue
            t = (f_idx - idx1) / span
            x = k1["x"] + (k2["x"] - k1["x"]) * t
            y = k1["y"] + (k2["y"] - k1["y"]) * t
            w = k1["w"] + (k2["w"] - k1["w"]) * t
            h = k1["h"] + (k2["h"] - k1["h"]) * t
            results.append(
                {
                    "frame_id": fid,
                    "class_id": k1["class_id"],
                    "x": max(0.0, min(1.0, round(x, 6))),
                    "y": max(0.0, min(1.0, round(y, 6))),
                    "w": max(0.001, min(1.0, round(w, 6))),
                    "h": max(0.001, min(1.0, round(h, 6))),
                    "track_id": k1["track_id"],
                }
            )
    return results


def _create_cv_tracker():
    """Return OpenCV CSRT tracker (best appearance accuracy) or KCF fallback."""
    for creator_name in ["TrackerCSRT_create", "TrackerKCF_create"]:
        creator = getattr(cv2, creator_name, None)
        if creator is not None:
            return creator()
    legacy = getattr(cv2, "legacy", None)
    if legacy is not None:
        for creator_name in ["TrackerCSRT_create", "TrackerKCF_create"]:
            creator = getattr(legacy, creator_name, None)
            if creator is not None:
                return creator()
    return None


def _find_motion_peak_box(
    prev_gray: np.ndarray,
    curr_gray: np.ndarray,
    bx: float,
    by: float,
    bw: float,
    bh: float,
    vel: Tuple[float, float],
) -> Tuple[bool, Tuple[float, float, float, float]]:
    """
    Find the best fixed-size (bw, bh) window in the search area where foreground motion
    (absdiff) is concentrated. Never blows up box size and never locks onto static pavement.
    """
    fh, fw = curr_gray.shape[:2]
    vx, vy = vel
    pred_x = bx + vx
    pred_y = by + vy

    pad_x = max(60, int(bw * 1.5))
    pad_y = max(40, int(bh * 0.8))
    sx0 = max(0, int(pred_x - pad_x))
    sy0 = max(0, int(pred_y - pad_y))
    sx1 = min(fw, int(pred_x + bw + pad_x))
    sy1 = min(fh, int(pred_y + bh + pad_y))

    kw = max(6, int(round(bw)))
    kh = max(6, int(round(bh)))
    if sx1 - sx0 <= kw or sy1 - sy0 <= kh:
        return False, (bx, by, bw, bh)

    g1 = cv2.GaussianBlur(prev_gray[sy0:sy1, sx0:sx1], (5, 5), 0)
    g2 = cv2.GaussianBlur(curr_gray[sy0:sy1, sx0:sx1], (5, 5), 0)
    diff = cv2.absdiff(g1, g2)
    _, mask = cv2.threshold(diff, 20, 255, cv2.THRESH_BINARY)
    mask_f = mask.astype(np.float32) / 255.0

    # boxFilter computes average motion density inside every (kw, kh) window
    density = cv2.boxFilter(mask_f, -1, (kw, kh), normalize=True, borderType=cv2.BORDER_CONSTANT)

    # Valid top-left region inside search_roi
    half_w = kw // 2
    half_h = kh // 2
    valid = density[half_h : density.shape[0] - (kw * 0 + (kh - half_h)), half_w : density.shape[1] - (kw - half_w)]
    if valid.size == 0:
        return False, (bx, by, bw, bh)

    min_val, max_val, _, max_loc = cv2.minMaxLoc(valid)
    # Require at least 6% moving pixels inside the box to confirm an actual moving object
    if max_val < 0.06:
        return False, (bx, by, bw, bh)

    best_cx = sx0 + half_w + max_loc[0]
    best_cy = sy0 + half_h + max_loc[1]
    nx = max(0.0, min(float(fw - kw), float(best_cx - kw / 2.0)))
    ny = max(0.0, min(float(fh - kh), float(best_cy - kh / 2.0)))
    return True, (nx, ny, bw, bh)


def track_forward_opencv(
    frames: List[Dict[str, Any]],
    source_frame_id: int,
    source_ann: Dict[str, Any],
    num_frames: int = 10,
) -> List[Dict[str, Any]]:
    """
    Propagate a bounding box forward across subsequent frames using OpenCV CSRT/KCF
    with automatic motion-peak recovery when low-FPS jumps cause background lock.
    """
    pos = next((i for i, f in enumerate(frames) if f["id"] == source_frame_id), None)
    if pos is None or pos + 1 >= len(frames):
        return []

    src_frame = frames[pos]
    img0 = cv2.imread(src_frame["file_path"])
    if img0 is None:
        return []

    ih, iw = img0.shape[:2]
    bx = float(int(source_ann["x"] * iw))
    by = float(int(source_ann["y"] * ih))
    bw = float(max(6, int(source_ann["w"] * iw)))
    bh = float(max(6, int(source_ann["h"] * ih)))
    init_w, init_h = bw, bh

    tracker = _create_cv_tracker()
    if tracker is not None:
        tracker.init(img0, (int(bx), int(by), int(bw), int(bh)))

    prev_gray = cv2.cvtColor(img0, cv2.COLOR_BGR2GRAY)
    curr_box = (bx, by, bw, bh)
    vel = (0.0, 0.0)

    tracked: List[Dict[str, Any]] = []
    target_frames = frames[pos + 1 : pos + 1 + num_frames]

    for f in target_frames:
        img = cv2.imread(f["file_path"])
        if img is None:
            break
        fh, fw = img.shape[:2]
        curr_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        tx, ty, tw, th = curr_box
        ok = False
        if tracker is not None:
            ok, tbox = tracker.update(img)
            if ok:
                tx, ty, tw, th = map(float, tbox)

        # Check if tracker stayed frozen on static background while motion occurred nearby
        shift = ((tx - curr_box[0]) ** 2 + (ty - curr_box[1]) ** 2) ** 0.5
        if (not ok) or shift < 2.0:
            m_ok, m_box = _find_motion_peak_box(
                prev_gray, curr_gray, curr_box[0], curr_box[1], init_w, init_h, vel
            )
            if m_ok:
                m_shift = ((m_box[0] - curr_box[0]) ** 2 + (m_box[1] - curr_box[1]) ** 2) ** 0.5
                if (not ok) or m_shift >= 4.0:
                    tx, ty, tw, th = m_box
                    ok = True
                    # Re-initialize CSRT/KCF at the new position
                    tracker = _create_cv_tracker()
                    if tracker is not None:
                        tracker.init(img, (int(tx), int(ty), int(tw), int(th)))

        if not ok:
            break

        # Clamp size within 0.80x - 1.20x of initial box
        cx = tx + tw / 2.0
        cy = ty + th / 2.0
        tw = max(6.0, max(init_w * 0.80, min(init_w * 1.20, tw)))
        th = max(6.0, max(init_h * 0.80, min(init_h * 1.20, th)))
        tx = max(0.0, min(float(fw) - tw, cx - tw / 2.0))
        ty = max(0.0, min(float(fh) - th, cy - th / 2.0))

        vel = (tx - curr_box[0], ty - curr_box[1])
        curr_box = (tx, ty, tw, th)
        prev_gray = curr_gray

        nx = max(0.0, min(0.998, tx / fw))
        ny = max(0.0, min(0.998, ty / fh))
        nw = max(0.002, min(1.0 - nx, tw / fw))
        nh = max(0.002, min(1.0 - ny, th / fh))

        tracked.append(
            {
                "frame_id": f["id"],
                "class_id": source_ann["class_id"],
                "x": round(nx, 6),
                "y": round(ny, 6),
                "w": round(nw, 6),
                "h": round(nh, 6),
                "track_id": source_ann.get("track_id"),
            }
        )

    return tracked
