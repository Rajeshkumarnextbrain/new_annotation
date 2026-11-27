import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager

DATA_DIR = Path(os.environ.get("DATA_DIR") or (Path(__file__).resolve().parents[2] / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "annotations.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


@contextmanager
def db_session():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with db_session() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#3b82f6',
                class_index INTEGER NOT NULL,
                hotkey TEXT DEFAULT '',
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                UNIQUE(project_id, name)
            );

            CREATE TABLE IF NOT EXISTS media_sequences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                source_type TEXT NOT NULL, -- 'images' | 'video_clip' | 'video_merged'
                source_path TEXT DEFAULT '',
                fps REAL DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                duration REAL DEFAULT 0,
                fps REAL DEFAULT 0,
                total_frames INTEGER DEFAULT 0,
                width INTEGER DEFAULT 0,
                height INTEGER DEFAULT 0,
                processed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS frames (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                sequence_id INTEGER NOT NULL,
                frame_index INTEGER NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                split TEXT DEFAULT 'unassigned', -- 'unassigned' | 'train' | 'val' | 'test'
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (sequence_id) REFERENCES media_sequences(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                frame_id INTEGER NOT NULL,
                class_id INTEGER NOT NULL,
                x REAL NOT NULL, -- normalized 0..1 top-left x
                y REAL NOT NULL, -- normalized 0..1 top-left y
                w REAL NOT NULL, -- normalized 0..1 width
                h REAL NOT NULL, -- normalized 0..1 height
                track_id INTEGER DEFAULT NULL,
                is_keyframe INTEGER DEFAULT 1,
                interpolated INTEGER DEFAULT 0,
                confidence REAL DEFAULT 1.0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (frame_id) REFERENCES frames(id) ON DELETE CASCADE,
                FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS extraction_jobs (
                id TEXT PRIMARY KEY,
                project_id INTEGER NOT NULL,
                status TEXT NOT NULL, -- 'pending' | 'running' | 'completed' | 'failed'
                progress REAL DEFAULT 0,
                total_frames INTEGER DEFAULT 0,
                extracted_frames INTEGER DEFAULT 0,
                message TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_frames_seq ON frames(sequence_id, frame_index);
            CREATE INDEX IF NOT EXISTS idx_ann_frame ON annotations(frame_id);
            CREATE INDEX IF NOT EXISTS idx_ann_track ON annotations(track_id);
            """
        )
        # Safe migration for existing databases missing videos.processed
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(videos)").fetchall()]
        if "processed" not in cols:
            conn.execute("ALTER TABLE videos ADD COLUMN processed INTEGER DEFAULT 0")
