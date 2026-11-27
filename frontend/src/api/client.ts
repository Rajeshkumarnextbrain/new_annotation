import type {
  AnalyticsData,
  AnnotationBox,
  ClassItem,
  ExtractionJob,
  FrameItem,
  MediaSequence,
  Project,
  TrackSummary,
  VideoItem,
} from '../types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, options);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data.detail || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  // Projects
  listProjects: () => request<Project[]>('/projects'),
  createProject: (name: string, description = '') =>
    request<Project>('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    }),
  deleteProject: (id: number) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  // Classes
  listClasses: (projectId: number) =>
    request<ClassItem[]>(`/projects/${projectId}/classes`),
  createClass: (projectId: number, name: string, color?: string, hotkey?: string) =>
    request<ClassItem>(`/projects/${projectId}/classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, hotkey }),
    }),
  updateClass: (projectId: number, classId: number, data: Partial<ClassItem>) =>
    request<ClassItem>(`/projects/${projectId}/classes/${classId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteClass: (projectId: number, classId: number) =>
    request<{ ok: boolean }>(`/projects/${projectId}/classes/${classId}`, {
      method: 'DELETE',
    }),

  // Sequences & Image Import
  listSequences: (projectId: number) =>
    request<MediaSequence[]>(`/projects/${projectId}/sequences`),
  deleteSequence: (projectId: number, seqId: number) =>
    request<{ ok: boolean }>(`/projects/${projectId}/sequences/${seqId}`, {
      method: 'DELETE',
    }),
  importFolder: (projectId: number, folder_path: string, sequence_name?: string) =>
    request<{ sequence_id: number; imported_count: number }>(
      `/projects/${projectId}/import/folder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path, sequence_name }),
      }
    ),
  uploadImages: (projectId: number, sequenceName: string, files: File[]) => {
    const fd = new FormData();
    fd.append('sequence_name', sequenceName);
    files.forEach((f) => fd.append('files', f));
    return request<{ sequence_id: number; imported_count: number }>(
      `/projects/${projectId}/import/images-upload`,
      { method: 'POST', body: fd }
    );
  },

  // Videos & Clip Extraction
  listVideos: (projectId: number) =>
    request<VideoItem[]>(`/projects/${projectId}/videos`),
  uploadVideos: (projectId: number, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return request<VideoItem[]>(`/projects/${projectId}/videos/upload`, {
      method: 'POST',
      body: fd,
    });
  },
  linkVideo: (projectId: number, file_path: string, name?: string) =>
    request<VideoItem>(`/projects/${projectId}/videos/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path, name }),
    }),
  deleteVideo: (projectId: number, videoId: number) =>
    request<{ ok: boolean }>(`/projects/${projectId}/videos/${videoId}`, {
      method: 'DELETE',
    }),
  extractClips: (
    projectId: number,
    payload: {
      video_id: number;
      clips: { start: number; end: number; label?: string }[];
      mode: 'all' | 'fps' | 'every_n';
      value: number;
      skip_duplicates: boolean;
      dup_threshold?: number;
      merge_clips: boolean;
      sequence_name?: string;
    }
  ) =>
    request<{ job_id: string; status: string }>(
      `/projects/${projectId}/videos/extract-clips`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),
  getJob: (projectId: number, jobId: string) =>
    request<ExtractionJob>(`/projects/${projectId}/jobs/${jobId}`),

  // Frames & Annotations
  listFrames: (sequenceId: number) =>
    request<FrameItem[]>(`/sequences/${sequenceId}/frames`),
  listTracks: (sequenceId: number) =>
    request<TrackSummary[]>(`/sequences/${sequenceId}/tracks`),
  getFrameAnnotations: (frameId: number) =>
    request<AnnotationBox[]>(`/frames/${frameId}/annotations`),
  saveFrameAnnotations: (frameId: number, annotations: AnnotationBox[]) =>
    request<AnnotationBox[]>(`/frames/${frameId}/annotations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        annotations: annotations.map((a) => ({
          class_id: a.class_id,
          x: a.x,
          y: a.y,
          w: a.w,
          h: a.h,
          track_id: a.track_id,
          is_keyframe: a.is_keyframe,
          interpolated: a.interpolated,
        })),
      }),
    }),
  copyFromFrame: (frameId: number, sourceFrameId: number) =>
    request<AnnotationBox[]>(`/frames/${frameId}/copy-from/${sourceFrameId}`, {
      method: 'POST',
    }),
  interpolateTrack: (sequence_id: number, track_id: number) =>
    request<{ interpolated_count: number }>('/tracking/interpolate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence_id, track_id }),
    }),
  opencvTrackForward: (
    sequence_id: number,
    source_frame_id: number,
    annotation_id: number | null = null,
    num_frames = 10
  ) =>
    request<{ tracked_objects: number; tracked_frames: number }>('/tracking/opencv-forward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence_id, source_frame_id, annotation_id, num_frames }),
    }),

  // Splitting, Analytics, YOLO Import/Export
  splitDataset: (
    projectId: number,
    payload: {
      train_ratio: number;
      val_ratio: number;
      test_ratio: number;
      stratified: boolean;
      video_aware: boolean;
      per_video_sequential: boolean;
      seed?: number;
    }
  ) =>
    request<{ splits: Record<string, number>; total_frames: number }>(
      `/projects/${projectId}/split`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),
  getAnalytics: (projectId: number) =>
    request<AnalyticsData>(`/projects/${projectId}/analytics`),
  importYoloFolder: (
    projectId: number,
    payload: {
      images_dir: string;
      labels_dir: string;
      classes_file?: string;
      sequence_name?: string;
    }
  ) =>
    request<{ sequence_id: number; imported_frames: number; imported_annotations: number }>(
      `/projects/${projectId}/import/yolo-folder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),
  exportYoloUrl: (projectId: number, renameMode = 'none', renameValue = '') => {
    const params = new URLSearchParams({
      rename_mode: renameMode,
      rename_value: renameValue,
    });
    return `${BASE}/projects/${projectId}/export/yolo?${params.toString()}`;
  },
  frameImageUrl: (frameId: number) => `${BASE}/media/frame/${frameId}`,
  videoStreamUrl: (videoId: number) => `${BASE}/media/video/${videoId}`,
  getVideoStatus: (videoId: number) =>
    request<{ status: 'ready' | 'transcoding' | 'error'; error?: string }>(
      `/media/video/${videoId}/status`
    ),
};
