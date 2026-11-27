from collections import defaultdict
from pathlib import Path
import cv2
import yaml
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from ..database import db_session
from ..models import SplitRequest, YoloImportFolderRequest
from ..services.video_service import IMAGE_EXTS
from ..services.yolo_service import compute_analytics, compute_splits, export_yolo_zip
from .projects import DEFAULT_COLORS

router = APIRouter(prefix="/api/projects/{project_id}", tags=["dataset"])


@router.post("/split")
def split_dataset(project_id: int, payload: SplitRequest):
    with db_session() as conn:
        frames = [
            dict(r)
            for r in conn.execute("SELECT * FROM frames WHERE project_id = ?", (project_id,)).fetchall()
        ]
        if not frames:
            raise HTTPException(400, "No frames in project to split")
        anns = [
            dict(r)
            for r in conn.execute(
                "SELECT a.* FROM annotations a JOIN frames f ON a.frame_id = f.id WHERE f.project_id = ?",
                (project_id,),
            ).fetchall()
        ]
        anns_by_frame = defaultdict(list)
        for a in anns:
            anns_by_frame[a["frame_id"]].append(a)

        target_frames = (
            frames
            if payload.include_unannotated
            else [f for f in frames if len(anns_by_frame.get(f["id"], [])) > 0]
        )
        if not target_frames:
            raise HTTPException(400, "No annotated frames found to split")

        # Reset all project frames to unassigned first
        conn.execute("UPDATE frames SET split = 'unassigned' WHERE project_id = ?", (project_id,))

        assignments = compute_splits(
            frames=target_frames,
            annotations_by_frame=anns_by_frame,
            train_ratio=payload.train_ratio,
            val_ratio=payload.val_ratio,
            test_ratio=payload.test_ratio,
            stratified=payload.stratified,
            video_aware=payload.video_aware,
            per_video_sequential=payload.per_video_sequential,
            seed=payload.seed,
        )
        conn.executemany(
            "UPDATE frames SET split = ? WHERE id = ?",
            [(split_val, fid) for fid, split_val in assignments.items()],
        )
        counts = defaultdict(int)
        for sp in assignments.values():
            counts[sp] += 1
        return {"splits": dict(counts), "total_frames": len(assignments)}


@router.get("/analytics")
def get_analytics(project_id: int):
    with db_session() as conn:
        classes = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM classes WHERE project_id = ? ORDER BY class_index ASC",
                (project_id,),
            ).fetchall()
        ]
        frames = [
            dict(r)
            for r in conn.execute("SELECT * FROM frames WHERE project_id = ?", (project_id,)).fetchall()
        ]
        anns = [
            dict(r)
            for r in conn.execute(
                "SELECT a.* FROM annotations a JOIN frames f ON a.frame_id = f.id WHERE f.project_id = ?",
                (project_id,),
            ).fetchall()
        ]
        return compute_analytics(classes, frames, anns)


@router.get("/export/yolo")
def download_yolo_export(
    project_id: int,
    rename_mode: str = "none",
    rename_value: str = "",
    include_unannotated: bool = False,
):
    with db_session() as conn:
        proj = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not proj:
            raise HTTPException(404, "Project not found")
        classes = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM classes WHERE project_id = ? ORDER BY class_index ASC",
                (project_id,),
            ).fetchall()
        ]
        frames = [
            dict(r)
            for r in conn.execute("SELECT * FROM frames WHERE project_id = ?", (project_id,)).fetchall()
        ]
        anns = [
            dict(r)
            for r in conn.execute(
                "SELECT a.* FROM annotations a JOIN frames f ON a.frame_id = f.id WHERE f.project_id = ?",
                (project_id,),
            ).fetchall()
        ]
        anns_by_frame = defaultdict(list)
        for a in anns:
            anns_by_frame[a["frame_id"]].append(a)

        export_frames = (
            frames
            if include_unannotated
            else [f for f in frames if len(anns_by_frame.get(f["id"], [])) > 0]
        )

        zip_bytes = export_yolo_zip(
            proj["name"], classes, export_frames, anns_by_frame, rename_mode=rename_mode, rename_value=rename_value
        )
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in proj["name"])
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}_yolo.zip"'},
        )


@router.post("/import/yolo-folder")
def import_yolo_folder(project_id: int, payload: YoloImportFolderRequest):
    img_dir = Path(payload.images_dir).expanduser()
    lbl_dir = Path(payload.labels_dir).expanduser()
    if not img_dir.is_dir() or not lbl_dir.is_dir():
        raise HTTPException(400, "images_dir and labels_dir must be valid directories")

    # Parse class names from classes_file (yaml or txt)
    class_names: list[str] = []
    if payload.classes_file:
        cf = Path(payload.classes_file).expanduser()
        if cf.exists():
            if cf.suffix.lower() in {".yaml", ".yml"}:
                ydata = yaml.safe_load(cf.read_text()) or {}
                raw_names = ydata.get("names", [])
                if isinstance(raw_names, dict):
                    class_names = [raw_names[k] for k in sorted(raw_names.keys())]
                elif isinstance(raw_names, list):
                    class_names = [str(x) for x in raw_names]
            else:
                class_names = [line.strip() for line in cf.read_text().splitlines() if line.strip()]

    images = sorted([p for p in img_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS])
    if not images:
        raise HTTPException(400, "No images found in images_dir")

    with db_session() as conn:
        # Ensure classes exist
        existing = {
            r["class_index"]: r["id"]
            for r in conn.execute("SELECT id, class_index FROM classes WHERE project_id = ?", (project_id,)).fetchall()
        }
        for idx, cname in enumerate(class_names):
            if idx not in existing:
                color = DEFAULT_COLORS[idx % len(DEFAULT_COLORS)]
                hotkey = str(idx + 1) if idx < 9 else ""
                try:
                    cur = conn.execute(
                        "INSERT INTO classes (project_id, name, color, class_index, hotkey) VALUES (?, ?, ?, ?, ?)",
                        (project_id, cname, color, idx, hotkey),
                    )
                    existing[idx] = cur.lastrowid
                except Exception:
                    row = conn.execute(
                        "SELECT id FROM classes WHERE project_id = ? AND name = ?",
                        (project_id, cname),
                    ).fetchone()
                    if row:
                        existing[idx] = row["id"]

        seq_name = payload.sequence_name or f"YOLO Import ({img_dir.name})"
        cur_seq = conn.execute(
            "INSERT INTO media_sequences (project_id, name, source_type, source_path) VALUES (?, ?, 'images', ?)",
            (project_id, seq_name, str(img_dir)),
        )
        seq_id = cur_seq.lastrowid

        imported_frames = 0
        imported_anns = 0
        for fidx, img_path in enumerate(images):
            im = cv2.imread(str(img_path))
            if im is None:
                continue
            h, w = im.shape[:2]
            cur_f = conn.execute(
                "INSERT INTO frames (project_id, sequence_id, frame_index, filename, file_path, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (project_id, seq_id, fidx, img_path.name, str(img_path), w, h),
            )
            frame_id = cur_f.lastrowid
            imported_frames += 1

            lbl_path = lbl_dir / f"{img_path.stem}.txt"
            if lbl_path.exists():
                for line in lbl_path.read_text().splitlines():
                    parts = line.strip().split()
                    if len(parts) < 5:
                        continue
                    c_idx = int(float(parts[0]))
                    xc, yc, bw, bh = map(float, parts[1:5])
                    if c_idx not in existing:
                        color = DEFAULT_COLORS[c_idx % len(DEFAULT_COLORS)]
                        cur_c = conn.execute(
                            "INSERT INTO classes (project_id, name, color, class_index, hotkey) VALUES (?, ?, ?, ?, ?)",
                            (project_id, f"class_{c_idx}", color, c_idx, str(c_idx + 1) if c_idx < 9 else ""),
                        )
                        existing[c_idx] = cur_c.lastrowid

                    x = max(0.0, min(1.0, xc - bw / 2.0))
                    y = max(0.0, min(1.0, yc - bh / 2.0))
                    conn.execute(
                        "INSERT INTO annotations (frame_id, class_id, x, y, w, h, is_keyframe, interpolated) VALUES (?, ?, ?, ?, ?, ?, 1, 0)",
                        (frame_id, existing[c_idx], x, y, min(1.0 - x, bw), min(1.0 - y, bh)),
                    )
                    imported_anns += 1

        return {
            "sequence_id": seq_id,
            "imported_frames": imported_frames,
            "imported_annotations": imported_anns,
        }
