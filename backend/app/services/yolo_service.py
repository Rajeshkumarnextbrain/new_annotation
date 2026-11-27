import io
import random
import shutil
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Any, Tuple
import yaml


def compute_splits(
    frames: List[Dict[str, Any]],
    annotations_by_frame: Dict[int, List[Dict[str, Any]]],
    train_ratio: float,
    val_ratio: float,
    test_ratio: float,
    stratified: bool = True,
    video_aware: bool = True,
    per_video_sequential: bool = True,
    seed: int = 42,
) -> Dict[int, str]:
    """
    Assign each frame_id to 'train', 'val', or 'test'.
    When per_video_sequential=True, splits EACH video/sequence sequentially in frame order
    (first train%, then val%, then test%) without random shuffling.
    """
    total_r = train_ratio + val_ratio + test_ratio
    if total_r <= 0:
        raise ValueError("Sum of split ratios must be > 0")
    tr = train_ratio / total_r
    vr = val_ratio / total_r

    assignments: Dict[int, str] = {}

    if per_video_sequential:
        groups: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        for f in frames:
            groups[f["sequence_id"]].append(f)
        for seq_id, seq_frames in groups.items():
            seq_sorted = sorted(seq_frames, key=lambda x: (x.get("frame_index", 0), x["id"]))
            n = len(seq_sorted)
            n_train = round(n * tr)
            n_val = round(n * vr)
            if n >= 1 and tr > 0 and n_train == 0:
                n_train = 1
            for i, f in enumerate(seq_sorted):
                if i < n_train:
                    assignments[f["id"]] = "train"
                elif i < n_train + n_val:
                    assignments[f["id"]] = "val"
                else:
                    assignments[f["id"]] = "test"
        return assignments

    rng = random.Random(seed)

    if video_aware:
        groups: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        for f in frames:
            groups[f["sequence_id"]].append(f)
        units = list(groups.values())
    else:
        units = [[f] for f in frames]

    def unit_primary_class(unit: List[Dict[str, Any]]) -> int:
        counts: Counter = Counter()
        for f in unit:
            for ann in annotations_by_frame.get(f["id"], []):
                counts[ann["class_id"]] += 1
        if not counts:
            return -1
        return counts.most_common(1)[0][0]

    if stratified:
        buckets: Dict[int, List[List[Dict[str, Any]]]] = defaultdict(list)
        for u in units:
            buckets[unit_primary_class(u)].append(u)
        for cls_key, bucket in buckets.items():
            rng.shuffle(bucket)
            n = len(bucket)
            n_train = round(n * tr)
            n_val = round(n * vr)
            # Ensure at least 1 in train if n >= 1 and tr > 0
            if n >= 1 and tr > 0 and n_train == 0:
                n_train = 1
            for i, u in enumerate(bucket):
                if i < n_train:
                    split_name = "train"
                elif i < n_train + n_val:
                    split_name = "val"
                else:
                    split_name = "test"
                for f in u:
                    assignments[f["id"]] = split_name
    else:
        rng.shuffle(units)
        n = len(units)
        n_train = round(n * tr)
        n_val = round(n * vr)
        for i, u in enumerate(units):
            if i < n_train:
                split_name = "train"
            elif i < n_train + n_val:
                split_name = "val"
            else:
                split_name = "test"
            for f in u:
                assignments[f["id"]] = split_name

    return assignments


def compute_analytics(
    classes: List[Dict[str, Any]],
    frames: List[Dict[str, Any]],
    annotations: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute class distribution, coverage, box size stats, and 10x10 spatial heatmap."""
    class_map = {c["id"]: c for c in classes}
    annotated_frame_ids = {a["frame_id"] for a in annotations}

    class_counts: Counter = Counter()
    split_counts: Counter = Counter()
    for f in frames:
        split_counts[f["split"] or "unassigned"] += 1

    # 10x10 spatial heatmap (box centers)
    heatmap = [[0 for _ in range(10)] for _ in range(10)]
    areas: List[float] = []
    aspect_ratios: List[float] = []
    size_buckets = {"small": 0, "medium": 0, "large": 0}

    for a in annotations:
        class_counts[a["class_id"]] += 1
        cx = min(9, max(0, int((a["x"] + a["w"] / 2.0) * 10)))
        cy = min(9, max(0, int((a["y"] + a["h"] / 2.0) * 10)))
        heatmap[cy][cx] += 1

        area = a["w"] * a["h"]
        areas.append(area)
        if a["h"] > 0:
            aspect_ratios.append(round(a["w"] / a["h"], 3))

        if area < 0.01:
            size_buckets["small"] += 1
        elif area < 0.09:
            size_buckets["medium"] += 1
        else:
            size_buckets["large"] += 1

    class_distribution = [
        {
            "class_id": c["id"],
            "name": c["name"],
            "color": c["color"],
            "count": class_counts.get(c["id"], 0),
        }
        for c in classes
    ]

    return {
        "total_frames": len(frames),
        "annotated_frames": len(annotated_frame_ids),
        "unannotated_frames": max(0, len(frames) - len(annotated_frame_ids)),
        "total_annotations": len(annotations),
        "class_distribution": class_distribution,
        "split_distribution": dict(split_counts),
        "size_buckets": size_buckets,
        "avg_box_area": round(sum(areas) / len(areas), 5) if areas else 0.0,
        "avg_aspect_ratio": round(sum(aspect_ratios) / len(aspect_ratios), 3) if aspect_ratios else 0.0,
        "heatmap": heatmap,
    }


def export_yolo_zip(
    project_name: str,
    classes: List[Dict[str, Any]],
    frames: List[Dict[str, Any]],
    annotations_by_frame: Dict[int, List[Dict[str, Any]]],
    rename_mode: str = "none",
    rename_value: str = "",
) -> bytes:
    """
    Build an in-memory ZIP containing YOLO 2D Detect dataset:
    - {split}/images/{filename}
    - {split}/labels/{stem}.txt
    - classes.txt
    - data.yaml
    Supports rename_mode: 'none' | 'prefix' | 'suffix' | 'full'
    """
    sorted_classes = sorted(classes, key=lambda c: c["class_index"])
    class_id_to_idx = {c["id"]: idx for idx, c in enumerate(sorted_classes)}
    names = [c["name"] for c in sorted_classes]

    used_splits = {
        (f["split"] if f["split"] in {"train", "val", "test"} else "train")
        for f in frames
    }
    if not used_splits:
        used_splits = {"train"}

    yaml_lines = []
    if "train" in used_splits:
        yaml_lines.append("train: /train/images")
    if "val" in used_splits:
        yaml_lines.append("val: /val/images")
    elif "test" in used_splits:
        yaml_lines.append("val: /test/images")
    if "test" in used_splits:
        yaml_lines.append("test: /test/images")
    yaml_lines.append("")
    yaml_lines.append(f"nc: {len(names)}")
    quoted_names = ",".join(f"'{n}'" for n in names)
    yaml_lines.append(f"names: [{quoted_names}]")
    data_yaml_str = "\n".join(yaml_lines) + "\n"

    clean_val = "".join(c if c.isalnum() or c in "-_" else "_" for c in (rename_value or "").strip())

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.yaml", data_yaml_str)
        zf.writestr("classes.txt", "\n".join(names) + ("\n" if names else ""))

        seen_names: Dict[str, int] = defaultdict(int)
        export_counter = 1
        for f in frames:
            split = f["split"] if f["split"] in {"train", "val", "test"} else "train"
            src = Path(f["file_path"])
            if not src.exists():
                continue

            orig_stem = src.stem
            suf = src.suffix
            if rename_mode == "prefix" and clean_val:
                base_name = f"{clean_val}{orig_stem}{suf}"
            elif rename_mode == "suffix" and clean_val:
                base_name = f"{orig_stem}{clean_val}{suf}"
            elif rename_mode == "full":
                prefix_base = clean_val or "frame"
                base_name = f"{prefix_base}_{export_counter:06d}{suf}"
            else:
                base_name = f"{f['sequence_id']}_{src.name}"

            export_counter += 1

            seen_names[f"{split}/{base_name}"] += 1
            if seen_names[f"{split}/{base_name}"] > 1:
                stem = Path(base_name).stem
                base_name = f"{stem}_{seen_names[f'{split}/{base_name}']}{suf}"

            img_arc = f"{split}/images/{base_name}"
            lbl_arc = f"{split}/labels/{Path(base_name).stem}.txt"

            zf.write(src, img_arc)

            lines: List[str] = []
            for ann in annotations_by_frame.get(f["id"], []):
                c_idx = class_id_to_idx.get(ann["class_id"])
                if c_idx is None:
                    continue
                xc = max(0.0, min(1.0, ann["x"] + ann["w"] / 2.0))
                yc = max(0.0, min(1.0, ann["y"] + ann["h"] / 2.0))
                w = max(0.0, min(1.0, ann["w"]))
                h = max(0.0, min(1.0, ann["h"]))
                lines.append(f"{c_idx} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")

            zf.writestr(lbl_arc, "\n".join(lines) + ("\n" if lines else ""))

    buf.seek(0)
    return buf.getvalue()
