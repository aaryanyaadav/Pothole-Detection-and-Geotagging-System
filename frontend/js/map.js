const API_URL = "https://pothole-detection-and-geotagging-system.onrender.com";
let map = null;

function initMap() {
    console.log("Initializing Map...");

    // Default center (Center of India)
    const defaultCenter = [20.5937, 78.9629];

    // Create map instance
    map = L.map('map', {
        zoomControl: false, // We'll add it manually to control position
        attributionControl: true
    }).setView(defaultCenter, 5);

    // --- 1. Define Layers ---

    // Google Satellite Hybrid
    const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: 'Google Maps'
    });

    // Google Streets (Normal)
    const googleStreets = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: 'Google Maps'
    });

    // OpenStreetMap (Alternative)
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    });

    // Add Default Layer
    googleHybrid.addTo(map);

    // --- 2. Add Controls ---

    // Layer Control (Top Right)
    const baseMaps = {
        "Google Satellite": googleHybrid,
        "Google Streets": googleStreets,
        "OpenStreetMap": osm
    };
    L.control.layers(baseMaps).addTo(map);

    // Zoom Control (Bottom Right)
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Custom "Locate Me" Button (Top Left)
    const locateControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            const btn = L.DomUtil.create('button', 'locate-btn');
            btn.innerHTML = '📍';
            btn.title = "Go to my location";
            btn.style.backgroundColor = 'white';
            btn.style.border = '2px solid rgba(0,0,0,0.2)';
            btn.style.borderRadius = '4px';
            btn.style.width = '34px';
            btn.style.height = '34px';
            btn.style.cursor = 'pointer';
            btn.style.fontSize = '20px';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';

            btn.onclick = function (e) {
                e.preventDefault();
                goToUserLocation();
            };
            return btn;
        }
    });
    map.addControl(new locateControl());

    // --- 3. Robust Rendering Fixes ---
    const fixRender = () => { map.invalidateSize(); };
    setTimeout(fixRender, 100);
    setTimeout(fixRender, 500);
    setTimeout(fixRender, 1000);

    const mapDiv = document.getElementById('map');
    new ResizeObserver(fixRender).observe(mapDiv);

    // --- 4. Initial Location Check ---
    goToUserLocation();

    // --- 5. Load Potholes ---
    loadPotholes();
}

function goToUserLocation() {
    if (!navigator.geolocation) return;

    // Show loading state cursor
    document.body.style.cursor = 'wait';

    navigator.geolocation.getCurrentPosition(position => {
        document.body.style.cursor = 'default';
        const { latitude, longitude } = position.coords;

        // Remove existing location marker if any
        map.eachLayer((layer) => {
            if (layer._isUserLocation) {
                map.removeLayer(layer);
            }
        });

        // Add user marker
        const marker = L.circleMarker([latitude, longitude], {
            radius: 8,
            fillColor: "#3388ff",
            color: "#fff",
            weight: 3,
            opacity: 1,
            fillOpacity: 1
        }).addTo(map).bindPopup("You are here");
        marker._isUserLocation = true; // Tag it

        // Fly to location
        map.flyTo([latitude, longitude], 16, {
            animate: true,
            duration: 1.5
        });

    }, (err) => {
        document.body.style.cursor = 'default';
        console.warn("Location access denied or failed", err);
    }, { enableHighAccuracy: true });
}

// Load Potholes from API
async function loadPotholes() {
    try {
        const response = await fetch(`${API_URL}/potholes`);
        const data = await response.json();

        if (data.success && data.potholes) {
            updateMapMarkers(data.potholes);
        }
    } catch (error) {
        console.error("Error loading potholes:", error);
    }
}

// Image Modal (created dynamically)
const modalHtml = `
<div id="image-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; justify-content:center; align-items:center;">
    <div style="position:relative; max-width:90%; max-height:90%;">
        <span id="close-modal" style="position:absolute; top:-40px; right:0; color:white; font-size:30px; cursor:pointer;">&times;</span>
        <img id="modal-img" src="" style="max-width:100%; max-height:90vh; border-radius:4px; box-shadow:0 0 20px rgba(0,0,0,0.5);">
    </div>
</div>`;
document.body.insertAdjacentHTML('beforeend', modalHtml);

const modal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-img');
const closeBtn = document.getElementById('close-modal');

closeBtn.onclick = () => { modal.style.display = 'none'; };
modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

// Update Map Markers
function updateMapMarkers(potholes) {
    const userEmail = localStorage.getItem('userEmail');
    potholes.forEach(p => {
        if (!p.latitude || !p.longitude) return;
        
        // Only show potholes belonging to the logged-in user
        if (userEmail && p.user_email && p.user_email !== userEmail) return;

        const date = new Date(p.created_at).toLocaleString();
        const conf = (p.confidence * 100).toFixed(1);

        // Handle cloud vs local URLs
        let imgUrl = p.image_path;
        if (imgUrl && !imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
            imgUrl = `${API_URL}${imgUrl}`;
        }

        const marker = L.marker([p.latitude, p.longitude]).addTo(map);

        // Unique ID for button
        const btnId = `view-btn-${Math.random().toString(36).substr(2, 9)}`;

        const popupContent = `
            <div style="text-align:center; min-width: 160px; font-family:sans-serif;">
                <h4 style="margin:0 0 8px 0; color:#e74c3c;">Pothole Detected</h4>
                <div style="font-size:12px; color:#555; margin-bottom:10px;">
                    Confidence: <strong>${conf}%</strong><br>
                    <span style="color:#888; font-size:11px;">${date}</span>
                </div>
                <button id="${btnId}" style="
                    background:#3498db; color:white; border:none; padding:6px 12px;
                    border-radius:4px; cursor:pointer; font-size:12px;
                ">View Image</button>
            </div>
        `;

        marker.bindPopup(popupContent);

        // Attach event listener after popup opens
        marker.on('popupopen', () => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.onclick = () => {
                    modalImg.src = imgUrl;
                    modal.style.display = 'flex';
                };
            }
        });
    });
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
} else {
    initMap();
}
