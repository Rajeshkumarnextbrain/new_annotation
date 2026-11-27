# YOLO Data Annotation Tool — Requirements & Feature Specification

## 1. Project Overview
A fast, local-friendly **web-based data annotation tool** tailored for **YOLO 2D object detection** workflows. It supports importing image folders and single/multiple videos, intelligent video clip extraction, a keyboard-driven smart canvas, frame-by-frame object tracking, dataset splitting, and analytics.

---

## 2. Architecture & Tech Stack
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + HTML5 Canvas / Konva.js
- **Backend:** Python FastAPI + OpenCV + FFmpeg + SQLite
- **Storage:** Local filesystem (supports direct file/folder upload and linking local directory paths)
- **Deployment Model:** Single-workspace web application (no user authentication or role management required)

---

## 3. Core Feature Modules

### 3.1 Data Ingestion & Video Clip Trimmer
- **Image Import:**
  - Import single or multiple images, or entire image folders (upload or local folder path).
  - Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`.
- **Video Import:**
  - Upload or link single or multiple videos (`.mp4`, `.avi`, `.mov`, `.mkv`).
- **Interactive Video Trimmer & Clip Selector:**
  - **Video Preview & Timeline:** Scrub through long footage (e.g., 1-hour+ videos) before extracting frames.
  - **Quick-Clip from Playhead (Auto-Clip Duration):**
    - User sets a fixed duration $X$ seconds (e.g., `5s`, `10s`, `15s`, or custom).
    - Navigating to any timestamp $T$ (e.g., `01:05`) and clicking **Clip** (or pressing a hotkey) immediately adds a clip segment `[T, T + X]` (clamped to video end).
    - Supports adding multiple quick-clips across different timestamps in one video.
  - **Manual Multi-Range Selection:**
    - Manually mark or fine-tune one or multiple `start → end` time ranges on the timeline.
  - **Live Frame Estimate:** Displays total selected duration and estimated extracted frame count before processing.
- **Frame Extraction Pipeline:**
  - Configurable extraction rate: **Target FPS** or **Every $N$ frames**.
  - Optional near-duplicate frame skipping.
  - Option to **save each clip as a separate sequence** (for independent tracking) or **merge into a single dataset**.
  - Background extraction job with live progress indicator.

---

### 3.2 Smart Annotation Canvas (2D Bounding Boxes)
- **Annotation Type:**
  - Axis-aligned **2D Bounding Boxes** (draw, move, resize, assign/change class).
- **Canvas Navigation & Visual Aids:**
  - Smooth cursor-centered zoom & pan, fit-to-screen, 1:1 pixel view.
  - Full-canvas crosshair guides, label overlays, box opacity & border thickness controls.
  - Per-class color coding and quick class search/filter.
- **Non-Destructive Image Adjustments:**
  - Real-time canvas filters: **Brightness, Contrast, Gamma, Saturation, Invert** (resettable, does not alter source images).
- **Productivity & Shortcuts:**
  - Full **Undo / Redo** history stack.
  - **Customizable Keyboard Shortcuts:**
    - Class hotkeys (`1–9`)
    - Frame navigation (`←` / `→`, jump ±10 frames)
    - Copy annotations from previous frame
    - Delete, duplicate, hide/show, and lock boxes

---

### 3.3 Video Frame-by-Frame & Object Tracking
- **Timeline Scrubber:**
  - Frame-by-frame stepping, play/pause, and visual keyframe markers on the timeline.
- **Track ID Management:**
  - Persistent `track_id` across frames for each tracked object.
- **Tracking & Propagation:**
  - **Keyframe Linear Interpolation:** Annotate start and end frames; automatically interpolate box position and size across intermediate frames.
  - **Copy & Propagate:** Copy all or selected boxes from the previous frame or propagate forward.
  - **Semi-Auto Tracker Assist (Optional):** Lightweight OpenCV tracker to propagate a box across frames with manual adjustment at any frame.

---

### 3.4 Dataset Splitting & Analytics Dashboard
- **Train / Val / Test Splitter:**
  - Configurable split percentages (e.g., `70 / 20 / 10`).
  - **Class-Stratified Splitting:** Preserves class balance across splits.
  - **Video-Aware Splitting:** Keeps frames from the same video/clip in the same split to prevent data leakage.
- **Analytics Dashboard:**
  - Class distribution bar chart (identify class imbalance).
  - Frame coverage summary (annotated vs. unannotated/background frames).
  - Bounding box size & aspect-ratio distribution.
  - Spatial heatmap of object locations across frames.

---

### 3.5 YOLO Import & Export
- **YOLO 2D Detect Export:**
  - Generates standard normalized `.txt` label files (`class_id x_center y_center width height`).
  - Auto-generates `data.yaml` with class names and split paths (`train/`, `val/`, `test/`).
  - Organized `images/` and `labels/` directory export (ZIP download or local folder export).
- **YOLO Import:**
  - Import existing YOLO `.txt` annotations + `classes.txt` or `data.yaml` to review or continue annotating.

---

## 4. Out of Scope / Deferred
- **Multi-user authentication, roles, and task assignment** *(excluded)*
- **YOLO OBB (Oriented/Rotated Bounding Box) export** *(excluded)*
- **Dataset versioning & snapshot diffs** *(on hold for future phases)*
