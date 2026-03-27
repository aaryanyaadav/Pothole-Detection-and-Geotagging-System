#  Real-Time Pothole Detection And Geotagging System

A comprehensive, real-time machine learning web application that detects and logs potholes. Built with Python, FastAPI, YOLOv8, and Supabase.

##  Project Overview

This project aims to automatically detect potholes using a compute
r vision model running on live feeds or static images. Once detected, the system logs the pothole's GPS coordinates, user details, and an annotated image of the pothole into a database for further review and mapping.

### Key Features
- **Real-Time Detection:** Uses WebSockets for low-latency live video feed processing.
- **Object Detection:** Powered by the state-of-the-art YOLOv8 model (`pothole_yolov8_best.pt`).
- **Cloud Database & Storage:** Integration with Supabase to store User Data, Pothole records, and captured images.
- **Offline / Local Fallback:** Uses an in-memory database and local object storage if Supabase credentials are not provided.
- **Interactive Mapping & Visualizations:** Frontend dashboard with heatmaps and statistics of detected potholes, alongside interactive Leaflet maps.

---

##  System Architecture

The application is structured in three main components:

### 1. Backend (FastAPI + YOLOv8)
- **Web Framework:** Runs a fast, asynchronous FastAPI server (`app.py`).
- **Machine Learning Integration:** Uses the `ultralytics` YOLOv8 model to perform inference. Frames are processed using `OpenCV (cv2)` and `numpy`.
- **Endpoints:**
  - `HTTP POST /predict`: Processes a single image upload and returns bounding box info.
  - `WebSocket /ws/detect`: Receives live base64 image frames, performs inference, debounces, and streams results back to the client.
  - REST endpoints for User Authentication, Profiles, and Capture management.

### 2. Frontend (Vanilla Web Technologies)
- **Structure:** Resides in the `frontend/` directory. Made entirely of HTML, CSS, and Vanilla JavaScript.
- **Views:**
  - `auth.html` & `auth.js`: User Registration & Login (Interacts with Supabase).
  - `dashboard.html` & `dashboard.js`: Stats and settings.
  - `map.html` & `map.js`: Powered by **Leaflet.js**, this renders an interactive web map to visualize logged potholes. It allows users to toggle between different tile layers (Google Satellite, Google Streets, OpenStreetMap), utilizes Geolocation to auto-center the view natively, and plots interactive markers with popups that show pothole detection metrics and thumbnail images.
  - `potholes.html`: Interface for live video streaming and inference WebSocket connection.

### 3. Database & Storage Layer (Supabase / Local)
- **Supabase PostgreSQL:** Stores user credentials, profiles, and pothole metadata (Latitude, Longitude, Confidence score).
- **Supabase Storage:** Saves annotated images locally to a bucket named `potholes`.
- **Local Fallback Mode:** If `SUPABASE_URL` is omitted, images are dumped into the `captures/` directory and metadata is stored in local `.json` sidecar files or in-memory dicts.

---

##  Workflow

1. **Client App Initialization:** The user navigates to the frontend application and logs in. A JWT or custom token is assigned for session tracking.
2. **Camera Streaming:** The user grants permission for their camera/webcam. The frontend captures frames at a set interval.
3. **Data Transmission:** The frontend establishes a persistent WebSocket connection to the `/ws/detect` endpoint and pushes base64 encoded frames alongside GPS locations.
4. **Machine Learning Inference:** The FastAPI backend decodes the frame and passes it to the YOLOv8 model. The model identifies the bounding box coordinates (`x1, y1, x2, y2`) and confidence scores for any potholes present.
5. **Debouncing & Cloud Storage:** If a high-confidence pothole is found:
   - The backend checks a timestamp debounce (e.g., `MIN_SAVE_INTERVAL`) to prevent saving identical successive frames.
   - It draws bounding boxes on the frame using OpenCV.
   - The annotated image is uploaded to Supabase Storage.
   - The pothole metadata (GPS, User ID, Image URL) is logged into the Supabase database.
6. **Frontend Update:** The detection coordinates are relayed back to the browser via the open WebSocket connection. The frontend overlays a dynamic tracking box on the user's video feed.

---

##  Prerequisites

- Python 3.8+
- Node.js & npm (optional, mainly if extending frontend tools)
- A Supabase Project (optional but highly recommended)

---

##  Installation & Setup

1. **Clone or Extract the Repository:**
   ```bash
   cd "pothole model"
   ```

2. **Install Python Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
   *(Ensure you have `fastapi`, `uvicorn`, `ultralytics`, `opencv-python`, and `supabase` installed)*.

3. **Configure Environment Variables:**
   - Create a `.env` file in the root directory:
     ```env
     SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
     SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
     ```
   - *If using Supabase, follow the `SUPABASE_SETUP.md` instructions to create the necessary SQL tables (`users` and `potholes`) and storage buckets.*

4. **Launch the Backend Server:**
   ```bash
   python app.py
   # Or using uvicorn directly
   uvicorn app:app --host 0.0.0.0 --port 8001
   ```
   *(The YOLOv8 model `pothole_yolov8_best.pt` will be loaded into memory).*

5. **Serve the Frontend:**
   - Open a new terminal instance in the root folder and run:
   ```bash
   python -m http.server 8000
   ```
   - Navigate to `http://localhost:8000/frontend/index.html` in your browser.

---

##  Project Structure Quick Reference

- `/app.py`: FastAPI server logic, WebSocket endpoints, Supabase connections, database querying, and YOLO inference scripts.
- `/frontend/`: User Interfaces, UI logic, and style sheets.
- `/captures/`: Local fallback directory for detected pothole snapshots.
- `pothole_yolov8_best.pt`: The pre-trained computer vision model weights.


## Author
Aryan Kumar Yadav