from fastapi import APIRouter, HTTPException
from ..database import db_session
from ..models import (
    AnnotationCreate,
    AnnotationUpdate,
    FrameAnnotationsSave,
    InterpolateRequest,
    TrackStepRequest,
)
from ..services.tracker_service import interpolate_track_boxes, track_forward_opencv

router = APIRouter(prefix="/api", tags=["annotations"])


@router.get("/sequences/{sequence_id}/frames")
def list_sequence_frames(sequence_id: int):
    with db_session() as conn:
        frames = conn.execute(
            """
            SELECT f.*,
                (SELECT COUNT(*) FROM annotations a WHERE a.frame_id = f.id) AS annotation_count
            FROM frames f
            WHERE f.sequence_id = ?
            ORDER BY f.frame_index ASC, f.id ASC
            """,
            (sequence_id,),
        ).fetchall()
        return [dict(r) for r in frames]


@router.get("/sequences/{sequence_id}/tracks")
def list_sequence_tracks(sequence_id: int):
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT a.track_id, a.class_id, c.name AS class_name, c.color AS class_color,
                   COUNT(a.id) AS frame_count,
                   SUM(CASE WHEN a.is_keyframe = 1 THEN 1 ELSE 0 END) AS keyframe_count
            FROM annotations a
            JOIN frames f ON a.frame_id = f.id
            JOIN classes c ON a.class_id = c.id
            WHERE f.sequence_id = ? AND a.track_id IS NOT NULL
            GROUP BY a.track_id, a.class_id
            ORDER BY a.track_id ASC
            """,
            (sequence_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/frames/{frame_id}/annotations")
def get_frame_annotations(frame_id: int):
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT a.*, c.name AS class_name, c.color AS class_color
            FROM annotations a
            JOIN classes c ON a.class_id = c.id
            WHERE a.frame_id = ?
            ORDER BY a.id ASC
            """,
            (frame_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.put("/frames/{frame_id}/annotations")
def replace_frame_annotations(frame_id: int, payload: FrameAnnotationsSave):
    with db_session() as conn:
        frame = conn.execute("SELECT id FROM frames WHERE id = ?", (frame_id,)).fetchone()
        if not frame:
            raise HTTPException(404, "Frame not found")
        conn.execute("DELETE FROM annotations WHERE frame_id = ?", (frame_id,))
        for ann in payload.annotations:
            conn.execute(
                """
                INSERT INTO annotations (frame_id, class_id, x, y, w, h, track_id, is_keyframe, interpolated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    frame_id,
                    ann.class_id,
                    ann.x,
                    ann.y,
                    ann.w,
                    ann.h,
                    ann.track_id,
                    ann.is_keyframe,
                    ann.interpolated,
                ),
            )
        rows = conn.execute(
            """
            SELECT a.*, c.name AS class_name, c.color AS class_color
            FROM annotations a
            JOIN classes c ON a.class_id = c.id
            WHERE a.frame_id = ?
            ORDER BY a.id ASC
            """,
            (frame_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/frames/{frame_id}/annotations")
def create_annotation(frame_id: int, payload: AnnotationCreate):
    with db_session() as conn:
        cur = conn.execute(
            """
            INSERT INTO annotations (frame_id, class_id, x, y, w, h, track_id, is_keyframe, interpolated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                frame_id,
                payload.class_id,
                payload.x,
                payload.y,
                payload.w,
                payload.h,
                payload.track_id,
                payload.is_keyframe,
                payload.interpolated,
            ),
        )
        row = conn.execute(
            """
            SELECT a.*, c.name AS class_name, c.color AS class_color
            FROM annotations a
            JOIN classes c ON a.class_id = c.id
            WHERE a.id = ?
            """,
            (cur.lastrowid,),
        ).fetchone()
        return dict(row)


@router.patch("/annotations/{ann_id}")
def update_annotation(ann_id: int, payload: AnnotationUpdate):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM annotations WHERE id = ?", (ann_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Annotation not found")
        fields = {
            "class_id": payload.class_id if payload.class_id is not None else row["class_id"],
            "x": payload.x if payload.x is not None else row["x"],
            "y": payload.y if payload.y is not None else row["y"],
            "w": payload.w if payload.w is not None else row["w"],
            "h": payload.h if payload.h is not None else row["h"],
            "track_id": payload.track_id if payload.track_id is not None else row["track_id"],
            "is_keyframe": payload.is_keyframe if payload.is_keyframe is not None else row["is_keyframe"],
            "interpolated": payload.interpolated if payload.interpolated is not None else row["interpolated"],
        }
        conn.execute(
            """
            UPDATE annotations
            SET class_id = ?, x = ?, y = ?, w = ?, h = ?, track_id = ?, is_keyframe = ?, interpolated = ?
            WHERE id = ?
            """,
            (*fields.values(), ann_id),
        )
        updated = conn.execute(
            """
            SELECT a.*, c.name AS class_name, c.color AS class_color
            FROM annotations a
            JOIN classes c ON a.class_id = c.id
            WHERE a.id = ?
            """,
            (ann_id,),
        ).fetchone()
        return dict(updated)


@router.delete("/annotations/{ann_id}")
def delete_annotation(ann_id: int):
    with db_session() as conn:
        cur = conn.execute("DELETE FROM annotations WHERE id = ?", (ann_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Annotation not found")
        return {"ok": True}


@router.post("/frames/{frame_id}/copy-from/{source_frame_id}")
def copy_from_frame(frame_id: int, source_frame_id: int):
    with db_session() as conn:
        src_anns = conn.execute(
            "SELECT * FROM annotations WHERE frame_id = ?",
            (source_frame_id,),
        ).fetchall()
        for a in src_anns:
            conn.execute(
                """
                INSERT INTO annotations (frame_id, class_id, x, y, w, h, track_id, is_keyframe, interpolated)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)
                """,
                (frame_id, a["class_id"], a["x"], a["y"], a["w"], a["h"], a["track_id"]),
            )
        rows = conn.execute(
            """
            SELECT a.*, c.name AS class_name, c.color AS class_color
            FROM annotations a
            JOIN classes c ON a.class_id = c.id
            WHERE a.frame_id = ?
            ORDER BY a.id ASC
            """,
            (frame_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/tracking/interpolate")
def interpolate_track(payload: InterpolateRequest):
    with db_session() as conn:
        frames = [
            dict(r)
            for r in conn.execute(
                "SELECT id, frame_index FROM frames WHERE sequence_id = ? ORDER BY frame_index ASC",
                (payload.sequence_id,),
            ).fetchall()
        ]
        keyframes = [
            dict(r)
            for r in conn.execute(
                """
                SELECT a.* FROM annotations a
                JOIN frames f ON a.frame_id = f.id
                WHERE f.sequence_id = ? AND a.track_id = ? AND a.is_keyframe = 1
                """,
                (payload.sequence_id, payload.track_id),
            ).fetchall()
        ]

        if len(keyframes) < 2:
            raise HTTPException(400, "Need at least 2 keyframes with the same track_id to interpolate")

        interp = interpolate_track_boxes(frames, keyframes)
        # Remove old non-keyframe interpolated boxes for this track in those frames
        for item in interp:
            conn.execute(
                "DELETE FROM annotations WHERE frame_id = ? AND track_id = ? AND is_keyframe = 0",
                (item["frame_id"], payload.track_id),
            )
            # Only insert if there is no keyframe already on this frame for this track
            exists_kf = conn.execute(
                "SELECT id FROM annotations WHERE frame_id = ? AND track_id = ? AND is_keyframe = 1",
                (item["frame_id"], payload.track_id),
            ).fetchone()
            if not exists_kf:
                conn.execute(
                    """
                    INSERT INTO annotations (frame_id, class_id, x, y, w, h, track_id, is_keyframe, interpolated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
                    """,
                    (
                        item["frame_id"],
                        item["class_id"],
                        item["x"],
                        item["y"],
                        item["w"],
                        item["h"],
                        item["track_id"],
                    ),
                )
        return {"interpolated_count": len(interp)}


@router.post("/tracking/opencv-forward")
def opencv_track_forward(payload: TrackStepRequest):
    with db_session() as conn:
        frames = [
            dict(r)
            for r in conn.execute(
                "SELECT id, frame_index, file_path FROM frames WHERE sequence_id = ? ORDER BY frame_index ASC",
                (payload.sequence_id,),
            ).fetchall()
        ]
        if payload.annotation_id is not None:
            src_rows = conn.execute(
                "SELECT * FROM annotations WHERE id = ?",
                (payload.annotation_id,),
            ).fetchall()
        else:
            src_rows = conn.execute(
                "SELECT * FROM annotations WHERE frame_id = ? ORDER BY id ASC",
                (payload.source_frame_id,),
            ).fetchall()

        if not src_rows:
            raise HTTPException(404, "No annotations found on source frame to track")

        max_row = conn.execute(
            "SELECT COALESCE(MAX(track_id), 0) AS mx FROM annotations a JOIN frames f ON a.frame_id = f.id WHERE f.sequence_id = ?",
            (payload.sequence_id,),
        ).fetchone()
        next_tid = (max_row["mx"] or 0) + 1

        total_tracked_entries = 0
        tracked_objects = 0
        for ann in src_rows:
            ann_dict = dict(ann)
            if ann_dict["track_id"] is None:
                ann_dict["track_id"] = next_tid
                next_tid += 1
                conn.execute(
                    "UPDATE annotations SET track_id = ? WHERE id = ?",
                    (ann_dict["track_id"], ann_dict["id"]),
                )

            tracked = track_forward_opencv(frames, payload.source_frame_id, ann_dict, payload.num_frames)
            tracked_objects += 1
            for item in tracked:
                conn.execute(
                    "DELETE FROM annotations WHERE frame_id = ? AND track_id = ? AND is_keyframe = 0",
                    (item["frame_id"], ann_dict["track_id"]),
                )
                exists_kf = conn.execute(
                    "SELECT id FROM annotations WHERE frame_id = ? AND track_id = ? AND is_keyframe = 1",
                    (item["frame_id"], ann_dict["track_id"]),
                ).fetchone()
                if not exists_kf:
                    conn.execute(
                        """
                        INSERT INTO annotations (frame_id, class_id, x, y, w, h, track_id, is_keyframe, interpolated)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
                        """,
                        (
                            item["frame_id"],
                            item["class_id"],
                            item["x"],
                            item["y"],
                            item["w"],
                            item["h"],
                            item["track_id"],
                        ),
                    )
                    total_tracked_entries += 1
        return {
            "tracked_objects": tracked_objects,
            "tracked_frames": total_tracked_entries,
        }
