import shutil
from typing import List
from fastapi import APIRouter, HTTPException
from ..database import DATA_DIR, db_session
from ..models import ProjectCreate, ProjectOut, ClassCreate, ClassUpdate, ClassOut

router = APIRouter(prefix="/api/projects", tags=["projects"])

DEFAULT_COLORS = [
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
    "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
]


@router.get("", response_model=List[ProjectOut])
def list_projects():
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT p.*,
                (SELECT COUNT(*) FROM frames f WHERE f.project_id = p.id) AS frame_count,
                (SELECT COUNT(*) FROM annotations a JOIN frames f ON a.frame_id = f.id WHERE f.project_id = p.id) AS annotation_count,
                (SELECT COUNT(*) FROM classes c WHERE c.project_id = p.id) AS class_count
            FROM projects p
            ORDER BY p.id DESC
            """
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("", response_model=ProjectOut)
def create_project(payload: ProjectCreate):
    with db_session() as conn:
        cur = conn.execute(
            "INSERT INTO projects (name, description) VALUES (?, ?)",
            (payload.name.strip(), payload.description.strip()),
        )
        pid = cur.lastrowid
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
        return {**dict(row), "frame_count": 0, "annotation_count": 0, "class_count": 0}


@router.delete("/{project_id}")
def delete_project(project_id: int):
    with db_session() as conn:
        cur = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Project not found")
    proj_dir = DATA_DIR / f"project_{project_id}"
    if proj_dir.exists():
        shutil.rmtree(proj_dir, ignore_errors=True)
    return {"ok": True}


@router.get("/{project_id}/classes", response_model=List[ClassOut])
def list_classes(project_id: int):
    with db_session() as conn:
        rows = conn.execute(
            "SELECT * FROM classes WHERE project_id = ? ORDER BY class_index ASC, id ASC",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/{project_id}/classes", response_model=ClassOut)
def create_class(project_id: int, payload: ClassCreate):
    with db_session() as conn:
        existing = conn.execute(
            "SELECT COUNT(*) AS cnt FROM classes WHERE project_id = ?",
            (project_id,),
        ).fetchone()
        idx = existing["cnt"] if existing else 0
        color = payload.color or DEFAULT_COLORS[idx % len(DEFAULT_COLORS)]
        hotkey = payload.hotkey or (str(idx + 1) if idx < 9 else "")
        try:
            cur = conn.execute(
                "INSERT INTO classes (project_id, name, color, class_index, hotkey) VALUES (?, ?, ?, ?, ?)",
                (project_id, payload.name.strip(), color, idx, hotkey),
            )
        except Exception as e:
            raise HTTPException(400, f"Class already exists or invalid project: {e}")
        row = conn.execute("SELECT * FROM classes WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


@router.patch("/{project_id}/classes/{class_id}", response_model=ClassOut)
def update_class(project_id: int, class_id: int, payload: ClassUpdate):
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM classes WHERE id = ? AND project_id = ?",
            (class_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Class not found")
        name = payload.name.strip() if payload.name is not None else row["name"]
        color = payload.color if payload.color is not None else row["color"]
        hotkey = payload.hotkey if payload.hotkey is not None else row["hotkey"]
        conn.execute(
            "UPDATE classes SET name = ?, color = ?, hotkey = ? WHERE id = ?",
            (name, color, hotkey, class_id),
        )
        updated = conn.execute("SELECT * FROM classes WHERE id = ?", (class_id,)).fetchone()
        return dict(updated)


@router.delete("/{project_id}/classes/{class_id}")
def delete_class(project_id: int, class_id: int):
    with db_session() as conn:
        cur = conn.execute(
            "DELETE FROM classes WHERE id = ? AND project_id = ?",
            (class_id, project_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Class not found")
        # Re-normalize class_index
        remaining = conn.execute(
            "SELECT id FROM classes WHERE project_id = ? ORDER BY class_index ASC, id ASC",
            (project_id,),
        ).fetchall()
        for idx, r in enumerate(remaining):
            conn.execute("UPDATE classes SET class_index = ? WHERE id = ?", (idx, r["id"]))
        return {"ok": True}
