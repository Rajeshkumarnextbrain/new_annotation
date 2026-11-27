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

type HelpTab = 'mindmap' | 'practice' | 'shortcuts';
type BranchId = 'root' | 'project' | 'media' | 'annotate' | 'export';

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

const MINDMAP_BRANCHES: {
  id: Exclude<BranchId, 'root'>;
  title: string;
  subtitle: string;
  color: string;
  x: number;
  y: number;
  children: { label: string; detail: string }[];
}[] = [
  {
    id: 'project',
    title: '1. Project',
    subtitle: 'Workspace & Smart Resume',
    color: '#13241F',
    x: 180,
    y: 78,
    children: [
      { label: 'Create Project', detail: 'Name your workspace and lock in the 4-step pipeline.' },
      { label: 'Smart Resume', detail: 'Auto-opens Media if videos are pending, or Annotate if ready.' },
      { label: 'Clean Disk Delete', detail: 'Deleting a project removes DB rows + all files in data/.' },
    ],
  },
  {
    id: 'media',
    title: '2. Media / Video',
    subtitle: 'Strict Queue & Clipping',
    color: '#0B7A6F',
    x: 180,
    y: 252,
    children: [
      { label: 'Auto-Clip Xs', detail: 'Scrub 1hr+ video and clip [T -> T+X] in one click.' },
      { label: 'Use Full Video', detail: 'Extract 100% of frames from short/unclipped videos.' },
      { label: 'One-by-One Queue', detail: 'Process each video in order before unlocking Annotate.' },
    ],
  },
  {
    id: 'annotate',
    title: '3. Annotate & Track',
    subtitle: '2D Canvas & KCF/CSRT',
    color: '#E8553D',
    x: 720,
    y: 78,
    children: [
      { label: 'W / S Class Switch', detail: 'Cycle classes with live cursor badge; right-click box to edit.' },
      { label: 'Draw (B) / Select (V)', detail: 'Drag over crowded boxes; single-click to select & resize.' },
      { label: 'Auto-Track All (T)', detail: 'Tracks all objects on frame across 3, 5, 7, 10, or XX frames.' },
    ],
  },
  {
    id: 'export',
    title: '4. Split & Export',
    subtitle: 'Sequential & Rename',
    color: '#0B7A6F',
    x: 720,
    y: 252,
    children: [
      { label: 'Sequential Split', detail: 'Non-random per-video Train -> Val -> Test frame split.' },
      { label: 'Analytics & Heatmap', detail: 'Class balance, box sizes, and 10x10 spatial heatmap.' },
      { label: 'Rename + YOLO .zip', detail: 'Prefix/Suffix/Full rename with /train, /val, /test & data.yaml.' },
    ],
  },
];

export const HelpView: React.FC = () => {
  const [section, setSection] = useState<HelpTab>('mindmap');
  const [selectedBranch, setSelectedBranch] = useState<BranchId>('media');
  const [selectedLeaf, setSelectedLeaf] = useState<string | null>(null);
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

  const activeBranchObj = MINDMAP_BRANCHES.find((b) => b.id === selectedBranch);

  return (
    <div className="max-w-6xl w-full mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#13241F] flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#E8553D]" />
            YOLO Studio — Interactive Mindmap &amp; Guide
          </h2>
          <p className="text-xs text-[#76817B] mt-0.5">
            Click any node in the mindmap to explore features and try live simulators.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#E2E7E4] p-1 border border-[#C4CCC7]">
          {[
            { id: 'mindmap', label: 'Workflow Mindmap' },
            { id: 'practice', label: 'Canvas Sandbox' },
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

      {/* SECTION 1: INTERACTIVE MINDMAP */}
      {section === 'mindmap' && (
        <div className="space-y-4">
          {/* Visual SVG Mindmap Canvas */}
          <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-4 overflow-x-auto">
            <div className="min-w-[860px]">
              <svg viewBox="0 0 900 330" className="w-full h-auto block">
                {/* Curved Connector Lines from Center (450, 165) to 4 Main Branches */}
                {MINDMAP_BRANCHES.map((br) => {
                  const isLeft = br.x < 450;
                  const startX = isLeft ? 385 : 515;
                  const startY = 165;
                  const endX = isLeft ? br.x + 85 : br.x - 85;
                  const endY = br.y;
                  const ctrlX = (startX + endX) / 2;
                  const active = selectedBranch === br.id;
                  return (
                    <g key={`link-${br.id}`}>
                      <path
                        d={`M ${startX} ${startY} C ${ctrlX} ${startY}, ${ctrlX} ${endY}, ${endX} ${endY}`}
                        fill="none"
                        stroke={active ? br.color : '#B0BAB4'}
                        strokeWidth={active ? 3 : 2}
                        strokeDasharray={active ? undefined : '4 3'}
                      />
                      {/* Child sub-branch connectors */}
                      {br.children.map((ch, cIdx) => {
                        const cy = br.y + (cIdx - 1) * 38;
                        const cx = isLeft ? 15 : 755;
                        const bxEdge = isLeft ? br.x - 85 : br.x + 85;
                        const cxEdge = isLeft ? cx + 115 : cx;
                        const mid = (bxEdge + cxEdge) / 2;
                        return (
                          <path
                            key={`${br.id}-clink-${cIdx}`}
                            d={`M ${bxEdge} ${br.y} C ${mid} ${br.y}, ${mid} ${cy}, ${cxEdge} ${cy}`}
                            fill="none"
                            stroke={active ? br.color : '#C4CCC7'}
                            strokeWidth={active ? 1.8 : 1.2}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* Center Root Node */}
                <g
                  onClick={() => {
                    setSelectedBranch('root');
                    setSelectedLeaf(null);
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    x={385}
                    y={135}
                    width={130}
                    height={60}
                    rx={8}
                    fill="#13241F"
                    stroke={selectedBranch === 'root' ? '#E8553D' : '#13241F'}
                    strokeWidth={3}
                  />
                  <text
                    x={450}
                    y={161}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize={13}
                    fontWeight="bold"
                  >
                    YOLO Studio
                  </text>
                  <text
                    x={450}
                    y={179}
                    textAnchor="middle"
                    fill="#D8DFDB"
                    fontSize={10}
                    fontFamily="Space Mono, monospace"
                  >
                    4-STEP PIPELINE
                  </text>
                </g>

                {/* 4 Main Branch Nodes + 12 Leaf Nodes */}
                {MINDMAP_BRANCHES.map((br) => {
                  const isLeft = br.x < 450;
                  const active = selectedBranch === br.id;
                  return (
                    <g key={`node-${br.id}`}>
                      <g
                        onClick={() => {
                          setSelectedBranch(br.id);
                          setSelectedLeaf(null);
                        }}
                        className="cursor-pointer"
                      >
                        <rect
                          x={br.x - 85}
                          y={br.y - 26}
                          width={170}
                          height={52}
                          rx={6}
                          fill={active ? br.color : '#FFFFFF'}
                          stroke={br.color}
                          strokeWidth={active ? 2.5 : 1.5}
                        />
                        <text
                          x={br.x}
                          y={br.y - 3}
                          textAnchor="middle"
                          fill={active ? '#FFFFFF' : '#13241F'}
                          fontSize={12}
                          fontWeight="bold"
                        >
                          {br.title}
                        </text>
                        <text
                          x={br.x}
                          y={br.y + 14}
                          textAnchor="middle"
                          fill={active ? '#EEF2EF' : '#76817B'}
                          fontSize={9.5}
                          fontFamily="Space Mono, monospace"
                        >
                          {br.subtitle}
                        </text>
                      </g>

                      {/* Leaf Nodes */}
                      {br.children.map((ch, cIdx) => {
                        const cy = br.y + (cIdx - 1) * 38;
                        const cx = isLeft ? 15 : 755;
                        const leafActive = selectedBranch === br.id && selectedLeaf === ch.label;
                        return (
                          <g
                            key={`${br.id}-leaf-${cIdx}`}
                            onClick={() => {
                              setSelectedBranch(br.id);
                              setSelectedLeaf(ch.label);
                            }}
                            className="cursor-pointer"
                          >
                            <rect
                              x={cx}
                              y={cy - 14}
                              width={130}
                              height={28}
                              rx={4}
                              fill={leafActive ? '#13241F' : '#FFFFFF'}
                              stroke={leafActive ? '#E8553D' : '#C4CCC7'}
                              strokeWidth={leafActive ? 2 : 1}
                            />
                            <text
                              x={cx + 65}
                              y={cy + 4}
                              textAnchor="middle"
                              fill={leafActive ? '#FFFFFF' : '#13241F'}
                              fontSize={10}
                              fontFamily="Space Mono, monospace"
                            >
                              {ch.label}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Selected Branch Inspector + Interactive Simulator */}
          <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-5 space-y-4">
            {selectedBranch === 'root' && (
              <div className="space-y-2 text-xs">
                <h3 className="text-sm font-bold text-[#13241F]">
                  YOLO Studio — Strict 4-Step Pipeline
                </h3>
                <p className="text-[#76817B]">
                  Click any node in the mindmap above (<strong>1. Project</strong>,{' '}
                  <strong>2. Media / Video</strong>, <strong>3. Annotate &amp; Track</strong>, or{' '}
                  <strong>4. Split &amp; Export</strong>) to inspect its workflow and try its interactive
                  simulator.
                </p>
              </div>
            )}

            {activeBranchObj && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C4CCC7] pb-3">
                  <div className="flex items-center gap-2">
                    {selectedBranch === 'project' && <FolderKanban className="w-4 h-4 text-[#13241F]" />}
                    {selectedBranch === 'media' && <Film className="w-4 h-4 text-[#0B7A6F]" />}
                    {selectedBranch === 'annotate' && <PenTool className="w-4 h-4 text-[#E8553D]" />}
                    {selectedBranch === 'export' && <BarChart3 className="w-4 h-4 text-[#0B7A6F]" />}
                    <h3 className="text-sm font-bold text-[#13241F]">{activeBranchObj.title}</h3>
                    <span className="font-mono-label text-[11px] text-[#76817B]">
                      — {activeBranchObj.subtitle}
                    </span>
                  </div>
                  {selectedBranch === 'annotate' && (
                    <button
                      onClick={() => setSection('practice')}
                      className="bg-[#13241F] hover:bg-[#0B7A6F] text-white font-mono-label text-xs px-3 py-1.5 cursor-pointer"
                    >
                      Open Canvas Sandbox →
                    </button>
                  )}
                </div>

                {/* Leaf Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {activeBranchObj.children.map((ch) => (
                    <div
                      key={ch.label}
                      onClick={() => setSelectedLeaf(ch.label)}
                      className={`p-3 border cursor-pointer transition-colors ${
                        selectedLeaf === ch.label
                          ? 'bg-[#13241F] text-white border-[#E8553D]'
                          : 'bg-white text-[#13241F] border-[#C4CCC7] hover:border-[#13241F]'
                      }`}
                    >
                      <div className="font-mono-label text-xs font-bold">{ch.label}</div>
                      <p
                        className={`text-xs mt-1 ${
                          selectedLeaf === ch.label ? 'text-[#D8DFDB]' : 'text-[#76817B]'
                        }`}
                      >
                        {ch.detail}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Embedded Interactive Simulator for Media */}
                {selectedBranch === 'media' && (
                  <div className="bg-white border border-[#C4CCC7] p-4 space-y-3">
                    <div className="flex items-center justify-between font-mono-label text-xs">
                      <span className="font-bold text-[#13241F]">
                        TRY QUICK-CLIP SIMULATOR (60s VIDEO)
                      </span>
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1 font-mono-label text-xs">
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
                )}

                {/* Embedded Interactive Simulator for Split & Export */}
                {selectedBranch === 'export' && (
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
                    <div className="h-5 w-full flex overflow-hidden border border-[#13241F] font-mono-label text-[10px] text-white">
                      <div style={{ width: `${simTrainPct}%` }} className="bg-[#0B7A6F] flex items-center justify-center">
                        Train {simTrainPct}%
                      </div>
                      <div style={{ width: `${simValPct}%` }} className="bg-[#E8553D] flex items-center justify-center">
                        Val {simValPct}%
                      </div>
                      <div style={{ width: `${simTestPct}%` }} className="bg-[#13241F] flex items-center justify-center">
                        Test {simTestPct}%
                      </div>
                    </div>
                    <div className="pt-2 border-t border-[#E2E7E4] flex flex-wrap items-center gap-2 font-mono-label">
                      <span className="text-[#76817B]">Rename:</span>
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
                )}
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
