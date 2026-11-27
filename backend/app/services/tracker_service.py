from typing import List, Dict, Any
import cv2


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


def _create_kcf_tracker():
    """Create OpenCV KCF tracker (matching reference script)."""
    for creator_name in ["TrackerKCF_create", "TrackerCSRT_create"]:
        creator = getattr(cv2, creator_name, None)
        if creator is not None:
            return creator()
    legacy = getattr(cv2, "legacy", None)
    if legacy is not None:
        for creator_name in ["TrackerKCF_create", "TrackerCSRT_create"]:
            creator = getattr(legacy, creator_name, None)
            if creator is not None:
                return creator()
    raise RuntimeError("OpenCV KCF tracker is not available; install opencv-contrib-python-headless")


def track_forward_opencv(
    frames: List[Dict[str, Any]],
    source_frame_id: int,
    source_ann: Dict[str, Any],
    num_frames: int = 10,
) -> List[Dict[str, Any]]:
    """
    Propagate a bounding box forward across subsequent frames using pure OpenCV KCF
    (matching the user's reference LabelTracker mechanism).
    """
    pos = next((i for i, f in enumerate(frames) if f["id"] == source_frame_id), None)
    if pos is None or pos + 1 >= len(frames):
        return []

    src_frame = frames[pos]
    img0 = cv2.imread(src_frame["file_path"])
    if img0 is None:
        return []

    ih, iw = img0.shape[:2]
    xmin = int(source_ann["x"] * iw)
    ymin = int(source_ann["y"] * ih)
    w = max(4, int(source_ann["w"] * iw))
    h = max(4, int(source_ann["h"] * ih))

    tracker = _create_kcf_tracker()
    tracker.init(img0, (xmin, ymin, w, h))

    tracked: List[Dict[str, Any]] = []
    target_frames = frames[pos + 1 : pos + 1 + num_frames]

    for f in target_frames:
        next_image = cv2.imread(f["file_path"])
        if next_image is None:
            break
        fh, fw = next_image.shape[:2]

        success, bbox = tracker.update(next_image.copy())
        if not success:
            break

        bx, by, bw, bh = map(int, bbox)
        nx = max(0.0, min(0.998, bx / fw))
        ny = max(0.0, min(0.998, by / fh))
        nw = max(0.002, min(1.0 - nx, bw / fw))
        nh = max(0.002, min(1.0 - ny, bh / fh))

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
