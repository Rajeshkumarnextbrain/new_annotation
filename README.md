# YOLO Studio — Video Clipping & 2D Data Annotation Tool

A web-based **YOLO 2D object detection annotation studio** built with **React + TypeScript + Tailwind CSS** and **Python FastAPI + OpenCV 5 + FFmpeg + SQLite**.

---

## Features

### 1. Strict Step-by-Step Workflow
1. **Project** — Create and manage annotation projects with automatic disk cleanup on deletion.
2. **Media / Video** — Import single or multiple videos (upload or local path) or image folders:
   - **Auto-Clip $X$ Seconds:** Scrub to any timestamp and click **Clip** to capture `[T, T + X]`.
   - **Manual Multi-Range:** Mark custom `In → Out` ranges on the timeline.
   - **Use Full Video:** Extract all frames from an entire video in 1 click.
   - **Strict Sequential Video Queue:** Process multiple videos one-by-one before moving to annotation.
   - **All Frames (Full FPS) by Default:** Preserves 100% of frames (with optional `Target FPS`, `Every N Frames`, and near-duplicate skipping).
3. **Annotate** — High-speed 2D bounding box workspace:
   - Required initial class setup popup + per-class color picker.
   - Draw over crowded/overlapping boxes (`B`), or single-click inside a box to select & resize (`V`), and click outside to switch back to Draw.
   - Right-click context menu on any box to **Change Label** or **Delete Box**.
   - **Motion Auto-Track (`T`):** Tracks **all** boxes on the current frame forward (`3`, `5`, `7`, `10`, or custom frames) using OpenCV CSRT/KCF + motion-peak recovery.
   - **Auto-Save Toggle**, Undo/Redo, Copy Previous Frame (`C`), non-destructive image filters (Brightness, Contrast, Saturation, Box Opacity, Invert), and cross-video boundary navigation.
4. **Split & Export** — Dataset preparation & analytics:
   - **Per-Video Sequential Split (non-random):** Splits each video's frames sequentially (`train` → `val` → `test`).
   - **Analytics Dashboard:** Class distribution, box size breakdown (`Small`/`Medium`/`Large`), and `10×10` spatial heatmap.
   - **Bulk File Renaming:** Export with original names, **Prefix**, **Suffix**, or **Full Sequential Rename**.
   - **YOLO `.zip` Export & Import:** Exports `train/`, `val/`, `test/` (`images/` & `labels/`), `classes.txt`, and `data.yaml`.

---

## Keyboard Shortcuts (Annotate)

| Shortcut | Action |
| :--- | :--- |
| `W` / `S` | Previous / Next class (with live cursor badge) |
| `B` / `V` | Draw mode / Select mode |
| `A` / `D` or `←` / `→` | Previous / Next frame (crosses to prev/next video at ends) |
| `C` | Copy all boxes from previous frame |
| `T` | Auto-Track all boxes on current frame |
| `H` | Hide / Show bounding boxes |
| `Del` / `Backspace` | Delete selected box |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+S` | Save current frame |
| `Alt + Drag` / `Wheel` | Pan / Zoom at cursor |

---

## Docker Deployment (Unique Ports)

- **Web UI (Nginx):** `http://localhost:3784`
- **Backend API (FastAPI):** `http://localhost:8784`
- **Persistent Storage:** `./data` is mounted to `/app/data`

```bash
docker compose up -d --build
```

To stop:
```bash
docker compose down
```

---

## Local Development

```bash
./start.sh
```
- Frontend: `http://127.0.0.1:3785`
- Backend: `http://127.0.0.1:8785`
