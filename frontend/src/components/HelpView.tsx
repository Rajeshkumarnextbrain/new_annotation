import React from 'react';
import { HelpCircle, Keyboard, Workflow, MousePointerClick } from 'lucide-react';

const SHORTCUTS = [
  { key: 'W / S', action: 'Previous / Next class (with live cursor badge)' },
  { key: 'B / V', action: 'Draw mode / Select mode' },
  { key: 'A / D or ← / →', action: 'Previous / Next frame (crosses to prev/next video at ends)' },
  { key: 'C', action: 'Copy all boxes from previous frame' },
  { key: 'T', action: 'Auto-Track all boxes on current frame' },
  { key: 'H', action: 'Hide / Show bounding boxes' },
  { key: 'Del / Backspace', action: 'Delete selected box' },
  { key: 'Ctrl+Z / Ctrl+Shift+Z', action: 'Undo / Redo' },
  { key: 'Ctrl+S', action: 'Save current frame' },
  { key: 'Alt + Drag / Wheel', action: 'Pan / Zoom at cursor' },
];

const MOUSE_ACTIONS = [
  {
    action: 'Left-Click + Drag (in Draw mode)',
    detail: 'Draws a new bounding box, even over existing overlapping boxes.',
  },
  {
    action: 'Single Left-Click inside a box',
    detail: 'Selects that box and switches to Select mode for moving or resizing.',
  },
  {
    action: 'Left-Click outside any box (in Select mode)',
    detail: 'Deselects and switches right back to Draw mode.',
  },
  {
    action: 'Right-Click inside a box',
    detail: 'Opens quick menu to Change Label or Delete Box.',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '1. Project',
    desc: 'Create a project or open an existing one. Deleting a project also cleans up its files from disk.',
  },
  {
    step: '2. Media / Video',
    desc: 'Upload or link single/multiple videos or image folders. Process multiple videos one-by-one using Auto-Clip Xs, Manual Range, or Use Full Video (All Frames by default).',
  },
  {
    step: '3. Annotate',
    desc: 'Add classes, draw 2D boxes, use Motion Auto-Track (T) to follow all objects across frames, and step through frames with A/D or ←/→.',
  },
  {
    step: '4. Split & Export',
    desc: 'Apply Per-Video Sequential Split (Train → Val → Test), inspect Class Distribution & Spatial Heatmap, optionally rename files (Prefix/Suffix/Full), and download YOLO (.zip).',
  },
];

export const HelpView: React.FC = () => {
  return (
    <div className="max-w-5xl w-full mx-auto p-6 space-y-5">
      <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl px-5 py-3.5 flex items-center justify-between">
        <h2 className="text-base font-bold text-[#13241F] flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#E8553D]" />
          Help &amp; Keyboard Shortcuts
        </h2>
        <span className="font-mono-label text-[11px] text-[#76817B]">YOLO STUDIO GUIDE</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Keyboard Shortcuts Table */}
        <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#C4CCC7] bg-[#E2E7E4]/60 flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[#E8553D]" />
            <h3 className="text-sm font-bold text-[#13241F]">Keyboard Shortcuts (Annotate)</h3>
          </div>
          <div className="divide-y divide-[#C4CCC7]">
            {SHORTCUTS.map((item) => (
              <div
                key={item.key}
                className="px-5 py-2.5 flex items-center justify-between gap-4 text-xs bg-white/40"
              >
                <kbd className="font-mono-label bg-[#13241F] text-white px-2 py-1 text-[11px] shrink-0">
                  {item.key}
                </kbd>
                <span className="text-[#13241F] text-right">{item.action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mouse Interactions & Workflow */}
        <div className="space-y-4">
          <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#C4CCC7] bg-[#E2E7E4]/60 flex items-center gap-2">
              <MousePointerClick className="w-4 h-4 text-[#0B7A6F]" />
              <h3 className="text-sm font-bold text-[#13241F]">Mouse Interactions</h3>
            </div>
            <div className="divide-y divide-[#C4CCC7]">
              {MOUSE_ACTIONS.map((m) => (
                <div key={m.action} className="px-5 py-2.5 text-xs bg-white/40 space-y-0.5">
                  <div className="font-mono-label font-bold text-[#13241F]">{m.action}</div>
                  <div className="text-[#76817B]">{m.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#C4CCC7] bg-[#E2E7E4]/60 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-[#E8553D]" />
              <h3 className="text-sm font-bold text-[#13241F]">4-Step Workflow</h3>
            </div>
            <div className="divide-y divide-[#C4CCC7]">
              {WORKFLOW_STEPS.map((w) => (
                <div key={w.step} className="px-5 py-2.5 text-xs bg-white/40 space-y-0.5">
                  <div className="font-mono-label font-bold text-[#0B7A6F]">{w.step}</div>
                  <div className="text-[#13241F]">{w.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
