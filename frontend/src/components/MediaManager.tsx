import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Film,
  FolderOpen,
  ImagePlus,
  Lock,
  Scissors,
  Trash2,
  Play,
  Plus,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Upload,
  X,
} from 'lucide-react';
import type { ClipRange, ExtractionJob, MediaSequence, VideoItem } from '../types';
import { api } from '../api/client';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  projectId: number;
  sequences: MediaSequence[];
  videos: VideoItem[];
  onRefresh: () => void;
  onOpenAnnotator: (seqId: number) => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = (s % 60).toFixed(1).padStart(4, '0');
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${secs}`;
  }
  return `${String(mins).padStart(2, '0')}:${secs}`;
}

export const MediaManager: React.FC<Props> = ({
  projectId,
  sequences,
  videos,
  onRefresh,
  onOpenAnnotator,
}) => {
  const [showImport, setShowImport] = useState(videos.length === 0 && sequences.length === 0);
  const [importTab, setImportTab] = useState<'video' | 'image'>('video');

  const [folderPath, setFolderPath] = useState('');
  const [folderSeqName, setFolderSeqName] = useState('');
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  const [videoPath, setVideoPath] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoStatus, setVideoStatus] = useState<'checking' | 'transcoding' | 'ready' | 'error'>('checking');
  const [videoError, setVideoError] = useState('');
  const [autoClipEnabled, setAutoClipEnabled] = useState(true);
  const [autoClipSeconds, setAutoClipSeconds] = useState(5);
  const [manualStart, setManualStart] = useState(0);
  const [manualEnd, setManualEnd] = useState(5);
  const [clips, setClips] = useState<ClipRange[]>([]);
  const [extractMode, setExtractMode] = useState<'all' | 'fps' | 'every_n'>('all');
  const [extractValue, setExtractValue] = useState(2);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [mergeClips, setMergeClips] = useState(false);
  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [deleteSeq, setDeleteSeq] = useState<MediaSequence | null>(null);

  const firstUnprocessedIdx = useMemo(
    () => videos.findIndex((v) => !v.processed),
    [videos]
  );
  const processedCount = useMemo(
    () => videos.filter((v) => v.processed === 1).length,
    [videos]
  );
  const allVideosProcessed = videos.length === 0 || processedCount === videos.length;
  const hasFrames = sequences.some((s) => s.frame_count > 0);

  useEffect(() => {
    if (videos.length === 0) {
      setSelectedVideo(null);
      return;
    }
    if (!selectedVideo) {
      const target = firstUnprocessedIdx >= 0 ? videos[firstUnprocessedIdx] : videos[0];
      setSelectedVideo(target);
      return;
    }
    const updated = videos.find((v) => v.id === selectedVideo.id);
    if (!updated) {
      const target = firstUnprocessedIdx >= 0 ? videos[firstUnprocessedIdx] : videos[0];
      setSelectedVideo(target);
      setClips([]);
    } else if (updated.processed === 1 && selectedVideo.processed === 0 && firstUnprocessedIdx >= 0) {
      // Auto-advance to the next unprocessed video after finishing the current one
      setSelectedVideo(videos[firstUnprocessedIdx]);
      setClips([]);
    } else {
      setSelectedVideo(updated);
    }
  }, [videos, firstUnprocessedIdx]);

  useEffect(() => {
    if (!selectedVideo) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setCurrentTime(0);
    setVideoStatus('checking');
    setVideoError('');

    const poll = async () => {
      try {
        const res = await api.getVideoStatus(selectedVideo.id);
        if (cancelled) return;
        setVideoStatus(res.status);
        if (res.status === 'error') {
          setVideoError(res.error || 'Unable to prepare video preview');
        } else if (res.status === 'transcoding') {
          timer = setTimeout(poll, 1000);
        }
      } catch (err: any) {
        if (cancelled) return;
        setVideoStatus('error');
        setVideoError(err?.message || 'Failed to check video status');
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedVideo?.id]);

  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return;
    const timer = setInterval(async () => {
      try {
        const updated = await api.getJob(projectId, job.id);
        setJob(updated);
        if (updated.status === 'completed' || updated.status === 'failed') {
          onRefresh();
        }
      } catch {
        // ignore transient errors
      }
    }, 800);
    return () => clearInterval(timer);
  }, [job, projectId]);

  const handleFolderImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) return;
    setImporting(true);
    setMsg('');
    try {
      const res = await api.importFolder(
        projectId,
        folderPath.trim(),
        folderSeqName.trim() || undefined
      );
      setMsg(`Imported ${res.imported_count} images.`);
      setFolderPath('');
      setFolderSeqName('');
      onRefresh();
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImporting(true);
    setMsg('');
    try {
      const res = await api.uploadImages(projectId, `Upload (${files.length} imgs)`, files);
      setMsg(`Uploaded ${res.imported_count} images.`);
      onRefresh();
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleUploadVideos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImporting(true);
    setMsg('');
    try {
      const created = await api.uploadVideos(projectId, files);
      setMsg(`Uploaded ${created.length} video(s).`);
      if (created[0]) {
        setSelectedVideo(created[0]);
        setClips([]);
      }
      setShowImport(false);
      onRefresh();
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleLinkVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoPath.trim()) return;
    setImporting(true);
    setMsg('');
    try {
      const v = await api.linkVideo(projectId, videoPath.trim());
      setVideoPath('');
      setSelectedVideo(v);
      setClips([]);
      setShowImport(false);
      onRefresh();
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleQuickClipAtPlayhead = () => {
    if (!selectedVideo) return;
    const t = videoRef.current ? videoRef.current.currentTime : currentTime;
    const dur = Math.max(0.5, autoClipSeconds || 5);
    const end = Math.min(selectedVideo.duration, t + dur);
    if (end <= t + 0.05) return;
    const newClip: ClipRange = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      start: Number(t.toFixed(2)),
      end: Number(end.toFixed(2)),
      label: `${formatTime(t)} → ${formatTime(end)}`,
    };
    setClips((prev) => [...prev, newClip]);
  };

  const handleAddManualClip = () => {
    if (!selectedVideo) return;
    const s = Math.max(0, Math.min(manualStart, selectedVideo.duration));
    const e = Math.max(s + 0.1, Math.min(manualEnd, selectedVideo.duration));
    setClips((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        start: Number(s.toFixed(2)),
        end: Number(e.toFixed(2)),
        label: `${formatTime(s)} → ${formatTime(e)}`,
      },
    ]);
  };

  const estimatedFrames = useMemo(() => {
    if (!selectedVideo) return 0;
    const totalSec = clips.reduce((acc, c) => acc + Math.max(0, c.end - c.start), 0);
    const fps = selectedVideo.fps || 30;
    if (extractMode === 'all') {
      return Math.round(totalSec * fps);
    }
    if (extractMode === 'fps') {
      return Math.round(totalSec * extractValue);
    }
    return Math.round((totalSec * fps) / Math.max(1, extractValue));
  }, [clips, extractMode, extractValue, selectedVideo]);

  const handleUseFullVideo = async () => {
    if (!selectedVideo) return;
    try {
      const dur = Math.max(0.5, selectedVideo.duration || 1);
      const res = await api.extractClips(projectId, {
        video_id: selectedVideo.id,
        clips: [{ start: 0, end: dur, label: 'Full Video' }],
        mode: extractMode,
        value: extractValue,
        skip_duplicates: skipDuplicates,
        merge_clips: false,
      });
      setJob({
        id: res.job_id,
        project_id: projectId,
        status: 'pending',
        progress: 0,
        total_frames: Math.round(
          dur *
            (extractMode === 'all'
              ? selectedVideo.fps || 30
              : extractMode === 'fps'
              ? extractValue
              : (selectedVideo.fps || 30) / Math.max(1, extractValue))
        ),
        extracted_frames: 0,
        message: 'Extracting full video frames...',
      });
    } catch (err: any) {
      setMsg(`Extraction error: ${err.message}`);
    }
  };

  const handleStartExtraction = async () => {
    if (!selectedVideo || clips.length === 0) return;
    try {
      const res = await api.extractClips(projectId, {
        video_id: selectedVideo.id,
        clips: clips.map((c) => ({ start: c.start, end: c.end, label: c.label })),
        mode: extractMode,
        value: extractValue,
        skip_duplicates: skipDuplicates,
        merge_clips: mergeClips,
      });
      setJob({
        id: res.job_id,
        project_id: projectId,
        status: 'pending',
        progress: 0,
        total_frames: estimatedFrames,
        extracted_frames: 0,
        message: 'Starting extraction...',
      });
    } catch (err: any) {
      setMsg(`Extraction error: ${err.message}`);
    }
  };

  return (
    <div className="h-[calc(100vh-56px)] overflow-hidden flex flex-col bg-[#D8DFDB] p-3 gap-3">
      {/* Sub-toolbar with Workflow Gate Status */}
      <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImport((v) => !v)}
            className={`font-mono-label text-xs px-3.5 py-1.5 flex items-center gap-1.5 transition-colors cursor-pointer ${
              showImport
                ? 'bg-[#13241F] text-white'
                : 'bg-[#E8553D] hover:bg-[#C83E28] text-white'
            }`}
          >
            {showImport ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            Import Media
          </button>
          <span className="font-mono-label text-[11px] text-[#76817B] tabular-nums">
            {videos.length} VIDEO(S) · {sequences.length} SEQUENCE(S)
          </span>
        </div>

        <div className="flex items-center gap-3">
          {msg && (
            <div className="font-mono-label text-xs text-[#13241F] bg-white border border-[#C4CCC7] px-3 py-1 flex items-center gap-2">
              <span>{msg}</span>
              <button onClick={() => setMsg('')} className="text-[#76817B] hover:text-[#13241F] cursor-pointer">
                ✕
              </button>
            </div>
          )}

          {hasFrames && allVideosProcessed ? (
            <button
              onClick={() => onOpenAnnotator(sequences[0].id)}
              className="bg-[#0B7A6F] hover:bg-[#096158] text-white font-mono-label text-xs px-4 py-1.5 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              Step 3: Proceed to Annotate <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : videos.length > 0 && !allVideosProcessed ? (
            <span className="font-mono-label text-[11px] text-[#C83E28] bg-[#E8553D]/10 border border-[#E8553D]/30 px-3 py-1">
              VIDEO QUEUE ({processedCount}/{videos.length} DONE): Clip or Use Full Video for current video to unlock next
            </span>
          ) : (
            <span className="font-mono-label text-[11px] text-[#C83E28] bg-[#E8553D]/10 border border-[#E8553D]/30 px-3 py-1">
              STEP 2 REQUIRED: Add a video &amp; extract clips, or import images directly to unlock Annotate
            </span>
          )}
        </div>
      </div>

      {/* Collapsible Import Drawer */}
      {showImport && (
        <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-4 shrink-0">
          <div className="max-w-5xl flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-[#C4CCC7] pb-2.5">
              <button
                onClick={() => setImportTab('video')}
                className={`px-3 py-1.5 font-mono-label text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                  importTab === 'video'
                    ? 'bg-[#13241F] text-white'
                    : 'bg-[#E2E7E4] text-[#13241F] hover:bg-[#D8DFDB]'
                }`}
              >
                <Film className="w-3.5 h-3.5" /> Videos
              </button>
              <button
                onClick={() => setImportTab('image')}
                className={`px-3 py-1.5 font-mono-label text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                  importTab === 'image'
                    ? 'bg-[#13241F] text-white'
                    : 'bg-[#E2E7E4] text-[#13241F] hover:bg-[#D8DFDB]'
                }`}
              >
                <ImagePlus className="w-3.5 h-3.5" /> Images / Folder
              </button>
            </div>

            {importTab === 'video' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="border border-dashed border-[#76817B] hover:border-[#E8553D] bg-white px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-[#E8553D]" />
                  <div className="text-xs">
                    <span className="text-[#13241F] font-semibold block">Upload Video Files</span>
                    <span className="font-mono-label text-[11px] text-[#76817B]">MP4, AVI, MOV, MKV</span>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="video/*"
                    onChange={handleUploadVideos}
                    className="hidden"
                  />
                </label>
                <form onSubmit={handleLinkVideo} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Local video path (/path/to/video.mp4)"
                    value={videoPath}
                    onChange={(e) => setVideoPath(e.target.value)}
                    className="flex-1 bg-white border border-[#C4CCC7] px-3 py-2.5 text-xs text-[#13241F] placeholder:text-[#76817B] focus:outline-none focus:border-[#E8553D]"
                  />
                  <button
                    type="submit"
                    disabled={importing}
                    className="bg-[#0B7A6F] hover:bg-[#096158] text-white font-mono-label px-4 py-2.5 text-xs cursor-pointer shrink-0"
                  >
                    Link
                  </button>
                </form>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="border border-dashed border-[#76817B] hover:border-[#0B7A6F] bg-white px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-[#0B7A6F]" />
                  <div className="text-xs">
                    <span className="text-[#13241F] font-semibold block">Upload Image Files</span>
                    <span className="font-mono-label text-[11px] text-[#76817B]">JPG, PNG, WEBP</span>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleUploadImages}
                    className="hidden"
                  />
                </label>
                <form onSubmit={handleFolderImport} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Local image folder (/path/to/images)"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    className="flex-1 bg-white border border-[#C4CCC7] px-3 py-2.5 text-xs text-[#13241F] placeholder:text-[#76817B] focus:outline-none focus:border-[#0B7A6F]"
                  />
                  <button
                    type="submit"
                    disabled={importing}
                    className="bg-[#0B7A6F] hover:bg-[#096158] text-white font-mono-label px-4 py-2.5 text-xs flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5" /> Link
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3-Column Bento Workstation */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[270px_1fr_310px] gap-3 min-h-0 overflow-hidden">
        {/* Left Rail: Media Bin */}
        <aside className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl flex flex-col min-h-0 h-full overflow-hidden">
          <div className="px-3.5 py-2 border-b border-[#C4CCC7] bg-[#E2E7E4]/60 shrink-0">
            <span className="font-mono-label text-[11px] font-bold text-[#13241F] uppercase">
              Source Videos ({videos.length})
            </span>
          </div>
          <div className="divide-y divide-[#C4CCC7]/70 max-h-[42%] overflow-y-auto shrink-0">
            {videos.length === 0 ? (
              <p className="text-xs text-[#76817B] p-4">No videos yet.</p>
            ) : (
              videos.map((v, idx) => {
                const active = selectedVideo?.id === v.id;
                const isProcessed = v.processed === 1;
                const isLocked =
                  !isProcessed && firstUnprocessedIdx !== -1 && idx > firstUnprocessedIdx;
                return (
                  <div
                    key={v.id}
                    onClick={() => {
                      if (isLocked) return;
                      setSelectedVideo(v);
                      setClips([]);
                    }}
                    title={
                      isLocked
                        ? 'Process the current video first (clip or use full video)'
                        : v.name
                    }
                    className={`group px-3.5 py-2.5 flex items-center justify-between gap-2 border-l-4 transition-colors ${
                      isLocked
                        ? 'border-l-transparent opacity-45 cursor-not-allowed bg-[#E2E7E4]/40 text-[#76817B]'
                        : active
                        ? 'border-l-[#E8553D] bg-white text-[#13241F] cursor-pointer'
                        : 'border-l-transparent text-[#13241F]/80 hover:bg-white/60 cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isLocked ? (
                          <Lock className="w-3 h-3 text-[#76817B] shrink-0" />
                        ) : isProcessed ? (
                          <Check className="w-3.5 h-3.5 text-[#0B7A6F] shrink-0" />
                        ) : null}
                        <p className="text-xs font-semibold truncate">{v.name}</p>
                      </div>
                      <p className="font-mono-label text-[10px] text-[#76817B] tabular-nums mt-0.5">
                        {formatTime(v.duration)} · {v.fps}fps · {v.width}×{v.height}
                      </p>
                    </div>
                    {!isLocked && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await api.deleteVideo(projectId, v.id);
                          onRefresh();
                        }}
                        className="opacity-0 group-hover:opacity-100 text-[#76817B] hover:text-[#E8553D] p-1 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="px-3.5 py-2 border-y border-[#C4CCC7] bg-[#E2E7E4]/60 shrink-0">
            <span className="font-mono-label text-[11px] font-bold text-[#13241F] uppercase">
              Sequences ({sequences.length})
            </span>
          </div>
          <div className="divide-y divide-[#C4CCC7]/70 flex-1 min-h-0 overflow-y-auto">
            {sequences.length === 0 ? (
              <p className="text-xs text-[#76817B] p-4">
                Extract clips or link an image folder to start annotating.
              </p>
            ) : (
              sequences.map((seq) => (
                <div
                  key={seq.id}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-white/60 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#13241F] truncate">{seq.name}</p>
                    <p className="font-mono-label text-[10px] text-[#76817B] tabular-nums mt-0.5">
                      {seq.annotated_frames}/{seq.frame_count} annotated
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onOpenAnnotator(seq.id)}
                      disabled={!allVideosProcessed}
                      title={!allVideosProcessed ? 'Finish all videos in queue first' : 'Open in Annotator'}
                      className="bg-[#0B7A6F] hover:bg-[#096158] disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono-label text-[11px] px-2.5 py-1 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      Open <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setDeleteSeq(seq)}
                      className="p-1 text-[#76817B] hover:text-[#E8553D] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Center Monitor & Quick-Clip Transport */}
        <section className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl flex flex-col min-h-0 h-full overflow-hidden">
          {!selectedVideo ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-xs text-[#76817B]">
              <Film className="w-8 h-8 text-[#9AA59F] mb-2" />
              <p className="text-[#13241F] font-semibold">No video selected</p>
              <p className="mt-1">Import or select a video from the left bin.</p>
            </div>
          ) : (
            <>
              <div className="flex-1 bg-[#13241F] flex items-center justify-center min-h-0 p-2 overflow-hidden">
                {videoStatus === 'ready' ? (
                  <video
                    key={selectedVideo.id}
                    ref={videoRef}
                    src={api.videoStreamUrl(selectedVideo.id)}
                    controls
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    className="max-h-full max-w-full w-full h-full object-contain"
                  />
                ) : videoStatus === 'error' ? (
                  <div className="text-center px-6 text-xs text-[#EEF2EF]">
                    <p className="font-semibold text-[#E8553D]">Video preview unavailable</p>
                    <p className="mt-1 text-[#9AA59F] max-w-md">{videoError}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center px-6 text-xs text-[#EEF2EF]">
                    <Loader2 className="w-7 h-7 text-[#E8553D] animate-spin mb-2.5" />
                    <p className="font-semibold">
                      {videoStatus === 'transcoding'
                        ? 'Preparing browser-compatible preview (H.264)...'
                        : 'Checking video compatibility...'}
                    </p>
                    <p className="mt-1 text-[#9AA59F]">
                      {videoStatus === 'transcoding'
                        ? 'This runs once per non-H.264 video. Clip extraction still uses the original full-resolution file.'
                        : 'Please wait a moment.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Clip Timeline */}
              <div className="border-t border-[#C4CCC7] bg-[#EEF2EF] px-4 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between font-mono-label text-[11px] text-[#76817B] tabular-nums">
                  <span>CLIP TIMELINE</span>
                  <span className="text-[#13241F] font-bold">
                    {formatTime(currentTime)} / {formatTime(selectedVideo.duration)}
                  </span>
                </div>
                <div
                  onClick={(e) => {
                    if (!videoRef.current || !selectedVideo.duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    videoRef.current.currentTime = ratio * selectedVideo.duration;
                  }}
                  className="relative h-4 bg-[#D8DFDB] border border-[#C4CCC7] overflow-hidden cursor-pointer"
                >
                  {clips.map((c) => {
                    const left = (c.start / Math.max(0.1, selectedVideo.duration)) * 100;
                    const width = ((c.end - c.start) / Math.max(0.1, selectedVideo.duration)) * 100;
                    return (
                      <div
                        key={c.id}
                        style={{ left: `${left}%`, width: `${Math.max(0.8, width)}%` }}
                        className="absolute top-0 bottom-0 bg-[#0B7A6F]/60 border-x border-[#0B7A6F]"
                        title={c.label}
                      />
                    );
                  })}
                  <div
                    style={{
                      left: `${(currentTime / Math.max(0.1, selectedVideo.duration)) * 100}%`,
                    }}
                    className="absolute top-0 bottom-0 w-0.5 bg-[#E8553D]"
                  />
                </div>
              </div>

              {/* Quick-Clip & Manual Range Controls */}
              <div className="border-t border-[#C4CCC7] bg-white px-4 py-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 font-mono-label text-xs font-bold text-[#13241F] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoClipEnabled}
                        onChange={(e) => setAutoClipEnabled(e.target.checked)}
                        className="accent-[#E8553D]"
                      />
                      AUTO-CLIP (SEC):
                    </label>
                    <div className="flex items-center gap-1">
                      {[3, 5, 10, 15, 30].map((sec) => (
                        <button
                          key={sec}
                          onClick={() => setAutoClipSeconds(sec)}
                          className={`px-2 py-1 font-mono-label text-[11px] tabular-nums cursor-pointer border transition-colors ${
                            autoClipSeconds === sec
                              ? 'bg-[#13241F] border-[#13241F] text-white'
                              : 'bg-[#EEF2EF] border-[#C4CCC7] text-[#13241F] hover:bg-[#E2E7E4]'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={autoClipSeconds}
                        onChange={(e) => setAutoClipSeconds(Number(e.target.value))}
                        className="w-14 bg-white border border-[#C4CCC7] px-2 py-1 font-mono-label text-xs text-[#13241F] text-center tabular-nums focus:outline-none focus:border-[#E8553D]"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleQuickClipAtPlayhead}
                    disabled={!autoClipEnabled}
                    className="bg-[#E8553D] hover:bg-[#C83E28] active:scale-[0.99] disabled:opacity-40 text-white font-mono-label px-4 py-2 text-xs flex items-center gap-1.5 transition cursor-pointer tabular-nums"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Clip {autoClipSeconds}s ({formatTime(currentTime)} →{' '}
                    {formatTime(Math.min(selectedVideo.duration, currentTime + autoClipSeconds))})
                  </button>
                </div>

                <div className="pt-2 border-t border-[#E2E7E4] flex flex-wrap items-center gap-2 font-mono-label text-xs">
                  <span className="text-[#76817B]">MANUAL:</span>
                  <button
                    onClick={() => setManualStart(Number(currentTime.toFixed(2)))}
                    className="bg-[#EEF2EF] hover:bg-[#E2E7E4] border border-[#C4CCC7] text-[#13241F] px-2.5 py-1 cursor-pointer tabular-nums"
                  >
                    In ({formatTime(manualStart)})
                  </button>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={manualStart}
                    onChange={(e) => setManualStart(Number(e.target.value))}
                    className="w-16 bg-white border border-[#C4CCC7] px-2 py-1 text-[#13241F] text-center tabular-nums"
                  />
                  <span className="text-[#76817B]">→</span>
                  <button
                    onClick={() => setManualEnd(Number(currentTime.toFixed(2)))}
                    className="bg-[#EEF2EF] hover:bg-[#E2E7E4] border border-[#C4CCC7] text-[#13241F] px-2.5 py-1 cursor-pointer tabular-nums"
                  >
                    Out ({formatTime(manualEnd)})
                  </button>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={manualEnd}
                    onChange={(e) => setManualEnd(Number(e.target.value))}
                    className="w-16 bg-white border border-[#C4CCC7] px-2 py-1 text-[#13241F] text-center tabular-nums"
                  />
                  <button
                    onClick={handleAddManualClip}
                    className="border border-[#76817B] text-[#13241F] hover:bg-[#13241F] hover:text-white px-3 py-1 flex items-center gap-1 cursor-pointer ml-auto transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Range
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Right Rail: Clip Queue & Extraction */}
        <aside className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl flex flex-col justify-between min-h-0 h-full overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-3.5 py-2.5 border-b border-[#C4CCC7] bg-[#E2E7E4]/60 flex items-center justify-between">
              <span className="font-mono-label text-[11px] font-bold text-[#13241F] uppercase">
                Clip Queue ({clips.length})
              </span>
              {clips.length > 0 && (
                <button
                  onClick={() => setClips([])}
                  className="font-mono-label text-[11px] text-[#E8553D] hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#C4CCC7]/70">
              {clips.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#76817B]">
                  Scrub the video and click <strong>Clip {autoClipSeconds}s</strong> to add ranges.
                </div>
              ) : (
                clips.map((c, idx) => (
                  <div
                    key={c.id}
                    className="px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-white/60"
                  >
                    <button
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = c.start;
                      }}
                      className="font-mono-label text-[#13241F] hover:text-[#E8553D] flex items-center gap-2 text-left cursor-pointer tabular-nums"
                    >
                      <Play className="w-3 h-3 text-[#0B7A6F] shrink-0" />
                      <span>
                        #{idx + 1} · {formatTime(c.start)} → {formatTime(c.end)}
                      </span>
                    </button>
                    <button
                      onClick={() => setClips((prev) => prev.filter((x) => x.id !== c.id))}
                      className="text-[#76817B] hover:text-[#E8553D] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Extraction Config */}
          <div className="border-t border-[#C4CCC7] bg-white p-4 space-y-3 text-xs">
            <div className="font-mono-label text-[11px] font-bold text-[#13241F] uppercase">
              Extraction Settings
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#76817B]">Mode</span>
              <select
                value={extractMode}
                onChange={(e) => setExtractMode(e.target.value as 'all' | 'fps' | 'every_n')}
                className="bg-[#EEF2EF] border border-[#C4CCC7] px-2 py-1 font-mono-label text-xs text-[#13241F]"
              >
                <option value="all">All Frames (Full FPS)</option>
                <option value="fps">Target FPS</option>
                <option value="every_n">Every N Frames</option>
              </select>
            </div>
            {extractMode !== 'all' && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#76817B]">
                  {extractMode === 'fps' ? 'Frames / sec' : 'Step (frames)'}
                </span>
                <input
                  type="number"
                  min={0.1}
                  step={extractMode === 'fps' ? 0.5 : 1}
                  value={extractValue}
                  onChange={(e) => setExtractValue(Number(e.target.value))}
                  className="w-20 bg-[#EEF2EF] border border-[#C4CCC7] px-2 py-1 font-mono-label text-xs text-[#13241F] text-center tabular-nums"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-[#13241F] cursor-pointer">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="accent-[#0B7A6F]"
              />
              Skip near-duplicate frames
            </label>
            <label className="flex items-center gap-2 text-[#13241F] cursor-pointer">
              <input
                type="checkbox"
                checked={mergeClips}
                onChange={(e) => setMergeClips(e.target.checked)}
                className="accent-[#0B7A6F]"
              />
              Merge clips into one sequence
            </label>

            <div className="pt-2 border-t border-[#E2E7E4] flex items-center justify-between font-mono-label text-[#76817B] tabular-nums">
              <span>EST. FRAMES</span>
              <span className="text-[#13241F] font-bold">{estimatedFrames}</span>
            </div>

            <button
              onClick={handleStartExtraction}
              disabled={!selectedVideo || clips.length === 0 || (job !== null && job.status === 'running')}
              className="w-full bg-[#0B7A6F] hover:bg-[#096158] active:scale-[0.99] disabled:opacity-40 text-white font-mono-label py-2.5 text-xs transition cursor-pointer"
            >
              Extract Selected Clips ({clips.length})
            </button>

            <button
              onClick={handleUseFullVideo}
              disabled={!selectedVideo || (job !== null && job.status === 'running')}
              className="w-full bg-[#13241F] hover:bg-[#22352F] active:scale-[0.99] disabled:opacity-40 text-white font-mono-label py-2 text-xs transition cursor-pointer"
              title="Skip clipping and extract frames from the entire video"
            >
              Use Full Video ({selectedVideo ? formatTime(selectedVideo.duration) : '00:00'})
            </button>

            {job && (
              <div className="bg-[#EEF2EF] border border-[#C4CCC7] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between font-mono-label tabular-nums">
                  <span className="flex items-center gap-1.5 text-[#13241F] font-bold">
                    {job.status === 'completed' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#0B7A6F]" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E8553D]" />
                    )}
                    {job.status.toUpperCase()}
                  </span>
                  <span>{Math.round((job.progress || 0) * 100)}%</span>
                </div>
                <div className="w-full bg-[#D8DFDB] h-1.5 overflow-hidden">
                  <div
                    className="bg-[#0B7A6F] h-full transition-all"
                    style={{ width: `${Math.round((job.progress || 0) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#76817B]">{job.message}</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <ConfirmModal
        open={Boolean(deleteSeq)}
        title="Delete Sequence"
        message={`Delete sequence "${deleteSeq?.name}" and its extracted frames?`}
        confirmLabel="Delete Sequence"
        onConfirm={async () => {
          if (!deleteSeq) return;
          await api.deleteSequence(projectId, deleteSeq.id);
          setDeleteSeq(null);
          onRefresh();
        }}
        onCancel={() => setDeleteSeq(null)}
      />
    </div>
  );
};
