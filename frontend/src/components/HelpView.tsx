import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Check,
  Film,
  FolderKanban,
  HelpCircle,
  Keyboard,
  MousePointerClick,
  PenTool,
  Scissors,
  Search,
  Wand2,
} from 'lucide-react';

type HelpTab = 'walkthrough' | 'practice' | 'shortcuts';

const SHORTCUTS = [
  { key: 'W / S', category: 'Classes', action: 'Switch to Previous / Next class (updates cursor badge)' },
  { key: 'B / V', category: 'Tools', action: 'Switch to Draw mode (B) or Select mode (V)' },
  { key: 'A / D or ← / →', category: 'Navigation', action: 'Previous / Next frame (moves to prev/next video at ends)' },
  { key: 'C', category: 'Editing', action: 'Copy all boxes from previous frame onto current frame' },
  { key: 'T', category: 'Tracking', action: 'Auto-Track ALL boxes on current frame forward' },
  { key: 'H', category: 'View', action: 'Hide / Show bounding boxes on canvas' },
  { key: 'Del / Backspace', category: 'Editing', action: 'Delete the currently selected bounding box' },
  { key: 'Ctrl+Z / Ctrl+Shift+Z', category: 'Editing', action: 'Undo / Redo box changes' },
  { key: 'Ctrl+S', category: 'Saving', action: 'Save current frame annotations manually' },
  { key: 'Alt + Drag / Wheel', category: 'View', action: 'Pan canvas / Zoom in & out at cursor' },
];

const DEMO_CLASSES = [
  { name: 'person', color: '#3b82f6' },
  { name: 'crowd', color: '#ef4444' },
  { name: 'helmet', color: '#10b981' },
];

export const HelpView: React.FC = () => {
  const [section, setSection] = useState<HelpTab>('walkthrough');
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [shortcutFilter, setShortcutFilter] = useState('');

  // Interactive Step 2: Clip Simulator
  const [simTime, setSimTime] = useState(12);
  const [simClipDur, setSimClipDur] = useState(5);
  const [simClips, setSimClips] = useState<{ start: number; end: number }[]>([
    { start: 4, end: 9 },
  ]);

  // Interactive Step 3: Practice Canvas
  const [demoClassIdx, setDemoClassIdx] = useState(0);
  const [demoMode, setDemoMode] = useState<'draw' | 'select'>('draw');
  const [demoBoxes, setDemoBoxes] = useState([
    { id: 1, x: 22, y: 24, w: 22, h: 48, clsIdx: 0 },
    { id: 2, x: 56, y: 30, w: 24, h: 42, clsIdx: 1 },
  ]);
  const [demoSelected, setDemoSelected] = useState<number | null>(null);
  const [demoCursor, setDemoCursor] = useState<{ x: number; y: number } | null>(null);
  const [demoMenu, setDemoMenu] = useState<{ x: number; y: number; id: number } | null>(null);
  const [demoTracked, setDemoTracked] = useState(false);

  // Interactive Step 4: Split & Rename Simulator
  const [simTrain, setSimTrain] = useState(70);
  const [simVal, setSimVal] = useState(20);
  const [simTest, setSimTest] = useState(10);
  const [simRenameMode, setSimRenameMode] = useState<'none' | 'prefix' | 'suffix' | 'full'>('prefix');
  const [simRenameVal, setSimRenameVal] = useState('cam1_');

  // Keyboard practice listener when on practice tab
  useEffect(() => {
    if (section !== 'practice') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'w') {
        setDemoClassIdx((i) => (i - 1 + DEMO_CLASSES.length) % DEMO_CLASSES.length);
      } else if (e.key.toLowerCase() === 's') {
        setDemoClassIdx((i) => (i + 1) % DEMO_CLASSES.length);
      } else if (e.key.toLowerCase() === 'b') {
        setDemoMode('draw');
      } else if (e.key.toLowerCase() === 'v') {
        setDemoMode('select');
      } else if (e.key.toLowerCase() === 't') {
        setDemoTracked(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [section]);

  const filteredShortcuts = SHORTCUTS.filter(
    (s) =>
      s.key.toLowerCase().includes(shortcutFilter.toLowerCase()) ||
      s.action.toLowerCase().includes(shortcutFilter.toLowerCase()) ||
      s.category.toLowerCase().includes(shortcutFilter.toLowerCase())
  );

  const simTotal = Math.max(1, simTrain + simVal + simTest);
  const simTrainPct = Math.round((simTrain / simTotal) * 100);
  const simValPct = Math.round((simVal / simTotal) * 100);
  const simTestPct = Math.max(0, 100 - simTrainPct - simValPct);

  return (
    <div className="max-w-6xl w-full mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#13241F] flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#E8553D]" />
            YOLO Studio — Interactive User Guide
          </h2>
          <p className="text-xs text-[#76817B] mt-0.5">
            Learn the 4-step workflow, test interactive controls, and look up keyboard shortcuts.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#E2E7E4] p-1 border border-[#C4CCC7]">
          {[
            { id: 'walkthrough', label: 'Step-by-Step Guide' },
            { id: 'practice', label: 'Interactive Sandbox' },
            { id: 'shortcuts', label: 'All Shortcuts' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSection(t.id as HelpTab)}
              className={`px-3 py-1.5 font-mono-label text-xs cursor-pointer transition-colors ${
                section === t.id
                  ? 'bg-[#E8553D] text-white'
                  : 'text-[#13241F] hover:bg-[#D8DFDB]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: STEP-BY-STEP INTERACTIVE WALKTHROUGH */}
      {section === 'walkthrough' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Step Selector */}
          <div className="lg:col-span-4 space-y-2">
            {[
              {
                num: 1 as const,
                title: '1. Create or Open Project',
                icon: FolderKanban,
                summary: 'Start a workspace & auto-resume where you left off.',
              },
              {
                num: 2 as const,
                title: '2. Import & Clip Media',
                icon: Film,
                summary: 'Add videos or image folders. Process videos one-by-one.',
              },
              {
                num: 3 as const,
                title: '3. Annotate & Auto-Track',
                icon: PenTool,
                summary: 'Draw 2D boxes, switch classes with W/S, track all with T.',
              },
              {
                num: 4 as const,
                title: '4. Split, Rename & Export',
                icon: BarChart3,
                summary: 'Sequential Train/Val/Test split, analytics & YOLO .zip.',
              },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeStep === item.num;
              return (
                <button
                  key={item.num}
                  onClick={() => setActiveStep(item.num)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer border-l-4 ${
                    active
                      ? 'bg-white border-[#C4CCC7] border-l-[#E8553D]'
                      : 'bg-[#EEF2EF] border-[#C4CCC7] border-l-transparent hover:bg-white/60'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-[#13241F]">
                    <Icon className={`w-4 h-4 ${active ? 'text-[#E8553D]' : 'text-[#0B7A6F]'}`} />
                    {item.title}
                  </div>
                  <p className="text-xs text-[#76817B] mt-1">{item.summary}</p>
                </button>
              );
            })}
          </div>

          {/* Step Details + Live Mini Simulator */}
          <div className="lg:col-span-8 bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-6 space-y-5">
            {activeStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#13241F]">Step 1: Project Setup</h3>
                <div className="space-y-2.5 text-xs text-[#13241F] leading-relaxed">
                  <p>
                    1. Enter a <strong>Project Name</strong> (e.g., <code>sami_door</code>) and click{' '}
                    <span className="font-mono-label bg-[#E8553D] text-white px-1.5 py-0.5">+ Create</span>.
                  </p>
                  <p>
                    2. <strong>Smart Resume:</strong> When you click <strong>Open →</strong> on an existing project:
                    if it still has unprocessed videos or no frames, it opens <strong>2. Media / Video</strong>.
                    Once all videos are processed, it opens <strong>3. Annotate</strong> directly on the first
                    unannotated sequence.
                  </p>
                  <p>
                    3. <strong>Clean Deletion:</strong> Deleting a project removes both its database records and all
                    uploaded/extracted files from disk.
                  </p>
                </div>
                <div className="bg-white border border-[#C4CCC7] p-4 space-y-2 text-xs">
                  <div className="font-mono-label font-bold text-[#0B7A6F]">STRICT WORKFLOW GATES</div>
                  <p className="text-[#76817B]">
                    Tabs unlock in order so you never export empty data:
                    <strong className="text-[#13241F]"> Project → Media/Video → Annotate → Split &amp; Export</strong>.
                  </p>
                </div>
              </div>
            )}

            {activeStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#13241F]">
                  Step 2: Video Clipping &amp; Image Import (Try Simulator)
                </h3>
                <p className="text-xs text-[#76817B]">
                  Upload or link single/multiple videos, or import an image folder directly. When multiple videos
                  are queued, process them <strong>one-by-one</strong> (either clip segments or click{' '}
                  <strong>Use Full Video</strong>). Extraction keeps <strong>All Frames (Full FPS)</strong> by default.
                </p>

                {/* Interactive Quick-Clip Simulator */}
                <div className="bg-white border border-[#C4CCC7] p-4 space-y-3">
                  <div className="flex items-center justify-between font-mono-label text-xs">
                    <span className="font-bold text-[#13241F]">INTERACTIVE QUICK-CLIP SIMULATOR (60s VIDEO)</span>
                    <span className="text-[#76817B]">Playhead: {simTime}s</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={59}
                    value={simTime}
                    onChange={(e) => setSimTime(Number(e.target.value))}
                    className="w-full accent-[#E8553D]"
                  />
                  <div className="relative h-4 bg-[#D8DFDB] border border-[#C4CCC7]">
                    {simClips.map((c, idx) => (
                      <div
                        key={idx}
                        style={{
                          left: `${(c.start / 60) * 100}%`,
                          width: `${((c.end - c.start) / 60) * 100}%`,
                        }}
                        className="absolute top-0 bottom-0 bg-[#0B7A6F]/70 border-x border-[#0B7A6F]"
                      />
                    ))}
                    <div
                      style={{ left: `${(simTime / 60) * 100}%` }}
                      className="absolute top-0 bottom-0 w-0.5 bg-[#E8553D]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1 font-mono-label text-xs">
                      <span className="text-[#76817B] mr-1">Auto-Clip:</span>
                      {[3, 5, 10].map((d) => (
                        <button
                          key={d}
                          onClick={() => setSimClipDur(d)}
                          className={`px-2 py-1 border cursor-pointer ${
                            simClipDur === d
                              ? 'bg-[#13241F] text-white border-[#13241F]'
                              : 'bg-[#EEF2EF] border-[#C4CCC7] text-[#13241F]'
                          }`}
                        >
                          {d}s
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setSimClips((prev) => [
                            ...prev,
                            { start: simTime, end: Math.min(60, simTime + simClipDur) },
                          ])
                        }
                        className="bg-[#E8553D] hover:bg-[#C83E28] text-white font-mono-label text-xs px-3 py-1.5 flex items-center gap-1 cursor-pointer"
                      >
                        <Scissors className="w-3.5 h-3.5" /> Clip {simClipDur}s ({simTime}s →{' '}
                        {Math.min(60, simTime + simClipDur)}s)
                      </button>
                      <button
                        onClick={() => setSimClips([])}
                        className="border border-[#76817B] text-[#13241F] font-mono-label text-xs px-2.5 py-1.5 cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className="font-mono-label text-[11px] text-[#0B7A6F]">
                    Queued {simClips.length} clip(s) · Est.{' '}
                    {simClips.reduce((acc, c) => acc + (c.end - c.start) * 25, 0)} frames @ 25 FPS
                  </div>
                </div>
              </div>
            )}

            {activeStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#13241F]">Step 3: Annotate &amp; Motion Auto-Track</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white border border-[#C4CCC7] p-3.5 space-y-1.5">
                    <div className="font-mono-label font-bold text-[#E8553D]">DRAWING &amp; EDITING</div>
                    <ul className="space-y-1 text-[#13241F] list-disc pl-4">
                      <li>First time opening Annotate, a popup asks you to add classes (comma-separated supported).</li>
                      <li>Press <strong>W / S</strong> to switch classes (shows live badge on cursor).</li>
                      <li><strong>Drag</strong> in Draw mode to draw over crowded boxes.</li>
                      <li><strong>Single-click</strong> inside a box to select &amp; resize; click outside to return to Draw.</li>
                      <li><strong>Right-click</strong> any box to Change Label or Delete.</li>
                    </ul>
                  </div>
                  <div className="bg-white border border-[#C4CCC7] p-3.5 space-y-1.5">
                    <div className="font-mono-label font-bold text-[#0B7A6F]">TRACKING &amp; NAVIGATION</div>
                    <ul className="space-y-1 text-[#13241F] list-disc pl-4">
                      <li>Draw all objects on Frame 1, choose track length (<code>3, 5, 7, 10, XX</code>), and press <strong>T</strong>.</li>
                      <li>Tracker stays on your current frame so you can step forward with <strong>D / →</strong> and verify each box.</li>
                      <li>Pressing <strong>D / →</strong> on the last frame automatically moves to the next video.</li>
                      <li>Toggle <strong>Auto-Save</strong> ON/OFF anytime in the top toolbar.</li>
                    </ul>
                  </div>
                </div>
                <button
                  onClick={() => setSection('practice')}
                  className="bg-[#13241F] hover:bg-[#0B7A6F] text-white font-mono-label text-xs px-4 py-2 cursor-pointer transition-colors"
                >
                  Open Interactive Canvas Sandbox →
                </button>
              </div>
            )}

            {activeStep === 4 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#13241F]">
                  Step 4: Sequential Split &amp; Export Rename (Try Simulator)
                </h3>
                <p className="text-xs text-[#76817B]">
                  Splits each video sequentially in frame order (non-random), shows class distribution &amp; spatial
                  heatmap, and exports <code>train/</code>, <code>val/</code>, <code>test/</code> with{' '}
                  <code>data.yaml</code>.
                </p>

                <div className="bg-white border border-[#C4CCC7] p-4 space-y-3 text-xs">
                  <div className="grid grid-cols-3 gap-3 font-mono-label">
                    <div>
                      <label className="text-[#76817B] block mb-1">TRAIN %</label>
                      <input
                        type="number"
                        value={simTrain}
                        onChange={(e) => setSimTrain(Math.max(0, Number(e.target.value)))}
                        className="w-full border border-[#C4CCC7] px-2 py-1 text-[#13241F]"
                      />
                    </div>
                    <div>
                      <label className="text-[#76817B] block mb-1">VAL %</label>
                      <input
                        type="number"
                        value={simVal}
                        onChange={(e) => setSimVal(Math.max(0, Number(e.target.value)))}
                        className="w-full border border-[#C4CCC7] px-2 py-1 text-[#13241F]"
                      />
                    </div>
                    <div>
                      <label className="text-[#76817B] block mb-1">TEST %</label>
                      <input
                        type="number"
                        value={simTest}
                        onChange={(e) => setSimTest(Math.max(0, Number(e.target.value)))}
                        className="w-full border border-[#C4CCC7] px-2 py-1 text-[#13241F]"
                      />
                    </div>
                  </div>

                  {/* Visual Sequential Split Bar */}
                  <div className="h-5 w-full flex overflow-hidden border border-[#13241F] font-mono-label text-[10px] text-white">
                    <div
                      style={{ width: `${simTrainPct}%` }}
                      className="bg-[#0B7A6F] flex items-center justify-center"
                    >
                      Train {simTrainPct}%
                    </div>
                    <div
                      style={{ width: `${simValPct}%` }}
                      className="bg-[#E8553D] flex items-center justify-center"
                    >
                      Val {simValPct}%
                    </div>
                    <div
                      style={{ width: `${simTestPct}%` }}
                      className="bg-[#13241F] flex items-center justify-center"
                    >
                      Test {simTestPct}%
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E2E7E4] flex flex-wrap items-center gap-2 font-mono-label">
                    <span className="text-[#76817B]">Rename Mode:</span>
                    <select
                      value={simRenameMode}
                      onChange={(e) => setSimRenameMode(e.target.value as any)}
                      className="border border-[#C4CCC7] px-2 py-1 bg-[#EEF2EF]"
                    >
                      <option value="none">Original</option>
                      <option value="prefix">Prefix</option>
                      <option value="suffix">Suffix</option>
                      <option value="full">Full Sequential</option>
                    </select>
                    {simRenameMode !== 'none' && (
                      <input
                        type="text"
                        value={simRenameVal}
                        onChange={(e) => setSimRenameVal(e.target.value)}
                        className="border border-[#C4CCC7] px-2 py-1 w-32"
                      />
                    )}
                    <span className="ml-auto text-[#0B7A6F]">
                      →{' '}
                      {simRenameMode === 'prefix'
                        ? `${simRenameVal || 'pre_'}frame_000000.jpg`
                        : simRenameMode === 'suffix'
                        ? `frame_000000${simRenameVal || '_suf'}.jpg`
                        : simRenameMode === 'full'
                        ? `${simRenameVal || 'frame'}_000001.jpg`
                        : '1_frame_000000.jpg'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: INTERACTIVE ANNOTATION PRACTICE SANDBOX */}
      {section === 'practice' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-[#C4CCC7] bg-[#E2E7E4] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-mono-label">
                <button
                  onClick={() => setDemoMode('draw')}
                  className={`px-2.5 py-1 cursor-pointer ${
                    demoMode === 'draw' ? 'bg-[#E8553D] text-white' : 'bg-white text-[#13241F]'
                  }`}
                >
                  Draw (B)
                </button>
                <button
                  onClick={() => setDemoMode('select')}
                  className={`px-2.5 py-1 cursor-pointer ${
                    demoMode === 'select' ? 'bg-[#E8553D] text-white' : 'bg-white text-[#13241F]'
                  }`}
                >
                  Select (V)
                </button>
                <span className="text-[#76817B] ml-2">
                  Press <kbd className="bg-white px-1 border border-[#C4CCC7] text-[#13241F]">W</kbd> /{' '}
                  <kbd className="bg-white px-1 border border-[#C4CCC7] text-[#13241F]">S</kbd> to switch class
                </span>
              </div>
              <button
                onClick={() => setDemoTracked(true)}
                className="bg-[#0B7A6F] hover:bg-[#096158] text-white font-mono-label px-3 py-1 flex items-center gap-1 cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" /> Test Auto-Track (T)
              </button>
            </div>

            {/* Interactive Practice Area */}
            <div
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setDemoCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseLeave={() => setDemoCursor(null)}
              onClick={() => {
                setDemoMenu(null);
                if (demoMode === 'select') {
                  setDemoSelected(null);
                  setDemoMode('draw');
                }
              }}
              className={`relative h-80 bg-[#13241F] overflow-hidden select-none ${
                demoMode === 'draw' ? 'cursor-crosshair' : 'cursor-default'
              }`}
            >
              <div className="absolute inset-0 flex items-center justify-center text-[#76817B]/40 font-mono-label text-xs pointer-events-none">
                PRACTICE CANVAS — CLICK A BOX TO SELECT · CLICK OUTSIDE TO DRAW · RIGHT-CLICK A BOX FOR MENU
              </div>

              {demoBoxes.map((b) => {
                const cls = DEMO_CLASSES[b.clsIdx];
                const isSel = demoSelected === b.id;
                const shift = demoTracked ? 6 : 0;
                return (
                  <div
                    key={b.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDemoMenu(null);
                      setDemoSelected(b.id);
                      setDemoMode('select');
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDemoSelected(b.id);
                      setDemoMenu({ x: e.clientX, y: e.clientY, id: b.id });
                    }}
                    style={{
                      left: `${b.x + shift}%`,
                      top: `${b.y}%`,
                      width: `${b.w}%`,
                      height: `${b.h}%`,
                      borderColor: cls.color,
                      backgroundColor: `${cls.color}33`,
                    }}
                    className={`absolute border-2 transition-all cursor-pointer ${
                      isSel ? 'ring-2 ring-white' : ''
                    } ${demoTracked ? 'border-dashed' : ''}`}
                  >
                    <span
                      style={{ backgroundColor: cls.color }}
                      className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-bold text-white"
                    >
                      {cls.name}
                    </span>
                  </div>
                );
              })}

              {/* Cursor Class Badge */}
              {demoMode === 'draw' && demoCursor && (
                <div
                  style={{ left: demoCursor.x + 14, top: demoCursor.y + 14 }}
                  className="absolute pointer-events-none flex items-center gap-1.5 bg-[#13241F]/90 text-white border border-white/25 px-2 py-0.5 font-mono-label text-[11px]"
                >
                  <span
                    className="w-2.5 h-2.5"
                    style={{ backgroundColor: DEMO_CLASSES[demoClassIdx].color }}
                  />
                  {DEMO_CLASSES[demoClassIdx].name}
                </div>
              )}
            </div>

            {demoTracked && (
              <div className="px-4 py-2 bg-[#0B7A6F]/15 border-t border-[#0B7A6F]/30 font-mono-label text-xs text-[#0B7A6F] flex items-center justify-between">
                <span>Tracked all {demoBoxes.length} boxes forward! (Dashed = tracked)</span>
                <button
                  onClick={() => setDemoTracked(false)}
                  className="underline cursor-pointer"
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Right Legend */}
          <div className="lg:col-span-4 bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-4 space-y-4 text-xs">
            <h4 className="font-mono-label font-bold text-[#13241F] uppercase">
              Active Class (W / S)
            </h4>
            <div className="space-y-1.5">
              {DEMO_CLASSES.map((c, idx) => (
                <button
                  key={c.name}
                  onClick={() => setDemoClassIdx(idx)}
                  className={`w-full px-3 py-2 flex items-center justify-between border-l-4 cursor-pointer ${
                    demoClassIdx === idx
                      ? 'bg-[#13241F] text-white border-l-[#E8553D]'
                      : 'bg-white text-[#13241F] border-l-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                  {demoClassIdx === idx && (
                    <span className="font-mono-label text-[9px] bg-[#E8553D] px-1.5 py-0.5">
                      ACTIVE
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-[#C4CCC7] space-y-2">
              <div className="font-mono-label font-bold text-[#13241F] flex items-center gap-1.5">
                <MousePointerClick className="w-3.5 h-3.5 text-[#0B7A6F]" />
                TRY THESE ACTIONS
              </div>
              <p className="text-[#76817B]">• Press <strong>W</strong> or <strong>S</strong> to watch the cursor badge change.</p>
              <p className="text-[#76817B]">• Click inside a box to select it (white ring).</p>
              <p className="text-[#76817B]">• Right-click a box to open the label/delete menu.</p>
              <p className="text-[#76817B]">• Click empty space to switch back to Draw mode.</p>
            </div>
          </div>

          {demoMenu && (
            <div
              style={{ left: demoMenu.x, top: demoMenu.y }}
              className="fixed z-50 w-44 bg-[#EEF2EF] border border-[#13241F] shadow-xl text-xs"
            >
              <div className="px-2.5 py-1 bg-[#E2E7E4] border-b border-[#C4CCC7] font-mono-label text-[10px] font-bold text-[#76817B]">
                CHANGE LABEL
              </div>
              {DEMO_CLASSES.map((c, idx) => (
                <button
                  key={c.name}
                  onClick={() => {
                    setDemoBoxes((prev) =>
                      prev.map((b) => (b.id === demoMenu.id ? { ...b, clsIdx: idx } : b))
                    );
                    setDemoMenu(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-white cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                  {demoBoxes.find((b) => b.id === demoMenu.id)?.clsIdx === idx && (
                    <Check className="w-3 h-3 text-[#0B7A6F]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: SEARCHABLE SHORTCUTS */}
      {section === 'shortcuts' && (
        <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#C4CCC7] bg-[#E2E7E4]/60 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[#13241F] flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-[#E8553D]" />
              Complete Keyboard Shortcut Reference
            </h3>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#76817B] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search shortcuts..."
                value={shortcutFilter}
                onChange={(e) => setShortcutFilter(e.target.value)}
                className="bg-white border border-[#C4CCC7] pl-8 pr-3 py-1 text-xs text-[#13241F] focus:outline-none focus:border-[#E8553D]"
              />
            </div>
          </div>

          <div className="divide-y divide-[#C4CCC7]">
            {filteredShortcuts.map((item) => (
              <div
                key={item.key}
                className="px-5 py-3 flex items-center justify-between gap-4 text-xs bg-white/50"
              >
                <div className="flex items-center gap-3">
                  <kbd className="font-mono-label bg-[#13241F] text-white px-2.5 py-1 text-[11px] min-w-[140px] text-center">
                    {item.key}
                  </kbd>
                  <span className="font-mono-label text-[10px] bg-[#E2E7E4] text-[#76817B] px-2 py-0.5 uppercase">
                    {item.category}
                  </span>
                </div>
                <span className="text-[#13241F] text-right">{item.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
