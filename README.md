#  Real-Time Pothole Detection & Geotagging System

**An end-to-end computer vision web application that detects potholes in real-time, geotags them, and visualizes them on an interactive map.**

##  Overview

This project automates pothole detection using a state-of-the-art **YOLOv8** object detection model running on **live webcam feeds** or **static image uploads**. Every detection is enriched with GPS coordinates, logged to a cloud database, and visualized on an interactive map — creating a real-world road monitoring pipeline.

> **Built for:** Smart city infrastructure monitoring, municipal reporting automation, and road safety analytics.

---

## Key Features

| Feature | Description |
|---|---|
|  **Real-Time Detection** | WebSocket-powered live video processing with minimal latency |
|  **YOLOv8 Inference** | Custom-trained `pothole_yolov8_best.pt` model for high-accuracy detection |
|  **GPS Geotagging** | Automatically captures and stores GPS coordinates with each detection |
|  **Cloud Storage** | Supabase PostgreSQL + Storage for scalable, persistent logging |
|  **Interactive Map** | Leaflet.js dashboard with heatmaps, markers, and satellite tile layers |
|  **Offline Fallback** | Runs fully without Supabase using local in-memory DB and file storage |
|  **Analytics Dashboard** | Detection stats, confidence trends, and historical pothole data |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐    │
│   │  auth.html   │   │ potholes.html│   │    map.html      │    │
│   │  (Login/Reg) │   │ (Live Feed)  │   │ (Leaflet Maps)   │    │
│   └──────────────┘   └──────┬───────┘   └──────────────────┘    │
│                             │ WebSocket / REST                  │
└─────────────────────────────┼───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI)                           │
│                                                                 │
│  POST /predict        WebSocket /ws/detect     REST /users      │
│       │                      │                      │           │
│       └──────────────┬───────┘                      │           │
│                      ▼                              │           │
│            ┌──────────────────┐                     │           │
│            │  YOLOv8 Model    │  ◄── OpenCV (cv2)   │           │
│            │ (Inference Engine│       NumPy         │           │
│            └────────┬─────────┘                     │           │
│                     │ Annotated Frame + Metadata    │           │
└─────────────────────┼───────────────────────────────┼───────────┘
                      ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  STORAGE LAYER                                  │
│                                                                 │
│   ┌──────────────────────┐      ┌──────────────────────────┐    │
│   │  Supabase PostgreSQL │      │   Supabase Storage       │    │
│   │  (users, potholes)   │      │   (annotated images)     │    │
│   └──────────────────────┘      └──────────────────────────┘    │
│              OR (Offline Fallback)                              │
│   ┌──────────────────────┐      ┌──────────────────────────┐    │
│   │   In-Memory Dict     │      │   /captures/ Directory   │    │
│   └──────────────────────┘      └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detection Pipeline

```
Camera Frame
     │
     ▼
Base64 Encode ──► WebSocket /ws/detect
                         │
                         ▼
               Decode + cv2 Processing
                         │
                         ▼
               YOLOv8 Inference
               (BBox: x1,y1,x2,y2 + Confidence)
                         │
               ┌─────────┴─────────┐
               │Confidence > Thresh│
               │ + Debounce Check  │
               └─────────┬─────────┘
                         │
                         ▼
               Annotate Frame (OpenCV)
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       Upload Image          Log Metadata
       (Supabase Storage)    (GPS, UserID,
                              Confidence Score)
                         │
                         ▼
             WebSocket Response → Frontend
             (Overlay tracking box on feed)
```

---

## Tech Stack

**Backend**
- `FastAPI` — Async web framework with WebSocket support
- `Ultralytics YOLOv8` — Object detection model
- `OpenCV (cv2)` — Frame processing and bounding box annotation
- `NumPy` — Array processing for image data
- `Uvicorn` — ASGI server

**Frontend**
- Vanilla `HTML / CSS / JavaScript`
- `Leaflet.js` — Interactive maps (OpenStreetMap, Google Satellite, Google Streets)
- Native Geolocation API for auto-centering

**Database & Storage**
- `Supabase` (PostgreSQL + Object Storage)
- Local JSON sidecar files + `captures/` directory (offline fallback)

---

## Project Structure

```
pothole-detection/
│
├── app.py                      # FastAPI server, WebSocket endpoints, YOLO inference
├── pothole_yolov8_best.pt      # Pre-trained YOLOv8 model weights
├── requirements.txt
├── .env                        # Supabase credentials (not committed)
├── SUPABASE_SETUP.md           # SQL table setup instructions
│
├── frontend/
│   ├── index.html              # Landing page
│   ├── auth.html / auth.js     # User registration & login
│   ├── dashboard.html / .js    # Stats and settings
│   ├── potholes.html           # Live video stream + WebSocket detection UI
│   └── map.html / map.js       # Interactive Leaflet map with pothole markers
│
└── captures/                   # Local fallback: annotated pothole snapshots
```

---

## Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/aaryanyaadav/Pothole-Detection-and-Geotagging-System
cd Pothole-Detection-and-Geotagging-System
```

### 2. Install Python Dependencies
```bash
pip install -r requirements.txt
```

> Requires: `fastapi`, `uvicorn`, `ultralytics`, `opencv-python`, `supabase`

### 3. Configure Environment Variables
Create a `.env` file in the project root:
```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
```
> Omit these variables to run in **offline/local fallback mode**.

### 4. Set Up Supabase (if using cloud)
Follow `SUPABASE_SETUP.md` to create the required SQL tables:
- `users` — stores user profiles and credentials
- `potholes` — stores detection metadata (lat, lng, confidence, image URL)
- `potholes` storage bucket — for annotated image uploads
-  check the supabase stetup.md file for more details

### 5. Start the Backend Server
```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8001 --reload
```
> The YOLOv8 model (`pothole_yolov8_best.pt`) loads into memory on startup.

### 6. Serve the Frontend
```bash
python -m http.server 8000
```
Navigate to: **`http://localhost:8000/frontend/index.html`**

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/predict` | Upload a single image; returns bounding box + confidence |
| `WebSocket` | `/ws/detect` | Stream base64 frames; receive real-time detection results |
| `GET` | `/potholes` | Fetch all logged pothole records |
| `POST` | `/register` | Register a new user |
| `POST` | `/login` | Authenticate and receive session token |

---


##  Author

**Aryan Kumar Yadav**

