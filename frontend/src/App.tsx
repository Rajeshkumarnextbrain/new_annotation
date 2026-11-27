import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Check, ChevronDown, Film, FolderKanban, Lock, PenTool } from 'lucide-react';
import type { ClassItem, MediaSequence, Project, VideoItem } from './types';
import { api } from './api/client';
import { ProjectList } from './components/ProjectList';
import { MediaManager } from './components/MediaManager';
import { AnnotationWorkspace } from './components/AnnotationWorkspace';
import { AnalyticsSplitView } from './components/AnalyticsSplitView';

type Tab = 'projects' | 'media' | 'annotate' | 'analytics';

export default function App() {
  const [tab, setTab] = useState<Tab>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sequences, setSequences] = useState<MediaSequence[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState<number | null>(null);

  const loadProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    setSelectedProject((prev) => {
      if (!prev) return list[0] || null;
      return list.find((p) => p.id === prev.id) || list[0] || null;
    });
  }, []);

  const loadProjectDetails = useCallback(async (projectId: number) => {
    const [seqs, vids, cls] = await Promise.all([
      api.listSequences(projectId),
      api.listVideos(projectId),
      api.listClasses(projectId),
    ]);
    setSequences(seqs);
    setVideos(vids);
    setClasses(cls);
    setSelectedSequenceId((prev) => {
      if (prev && seqs.some((s) => s.id === prev)) return prev;
      const firstUnannotated = seqs.find(
        (s) => s.frame_count > 0 && s.annotated_frames < s.frame_count
      );
      return firstUnannotated?.id || seqs[0]?.id || null;
    });
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProject) {
      loadProjectDetails(selectedProject.id);
    } else {
      setSequences([]);
      setVideos([]);
      setClasses([]);
      setSelectedSequenceId(null);
    }
  }, [selectedProject?.id, loadProjectDetails]);

  // Strict workflow gates
  const hasProject = Boolean(selectedProject);
  const hasFrames = sequences.some((s) => s.frame_count > 0);
  const processedVideosCount = videos.filter((v) => v.processed === 1).length;
  const allVideosProcessed = videos.length === 0 || processedVideosCount === videos.length;
  const hasAnnotations =
    (selectedProject?.annotation_count || 0) > 0 ||
    sequences.some((s) => s.annotated_frames > 0);

  // Auto-redirect if current tab becomes locked when switching projects
  useEffect(() => {
    if (!hasProject && tab !== 'projects') {
      setTab('projects');
    } else if (hasProject && (!hasFrames || !allVideosProcessed) && (tab === 'annotate' || tab === 'analytics')) {
      setTab('media');
    } else if (hasProject && hasFrames && allVideosProcessed && !hasAnnotations && tab === 'analytics') {
      setTab('annotate');
    }
  }, [hasProject, hasFrames, allVideosProcessed, hasAnnotations, tab]);

  const handleSelectProject = async (p: Project) => {
    setSelectedProject(p);
    try {
      const [seqs, vids] = await Promise.all([
        api.listSequences(p.id),
        api.listVideos(p.id),
      ]);
      const projHasFrames = seqs.some((s) => s.frame_count > 0);
      const projAllVideosDone = vids.length === 0 || vids.every((v) => v.processed === 1);
      const firstUnannotated = seqs.find(
        (s) => s.frame_count > 0 && s.annotated_frames < s.frame_count
      );
      setSelectedSequenceId(firstUnannotated?.id || seqs[0]?.id || null);
      setTab(projHasFrames && projAllVideosDone ? 'annotate' : 'media');
    } catch {
      setTab('media');
    }
  };

  const handleOpenAnnotator = (seqId: number) => {
    if (!hasFrames || !allVideosProcessed) return;
    setSelectedSequenceId(seqId);
    setTab('annotate');
  };

  const steps: {
    id: Tab;
    stepNum: number;
    label: string;
    icon: typeof FolderKanban;
    enabled: boolean;
    done: boolean;
    lockReason: string;
  }[] = [
    {
      id: 'projects',
      stepNum: 1,
      label: 'Project',
      icon: FolderKanban,
      enabled: true,
      done: hasProject,
      lockReason: '',
    },
    {
      id: 'media',
      stepNum: 2,
      label: 'Media / Video',
      icon: Film,
      enabled: hasProject,
      done: hasFrames && allVideosProcessed,
      lockReason: 'Create or select a project first',
    },
    {
      id: 'annotate',
      stepNum: 3,
      label: 'Annotate',
      icon: PenTool,
      enabled: hasProject && hasFrames && allVideosProcessed,
      done: hasAnnotations,
      lockReason: !allVideosProcessed
        ? `Process all videos one-by-one first (${processedVideosCount}/${videos.length} done)`
        : 'Add a video & extract clips, or import images first',
    },
    {
      id: 'analytics',
      stepNum: 4,
      label: 'Split & Export',
      icon: BarChart3,
      enabled: hasProject && hasFrames && allVideosProcessed && hasAnnotations,
      done: false,
      lockReason: 'Annotate at least 1 box before splitting & exporting',
    },
  ];

  return (
    <div className="min-h-screen bg-[#D8DFDB] text-[#13241F] flex flex-col">
      {/* Header */}
      <header className="h-14 bg-[#EEF2EF] border-b border-[#C4CCC7] px-5 flex items-center justify-between shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTab('projects')}
            className="flex items-center gap-2.5 text-left cursor-pointer focus:outline-none"
          >
            <div className="w-7 h-7 bg-[#E8553D] flex items-center justify-center font-mono-label text-xs font-bold text-white">
              YS
            </div>
            <span className="font-bold text-sm text-[#13241F] tracking-tight">
              YOLO Studio
            </span>
          </button>

          {projects.length > 0 && (
            <>
              <span className="text-[#9AA59F] font-mono-label text-xs">/</span>
              <div className="relative flex items-center">
                <select
                  value={selectedProject?.id || ''}
                  onChange={(e) => {
                    const p = projects.find((x) => x.id === Number(e.target.value));
                    if (p) setSelectedProject(p);
                  }}
                  className="appearance-none bg-[#E2E7E4] hover:bg-[#D8DFDB] border border-[#C4CCC7] text-[#13241F] font-mono-label text-xs pl-3 pr-8 py-1.5 cursor-pointer focus:outline-none focus:border-[#E8553D] transition-colors"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#76817B] absolute right-2.5 pointer-events-none" />
              </div>
            </>
          )}
        </div>

        {/* Strict Step-by-Step Workflow Stepper */}
        <nav className="flex items-center gap-1 bg-[#E2E7E4] p-1 rounded-full border border-[#C4CCC7]">
          {steps.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                disabled={!item.enabled}
                title={!item.enabled ? item.lockReason : `Step ${item.stepNum}: ${item.label}`}
                onClick={() => item.enabled && setTab(item.id)}
                className={`px-3 py-1.5 rounded-full font-mono-label text-[11px] flex items-center gap-1.5 transition-colors ${
                  !item.enabled
                    ? 'opacity-45 cursor-not-allowed text-[#76817B]'
                    : active
                    ? 'bg-[#E8553D] text-white cursor-pointer'
                    : 'text-[#13241F] hover:bg-[#D8DFDB] cursor-pointer'
                }`}
              >
                {!item.enabled ? (
                  <Lock className="w-3 h-3" />
                ) : item.done && !active ? (
                  <Check className="w-3.5 h-3.5 text-[#0B7A6F]" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
                <span>
                  {item.stepNum}. {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {selectedProject && (
          <div className="hidden lg:flex items-center gap-3 font-mono-label text-[11px] text-[#76817B] tabular-nums">
            <span>{selectedProject.frame_count}F</span>
            <span>·</span>
            <span>{selectedProject.annotation_count}B</span>
            <span>·</span>
            <span>{selectedProject.class_count}C</span>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0">
        {tab === 'projects' && (
          <ProjectList
            projects={projects}
            selectedProject={selectedProject}
            onSelect={handleSelectProject}
            onRefresh={loadProjects}
          />
        )}

        {tab === 'media' && selectedProject && (
          <MediaManager
            projectId={selectedProject.id}
            sequences={sequences}
            videos={videos}
            onRefresh={() => {
              loadProjectDetails(selectedProject.id);
              loadProjects();
            }}
            onOpenAnnotator={handleOpenAnnotator}
          />
        )}

        {tab === 'annotate' && selectedProject && (
          <AnnotationWorkspace
            projectId={selectedProject.id}
            sequences={sequences}
            selectedSequenceId={selectedSequenceId}
            onSelectSequence={setSelectedSequenceId}
            classes={classes}
            onRefreshClasses={() => loadProjectDetails(selectedProject.id)}
            onAnnotationsSaved={() => {
              loadProjectDetails(selectedProject.id);
              loadProjects();
            }}
          />
        )}

        {tab === 'analytics' && selectedProject && (
          <AnalyticsSplitView
            projectId={selectedProject.id}
            onRefreshProject={() => {
              loadProjectDetails(selectedProject.id);
              loadProjects();
            }}
          />
        )}
      </main>
    </div>
  );
}
