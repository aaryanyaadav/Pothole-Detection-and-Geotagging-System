

from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import cv2
import numpy as np
from io import BytesIO
import base64
import json
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
import os
import traceback
import hashlib
import secrets
from typing import Optional

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

# For Supabase integration (optional - can work without it initially)
import asyncio
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("⚠️  Supabase library not installed. Install with: pip install supabase")

app = FastAPI(title="Pothole Detection API", version="1.0.0")

# Add CORS middleware to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create captures directory
CAPTURES_DIR = Path(__file__).parent / "captures"
CAPTURES_DIR.mkdir(exist_ok=True)
print(f"✓ Captures directory: {CAPTURES_DIR}")

# Load the YOLOv8 model
MODEL_PATH = Path(__file__).parent / "pothole_yolov8_best.pt"
try:
    model = YOLO(str(MODEL_PATH))
    print(f"✓ Model loaded successfully from {MODEL_PATH}")
except Exception as e:
    print(f"✗ Error loading model: {e}")
    model = None

# Confidence threshold
CONFIDENCE_THRESHOLD = 0.5

# Debounce saves: track last save time to avoid rapid successive saves
LAST_SAVE_TIME = 0
MIN_SAVE_INTERVAL = 0.5

# Initialize Supabase (optional)
supabase_client: Optional[Client] = None
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

if SUPABASE_AVAILABLE and SUPABASE_URL and SUPABASE_SERVICE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print("✓ Supabase connected")
    except Exception as e:
        print(f"⚠️  Failed to connect to Supabase: {e}")
        supabase_client = None
else:
    print("⚠️  Supabase not configured. Authentication will use local storage.")

# In-memory user storage (for demo; use Supabase in production)
users_db = {}  # {email: {name, password_hash, token, created_at}}
MIN_SAVE_INTERVAL = 1.0  # seconds


@app.get("/")
async def root():
    """Root endpoint - API status"""
    return {
        "message": "Pothole Detection API is running",
        "model": "YOLOv8",
        "status": "ready" if model else "model not loaded"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": model is not None
    }


# Auth helper functions
def hash_password(password: str) -> str:
    """Hash a password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def generate_token() -> str:
    """Generate a secure token"""
    return secrets.token_urlsafe(32)


# Auth endpoints
@app.post("/auth/signup")
async def signup(data: dict):
    """
    Register a new user
    Body: {name, email, password}
    """
    try:
        email = data.get("email", "").lower().strip()
        password = data.get("password", "")
        name = data.get("name", "").strip()

        # Validate
        if not email or not password or not name:
            return JSONResponse(
                status_code=400,
                content={"error": "Missing required fields"}
            )

        if len(password) < 6:
            return JSONResponse(
                status_code=400,
                content={"error": "Password must be at least 6 characters"}
            )

        # Check if Supabase is available
        if supabase_client:
            # Use Supabase
            try:
                response = supabase_client.table("users").insert({
                    "email": email,
                    "name": name,
                    "password_hash": hash_password(password)
                }).execute()
                
                if response.data:
                    token = generate_token()
                    # Cache token in memory so get_user_from_token works
                    users_db[email] = {
                        "token": token,
                        "name": name
                    }
                    return {
                        "success": True,
                        "token": token,
                        "name": name,
                        "message": "Signup successful"
                    }

# ... (skipping to login function update inside the same replace if possible, but tool only allows contiguous. I will do separate or larger block)

# Let's target the login function specifically first.

                else:
                    return JSONResponse(
                        status_code=400,
                        content={"error": "Email already registered"}
                    )
            except Exception as e:
                if "duplicate" in str(e).lower():
                    return JSONResponse(
                        status_code=400,
                        content={"error": "Email already registered"}
                    )
                raise
        else:
            # Use in-memory storage
            if email in users_db:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Email already registered"}
                )

            token = generate_token()
            users_db[email] = {
                "name": name,
                "password_hash": hash_password(password),
                "token": token,
                "created_at": datetime.now().isoformat()
            }

            print(f"✓ New user registered: {email}")
            return {
                "success": True,
                "token": token,
                "name": name,
                "message": "Signup successful"
            }

    except Exception as e:
        print(f"Signup error: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": "Signup failed"}
        )


@app.post("/auth/login")
async def login(data: dict):
    """
    Login user
    Body: {email, password}
    """
    try:
        email = data.get("email", "").lower().strip()
        password = data.get("password", "")

        # Validate
        if not email or not password:
            return JSONResponse(
                status_code=400,
                content={"error": "Missing email or password"}
            )

        # Check if Supabase is available
        if supabase_client:
            # Use Supabase
            try:
                response = supabase_client.table("users").select("*").eq("email", email).execute()
                
                if response.data and len(response.data) > 0:
                    user = response.data[0]
                    if user["password_hash"] == hash_password(password):
                        token = generate_token()
                        # Cache token in memory checks
                        users_db[email] = {
                            "token": token,
                            "name": user.get("name", email)
                        }
                        return {
                            "success": True,
                            "token": token,
                            "name": user.get("name", email),
                            "message": "Login successful"
                        }
                
                return JSONResponse(
                    status_code=401,
                    content={"error": "Invalid email or password"}
                )
            except Exception as e:
                print(f"Supabase login error: {e}")
                raise
        else:
            # Use in-memory storage
            if email not in users_db:
                return JSONResponse(
                    status_code=401,
                    content={"error": "Invalid email or password"}
                )

            user = users_db[email]
            if user["password_hash"] != hash_password(password):
                return JSONResponse(
                    status_code=401,
                    content={"error": "Invalid email or password"}
                )

            print(f"✓ User logged in: {email}")
            return {
                "success": True,
                "token": user["token"],
                "name": user.get("name", email),
                "message": "Login successful"
            }

    except Exception as e:
        print(f"Login error: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": "Login failed"}
        )


@app.post("/auth/logout")
async def logout(data: dict):
    """Logout user (token-based)"""
    # In a real app, invalidate the token on the server
    return {"success": True, "message": "Logged out successfully"}


# Helper function to get current user from token
def get_user_from_token(authorization_header: str):
    """Extract user email from Bearer token"""
    try:
        if not authorization_header or not authorization_header.startswith("Bearer "):
            return None
        
        token = authorization_header.split(" ")[1]
        
        # Search for user with this token
        if supabase_client:
            # For Supabase, we'd need to validate JWT token
            # For now, search in our in-memory db
            pass
        
        # In-memory token lookup
        for email, user_data in users_db.items():
            if user_data.get("token") == token:
                return email
        
        return None
    except:
        return None


# Profile endpoints
@app.get("/user/profile")
async def get_user_profile(request: Request):
    """Get current user's profile"""
    try:
        authorization = request.headers.get("Authorization")
        
        if not authorization:
            return JSONResponse(
                status_code=401,
                content={"error": "Missing authorization token"}
            )
        
        email = get_user_from_token(authorization)
        
        if not email:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid or expired token"}
            )
        
        # Get from Supabase or in-memory
        if supabase_client:
            response = supabase_client.table("users").select("*").eq("email", email).execute()
            if response.data and len(response.data) > 0:
                user = response.data[0]
                return {
                    "email": user.get("email"),
                    "name": user.get("name"),
                    "phone": user.get("phone"),
                    "address": user.get("address"),
                    "city": user.get("city"),
                    "state": user.get("state"),
                    "zipcode": user.get("zipcode"),
                    "bio": user.get("bio"),
                    "created_at": user.get("created_at")
                }
        else:
            # In-memory storage
            if email in users_db:
                user = users_db[email]
                return {
                    "email": email,
                    "name": user.get("name"),
                    "phone": user.get("phone"),
                    "address": user.get("address"),
                    "city": user.get("city"),
                    "state": user.get("state"),
                    "zipcode": user.get("zipcode"),
                    "bio": user.get("bio"),
                    "created_at": user.get("created_at")
                }
        
        return JSONResponse(
            status_code=404,
            content={"error": "User not found"}
        )
    
    except Exception as e:
        print(f"Error fetching profile: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to fetch profile"}
        )


@app.put("/user/profile")
async def update_user_profile(data: dict, request: Request):
    """Update user's profile information"""
    try:
        authorization = request.headers.get("Authorization")
        
        if not authorization:
            return JSONResponse(
                status_code=401,
                content={"error": "Missing authorization token"}
            )
        
        email = get_user_from_token(authorization)
        
        if not email:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid or expired token"}
            )
        
        update_data = {
            "name": data.get("name"),
            "phone": data.get("phone"),
            "address": data.get("address"),
            "city": data.get("city"),
            "state": data.get("state"),
            "zipcode": data.get("zipcode"),
            "bio": data.get("bio"),
            "updated_at": datetime.now().isoformat()
        }
        
        # Update in Supabase or in-memory
        if supabase_client:
            response = supabase_client.table("users").update(update_data).eq("email", email).execute()
            return {"success": True, "message": "Profile updated"}
        else:
            # In-memory update
            if email in users_db:
                users_db[email].update(update_data)
                print(f"✓ Profile updated for {email}")
                return {"success": True, "message": "Profile updated"}
        
        return JSONResponse(
            status_code=404,
            content={"error": "User not found"}
        )
    
    except Exception as e:
        print(f"Error updating profile: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to update profile"}
        )


@app.put("/user/password")
async def change_password(data: dict, request: Request):
    """Change user's password"""
    try:
        authorization = request.headers.get("Authorization")
        
        if not authorization:
            return JSONResponse(
                status_code=401,
                content={"error": "Missing authorization token"}
            )
        
        email = get_user_from_token(authorization)
        
        if not email:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid or expired token"}
            )
        
        current_password = data.get("currentPassword", "")
        new_password = data.get("newPassword", "")
        
        # Validate passwords
        if not current_password or not new_password:
            return JSONResponse(
                status_code=400,
                content={"error": "Missing password fields"}
            )
        
        if len(new_password) < 6:
            return JSONResponse(
                status_code=400,
                content={"error": "New password must be at least 6 characters"}
            )
        
        # Verify current password
        if supabase_client:
            response = supabase_client.table("users").select("*").eq("email", email).execute()
            if not response.data or len(response.data) == 0:
                return JSONResponse(status_code=404, content={"error": "User not found"})
            
            user = response.data[0]
            if user["password_hash"] != hash_password(current_password):
                return JSONResponse(
                    status_code=401,
                    content={"error": "Current password is incorrect"}
                )
            
            # Update password
            supabase_client.table("users").update({
                "password_hash": hash_password(new_password),
                "updated_at": datetime.now().isoformat()
            }).eq("email", email).execute()
        else:
            # In-memory
            if email not in users_db:
                return JSONResponse(status_code=404, content={"error": "User not found"})
            
            user = users_db[email]
            if user["password_hash"] != hash_password(current_password):
                return JSONResponse(
                    status_code=401,
                    content={"error": "Current password is incorrect"}
                )
            
            user["password_hash"] = hash_password(new_password)
            user["updated_at"] = datetime.now().isoformat()
            print(f"✓ Password changed for {email}")
        
        return {"success": True, "message": "Password changed successfully"}
    
    except Exception as e:
        print(f"Error changing password: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to change password"}
        )


@app.delete("/user/profile")
async def delete_user_account(request: Request):
    """Delete user's account and data"""
    try:
        authorization = request.headers.get("Authorization")
        
        if not authorization:
            return JSONResponse(
                status_code=401,
                content={"error": "Missing authorization token"}
            )
        
        email = get_user_from_token(authorization)
        
        if not email:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid or expired token"}
            )
        
        # Delete from Supabase or in-memory
        if supabase_client:
            supabase_client.table("users").delete().eq("email", email).execute()
        else:
            # In-memory deletion
            if email in users_db:
                del users_db[email]
                print(f"✓ Account deleted for {email}")
        
        return {"success": True, "message": "Account deleted"}
    
    except Exception as e:
        print(f"Error deleting account: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to delete account"}
        )


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Predict potholes in an image
    Accepts: JPEG, PNG image
    Returns: Detection results with bounding boxes and confidence scores
    """
    if model is None:
        return JSONResponse(
            status_code=500,
            content={"error": "Model not loaded"}
        )
    
    try:
        # Read image file
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid image format"}
            )
        
        # Run inference
        results = model(frame, conf=CONFIDENCE_THRESHOLD)
        
        # Extract detections
        detections = []
        if results and len(results) > 0:
            result = results[0]
            if result.boxes is not None:
                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    conf = float(box.conf[0])
                    cls = int(box.cls[0])
                    
                    detections.append({
                        "class": cls,
                        "class_name": "pothole",
                        "confidence": round(conf, 3),
                        "bbox": {
                            "x1": round(x1, 2),
                            "y1": round(y1, 2),
                            "x2": round(x2, 2),
                            "y2": round(y2, 2)
                        }
                    })
        
        # Draw bounding boxes on frame for visualization
        annotated_frame = frame.copy()
        for det in detections:
            bbox = det["bbox"]
            x1, y1, x2, y2 = int(bbox["x1"]), int(bbox["y1"]), int(bbox["x2"]), int(bbox["y2"])
            conf = det["confidence"]
            
            # Draw rectangle
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            # Draw label
            label = f"Pothole: {conf}"
            cv2.putText(annotated_frame, label, (x1, y1 - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        
        # Encode annotated frame to base64
        _, buffer = cv2.imencode('.jpg', annotated_frame)
        annotated_image_b64 = base64.b64encode(buffer).decode('utf-8')
        
        return {
            "success": True,
            "detections": detections,
            "detection_count": len(detections),
            "annotated_image": f"data:image/jpeg;base64,{annotated_image_b64}",
            "frame_size": {
                "height": frame.shape[0],
                "width": frame.shape[1]
            }
        }
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.websocket("/ws/detect")
async def websocket_detect(websocket: WebSocket):
    """
    WebSocket endpoint for real-time pothole detection
    Accepts base64-encoded image frames
    Returns detection results in real-time
    DO NOT close connection after detections; keep it open indefinitely.
    """
    await websocket.accept()
    
    if model is None:
        try:
            await websocket.send_json({"error": "Model not loaded"})
        except:
            pass
        await websocket.close()
        return
    
    print("WebSocket connection accepted, starting inference loop")
    
    try:
        while True:
            try:
                # Receive base64 image data
                data = await websocket.receive_text()
                message = json.loads(data)
                
                if message.get("type") == "ping":
                    # Respond to heartbeat ping
                    try:
                        await websocket.send_json({"type": "pong"})
                    except Exception as e:
                        print(f"Failed to send pong: {e}")
                    continue
                
                if message.get("type") == "frame":
                    try:
                        # Decode base64 image
                        image_data = message.get("image")
                        if not image_data:
                            await websocket.send_json({"error": "No image data"})
                            continue
                        
                        # Remove data URL prefix if present
                        if "," in image_data:
                            image_data = image_data.split(",")[1]
                        
                        nparr = np.frombuffer(base64.b64decode(image_data), np.uint8)
                        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        
                        if frame is None:
                            await websocket.send_json({"error": "Invalid image"})
                            continue
                        
                        # Run inference
                        results = model(frame, conf=CONFIDENCE_THRESHOLD)
                        
                        # Extract detections
                        detections = []
                        if results and len(results) > 0:
                            result = results[0]
                            if result.boxes is not None:
                                for box in result.boxes:
                                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                                    conf = float(box.conf[0])
                                    
                                    detections.append({
                                        "confidence": round(conf, 3),
                                        "bbox": {
                                            "x1": round(x1, 2),
                                            "y1": round(y1, 2),
                                            "x2": round(x2, 2),
                                            "y2": round(y2, 2),
                                            "width": round(x2 - x1, 2),
                                            "height": round(y2 - y1, 2)
                                        }
                                    })
                        
                        # Save frame if potholes detected (with debouncing)
                        # Save frame if potholes detected (with debouncing)
                        if detections:
                            gps = message.get("gps")
                            email = message.get("email") 
                            # Run save in background thread to avoid blocking the websocket loop
                            loop = asyncio.get_event_loop()
                            saved_path = await loop.run_in_executor(
                                None, 
                                save_annotated_frame, 
                                frame, detections, gps, email
                            )
                            if saved_path:
                                print(f"✓ Saved capture: {saved_path}")
                        
                        # Send response — ALWAYS respond and keep connection open
                        try:
                            await websocket.send_json({
                                "success": True,
                                "detection_count": len(detections),
                                "detections": detections
                            })
                            if detections:
                                print(f"← Sent detection_count={len(detections)} to client")
                        except Exception as send_err:
                            print(f"Failed to send detection response: {send_err}")
                            # Don't break; continue listening
                        
                    except Exception as frame_err:
                        print(f"Error processing frame: {frame_err}")
                        traceback.print_exc()
                        try:
                            await websocket.send_json({"error": f"Frame processing error: {str(frame_err)}"})
                        except:
                            pass
                        # Don't break; continue listening
            
            except WebSocketDisconnect:
                print("Client disconnected (WebSocketDisconnect)")
                break
            except Exception as inner_err:
                print(f"Error in receive loop: {inner_err}")
                traceback.print_exc()
                break
    
    except WebSocketDisconnect:
        print("Client disconnected (outer WebSocketDisconnect)")
    except Exception as e:
        print(f"WebSocket error (outer exception):")
        traceback.print_exc()
    
    print("WebSocket handler exiting")


@app.get("/model/info")
async def model_info():
    """Get model information"""
    if model is None:
        return JSONResponse(
            status_code=500,
            content={"error": "Model not loaded"}
        )
    
    return {
        "model_name": "YOLOv8",
        "model_path": str(MODEL_PATH),
        "input_size": 640,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "classes": ["pothole"]
    }


@app.get("/captures")
async def list_captures():
    """List all captured images"""
    captures = []
    if CAPTURES_DIR.exists():
        for file in sorted(CAPTURES_DIR.glob("*.jpg"), reverse=True):
            entry = {
                "filename": file.name,
                "path": f"/captures/{file.name}",
                "size": file.stat().st_size,
                "created": datetime.fromtimestamp(file.stat().st_mtime).isoformat()
            }
            # Try to include metadata (GPS, detections) if sidecar JSON exists
            meta_file = file.with_suffix(file.suffix + '.json')
            try:
                if meta_file.exists():
                    with open(meta_file, 'r', encoding='utf-8') as mf:
                        meta = json.load(mf)
                        # Only include gps and detections to keep listing small
                        entry['gps'] = meta.get('gps')
                        entry['detections'] = meta.get('detections')
            except Exception as e:
                print(f"⚠️ Failed to read metadata for {file.name}: {e}")

            captures.append(entry)
    
    return {
        "captures_dir": str(CAPTURES_DIR),
        "total": len(captures),
        "captures": captures
    }


@app.get("/captures/{filename}")
async def get_capture(filename: str):
    """Retrieve a specific captured image"""
    filepath = CAPTURES_DIR / filename
    
    if not filepath.exists() or not filepath.suffix.lower() in ['.jpg', '.jpeg', '.png']:
        return JSONResponse(
            status_code=404,
            content={"error": "File not found"}
        )
    
    return FileResponse(filepath, media_type="image/jpeg")


@app.delete("/captures/{filename}")
async def delete_capture(filename: str):
    """Delete a captured image"""
    filepath = CAPTURES_DIR / filename
    
    if not filepath.exists():
        return JSONResponse(
            status_code=404,
            content={"error": "File not found"}
        )
    
    try:
        filepath.unlink()
        # Also delete metadata sidecar if it exists
        meta_file = filepath.with_suffix(filepath.suffix + '.json')
        try:
            if meta_file.exists():
                meta_file.unlink()
        except:
            pass
        return {"success": True, "message": f"Deleted {filename}"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.delete("/potholes/{pothole_id}")
async def delete_pothole_record(pothole_id: str):
    """Delete a pothole record and its image from Supabase"""
    print(f"-> Request to delete pothole ID: {pothole_id}")
    try:
        if not supabase_client:
            return JSONResponse(status_code=501, content={"error": "Database not connected"})

        # 1. Get the image path first so we can delete the file from storage
        response = supabase_client.table("potholes").select("image_path").eq("id", pothole_id).execute()
        if not response.data:
            return JSONResponse(status_code=404, content={"error": "Record not found"})
        
        image_url = response.data[0].get("image_path")
        
        # 2. Delete the record from the database
        supabase_client.table("potholes").delete().eq("id", pothole_id).execute()
        
        # 3. Delete the file from storage (if it's a cloud path)
        if image_url and "supabase.co" in image_url:
            try:
                # Extract filename from URL 
                # URL format: .../storage/v1/object/public/potholes/pothole_...jpg
                filename = image_url.split("/")[-1]
                supabase_client.storage.from_("potholes").remove(filename)
                print(f"✓ Deleted storage file: {filename}")
            except Exception as e:
                print(f"⚠️ Failed to delete storage file: {e}")

        return {"success": True, "message": "Pothole deleted"}
        
    except Exception as e:
        print(f"Error deleting pothole: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/potholes")
async def get_potholes():
    """Get all confirmed pothole locations"""
    try:
        if supabase_client:
            response = supabase_client.table("potholes").select("*").order("created_at", desc=True).execute()
            return {"success": True, "potholes": response.data}
        else:
            # Fallback: Read from local JSON sidecars
            potholes = []
            if CAPTURES_DIR.exists():
                for file in CAPTURES_DIR.glob("*.json"):
                    try:
                        with open(file, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            if data.get("gps"):
                                potholes.append({
                                    "latitude": data["gps"]["lat"],
                                    "longitude": data["gps"]["lon"],
                                    "confidence": pd[0]["confidence"] if (pd := data.get("detections")) else 0,
                                    "image_path": f"/captures/{data.get('filename')}",
                                    "created_at": data.get("timestamp")
                                })
                    except:
                        pass
            return {"success": True, "potholes": potholes}
    except Exception as e:
        print(f"Error fetching potholes: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


def save_annotated_frame(frame, detections, gps=None, user_email=None):
    """Save annotated frame to Supabase Storage and database. 
    Returns the public URL if successful, or None."""
    global LAST_SAVE_TIME
    
    try:
        # Debounce
        current_time = datetime.now().timestamp()
        if current_time - LAST_SAVE_TIME < MIN_SAVE_INTERVAL:
            print(f"⊘ Debounced save")
            return None
        LAST_SAVE_TIME = current_time
        
        annotated = frame.copy()
        for det in detections:
            bbox = det["bbox"]
            x1, y1, x2, y2 = int(bbox["x1"]), int(bbox["y1"]), int(bbox["x2"]), int(bbox["y2"])
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(annotated, f"Pothole: {det['confidence']:.1%}", (x1, y1 - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        
        # Encode image to memory buffer (no local file)
        _, buffer = cv2.imencode('.jpg', annotated)
        image_bytes = buffer.tobytes()
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filename = f"pothole_{timestamp}.jpg"
        
        final_url = None
        
        # 1. Upload to Supabase Storage
        if supabase_client:
            try:
                bucket_name = "potholes" # Ensure this bucket exists in Supabase
                response = supabase_client.storage.from_(bucket_name).upload(
                    file=image_bytes,
                    path=filename,
                    file_options={"content-type": "image/jpeg"}
                )
                
                # Get public URL
                public_url = supabase_client.storage.from_(bucket_name).get_public_url(filename)
                final_url = public_url
                print(f"✓ Uploaded to Supabase Storage: {filename}")
                
            except Exception as up_err:
                print(f"⚠️ Storage upload failed: {up_err}")
                # Fallback: Save locally if cloud storage fails, just so we don't lose data
                local_path = CAPTURES_DIR / filename
                cv2.imwrite(str(local_path), annotated)
                final_url = f"/captures/{filename}"
                print(f"✓ Saved locally (fallback): {filename}")
        else:
            # Fallback if no Supabase client
            local_path = CAPTURES_DIR / filename
            cv2.imwrite(str(local_path), annotated)
            final_url = f"/captures/{filename}"
            print(f"✓ Saved locally (offline): {filename}")

        # 2. Save Metadata to Database/Local
        # Always output a JSON sidecar file when falling back to local captures
        if final_url and final_url.startswith("/captures/"):
            max_conf = max([d["confidence"] for d in detections]) if detections else 0
            meta_data = {
                "timestamp": datetime.now().isoformat(),
                "filename": filename,
                "user_email": user_email,
                "gps": gps,
                "detections": detections,
                "confidence": max_conf
            }
            json_path = CAPTURES_DIR / f"pothole_{timestamp}.json"
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(meta_data, f)

        if supabase_client and gps and gps.get("lat"):
            try:
                max_conf = max([d["confidence"] for d in detections]) if detections else 0
                db_data = {
                    "user_email": user_email,
                    "image_path": final_url, # Now pointing to storage URL or local fallback
                    "latitude": gps["lat"],
                    "longitude": gps["lon"],
                    "accuracy": gps.get("accuracy", 0),
                    "confidence": max_conf,
                    "created_at": datetime.now().isoformat()
                }
                supabase_client.table("potholes").insert(db_data).execute()
                print(f"✓ Database record created: {gps['lat']}, {gps['lon']}")
            except Exception as db_err:
                print(f"⚠️ Database insert failed: {db_err}")

        return final_url

    except Exception as e:
        print(f"✗ Error in save pipeline: {e}")
        traceback.print_exc()
        return None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
