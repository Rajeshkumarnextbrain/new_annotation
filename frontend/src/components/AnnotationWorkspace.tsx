import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  GitBranch,
  Keyboard,
  Loader2,
  Maximize2,
  MousePointer,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sliders,
  Square,
  Trash2,
  Undo2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AnnotationBox,
  ClassItem,
  FrameItem,
  ImageFilters,
  MediaSequence,
  TrackSummary,
} from '../types';
import { api } from '../api/client';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  projectId: number;
  sequences: MediaSequence[];
  selectedSequenceId: number | null;
  onSelectSequence: (id: number) => void;
  classes: ClassItem[];
  onRefreshClasses: () => void;
  onAnnotationsSaved?: () => void;
}

const DEFAULT_FILTERS: ImageFilters = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  gamma: 1.0,
  invert: false,
};

type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

export const AnnotationWorkspace: React.FC<Props> = ({
  projectId,
  sequences,
  selectedSequenceId,
  onSelectSequence,
  classes,
  onRefreshClasses,
  onAnnotationsSaved,
}) => {
  const [frames, setFrames] = useState<FrameItem[]>([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const [annotations, setAnnotations] = useState<AnnotationBox[]>([]);
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [activeClassId, setActiveClassId] = useState<number | null>(null);
  const [toolMode, setToolMode] = useState<'draw' | 'select'>('draw');

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<AnnotationBox[][]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationBox[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Canvas & Visual settings
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cursorNorm, setCursorNorm] = useState<{ x: number; y: number } | null>(null);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [hideBoxes, setHideBoxes] = useState(false);
  const [boxOpacity, setBoxOpacity] = useState(0.2);
  const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Playback & Tracking
  const [playing, setPlaying] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [trackLength, setTrackLength] = useState(10);
  const [seqMenuOpen, setSeqMenuOpen] = useState(false);
  const seqMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    boxIdx: number;
  } | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (seqMenuRef.current && !seqMenuRef.current.contains(e.target as Node)) {
        setSeqMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // New class quick-add & initial popup
  const [newClassName, setNewClassName] = useState('');
  const [showClassModal, setShowClassModal] = useState(classes.length === 0);
  const [classError, setClassError] = useState('');
  const [deleteClassTarget, setDeleteClassTarget] = useState<ClassItem | null>(null);

  // Interaction refs
  const dragRef = useRef<{
    type: 'draw' | 'pan' | 'edit';
    handle?: HandleType;
    startClientX: number;
    startClientY: number;
    startNormX: number;
    startNormY: number;
    startPan: { x: number; y: number };
    origBox?: AnnotationBox;
  } | null>(null);
  const [draftBox, setDraftBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const currentFrame = frames[frameIdx] || null;

  useEffect(() => {
    if (classes.length === 0) {
      setShowClassModal(true);
    } else if (activeClassId === null || !classes.some((c) => c.id === activeClassId)) {
      setActiveClassId(classes[0].id);
    }
  }, [classes, activeClassId]);

  // Load sequence frames & tracks
  useEffect(() => {
    if (!selectedSequenceId) {
      setFrames([]);
      setTracks([]);
      return;
    }
    api.listFrames(selectedSequenceId).then((fs) => {
      setFrames(fs);
      setFrameIdx(0);
    });
    api.listTracks(selectedSequenceId).then(setTracks);
  }, [selectedSequenceId]);

  // Load current frame annotations
  useEffect(() => {
    if (!currentFrame) {
      setAnnotations([]);
      return;
    }
    setImgLoaded(false);
    setSelectedIdx(null);
    setUndoStack([]);
    setRedoStack([]);
    setDirty(false);
    api.getFrameAnnotations(currentFrame.id).then(setAnnotations);
  }, [currentFrame?.id]);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current || !currentFrame) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pad = 40;
    const scaleX = (rect.width - pad) / currentFrame.width;
    const scaleY = (rect.height - pad) / currentFrame.height;
    const fitZoom = Math.max(0.1, Math.min(2, Math.min(scaleX, scaleY)));
    setZoom(fitZoom);
    setPan({
      x: (rect.width - currentFrame.width * fitZoom) / 2,
      y: (rect.height - currentFrame.height * fitZoom) / 2,
    });
  }, [currentFrame]);

  useEffect(() => {
    if (imgLoaded) {
      fitToScreen();
    }
  }, [imgLoaded, fitToScreen]);

  const pushHistory = useCallback((next: AnnotationBox[]) => {
    setAnnotations((prev) => {
      setUndoStack((u) => [...u.slice(-39), prev]);
      setRedoStack([]);
      return next;
    });
    setDirty(true);
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const prev = u[u.length - 1];
      setAnnotations((curr) => {
        setRedoStack((r) => [...r, curr]);
        return prev;
      });
      setDirty(true);
      return u.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const next = r[r.length - 1];
      setAnnotations((curr) => {
        setUndoStack((u) => [...u, curr]);
        return next;
      });
      setDirty(true);
      return r.slice(0, -1);
    });
  }, []);

  const checkAndAdvanceSequence = useCallback(
    (updatedFrames: FrameItem[]): boolean => {
      if (updatedFrames.length === 0) return false;
      const allDone = updatedFrames.every((f) => (f.annotation_count || 0) > 0);
      if (!allDone) return false;

      const currIdx = sequences.findIndex((s) => s.id === selectedSequenceId);
      const nextSeq =
        sequences.find(
          (s, idx) => idx > currIdx && s.frame_count > 0 && s.annotated_frames < s.frame_count
        ) ||
        sequences.find(
          (s) => s.id !== selectedSequenceId && s.frame_count > 0 && s.annotated_frames < s.frame_count
        );

      if (nextSeq) {
        setStatusMsg(`Sequence complete! Switched to: ${nextSeq.name}`);
        onSelectSequence(nextSeq.id);
        return true;
      }
      setStatusMsg('All sequences annotated! Ready for 4. Split & Export.');
      return false;
    },
    [sequences, selectedSequenceId, onSelectSequence]
  );

  const saveCurrentFrame = useCallback(
    async (annsToSave?: AnnotationBox[]): Promise<boolean> => {
      if (!currentFrame) return false;
      const payload = annsToSave || annotations;
      setSaving(true);
      try {
        const saved = await api.saveFrameAnnotations(currentFrame.id, payload);
        setAnnotations(saved);
        setDirty(false);
        const updatedFrames = frames.map((f) =>
          f.id === currentFrame.id ? { ...f, annotation_count: saved.length } : f
        );
        setFrames(updatedFrames);
        if (selectedSequenceId) {
          api.listTracks(selectedSequenceId).then(setTracks);
        }
        onAnnotationsSaved?.();
        return checkAndAdvanceSequence(updatedFrames);
      } finally {
        setSaving(false);
      }
    },
    [currentFrame, annotations, frames, selectedSequenceId, onAnnotationsSaved, checkAndAdvanceSequence]
  );

  const goToFrame = useCallback(
    async (nextIdx: number) => {
      if (frames.length === 0) return;
      const currSeqIdx = sequences.findIndex((s) => s.id === selectedSequenceId);

      // Moving past last frame -> advance to next video/sequence
      if (nextIdx >= frames.length) {
        if (currSeqIdx >= 0 && currSeqIdx < sequences.length - 1) {
          if (dirty && autoSave) {
            await saveCurrentFrame();
          } else if (dirty && !autoSave) {
            setStatusMsg('Unsaved changes discarded (Auto-Save OFF)');
          }
          const nextSeq = sequences[currSeqIdx + 1];
          setStatusMsg(`Moved to next video: ${nextSeq.name}`);
          onSelectSequence(nextSeq.id);
        }
        return;
      }

      // Moving before first frame -> go back to previous video/sequence
      if (nextIdx < 0) {
        if (currSeqIdx > 0) {
          if (dirty && autoSave) {
            await saveCurrentFrame();
          } else if (dirty && !autoSave) {
            setStatusMsg('Unsaved changes discarded (Auto-Save OFF)');
          }
          const prevSeq = sequences[currSeqIdx - 1];
          setStatusMsg(`Moved to previous video: ${prevSeq.name}`);
          onSelectSequence(prevSeq.id);
        }
        return;
      }

      if (nextIdx === frameIdx) return;
      if (dirty && autoSave) {
        const advanced = await saveCurrentFrame();
        if (advanced) return;
      } else if (dirty && !autoSave) {
        setStatusMsg('Unsaved changes discarded (Auto-Save OFF)');
      }
      setFrameIdx(nextIdx);
    },
    [frames.length, frameIdx, dirty, autoSave, saveCurrentFrame, sequences, selectedSequenceId, onSelectSequence]
  );

  // Playback loop
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setFrameIdx((prev) => {
        if (prev + 1 >= frames.length) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 150);
    return () => clearInterval(t);
  }, [playing, frames.length]);

  const handleCopyPrevious = useCallback(async () => {
    if (!currentFrame || frameIdx <= 0) return;
    const prevFrame = frames[frameIdx - 1];
    const copied = await api.copyFromFrame(currentFrame.id, prevFrame.id);
    setAnnotations(copied);
    setDirty(false);
    const updatedFrames = frames.map((f) =>
      f.id === currentFrame.id ? { ...f, annotation_count: copied.length } : f
    );
    setFrames(updatedFrames);
    setStatusMsg(`Copied ${copied.length} box(es) from previous frame`);
    onAnnotationsSaved?.();
    checkAndAdvanceSequence(updatedFrames);
  }, [currentFrame, frameIdx, frames, onAnnotationsSaved, checkAndAdvanceSequence]);

  const handleInterpolateSelected = async () => {
    if (!selectedSequenceId || selectedIdx === null) return;
    const box = annotations[selectedIdx];
    if (!box || box.track_id === null) {
      setStatusMsg('Assign a Track ID to this box first (across at least 2 keyframes).');
      return;
    }
    if (dirty) await saveCurrentFrame();
    try {
      const res = await api.interpolateTrack(selectedSequenceId, box.track_id);
      setStatusMsg(`Interpolated ${res.interpolated_count} frame(s) for Track #${box.track_id}`);
      const fs = await api.listFrames(selectedSequenceId);
      setFrames(fs);
    } catch (err: any) {
      setStatusMsg(`Interpolate error: ${err.message}`);
    }
  };

  const handleOpenCvTrack = useCallback(async () => {
    if (!selectedSequenceId || !currentFrame || annotations.length === 0 || trackingLoading) return;
    setTrackingLoading(true);
    try {
      if (dirty || annotations.some((a) => !a.id)) {
        const saved = await api.saveFrameAnnotations(currentFrame.id, annotations);
        setAnnotations(saved);
        setDirty(false);
      }
      setStatusMsg(`Tracking ${annotations.length} object(s) (+${trackLength} frames)...`);
      const res = await api.opencvTrackForward(selectedSequenceId, currentFrame.id, null, trackLength);
      setStatusMsg(`Tracked ${res.tracked_objects} object(s) across +${trackLength} frames`);
      const refreshed = await api.getFrameAnnotations(currentFrame.id);
      setAnnotations(refreshed);
      const fs = await api.listFrames(selectedSequenceId);
      setFrames(fs);
      api.listTracks(selectedSequenceId).then(setTracks);
      onAnnotationsSaved?.();
    } catch (err: any) {
      setStatusMsg(`Tracker error: ${err.message}`);
    } finally {
      setTrackingLoading(false);
    }
  }, [selectedSequenceId, currentFrame, annotations, dirty, trackLength, trackingLoading, onAnnotationsSaved]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveCurrentFrame();
        return;
      }

      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        e.preventDefault();
        goToFrame(frameIdx + 1);
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        e.preventDefault();
        goToFrame(frameIdx - 1);
      } else if (e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 's') {
        if (classes.length === 0) return;
        e.preventDefault();
        const currIdx = classes.findIndex((c) => c.id === activeClassId);
        const dir = e.key.toLowerCase() === 's' ? 1 : -1;
        const nextIdx =
          currIdx === -1
            ? 0
            : (currIdx + dir + classes.length) % classes.length;
        const cls = classes[nextIdx];
        setActiveClassId(cls.id);
      } else if (e.key.toLowerCase() === 'b') {
        setToolMode('draw');
      } else if (e.key.toLowerCase() === 'v') {
        setToolMode('select');
      } else if (e.key.toLowerCase() === 'h') {
        setHideBoxes((v) => !v);
      } else if (e.key.toLowerCase() === 'c') {
        handleCopyPrevious();
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleOpenCvTrack();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIdx !== null) {
          e.preventDefault();
          const next = annotations.filter((_, i) => i !== selectedIdx);
          setSelectedIdx(null);
          pushHistory(next);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    frameIdx,
    annotations,
    selectedIdx,
    classes,
    activeClassId,
    goToFrame,
    handleUndo,
    handleRedo,
    saveCurrentFrame,
    handleCopyPrevious,
    handleOpenCvTrack,
    pushHistory,
  ]);

  // Coordinate helpers
  const clientToNorm = (clientX: number, clientY: number) => {
    if (!containerRef.current || !currentFrame) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const imgX = (clientX - rect.left - pan.x) / zoom;
    const imgY = (clientY - rect.top - pan.y) / zoom;
    return {
      x: Math.max(0, Math.min(1, imgX / currentFrame.width)),
      y: Math.max(0, Math.min(1, imgY / currentFrame.height)),
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextZoom = Math.max(0.1, Math.min(12, zoom * factor));
    const scale = nextZoom / zoom;
    setPan({
      x: mouseX - (mouseX - pan.x) * scale,
      y: mouseY - (mouseY - pan.y) * scale,
    });
    setZoom(nextZoom);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setContextMenu(null);
    if (!currentFrame) return;
    // Middle click or Alt+click -> pan
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      dragRef.current = {
        type: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startNormX: 0,
        startNormY: 0,
        startPan: { ...pan },
      };
      return;
    }

    if (e.button !== 0) return;
    const norm = clientToNorm(e.clientX, e.clientY);

    if (toolMode === 'draw') {
      if (!activeClassId) {
        setShowClassModal(true);
        return;
      }
      dragRef.current = {
        type: 'draw',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startNormX: norm.x,
        startNormY: norm.y,
        startPan: { ...pan },
      };
      setDraftBox({ x: norm.x, y: norm.y, w: 0, h: 0 });
    } else {
      // Left-clicking outside any bbox while in Select mode switches back to Draw mode
      setSelectedIdx(null);
      setToolMode('draw');
      if (activeClassId) {
        dragRef.current = {
          type: 'draw',
          startClientX: e.clientX,
          startClientY: e.clientY,
          startNormX: norm.x,
          startNormY: norm.y,
          startPan: { ...pan },
        };
        setDraftBox({ x: norm.x, y: norm.y, w: 0, h: 0 });
      }
    }
  };

  const handleBoxMouseDown = (e: React.MouseEvent, idx: number, handle: HandleType) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelectedIdx(idx);
    const norm = clientToNorm(e.clientX, e.clientY);
    dragRef.current = {
      type: 'edit',
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startNormX: norm.x,
      startNormY: norm.y,
      startPan: { ...pan },
      origBox: { ...annotations[idx] },
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const norm = clientToNorm(e.clientX, e.clientY);
    setCursorNorm(norm);

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.type === 'pan') {
      setPan({
        x: drag.startPan.x + (e.clientX - drag.startClientX),
        y: drag.startPan.y + (e.clientY - drag.startClientY),
      });
    } else if (drag.type === 'draw') {
      const x = Math.min(drag.startNormX, norm.x);
      const y = Math.min(drag.startNormY, norm.y);
      const w = Math.abs(norm.x - drag.startNormX);
      const h = Math.abs(norm.y - drag.startNormY);
      setDraftBox({ x, y, w, h });
    } else if (drag.type === 'edit' && drag.origBox && selectedIdx !== null) {
      const dx = norm.x - drag.startNormX;
      const dy = norm.y - drag.startNormY;
      const b = { ...drag.origBox };
      const hnd = drag.handle || 'move';

      if (hnd === 'move') {
        b.x = Math.max(0, Math.min(1 - b.w, b.x + dx));
        b.y = Math.max(0, Math.min(1 - b.h, b.y + dy));
      } else {
        let x1 = b.x;
        let y1 = b.y;
        let x2 = b.x + b.w;
        let y2 = b.y + b.h;
        if (hnd.includes('w')) x1 = Math.max(0, Math.min(x2 - 0.005, x1 + dx));
        if (hnd.includes('e')) x2 = Math.min(1, Math.max(x1 + 0.005, x2 + dx));
        if (hnd.includes('n')) y1 = Math.max(0, Math.min(y2 - 0.005, y1 + dy));
        if (hnd.includes('s')) y2 = Math.min(1, Math.max(y1 + 0.005, y2 + dy));
        b.x = x1;
        b.y = y1;
        b.w = x2 - x1;
        b.h = y2 - y1;
      }
      b.is_keyframe = 1;
      b.interpolated = 0;

      setAnnotations((prev) => prev.map((item, i) => (i === selectedIdx ? b : item)));
    }
  };

  const handleMouseUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    if (drag.type === 'draw' && draftBox && activeClassId && currentFrame) {
      if (draftBox.w > 0.004 && draftBox.h > 0.004) {
        const cls = classes.find((c) => c.id === activeClassId);
        const newBox: AnnotationBox = {
          localId: `${Date.now()}`,
          frame_id: currentFrame.id,
          class_id: activeClassId,
          class_name: cls?.name,
          class_color: cls?.color,
          x: Number(draftBox.x.toFixed(6)),
          y: Number(draftBox.y.toFixed(6)),
          w: Number(draftBox.w.toFixed(6)),
          h: Number(draftBox.h.toFixed(6)),
          track_id: null,
          is_keyframe: 1,
          interpolated: 0,
        };
        pushHistory([...annotations, newBox]);
        setSelectedIdx(annotations.length);
      } else {
        // Single click without drag in Draw mode: select the smallest/topmost labeled bbox under cursor
        const px = drag.startNormX;
        const py = drag.startNormY;
        let hitIdx: number | null = null;
        let bestArea = Infinity;
        annotations.forEach((b, i) => {
          if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
            const area = b.w * b.h;
            if (area <= bestArea) {
              bestArea = area;
              hitIdx = i;
            }
          }
        });
        setSelectedIdx(hitIdx);
        if (hitIdx !== null) {
          setToolMode('select');
        }
      }
      setDraftBox(null);
    } else if (drag.type === 'edit' && drag.origBox) {
      setUndoStack((u) => [...u.slice(-39), annotations.map((a, i) => (i === selectedIdx ? drag.origBox! : a))]);
      setRedoStack([]);
      setDirty(true);
    }
  };

  const assignTrackId = (tid: number | null) => {
    if (selectedIdx === null) return;
    const next = annotations.map((a, i) => (i === selectedIdx ? { ...a, track_id: tid } : a));
    pushHistory(next);
  };

  const nextTrackId = useMemo(() => {
    const maxFromTracks = tracks.reduce((m, t) => Math.max(m, t.track_id), 0);
    const maxLocal = annotations.reduce((m, a) => Math.max(m, a.track_id || 0), 0);
    return Math.max(maxFromTracks, maxLocal) + 1;
  }, [tracks, annotations]);

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const names = newClassName
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setClassError('');
    try {
      let lastCreatedId: number | null = null;
      for (const cname of names) {
        const created = await api.createClass(projectId, cname);
        lastCreatedId = created.id;
      }
      setNewClassName('');
      onRefreshClasses();
      if (lastCreatedId !== null) setActiveClassId(lastCreatedId);
    } catch (err: any) {
      setClassError(err.message || 'Failed to add class');
    }
  };

  const filterCss = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) ${
    filters.invert ? 'invert(1)' : ''
  }`;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-[#D8DFDB] select-none">
      {/* Top Toolbar */}
      <div className="h-11 bg-[#EEF2EF] border-b border-[#C4CCC7] px-3 flex items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2">
          {/* Sequence Status Dropdown + Prev/Next Buttons */}
          <div className="flex items-center gap-1">
            {(() => {
              const currSeqIdx = sequences.findIndex((s) => s.id === selectedSequenceId);
              const hasPrevSeq = currSeqIdx > 0;
              const hasNextSeq = currSeqIdx >= 0 && currSeqIdx < sequences.length - 1;
              return (
                <>
                  <button
                    disabled={!hasPrevSeq}
                    onClick={() => hasPrevSeq && onSelectSequence(sequences[currSeqIdx - 1].id)}
                    title="Previous Video / Sequence"
                    className="bg-white border border-[#C4CCC7] hover:border-[#13241F] disabled:opacity-35 disabled:cursor-not-allowed p-1 text-[#13241F] cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <div ref={seqMenuRef} className="relative">
                    {(() => {
                      const activeSeq = sequences.find((s) => s.id === selectedSequenceId);
                      const getStatus = (s: MediaSequence) => {
                        if (s.frame_count > 0 && s.annotated_frames >= s.frame_count) return 'done';
                        if (s.annotated_frames > 0) return 'in_progress';
                        return 'not_started';
                      };
                      const activeStatus = activeSeq ? getStatus(activeSeq) : 'not_started';
                      return (
                        <>
                          <button
                            onClick={() => setSeqMenuOpen((v) => !v)}
                            className="bg-white border border-[#C4CCC7] hover:border-[#13241F] px-2 py-1 font-mono-label text-[#13241F] text-xs flex items-center gap-2 w-[210px] justify-between cursor-pointer whitespace-nowrap"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span
                                className={`w-2 h-2 shrink-0 rounded-full ${
                                  activeStatus === 'done'
                                    ? 'bg-[#0B7A6F]'
                                    : activeStatus === 'in_progress'
                                    ? 'bg-[#E8553D]'
                                    : 'bg-[#76817B]'
                                }`}
                              />
                              <span className="truncate">{activeSeq ? activeSeq.name : 'No sequences'}</span>
                            </span>
                            <span className="flex items-center gap-1 shrink-0 text-[10px] text-[#76817B] tabular-nums">
                              {activeSeq && `${activeSeq.annotated_frames}/${activeSeq.frame_count}`}
                              <ChevronDown className="w-3.5 h-3.5 text-[#13241F]" />
                            </span>
                          </button>

                          {seqMenuOpen && (
                            <div className="absolute left-0 top-full mt-1 w-96 max-h-80 overflow-y-auto bg-[#EEF2EF] border border-[#13241F] shadow-xl z-40 divide-y divide-[#C4CCC7]">
                              {sequences.map((s) => {
                                const st = getStatus(s);
                                const isCurr = s.id === selectedSequenceId;
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => {
                                      onSelectSequence(s.id);
                                      setSeqMenuOpen(false);
                                    }}
                                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors border-l-4 ${
                                      isCurr
                                        ? 'border-l-[#E8553D] bg-white'
                                        : 'border-l-transparent hover:bg-white/70'
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-medium text-[#13241F] truncate">{s.name}</span>
                                        {isCurr && (
                                          <span className="font-mono-label text-[9px] bg-[#13241F] text-white px-1 py-0.5 shrink-0">
                                            CURRENT
                                          </span>
                                        )}
                                      </div>
                                      <div className="font-mono-label text-[10px] text-[#76817B] tabular-nums mt-0.5">
                                        {s.annotated_frames} / {s.frame_count} frames annotated
                                      </div>
                                    </div>

                                    <span
                                      className={`font-mono-label text-[10px] px-1.5 py-0.5 shrink-0 flex items-center gap-1 ${
                                        st === 'done'
                                          ? 'bg-[#0B7A6F] text-white'
                                          : st === 'in_progress'
                                          ? 'bg-[#E8553D] text-white'
                                          : 'bg-[#E2E7E4] text-[#76817B]'
                                      }`}
                                    >
                                      {st === 'done' && <Check className="w-3 h-3" />}
                                      {st === 'done'
                                        ? 'COMPLETE'
                                        : st === 'in_progress'
                                        ? 'ANNOTATING'
                                        : 'NOT STARTED'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <button
                    disabled={!hasNextSeq}
                    onClick={() => hasNextSeq && onSelectSequence(sequences[currSeqIdx + 1].id)}
                    title="Next Video / Sequence"
                    className="bg-white border border-[#C4CCC7] hover:border-[#13241F] disabled:opacity-35 disabled:cursor-not-allowed p-1 text-[#13241F] cursor-pointer shrink-0"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              );
            })()}
          </div>

          <div className="h-5 w-px bg-[#C4CCC7] mx-1" />

          <button
            onClick={() => setToolMode('draw')}
            className={`px-2.5 py-1 font-mono-label flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              toolMode === 'draw' ? 'bg-[#E8553D] text-white' : 'text-[#13241F] hover:bg-[#E2E7E4]'
            }`}
            title="Draw Box (B)"
          >
            <Square className="w-3.5 h-3.5" /> Draw (B)
          </button>
          <button
            onClick={() => setToolMode('select')}
            className={`px-2.5 py-1 font-mono-label flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              toolMode === 'select' ? 'bg-[#E8553D] text-white' : 'text-[#13241F] hover:bg-[#E2E7E4]'
            }`}
            title="Select / Edit (V)"
          >
            <MousePointer className="w-3.5 h-3.5" /> Select (V)
          </button>

          <div className="h-5 w-px bg-[#C4CCC7] mx-1" />

          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-1.5 text-[#13241F] hover:bg-[#E2E7E4] disabled:opacity-30 cursor-pointer shrink-0"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-1.5 text-[#13241F] hover:bg-[#E2E7E4] disabled:opacity-30 cursor-pointer shrink-0"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleCopyPrevious}
            disabled={frameIdx <= 0}
            className="px-2 py-1 font-mono-label text-[#13241F] hover:bg-[#E2E7E4] disabled:opacity-30 flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title="Copy Previous Frame (C)"
          >
            <Copy className="w-3.5 h-3.5" /> Copy Prev (C)
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {statusMsg && (
            <span
              title={statusMsg}
              className="font-mono-label text-[#C83E28] text-[11px] max-w-[200px] truncate mr-1"
            >
              {statusMsg}
            </span>
          )}

          <button
            onClick={() => setZoom((z) => Math.min(12, z * 1.2))}
            className="p-1.5 text-[#13241F] hover:bg-[#E2E7E4] cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="font-mono-label text-[#76817B] w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.max(0.1, z * 0.85))}
            className="p-1.5 text-[#13241F] hover:bg-[#E2E7E4] cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={fitToScreen}
            className="p-1.5 text-[#13241F] hover:bg-[#E2E7E4] cursor-pointer"
            title="Fit to Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowCrosshair((v) => !v)}
            className={`p-1.5 cursor-pointer ${showCrosshair ? 'bg-[#13241F] text-white' : 'text-[#76817B]'}`}
            title="Toggle Crosshair"
          >
            <Crosshair className="w-4 h-4" />
          </button>
          <button
            onClick={() => setHideBoxes((v) => !v)}
            className={`p-1.5 cursor-pointer ${hideBoxes ? 'bg-[#E8553D] text-white' : 'text-[#76817B]'}`}
            title="Hide/Show Boxes (H)"
          >
            {hideBoxes ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`px-2 py-1 font-mono-label flex items-center gap-1 cursor-pointer ${
              showFilters ? 'bg-[#13241F] text-white' : 'text-[#13241F] hover:bg-[#E2E7E4]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Filters
          </button>
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            className="p-1.5 text-[#13241F] hover:bg-[#E2E7E4] cursor-pointer"
            title="Keyboard Shortcuts"
          >
            <Keyboard className="w-4 h-4" />
          </button>

          <label
            className="flex items-center gap-1.5 font-mono-label text-[11px] text-[#13241F] bg-[#E2E7E4] px-2 py-1 cursor-pointer"
            title="Automatically save boxes when switching frames"
          >
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(e) => setAutoSave(e.target.checked)}
              className="accent-[#0B7A6F]"
            />
            Auto-Save
          </label>

          <button
            onClick={() => saveCurrentFrame()}
            disabled={saving || !currentFrame}
            className={`px-3 py-1 font-mono-label font-bold flex items-center gap-1.5 cursor-pointer ${
              dirty
                ? 'bg-[#0B7A6F] hover:bg-[#096158] text-white'
                : 'bg-[#E2E7E4] text-[#13241F] hover:bg-[#D8DFDB]'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : dirty ? 'Save*' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Main Split: Canvas + Right Sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas Viewport */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!currentFrame || hideBoxes) return;
            const norm = clientToNorm(e.clientX, e.clientY);
            let hitIdx: number | null = null;
            let bestArea = Infinity;
            annotations.forEach((b, i) => {
              if (norm.x >= b.x && norm.x <= b.x + b.w && norm.y >= b.y && norm.y <= b.y + b.h) {
                const area = b.w * b.h;
                if (area <= bestArea) {
                  bestArea = area;
                  hitIdx = i;
                }
              }
            });
            if (hitIdx !== null) {
              setSelectedIdx(hitIdx);
              setContextMenu({ x: e.clientX, y: e.clientY, boxIdx: hitIdx });
            } else {
              setContextMenu(null);
            }
          }}
          onMouseLeave={() => {
            setCursorNorm(null);
            handleMouseUp();
          }}
          className={`relative flex-1 overflow-hidden bg-slate-950 ${
            toolMode === 'draw' ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          {!currentFrame ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              Select or import a sequence to start annotating.
            </div>
          ) : (
            <>
              {(!imgLoaded || trackingLoading || saving) && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#13241F]/90 text-white px-3 py-1.5 font-mono-label text-[11px] flex items-center gap-2 border border-white/20 shadow-lg">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E8553D]" />
                  <span>
                    {trackingLoading
                      ? `Auto-Tracking ${annotations.length} box(es)...`
                      : saving
                      ? 'Saving frame...'
                      : 'Loading frame...'}
                  </span>
                </div>
              )}
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                width: currentFrame.width,
                height: currentFrame.height,
              }}
              className="relative"
            >
              <img
                ref={imgRef}
                src={api.frameImageUrl(currentFrame.id)}
                alt={currentFrame.filename}
                onLoad={() => setImgLoaded(true)}
                draggable={false}
                style={{ filter: filterCss, width: currentFrame.width, height: currentFrame.height }}
                className="block pointer-events-none select-none"
              />

              {/* Existing Boxes */}
              {!hideBoxes &&
                annotations.map((box, idx) => {
                  const color = box.class_color || '#3b82f6';
                  const selected = idx === selectedIdx;
                  const left = box.x * currentFrame.width;
                  const top = box.y * currentFrame.height;
                  const width = box.w * currentFrame.width;
                  const height = box.h * currentFrame.height;
                  const invZoom = 1 / zoom;

                  return (
                    <div
                      key={box.id || box.localId || idx}
                      onMouseDown={(e) => {
                        if (toolMode === 'draw') return;
                        handleBoxMouseDown(e, idx, 'move');
                      }}
                      style={{
                        left,
                        top,
                        width,
                        height,
                        borderColor: color,
                        borderWidth: `${Math.max(1.5, 2 * invZoom)}px`,
                        borderStyle: box.interpolated ? 'dashed' : 'solid',
                        backgroundColor: `${color}${Math.round(boxOpacity * 255)
                          .toString(16)
                          .padStart(2, '0')}`,
                      }}
                      className={`absolute ${
                        toolMode === 'draw' ? 'pointer-events-none' : 'cursor-move'
                      } ${selected ? 'ring-2 ring-white/80' : ''}`}
                    >
                      <div
                        style={{
                          backgroundColor: color,
                          transform: `scale(${invZoom})`,
                          transformOrigin: 'bottom left',
                        }}
                        className="absolute -top-5 left-0 px-1.5 py-0.5 text-[11px] font-semibold text-white whitespace-nowrap rounded-t pointer-events-none"
                      >
                        {box.class_name || 'class'}
                        {box.track_id !== null ? ` #${box.track_id}` : ''}
                      </div>

                      {selected &&
                        (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandleType[]).map((hnd) => {
                          const posClass: Record<string, string> = {
                            nw: '-top-1.5 -left-1.5 cursor-nwse-resize',
                            n: '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize',
                            ne: '-top-1.5 -right-1.5 cursor-nesw-resize',
                            e: 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize',
                            se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
                            s: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize',
                            sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
                            w: 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize',
                          };
                          return (
                            <div
                              key={hnd}
                              onMouseDown={(e) => handleBoxMouseDown(e, idx, hnd)}
                              style={{ transform: `scale(${invZoom})` }}
                              className={`absolute w-3 h-3 bg-white border border-slate-900 rounded-xs ${posClass[hnd]}`}
                            />
                          );
                        })}
                    </div>
                  );
                })}

              {/* Draft Box */}
              {draftBox && (
                <div
                  style={{
                    left: draftBox.x * currentFrame.width,
                    top: draftBox.y * currentFrame.height,
                    width: draftBox.w * currentFrame.width,
                    height: draftBox.h * currentFrame.height,
                    borderWidth: `${2 / zoom}px`,
                  }}
                  className="absolute border-blue-400 bg-blue-500/20 pointer-events-none"
                />
              )}
            </div>
            </>
          )}

          {/* Crosshair Guides */}
          {showCrosshair && cursorNorm && currentFrame && (
            <>
              <div
                style={{ left: pan.x + cursorNorm.x * currentFrame.width * zoom }}
                className="absolute top-0 bottom-0 w-px bg-white/25 pointer-events-none"
              />
              <div
                style={{ top: pan.y + cursorNorm.y * currentFrame.height * zoom }}
                className="absolute left-0 right-0 h-px bg-white/25 pointer-events-none"
              />
            </>
          )}

          {/* Active Class Badge Following Mouse Cursor */}
          {toolMode === 'draw' && cursorNorm && currentFrame && activeClassId && (() => {
            const activeCls = classes.find((c) => c.id === activeClassId);
            if (!activeCls) return null;
            return (
              <div
                style={{
                  left: pan.x + cursorNorm.x * currentFrame.width * zoom + 14,
                  top: pan.y + cursorNorm.y * currentFrame.height * zoom + 14,
                }}
                className="absolute z-10 pointer-events-none flex items-center gap-1.5 bg-[#13241F]/90 text-white border border-white/20 px-2 py-0.5 font-mono-label text-[11px] shadow-md whitespace-nowrap"
              >
                <span
                  className="w-2.5 h-2.5 shrink-0"
                  style={{ backgroundColor: activeCls.color }}
                />
                <span>{activeCls.name}</span>
              </div>
            );
          })()}

          {/* Image Filters Popover */}
          {showFilters && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute top-3 right-3 w-64 bg-slate-900/95 border border-slate-700 rounded-xl p-4 space-y-3 text-xs shadow-2xl z-20"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Image Adjustments</span>
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
              {[
                { key: 'brightness', label: 'Brightness', min: 20, max: 250 },
                { key: 'contrast', label: 'Contrast', min: 20, max: 250 },
                { key: 'saturate', label: 'Saturation', min: 0, max: 250 },
              ].map((item) => (
                <div key={item.key} className="space-y-1">
                  <div className="flex justify-between text-slate-300">
                    <span>{item.label}</span>
                    <span>{(filters as any)[item.key]}%</span>
                  </div>
                  <input
                    type="range"
                    min={item.min}
                    max={item.max}
                    value={(filters as any)[item.key]}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, [item.key]: Number(e.target.value) }))
                    }
                    className="w-full accent-blue-500"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>Box Fill Opacity</span>
                  <span>{Math.round(boxOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.05}
                  value={boxOpacity}
                  onChange={(e) => setBoxOpacity(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={filters.invert}
                  onChange={(e) => setFilters((f) => ({ ...f, invert: e.target.checked }))}
                  className="accent-blue-500"
                />
                Invert Colors
              </label>
            </div>
          )}

          {/* Shortcuts Modal */}
          {showShortcuts && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute top-3 left-3 w-72 bg-slate-900/95 border border-slate-700 rounded-xl p-4 space-y-2 text-xs shadow-2xl z-20"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-white">Keyboard Shortcuts</span>
                <button onClick={() => setShowShortcuts(false)} className="text-slate-400 hover:text-white">
                  ✕
                </button>
              </div>
              {[
                ['W / S', 'Prev / Next class'],
                ['B / V', 'Draw / Select tool'],
                ['← / → or A / D', 'Prev / Next frame'],
                ['C', 'Copy previous frame boxes'],
                ['T', 'Auto-Track all frame boxes'],
                ['Del / Backspace', 'Delete selected box'],
                ['H', 'Hide / Show boxes'],
                ['Alt + Drag / Wheel', 'Pan / Zoom'],
                ['Ctrl+Z / Ctrl+S', 'Undo / Save'],
              ].map(([k, desc]) => (
                <div key={k} className="flex justify-between text-slate-300">
                  <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-blue-300">{k}</kbd>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar: Classes, Objects, Tracking */}
        <div className="w-76 bg-[#EEF2EF] border-l border-[#C4CCC7] flex flex-col shrink-0 overflow-y-auto">
          {/* Classes */}
          <div className="p-3.5 border-b border-[#C4CCC7] space-y-2.5">
            <h4 className="font-mono-label text-[11px] font-bold text-[#13241F] uppercase">
              Classes ({classes.length})
            </h4>
            <form onSubmit={handleAddClass} className="flex gap-1.5">
              <input
                type="text"
                placeholder="Add class..."
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                className="flex-1 bg-white border border-[#C4CCC7] px-2.5 py-1 text-xs text-[#13241F] focus:outline-none focus:border-[#E8553D]"
              />
              <button
                type="submit"
                className="bg-[#E8553D] hover:bg-[#C83E28] text-white px-2.5 py-1 text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {classes.map((c) => {
                const isActive = activeClassId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveClassId(c.id)}
                    className={`flex items-center justify-between px-2.5 py-1.5 text-xs cursor-pointer border-l-4 transition-colors ${
                      isActive
                        ? 'bg-[#13241F] text-white border-l-[#E8553D]'
                        : 'text-[#13241F] hover:bg-white border-l-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <input
                        type="color"
                        value={c.color}
                        onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => {
                          await api.updateClass(projectId, c.id, { color: e.target.value });
                          onRefreshClasses();
                        }}
                        title="Change class color"
                        className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer shrink-0"
                      />
                      <span className="font-medium truncate">{c.name}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <span className="font-mono-label text-[9px] bg-[#E8553D] text-white px-1.5 py-0.5">
                          ACTIVE
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteClassTarget(c);
                        }}
                        className="text-[#76817B] hover:text-[#E8553D] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Frame Objects */}
          <div className="p-3.5 border-b border-[#C4CCC7] space-y-2 flex-1 min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-mono-label text-[11px] font-bold text-[#13241F] uppercase">
                Frame Objects ({annotations.length})
              </h4>
              {annotations.length > 0 && (
                <button
                  onClick={() => {
                    setSelectedIdx(null);
                    pushHistory([]);
                    setStatusMsg(`Cleared ${annotations.length} box(es) (Ctrl+Z to undo)`);
                  }}
                  className="font-mono-label text-[10px] text-[#E8553D] hover:bg-[#E8553D] hover:text-white border border-[#E8553D]/40 px-2 py-0.5 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Delete all boxes on this frame (Ctrl+Z to undo)"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete All
                </button>
              )}
            </div>
            {annotations.length === 0 ? (
              <p className="text-xs text-[#76817B]">No boxes on this frame.</p>
            ) : (
              <div className="space-y-1.5">
                {annotations.map((box, idx) => (
                  <div
                    key={box.id || box.localId || idx}
                    onClick={() => {
                      setSelectedIdx(idx);
                      setToolMode('select');
                    }}
                    className={`p-2 border text-xs cursor-pointer space-y-1.5 ${
                      selectedIdx === idx
                        ? 'bg-white border-[#E8553D] text-[#13241F]'
                        : 'bg-[#E2E7E4]/60 border-[#C4CCC7] text-[#13241F]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span
                          className="w-2.5 h-2.5"
                          style={{ backgroundColor: box.class_color || '#E8553D' }}
                        />
                        {box.class_name || 'class'}
                        {box.interpolated ? (
                          <span className="font-mono-label text-[10px] text-[#0B7A6F] bg-[#0B7A6F]/10 px-1">
                            interp
                          </span>
                        ) : null}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = annotations.filter((_, i) => i !== idx);
                          setSelectedIdx(null);
                          pushHistory(next);
                        }}
                        className="text-[#76817B] hover:text-[#E8553D]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tracking Controls */}
          <div className="p-3.5 space-y-2.5 bg-white">
            <h4 className="font-mono-label text-[11px] font-bold text-[#13241F] uppercase flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-[#E8553D]" />
              Motion Auto-Track
            </h4>
            {annotations.length > 0 ? (
              <div className="space-y-2 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[#76817B]">
                    <span>Track Frames:</span>
                    <div className="flex items-center gap-1">
                      {[3, 5, 7, 10].map((len) => (
                        <button
                          key={len}
                          onClick={() => setTrackLength(len)}
                          className={`px-1.5 py-0.5 font-mono-label text-[11px] border cursor-pointer ${
                            trackLength === len
                              ? 'bg-[#13241F] border-[#13241F] text-white'
                              : 'bg-[#EEF2EF] border-[#C4CCC7] text-[#13241F] hover:bg-[#E2E7E4]'
                          }`}
                        >
                          {len}
                        </button>
                      ))}
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={trackLength}
                        onChange={(e) => setTrackLength(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                        className="w-12 bg-[#EEF2EF] border border-[#C4CCC7] px-1.5 py-0.5 font-mono-label text-[#13241F] text-center"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleOpenCvTrack}
                  disabled={trackingLoading}
                  className="w-full bg-[#E8553D] hover:bg-[#C83E28] disabled:opacity-50 text-white font-mono-label py-1.5 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {trackingLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Tracking...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3.5 h-3.5" /> Auto-Track All ({annotations.length}) +{trackLength}f (T)
                    </>
                  )}
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#76817B]">
                Draw at least 1 box on this frame, then click Auto-Track or press <kbd className="font-mono-label bg-[#E2E7E4] px-1 text-[#13241F]">T</kbd>.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Frame-by-Frame Timeline */}
      <div className="h-20 bg-[#EEF2EF] border-t border-[#C4CCC7] px-4 py-2 flex flex-col justify-between shrink-0">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPlaying((p) => !p)}
              disabled={frames.length === 0}
              className="bg-[#13241F] hover:bg-[#0B7A6F] text-white font-mono-label px-2.5 py-1 flex items-center gap-1 cursor-pointer"
            >
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => goToFrame(frameIdx - 10)}
              disabled={frameIdx === 0}
              className="px-2 py-1 font-mono-label bg-[#E2E7E4] hover:bg-[#D8DFDB] text-[#13241F] disabled:opacity-30 cursor-pointer"
            >
              -10
            </button>
            <button
              onClick={() => goToFrame(frameIdx - 1)}
              disabled={frameIdx === 0}
              className="p-1 bg-[#E2E7E4] hover:bg-[#D8DFDB] text-[#13241F] disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono-label text-[#13241F] font-bold px-2 tabular-nums">
              {frames.length > 0 ? frameIdx + 1 : 0} / {frames.length}
            </span>
            <button
              onClick={() => goToFrame(frameIdx + 1)}
              disabled={frameIdx >= frames.length - 1}
              className="p-1 bg-[#E2E7E4] hover:bg-[#D8DFDB] text-[#13241F] disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => goToFrame(frameIdx + 10)}
              disabled={frameIdx >= frames.length - 1}
              className="px-2 py-1 font-mono-label bg-[#E2E7E4] hover:bg-[#D8DFDB] text-[#13241F] disabled:opacity-30 cursor-pointer"
            >
              +10
            </button>
          </div>
          <div className="font-mono-label text-[11px] text-[#76817B]">
            {currentFrame ? `${currentFrame.filename} (${currentFrame.width}×${currentFrame.height})` : ''}
          </div>
        </div>

        {/* Scrubber */}
        <div className="flex items-center gap-1 overflow-x-auto py-1">
          {frames.map((f, i) => {
            const hasAnn = (f.annotation_count || 0) > 0;
            const active = i === frameIdx;
            return (
              <button
                key={f.id}
                onClick={() => goToFrame(i)}
                title={`Frame ${i + 1}: ${f.annotation_count || 0} box(es)`}
                className={`h-3 flex-1 min-w-[4px] max-w-[16px] transition cursor-pointer ${
                  active
                    ? 'bg-[#E8553D] ring-1 ring-[#13241F]'
                    : hasAnn
                    ? 'bg-[#0B7A6F]'
                    : 'bg-[#C4CCC7] hover:bg-[#76817B]'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Initial / Required Class Setup Popup */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 bg-[#13241F]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#EEF2EF] border border-[#13241F] rounded-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-[#C4CCC7] bg-[#E2E7E4] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#13241F]">Add Annotation Classes</h3>
                <p className="font-mono-label text-[11px] text-[#76817B]">
                  Define at least 1 class before drawing bounding boxes
                </p>
              </div>
              {classes.length > 0 && (
                <button
                  onClick={() => setShowClassModal(false)}
                  className="text-[#76817B] hover:text-[#13241F] font-mono-label text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              <form onSubmit={handleAddClass} className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. person, door, bag (comma-separated)"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="flex-1 bg-white border border-[#C4CCC7] px-3 py-2 text-xs text-[#13241F] placeholder:text-[#76817B] focus:outline-none focus:border-[#E8553D]"
                />
                <button
                  type="submit"
                  className="bg-[#E8553D] hover:bg-[#C83E28] text-white font-mono-label px-4 py-2 text-xs flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </form>
              {classError && (
                <p className="font-mono-label text-xs text-[#C83E28]">{classError}</p>
              )}

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {classes.length === 0 ? (
                  <p className="text-xs text-[#76817B] py-4 text-center border border-dashed border-[#C4CCC7] bg-white/50">
                    No classes added yet. Enter a class name above.
                  </p>
                ) : (
                  classes.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between bg-white border border-[#C4CCC7] px-3 py-2 text-xs"
                    >
                      <span className="flex items-center gap-2 font-medium text-[#13241F]">
                        <input
                          type="color"
                          value={c.color}
                          onChange={async (e) => {
                            await api.updateClass(projectId, c.id, { color: e.target.value });
                            onRefreshClasses();
                          }}
                          title="Change class color"
                          className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer shrink-0"
                        />
                        {c.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {c.hotkey && (
                          <kbd className="font-mono-label text-[10px] bg-[#E2E7E4] text-[#13241F] px-1.5 py-0.5">
                            Key {c.hotkey}
                          </kbd>
                        )}
                        <button
                          onClick={async () => {
                            await api.deleteClass(projectId, c.id);
                            onRefreshClasses();
                          }}
                          className="text-[#76817B] hover:text-[#E8553D] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowClassModal(false)}
                  disabled={classes.length === 0}
                  className="bg-[#0B7A6F] hover:bg-[#096158] disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono-label px-5 py-2 text-xs cursor-pointer transition-colors"
                >
                  Start Annotating →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteClassTarget)}
        title="Delete Class"
        message={`Delete class "${deleteClassTarget?.name}" and all boxes using it?`}
        confirmLabel="Delete Class"
        onConfirm={async () => {
          if (!deleteClassTarget) return;
          await api.deleteClass(projectId, deleteClassTarget.id);
          setDeleteClassTarget(null);
          onRefreshClasses();
        }}
        onCancel={() => setDeleteClassTarget(null)}
      />

      {/* Right-Click Context Menu for BBox */}
      {contextMenu && annotations[contextMenu.boxIdx] && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 w-48 bg-[#EEF2EF] border border-[#13241F] shadow-xl text-xs overflow-hidden"
        >
          <div className="px-2.5 py-1.5 bg-[#E2E7E4] border-b border-[#C4CCC7] font-mono-label text-[10px] font-bold text-[#76817B] uppercase flex items-center justify-between">
            <span>Change Label</span>
            <button
              onClick={() => setContextMenu(null)}
              className="text-[#76817B] hover:text-[#13241F] cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto divide-y divide-[#C4CCC7]/60">
            {classes.map((c) => {
              const isCurr = annotations[contextMenu.boxIdx].class_id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    const next = annotations.map((a, i) =>
                      i === contextMenu.boxIdx
                        ? { ...a, class_id: c.id, class_name: c.name, class_color: c.color }
                        : a
                    );
                    pushHistory(next);
                    setContextMenu(null);
                  }}
                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isCurr ? 'bg-[#13241F] text-white' : 'text-[#13241F] hover:bg-white'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="truncate">{c.name}</span>
                  </span>
                  {isCurr && <Check className="w-3 h-3 shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="border-t border-[#C4CCC7] p-1 bg-white">
            <button
              onClick={() => {
                const next = annotations.filter((_, i) => i !== contextMenu.boxIdx);
                setSelectedIdx(null);
                pushHistory(next);
                setContextMenu(null);
              }}
              className="w-full px-2 py-1.5 text-left text-[#E8553D] hover:bg-[#E8553D] hover:text-white font-mono-label text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Box
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
