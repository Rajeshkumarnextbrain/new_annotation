import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  FolderInput,
  PieChart,
  RefreshCw,
  Split,
} from 'lucide-react';
import type { AnalyticsData } from '../types';
import { api } from '../api/client';

interface Props {
  projectId: number;
  onRefreshProject: () => void;
}

export const AnalyticsSplitView: React.FC<Props> = ({ projectId, onRefreshProject }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [importingYolo, setImportingYolo] = useState(false);

  const [trainRatio, setTrainRatio] = useState(70);
  const [valRatio, setValRatio] = useState(20);
  const [testRatio, setTestRatio] = useState(10);
  const [stratified, setStratified] = useState(true);
  const [videoAware, setVideoAware] = useState(true);
  const [perVideoSequential, setPerVideoSequential] = useState(true);
  const [includeUnannotated, setIncludeUnannotated] = useState(false);
  const [splitMsg, setSplitMsg] = useState('');

  const [renameMode, setRenameMode] = useState<'none' | 'prefix' | 'suffix' | 'full'>('none');
  const [renameValue, setRenameValue] = useState('');
  const [hideEmptyClasses, setHideEmptyClasses] = useState(false);
  const [hoveredClass, setHoveredClass] = useState<{
    name: string;
    count: number;
    color: string;
  } | null>(null);

  const [imagesDir, setImagesDir] = useState('');
  const [labelsDir, setLabelsDir] = useState('');
  const [classesFile, setClassesFile] = useState('');
  const [importMsg, setImportMsg] = useState('');

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const data = await api.getAnalytics(projectId);
      setAnalytics(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [projectId]);

  const handleSplit = async () => {
    setSplitMsg('');
    setSplitting(true);
    try {
      const res = await api.splitDataset(projectId, {
        train_ratio: trainRatio / 100,
        val_ratio: valRatio / 100,
        test_ratio: testRatio / 100,
        stratified,
        video_aware: videoAware,
        per_video_sequential: perVideoSequential,
        include_unannotated: includeUnannotated,
      });
      setSplitMsg(
        `Split ${res.total_frames} frames → Train: ${res.splits.train || 0}, Val: ${
          res.splits.val || 0
        }, Test: ${res.splits.test || 0}`
      );
      loadAnalytics();
    } catch (err: any) {
      setSplitMsg(`Error: ${err.message}`);
    } finally {
      setSplitting(false);
    }
  };

  const handleYoloImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportMsg('');
    setImportingYolo(true);
    try {
      const res = await api.importYoloFolder(projectId, {
        images_dir: imagesDir.trim(),
        labels_dir: labelsDir.trim(),
        classes_file: classesFile.trim() || undefined,
      });
      setImportMsg(
        `Imported ${res.imported_frames} frames and ${res.imported_annotations} YOLO annotations.`
      );
      setImagesDir('');
      setLabelsDir('');
      setClassesFile('');
      loadAnalytics();
      onRefreshProject();
    } catch (err: any) {
      setImportMsg(`Error: ${err.message}`);
    } finally {
      setImportingYolo(false);
    }
  };

  const maxClassCount = Math.max(
    1,
    ...(analytics?.class_distribution.map((c) => c.count) || [1])
  );
  const maxHeat = Math.max(
    1,
    ...(analytics?.heatmap.flat() || [1])
  );

  return (
    <div className="max-w-6xl w-full mx-auto p-6 space-y-5">
      <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#13241F] flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#E8553D]" />
          Dataset Splitting, Analytics & YOLO Export
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAnalytics}
            className="border border-[#76817B] text-[#13241F] hover:bg-[#13241F] hover:text-white px-3 py-1.5 font-mono-label text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <a
            href={api.exportYoloUrl(projectId, renameMode, renameValue, includeUnannotated)}
            className="bg-[#E8553D] hover:bg-[#C83E28] text-white font-mono-label px-4 py-1.5 text-xs flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export YOLO (.zip)
          </a>
        </div>
      </div>

      {/* Export File Rename Options */}
      <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono-label font-bold text-[#13241F] uppercase">
            Export File Naming:
          </span>
          <select
            value={renameMode}
            onChange={(e) => setRenameMode(e.target.value as 'none' | 'prefix' | 'suffix' | 'full')}
            className="bg-white border border-[#C4CCC7] px-2.5 py-1.5 font-mono-label text-[#13241F]"
          >
            <option value="none">Keep Original Names</option>
            <option value="prefix">Add Prefix</option>
            <option value="suffix">Add Suffix</option>
            <option value="full">Full Rename (Sequential)</option>
          </select>
          {renameMode !== 'none' && (
            <input
              type="text"
              placeholder={
                renameMode === 'prefix'
                  ? 'e.g. cam1_'
                  : renameMode === 'suffix'
                  ? 'e.g. _v1'
                  : 'e.g. corridor'
              }
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-48 bg-white border border-[#C4CCC7] px-2.5 py-1.5 font-mono-label text-[#13241F]"
            />
          )}
        </div>
        <span className="font-mono-label text-[11px] text-[#76817B]">
          Preview:{' '}
          <strong className="text-[#13241F]">
            {renameMode === 'prefix'
              ? `${renameValue || 'prefix_'}frame_000000.jpg`
              : renameMode === 'suffix'
              ? `frame_000000${renameValue || '_suffix'}.jpg`
              : renameMode === 'full'
              ? `${renameValue || 'frame'}_000001.jpg`
              : '1_frame_000000.jpg'}
          </strong>
        </span>
      </div>

      {/* Summary Cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'TOTAL FRAMES', val: analytics.total_frames, color: 'text-[#13241F]' },
            { label: 'ANNOTATED', val: analytics.annotated_frames, color: 'text-[#0B7A6F]' },
            { label: 'UNANNOTATED', val: analytics.unannotated_frames, color: 'text-[#E8553D]' },
            { label: 'TOTAL BOXES', val: analytics.total_annotations, color: 'text-[#13241F]' },
          ].map((card) => (
            <div key={card.label} className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-4">
              <p className="font-mono-label text-[11px] text-[#76817B]">{card.label}</p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${card.color}`}>{card.val}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Train / Val / Test Splitter */}
        <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-sm text-[#13241F] flex items-center gap-2">
            <Split className="w-4 h-4 text-[#0B7A6F]" />
            Train / Val / Test Splitter
          </h3>
          <div className="grid grid-cols-3 gap-3 font-mono-label text-xs">
            <div>
              <label className="text-[#76817B] block mb-1">TRAIN (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={trainRatio}
                onChange={(e) => setTrainRatio(Number(e.target.value))}
                className="w-full bg-white border border-[#C4CCC7] px-2.5 py-1.5 text-[#13241F] tabular-nums"
              />
            </div>
            <div>
              <label className="text-[#76817B] block mb-1">VAL (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={valRatio}
                onChange={(e) => setValRatio(Number(e.target.value))}
                className="w-full bg-white border border-[#C4CCC7] px-2.5 py-1.5 text-[#13241F] tabular-nums"
              />
            </div>
            <div>
              <label className="text-[#76817B] block mb-1">TEST (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={testRatio}
                onChange={(e) => setTestRatio(Number(e.target.value))}
                className="w-full bg-white border border-[#C4CCC7] px-2.5 py-1.5 text-[#13241F] tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-[#13241F]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={perVideoSequential}
                onChange={(e) => setPerVideoSequential(e.target.checked)}
                className="accent-[#0B7A6F]"
              />
              Per-Video Sequential (Train → Val → Test, non-random)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeUnannotated}
                onChange={(e) => setIncludeUnannotated(e.target.checked)}
                className="accent-[#E8553D]"
              />
              Include unannotated frames (0 boxes)
            </label>
            {!perVideoSequential && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stratified}
                    onChange={(e) => setStratified(e.target.checked)}
                    className="accent-[#0B7A6F]"
                  />
                  Class-Stratified
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={videoAware}
                    onChange={(e) => setVideoAware(e.target.checked)}
                    className="accent-[#0B7A6F]"
                  />
                  Group by Video
                </label>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleSplit}
              disabled={splitting}
              className="bg-[#13241F] hover:bg-[#0B7A6F] disabled:opacity-50 text-white font-mono-label px-4 py-2 text-xs cursor-pointer transition-colors"
            >
              {splitting ? 'Splitting...' : 'Apply Dataset Split'}
            </button>
            {analytics && (
              <div className="flex gap-3 font-mono-label text-xs text-[#76817B] tabular-nums">
                <span>T: {analytics.split_distribution.train || 0}</span>
                <span>V: {analytics.split_distribution.val || 0}</span>
                <span>Te: {analytics.split_distribution.test || 0}</span>
              </div>
            )}
          </div>
          {splitMsg && <p className="font-mono-label text-xs text-[#0B7A6F]">{splitMsg}</p>}
        </div>

        {/* Import Existing YOLO Folder */}
        <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-sm text-[#13241F] flex items-center gap-2">
            <FolderInput className="w-4 h-4 text-[#E8553D]" />
            Import Existing YOLO Dataset
          </h3>
          <form onSubmit={handleYoloImport} className="space-y-2.5 text-xs">
            <input
              type="text"
              placeholder="Images directory path (e.g., /data/images/train)"
              value={imagesDir}
              onChange={(e) => setImagesDir(e.target.value)}
              required
              className="w-full bg-white border border-[#C4CCC7] px-3 py-2 text-[#13241F]"
            />
            <input
              type="text"
              placeholder="Labels directory path (e.g., /data/labels/train)"
              value={labelsDir}
              onChange={(e) => setLabelsDir(e.target.value)}
              required
              className="w-full bg-white border border-[#C4CCC7] px-3 py-2 text-[#13241F]"
            />
            <input
              type="text"
              placeholder="classes.txt or data.yaml path (optional)"
              value={classesFile}
              onChange={(e) => setClassesFile(e.target.value)}
              className="w-full bg-white border border-[#C4CCC7] px-3 py-2 text-[#13241F]"
            />
            <button
              type="submit"
              disabled={importingYolo}
              className="bg-[#0B7A6F] hover:bg-[#096158] disabled:opacity-50 text-white font-mono-label px-4 py-2 text-xs cursor-pointer transition-colors"
            >
              {importingYolo ? 'Importing...' : 'Import YOLO Folder'}
            </button>
          </form>
          {importMsg && <p className="font-mono-label text-xs text-[#0B7A6F]">{importMsg}</p>}
        </div>
      </div>

      {/* Analytics Charts */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Class Distribution Graph */}
          <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-[#13241F] flex items-center gap-2 text-sm">
                <PieChart className="w-4 h-4 text-[#E8553D]" />
                Class Distribution Graph
              </h3>
              <div className="flex items-center gap-3">
                {hoveredClass && (
                  <span className="font-mono-label text-[11px] bg-[#13241F] text-white px-2 py-0.5">
                    {hoveredClass.name}: {hoveredClass.count}
                  </span>
                )}
                <label className="flex items-center gap-1.5 font-mono-label text-[11px] text-[#76817B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideEmptyClasses}
                    onChange={(e) => setHideEmptyClasses(e.target.checked)}
                    className="accent-[#0B7A6F]"
                  />
                  Hide 0-count
                </label>
              </div>
            </div>

            {analytics.class_distribution.length === 0 ? (
              <p className="text-xs text-[#76817B]">No classes defined yet.</p>
            ) : (
              (() => {
                const items = hideEmptyClasses
                  ? analytics.class_distribution.filter((c) => c.count > 0)
                  : analytics.class_distribution;
                const chartItems = items.length > 0 ? items : analytics.class_distribution;
                const chartW = Math.max(480, chartItems.length * 48);
                const chartH = 260;
                const padL = 44;
                const padR = 20;
                const padT = 24;
                const padB = 92;
                const plotW = chartW - padL - padR;
                const plotH = chartH - padT - padB;
                const barSlot = plotW / Math.max(1, chartItems.length);
                const barW = Math.min(30, Math.max(16, barSlot * 0.58));
                const ticks = [0, 0.25, 0.5, 0.75, 1];

                return (
                  <div className="bg-white border border-[#C4CCC7] p-2 overflow-x-auto">
                    <svg
                      width={chartW}
                      height={chartH}
                      viewBox={`0 0 ${chartW} ${chartH}`}
                      className="block"
                    >
                      {/* Horizontal Gridlines & Y-Axis Ticks */}
                      {ticks.map((t) => {
                        const y = padT + plotH * (1 - t);
                        const val = Math.round(maxClassCount * t);
                        return (
                          <g key={t}>
                            <line
                              x1={padL}
                              y1={y}
                              x2={chartW - padR}
                              y2={y}
                              stroke="#E2E7E4"
                              strokeWidth={1}
                            />
                            <text
                              x={padL - 8}
                              y={y + 4}
                              textAnchor="end"
                              fill="#76817B"
                              fontSize={11}
                              fontFamily="Space Mono, monospace"
                            >
                              {val}
                            </text>
                          </g>
                        );
                      })}

                      {/* Bars */}
                      {chartItems.map((c, idx) => {
                        const h = maxClassCount > 0 ? (c.count / maxClassCount) * plotH : 0;
                        const x = padL + idx * barSlot + (barSlot - barW) / 2;
                        const y = padT + plotH - h;
                        const labelX = x + barW / 2;
                        const labelY = padT + plotH + 14;
                        return (
                          <g
                            key={c.class_id}
                            onMouseEnter={() =>
                              setHoveredClass({ name: c.name, count: c.count, color: c.color })
                            }
                            onMouseLeave={() => setHoveredClass(null)}
                            className="cursor-pointer"
                          >
                            <rect
                              x={x}
                              y={Math.min(y, padT + plotH - 2)}
                              width={barW}
                              height={Math.max(2, h)}
                              fill={c.color}
                              opacity={c.count === 0 ? 0.25 : 0.92}
                            />
                            {c.count > 0 && (
                              <text
                                x={labelX}
                                y={y - 6}
                                textAnchor="middle"
                                fill="#13241F"
                                fontSize={11}
                                fontWeight="bold"
                                fontFamily="Space Mono, monospace"
                              >
                                {c.count}
                              </text>
                            )}
                            <text
                              x={labelX}
                              y={labelY}
                              textAnchor="end"
                              transform={`rotate(-40 ${labelX} ${labelY})`}
                              fill="#13241F"
                              fontSize={11}
                              fontFamily="Space Mono, monospace"
                            >
                              {c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()
            )}

            <div className="pt-2 border-t border-[#C4CCC7] grid grid-cols-3 gap-2 font-mono-label text-xs text-[#76817B]">
              <div>SMALL: <strong className="text-[#13241F]">{analytics.size_buckets.small}</strong></div>
              <div>MEDIUM: <strong className="text-[#13241F]">{analytics.size_buckets.medium}</strong></div>
              <div>LARGE: <strong className="text-[#13241F]">{analytics.size_buckets.large}</strong></div>
            </div>
          </div>

          {/* 10x10 Spatial Heatmap */}
          <div className="bg-[#EEF2EF] border border-[#C4CCC7] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#13241F] text-sm">Spatial Heatmap</h3>
              <span className="font-mono-label text-[11px] text-[#76817B]">
                AR {analytics.avg_aspect_ratio} · AREA {(analytics.avg_box_area * 100).toFixed(2)}%
              </span>
            </div>
            <div className="grid grid-cols-10 gap-1 aspect-video max-h-56 bg-white p-2 border border-[#C4CCC7]">
              {analytics.heatmap.flatMap((row, r) =>
                row.map((val, c) => {
                  const alpha = val === 0 ? 0.06 : 0.2 + (val / maxHeat) * 0.8;
                  return (
                    <div
                      key={`${r}-${c}`}
                      title={`Cell (${c},${r}): ${val} boxes`}
                      style={{ backgroundColor: `rgba(232, 85, 61, ${alpha})` }}
                      className="flex items-center justify-center font-mono-label text-[10px] text-[#13241F]"
                    >
                      {val > 0 ? val : ''}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
