import React, { useState } from 'react';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import type { Project } from '../types';
import { api } from '../api/client';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  projects: Project[];
  selectedProject: Project | null;
  onSelect: (p: Project) => void;
  onRefresh: () => void;
}

export const ProjectList: React.FC<Props> = ({
  projects,
  selectedProject,
  onSelect,
  onRefresh,
}) => {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const p = await api.createProject(name.trim(), desc.trim());
      setName('');
      setDesc('');
      onRefresh();
      onSelect(p);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    setDeleteTarget(p);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await api.deleteProject(deleteTarget.id);
    setDeleteTarget(null);
    onRefresh();
  };

  return (
    <div className="max-w-5xl w-full mx-auto p-6 space-y-5">
      {/* Create Card */}
      <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-[#13241F]">Create Project</h2>
          <span className="font-mono-label text-[11px] text-[#76817B]">YOLO 2D WORKSPACE</span>
        </div>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input
            type="text"
            placeholder="Project name (e.g., sami_door)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="sm:col-span-4 bg-white border border-[#C4CCC7] px-3 py-2 text-xs text-[#13241F] placeholder:text-[#76817B] focus:outline-none focus:border-[#E8553D]"
            required
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="sm:col-span-6 bg-white border border-[#C4CCC7] px-3 py-2 text-xs text-[#13241F] placeholder:text-[#76817B] focus:outline-none focus:border-[#E8553D]"
          />
          <button
            type="submit"
            disabled={creating}
            className="sm:col-span-2 bg-[#E8553D] hover:bg-[#C83E28] active:scale-[0.99] disabled:opacity-50 text-white font-mono-label text-xs px-4 py-2 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {creating ? 'Creating...' : 'Create'}
          </button>
        </form>
        {error && <p className="text-[#C83E28] font-mono-label text-xs mt-2">{error}</p>}
      </div>

      {/* Projects Card */}
      <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#C4CCC7] flex items-center justify-between bg-[#E2E7E4]/60">
          <h3 className="text-sm font-bold text-[#13241F]">Projects</h3>
          <span className="font-mono-label text-[11px] text-[#76817B] tabular-nums">
            {projects.length} TOTAL
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="p-10 text-center font-mono-label text-xs text-[#76817B]">
            No projects yet. Create one above to begin.
          </div>
        ) : (
          <div className="divide-y divide-[#C4CCC7]">
            {projects.map((p) => {
              const active = selectedProject?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className={`px-5 py-3.5 flex items-center justify-between gap-4 cursor-pointer transition-colors border-l-4 ${
                    active
                      ? 'border-l-[#E8553D] bg-white/70'
                      : 'border-l-transparent hover:bg-white/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold text-[#13241F] truncate">{p.name}</span>
                      {active && (
                        <span className="font-mono-label text-[10px] px-1.5 py-0.5 bg-[#0B7A6F] text-white">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#76817B] truncate mt-0.5">
                      {p.description || 'No description'}
                    </p>
                  </div>

                  <div className="flex items-center gap-5 font-mono-label text-xs text-[#76817B] tabular-nums shrink-0">
                    <div>
                      <span className="text-[#13241F] font-bold">{p.frame_count}</span> frames
                    </div>
                    <div>
                      <span className="text-[#13241F] font-bold">{p.annotation_count}</span> boxes
                    </div>
                    <div>
                      <span className="text-[#13241F] font-bold">{p.class_count}</span> classes
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onSelect(p)}
                      className="font-mono-label text-xs bg-[#13241F] hover:bg-[#0B7A6F] text-white px-3 py-1.5 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      Open <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, p)}
                      className="bg-[#E8553D]/10 hover:bg-[#E8553D] text-[#E8553D] hover:text-white p-1.5 transition-colors cursor-pointer"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Project"
        message={`Delete project "${deleteTarget?.name}" and all its frames & annotations?`}
        confirmLabel="Delete Project"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
