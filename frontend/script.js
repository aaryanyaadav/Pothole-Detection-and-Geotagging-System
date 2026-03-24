let cameraStream = null;
let sideCameraStream = null;
let ws = null; // WebSocket connection for inference
let lastPosition = null;
let geoWatchId = null;
let inferenceInterval = null;
let wsConnecting = false;
let heartbeatInterval = null;
const API_URL = "http://localhost:8001"; // FastAPI server URL
const WS_URL = "ws://localhost:8001/ws/detect"; // WebSocket URL


function toggleCamera() {
    if (cameraStream) {
        stopCamera();
    } else {
        startCamera();
    }
}

function startCamera() {
    // Check if user is logged in
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        alert('Please login first to use the camera feature');
        window.location.href = 'auth.html';
        return;
    }

    const video = document.getElementById("camera");
    const placeholder = document.getElementById("camera-placeholder");
    const statusText = document.getElementById("status-text");
    const statusDot = document.getElementById("status-dot");
    const cameraBtn = document.getElementById("camera-btn");

    navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
    })
        .then(stream => {
            cameraStream = stream;
            video.srcObject = stream;
            video.style.display = "block";
            placeholder.style.display = "none";

            // Update status
            statusDot.style.color = "var(--success)";
            statusText.textContent = "Online";

            // Update Start btn
            cameraBtn.textContent = "Stop Camera";
            cameraBtn.classList.add("btn-active"); // Optional styling class

            // Show Start Capture button
            const startCapBtn = document.getElementById('start-capture-btn');
            if (startCapBtn) startCapBtn.style.display = 'inline-block';

            // Ensure stop capture is hidden
            const stopCapBtn = document.getElementById('stop-capture-btn');
            if (stopCapBtn) stopCapBtn.style.display = 'none';

        })
        .catch(err => {
            alert("Camera access denied!");
            console.error(err);
        });
}

function stopCamera() {
    // Stop detection if running
    stopDetection();

    const video = document.getElementById("camera");
    const placeholder = document.getElementById("camera-placeholder");
    const statusText = document.getElementById("status-text");
    const statusDot = document.getElementById("status-dot");
    const cameraBtn = document.getElementById("camera-btn");

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    video.style.display = "none";
    placeholder.style.display = "flex"; // Restore placeholder

    statusDot.style.color = "var(--text-muted)";
    statusText.textContent = "Offline";

    cameraBtn.textContent = "Start Camera";
    cameraBtn.classList.remove("btn-active");

    // Hide all capture buttons
    document.getElementById('start-capture-btn').style.display = 'none';
    document.getElementById('stop-capture-btn').style.display = 'none';
}

function startDetection() {
    console.log("Starting detection...");

    // Toggle buttons
    document.getElementById('start-capture-btn').style.display = 'none';
    document.getElementById('stop-capture-btn').style.display = 'inline-block';

    // Open side panel and start inference
    const panel = document.getElementById('side-camera-panel');
    if (panel) {
        panel.classList.add('show');
        panel.setAttribute('aria-hidden', 'false');
        startSideCamera();
    }

    // Show overlays
    const overlays = [
        document.getElementById('detection-overlay'),
        document.getElementById('main-detection-overlay')
    ];
    overlays.forEach(el => {
        if (el) el.style.display = 'block';
    });
}

function stopDetection() {
    console.log("Stopping detection...");

    // Toggle buttons back
    const startBtn = document.getElementById('start-capture-btn');
    const stopBtn = document.getElementById('stop-capture-btn');

    if (startBtn && startBtn.style.display === 'none' && cameraStream) {
        startBtn.style.display = 'inline-block';
    }
    if (stopBtn) stopBtn.style.display = 'none';

    // Close side panel and stop inference
    const panel = document.getElementById('side-camera-panel');
    if (panel) {
        panel.classList.remove('show');
        panel.setAttribute('aria-hidden', 'true');
        stopSideCamera();
    }

    // Hide overlays
    const overlays = [
        document.getElementById('detection-overlay'),
        document.getElementById('main-detection-overlay')
    ];
    overlays.forEach(el => {
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active');
            el.textContent = 'Scanning...';
        }
    });
}

function openMap() {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        alert('Please login first to use the map feature');
        window.location.href = 'auth.html';
        return;
    }

    window.location.href = 'map.html';
}

function goToLogin() {
    window.location.href = 'auth.html';
}

// Side camera panel controls
function toggleSideCamera() {
    const panel = document.getElementById('side-camera-panel');
    if (panel.classList.contains('show')) {
        stopDetection();
    } else {
        startDetection();
    }
}

function startSideCamera() {
    const video = document.getElementById('side-camera');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            sideCameraStream = stream;
            video.srcObject = stream;
            video.play().catch(() => { });

            // Initialize WebSocket for inference when side camera starts (and start persistent loop)
            initializeInferenceWebSocket(video);
            startInferenceLoop(video);

            // Start geolocation watch to attach GPS to captures
            if (navigator.geolocation) {
                try {
                    geoWatchId = navigator.geolocation.watchPosition((pos) => {
                        lastPosition = {
                            lat: pos.coords.latitude,
                            lon: pos.coords.longitude,
                            accuracy: pos.coords.accuracy
                        };
                    }, (err) => {
                        console.warn('Geolocation watch error:', err);
                        lastPosition = null;
                    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 });
                } catch (e) {
                    console.warn('Geolocation not available:', e);
                }
            }
        })
        .catch(err => {
            alert('Unable to access camera for capture panel.');
            console.error(err);
        });
}

function initializeInferenceWebSocket(videoElement) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        return; // Already connected
    }

    try {
        ws = new WebSocket(WS_URL);
        wsConnecting = true;

        ws.onopen = () => {
            console.log('✓ Connected to inference server');
            wsConnecting = false;
            // start heartbeat pings every 10s
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                try {
                    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
                } catch (e) { console.warn('Heartbeat ping failed', e); }
            }, 10000);
        };

        ws.onmessage = (event) => {
            try {
                const response = JSON.parse(event.data);
                if (response.success) {
                    displayDetections(response.detections || []);
                }
            } catch (e) {
                console.warn('Failed to parse WS message', e);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            wsConnecting = false;
        };

        ws.onclose = (event) => {
            // console.log('Inference connection closed', event);
            ws = null;
            wsConnecting = false;
            if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }

            // Persistent reconnect loop will handle re-init if needed
        };
    } catch (err) {
        console.error('Failed to initialize WebSocket:', err);
    }
}

function startInferenceLoop(videoElement) {
    // Start a persistent interval that attempts to send frames and reconnect WS when needed
    if (inferenceInterval) return; // already running

    inferenceInterval = setInterval(() => {
        // If websocket is not connected, try to (re)initialize it
        if ((!ws || ws.readyState !== WebSocket.OPEN) && !wsConnecting) {
            initializeInferenceWebSocket(videoElement);
        }

        // If we have a connected WS and an active video, send a frame
        if (ws && ws.readyState === WebSocket.OPEN && videoElement && videoElement.srcObject) {
            sendFrameForInference(videoElement);
        }
    }, 200); // 200ms -> 5 FPS check rate for high responsiveness
}

function sendFrameForInference(videoElement) {
    try {
        if (!videoElement.videoWidth || !videoElement.videoHeight) return;

        const canvas = document.createElement('canvas');
        // Downscale by half to reduce payload size significantly (4x smaller image)
        // This is CRITICAL for smooth performance over network
        canvas.width = videoElement.videoWidth / 2;
        canvas.height = videoElement.videoHeight / 2;
        const ctx = canvas.getContext('2d');
        // Draw scaled image
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // Convert to base64 JPEG
        canvas.toBlob((blob) => {
            if (!blob) return;
            const reader = new FileReader();
            reader.onload = () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'frame',
                        image: reader.result,
                        gps: lastPosition,
                        email: localStorage.getItem('userEmail')
                    }));
                }
            };
            reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.6); // 0.6 quality is sufficient for object detection
    } catch (err) {
        console.error('Error sending frame:', err);
    }
}

function displayDetections(detections) {
    const detectionInfo = document.getElementById('detection-info');
    const overlay = document.getElementById('detection-overlay');
    const mainOverlay = document.getElementById('main-detection-overlay');

    if (detections.length === 0) {
        if (detectionInfo) {
            detectionInfo.textContent = 'Scanning...';
            detectionInfo.style.color = '#ccc';
        }

        const resetOverlay = (el) => {
            if (el) {
                el.textContent = 'Scanning...';
                el.classList.remove('active');
            }
        };
        resetOverlay(overlay);
        resetOverlay(mainOverlay);
        return;
    }

    const avgConfidence = (detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length * 100).toFixed(0);

    // Update Header Info
    if (detectionInfo) {
        detectionInfo.textContent = `${detections.length} pothole(s) detected (${avgConfidence}%)`;
        detectionInfo.style.color = '#ff6b35';
    }

    // Update Overlays
    const updateOverlay = (el) => {
        if (el) {
            el.textContent = `⚠️ Pothole Detected! (${avgConfidence}%)`;
            el.classList.add('active');
        }
    };
    updateOverlay(overlay);
    updateOverlay(mainOverlay);
}

function stopSideCamera() {
    const video = document.getElementById('side-camera');
    if (sideCameraStream) {
        sideCameraStream.getTracks().forEach(t => t.stop());
        sideCameraStream = null;
    }
    video.pause();
    video.srcObject = null;

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        ws = null;
    }

    if (geoWatchId !== null && navigator.geolocation) {
        try {
            navigator.geolocation.clearWatch(geoWatchId);
        } catch (e) { }
        geoWatchId = null;
        lastPosition = null;
    }

    if (inferenceInterval) {
        clearInterval(inferenceInterval);
        inferenceInterval = null;
    }
}
