from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = ""


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    created_at: str
    frame_count: int = 0
    annotation_count: int = 0
    class_count: int = 0


class ClassCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    color: Optional[str] = None
    hotkey: str = ""


class ClassUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    hotkey: Optional[str] = None


class ClassOut(BaseModel):
    id: int
    project_id: int
    name: str
    color: str
    class_index: int
    hotkey: str


class FolderImportRequest(BaseModel):
    folder_path: str
    sequence_name: Optional[str] = None


class VideoLinkRequest(BaseModel):
    file_path: str
    name: Optional[str] = None


class ClipRange(BaseModel):
    start: float = Field(..., ge=0)
    end: float = Field(..., gt=0)
    label: Optional[str] = None


class ExtractClipsRequest(BaseModel):
    video_id: int
    clips: List[ClipRange]
    mode: Literal["all", "fps", "every_n"] = "all"
    value: float = Field(default=1.0, gt=0)
    skip_duplicates: bool = False
    dup_threshold: float = 0.985
    merge_clips: bool = False
    sequence_name: Optional[str] = None


class AnnotationCreate(BaseModel):
    class_id: int
    x: float = Field(..., ge=0, le=1)
    y: float = Field(..., ge=0, le=1)
    w: float = Field(..., gt=0, le=1)
    h: float = Field(..., gt=0, le=1)
    track_id: Optional[int] = None
    is_keyframe: int = 1
    interpolated: int = 0


class AnnotationUpdate(BaseModel):
    class_id: Optional[int] = None
    x: Optional[float] = Field(None, ge=0, le=1)
    y: Optional[float] = Field(None, ge=0, le=1)
    w: Optional[float] = Field(None, gt=0, le=1)
    h: Optional[float] = Field(None, gt=0, le=1)
    track_id: Optional[int] = None
    is_keyframe: Optional[int] = None
    interpolated: Optional[int] = None


class FrameAnnotationsSave(BaseModel):
    annotations: List[AnnotationCreate]


class InterpolateRequest(BaseModel):
    sequence_id: int
    track_id: int
    start_frame_id: Optional[int] = None
    end_frame_id: Optional[int] = None


class TrackStepRequest(BaseModel):
    sequence_id: int
    source_frame_id: int
    annotation_id: Optional[int] = None
    num_frames: int = Field(default=10, ge=1, le=200)


class SplitRequest(BaseModel):
    train_ratio: float = Field(0.7, ge=0, le=1)
    val_ratio: float = Field(0.2, ge=0, le=1)
    test_ratio: float = Field(0.1, ge=0, le=1)
    stratified: bool = True
    video_aware: bool = True
    per_video_sequential: bool = True
    include_unannotated: bool = False
    seed: int = 42


class YoloImportFolderRequest(BaseModel):
    images_dir: str
    labels_dir: str
    classes_file: Optional[str] = None
    sequence_name: Optional[str] = None
