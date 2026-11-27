export interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
  frame_count: number;
  annotation_count: number;
  class_count: number;
}

export interface ClassItem {
  id: number;
  project_id: number;
  name: string;
  color: string;
  class_index: number;
  hotkey: string;
}

export interface MediaSequence {
  id: number;
  project_id: number;
  name: string;
  source_type: string;
  source_path: string;
  fps: number;
  created_at: string;
  frame_count: number;
  annotated_frames: number;
}

export interface VideoItem {
  id: number;
  project_id: number;
  name: string;
  file_path: string;
  duration: number;
  fps: number;
  total_frames: number;
  width: number;
  height: number;
  processed: number;
  created_at: string;
}

export interface ClipRange {
  id: string;
  start: number;
  end: number;
  label: string;
}

export interface ExtractionJob {
  id: string;
  project_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  total_frames: number;
  extracted_frames: number;
  message: string;
}

export interface FrameItem {
  id: number;
  project_id: number;
  sequence_id: number;
  frame_index: number;
  filename: string;
  file_path: string;
  width: number;
  height: number;
  split: 'unassigned' | 'train' | 'val' | 'test';
  annotation_count?: number;
}

export interface AnnotationBox {
  id?: number;
  localId?: string;
  frame_id: number;
  class_id: number;
  class_name?: string;
  class_color?: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  w: number; // normalized 0..1
  h: number; // normalized 0..1
  track_id: number | null;
  is_keyframe: number;
  interpolated: number;
}

export interface TrackSummary {
  track_id: number;
  class_id: number;
  class_name: string;
  class_color: string;
  frame_count: number;
  keyframe_count: number;
}

export interface AnalyticsData {
  total_frames: number;
  annotated_frames: number;
  unannotated_frames: number;
  total_annotations: number;
  class_distribution: {
    class_id: number;
    name: string;
    color: string;
    count: number;
  }[];
  split_distribution: Record<string, number>;
  size_buckets: {
    small: number;
    medium: number;
    large: number;
  };
  avg_box_area: number;
  avg_aspect_ratio: number;
  heatmap: number[][];
}

export interface ImageFilters {
  brightness: number; // 100 default
  contrast: number;   // 100 default
  saturate: number;   // 100 default
  gamma: number;      // 1.0 default
  invert: boolean;
}
