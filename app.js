// ==================== Firebase Config ====================
const firebaseConfig = {
    apiKey: "AIzaSyBKBFZ26mQOYBs_P8V-yfWZN0yZW0aE1mQ",
    authDomain: "college-bus-tracking-sys-a565c.firebaseapp.com",
    projectId: "college-bus-tracking-sys-a565c",
    storageBucket: "college-bus-tracking-sys-a565c.appspot.com",
    messagingSenderId: "67601661951",
    appId: "1:67601661951:web:4b90d4a700c49038d931ca",
    measurementId: "G-27CHYQZFEZ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==================== Global Variables ====================
let map;
let markers = {};
let userMarker = null;
let selectedBusId = null;
let gpsWatchId = null;
let accuracyCircle = null;
let isLoggedIn = false;
let currentUser = null;
let userRole = null;
let trackedBusMarker = null;
let busData = {};

// ==================== Initialize App ====================
function init() {
    // Initialize Map
    map = L.map("map").setView([12.9716, 77.5946], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    checkGPSAvailability();
    setupEventListeners();
    loadBusData();
    setupEmergencyAlertsListener();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                const { latitude, longitude } = pos.coords;
                map.setView([latitude, longitude], 14);
            },
            err => {
                console.warn("Could not get user location:", err.message);
            }
        );
    }
}

// ==================== Event Listeners ====================
function setupEventListeners() {
    const driverLoginBtn = document.getElementById('driver-login-btn');
    const studentLoginBtn = document.getElementById('student-login-btn');
    const closeModalButtons = document.querySelectorAll('.close-modal');
    const cancelDriverLogin = document.getElementById('cancel-driver-login');
    const cancelStudentLogin = document.getElementById('cancel-student-login');
    const confirmDriverLogin = document.getElementById('confirm-driver-login');
    const confirmStudentLogin = document.getElementById('confirm-student-login');
    const logoutBtn = document.getElementById('logout-btn');
    const enableLocation = document.getElementById('enable-location');
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const locateMe = document.getElementById('locate-me');
    const startTracking = document.getElementById('start-tracking');
    const stopTracking = document.getElementById('stop-tracking');
    const trackBus = document.getElementById('track-bus');
    const busSearch = document.getElementById('bus-search');
    const searchButton = document.querySelector('.search-box button');
    const busOptions = document.querySelectorAll('.bus-option');
    const emergencyAlertBtn = document.getElementById('emergency-alert');

    if (driverLoginBtn) driverLoginBtn.addEventListener('click', () => {
        document.getElementById('driver-login-modal').style.display = 'flex';
    });

    if (studentLoginBtn) studentLoginBtn.addEventListener('click', () => {
        document.getElementById('student-login-modal').style.display = 'flex';
    });

    if (closeModalButtons.length > 0) {
        closeModalButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
            });
        });
    }

    if (cancelDriverLogin) cancelDriverLogin.addEventListener('click', () => {
        document.getElementById('driver-login-modal').style.display = 'none';
    });
    
    if (cancelStudentLogin) cancelStudentLogin.addEventListener('click', () => {
        document.getElementById('student-login-modal').style.display = 'none';
    });

    if (confirmDriverLogin) confirmDriverLogin.addEventListener('click', handleDriverLogin);
    if (confirmStudentLogin) confirmStudentLogin.addEventListener('click', handleStudentLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (enableLocation) enableLocation.addEventListener('click', enableLocationHandler);
    if (zoomIn) zoomIn.addEventListener('click', () => map.zoomIn());
    if (zoomOut) zoomOut.addEventListener('click', () => map.zoomOut());
    if (locateMe) locateMe.addEventListener('click', centerMapOnUser);
    if (startTracking) startTracking.addEventListener('click', startDriverTracking);
    if (stopTracking) stopTracking.addEventListener('click', stopDriverTracking);
    if (trackBus) trackBus.addEventListener('click', trackBusHandler);
    if (busSearch) busSearch.addEventListener('input', filterBusList);
    if (searchButton) searchButton.addEventListener('click', filterBusList);
    if (emergencyAlertBtn) emergencyAlertBtn.addEventListener('click', () => {
        sendEmergencyAlert(selectedBusId, 'General Emergency');
    });

    if (busOptions.length > 0) {
        busOptions.forEach(option => {
            option.addEventListener('click', function () {
                document.querySelectorAll('.bus-option').forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
            });
        });
    }
}

// ==================== Firebase Bus Functions ====================
async function sendLocationToServer(busId, latitude, longitude) {
    try {
        const busRef = db.collection("buses").doc(busId);
        await busRef.set({
            lat: latitude,
            lng: longitude,
            lastUpdate: new Date().toISOString(),
            status: "active",
            // Preserve existing data
            ...busData[busId]
        }, { merge: true });
        
        // Also save to history
        const historyRef = db.collection("busHistory").doc();
        await historyRef.set({
            busId: busId,
            lat: latitude,
            lng: longitude,
            timestamp: new Date().toISOString()
        });
        
        console.log("Location updated in Firebase for bus", busId);
    } catch (error) {
        console.error("Error sending location to Firebase:", error);
        throw error;
    }
}

function loadBusData() {
    db.collection("buses").onSnapshot((snapshot) => {
        busData = {};
        snapshot.forEach(doc => {
            // Include document ID in the data
            busData[doc.id] = { id: doc.id, ...doc.data() };
        });
        updateBusList(busData);

        for (const busId in busData) {
            const bus = busData[busId];
            if (bus.lat && bus.lng) {
                updateBusMarker(busId, bus.lat, bus.lng, bus.status || "inactive");
            }
        }

        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
        updateTrackButtonState();
    }, error => {
        console.error("Error loading bus data from Firebase:", error);
        showToast("Using demo data - Firebase not reachable", 2000);
        
        // Demo data for testing
        busData = {
            "bus-a1": { lat: 12.9716, lng: 77.5946, status: "active", name: "Bus A1" },
            "bus-a2": { lat: 12.9686, lng: 77.5876, status: "delayed", name: "Bus A2" },
            "bus-b1": { lat: 12.9746, lng: 77.6016, status: "active", name: "Bus B1" },
            "bus-b2": { lat: 12.9698, lng: 77.6021, status: "active", name: "Bus B2" }
        };
        updateBusList(busData);
        
        for (const busId in busData) {
            const bus = busData[busId];
            updateBusMarker(busId, bus.lat, bus.lng, bus.status || "inactive");
        }
        updateTrackButtonState();
    });
}

// ==================== Login/Logout ====================
async function handleDriverLogin() {
    const driverId = document.getElementById('driver-id').value.trim();
    const password = document.getElementById('password').value;
    const selectedBusOption = document.querySelector('#driver-login-modal .bus-option.selected');

    if (!driverId || !password || !selectedBusOption) {
        showToast("Please fill all fields and select a bus");
        return;
    }

    const busId = selectedBusOption.getAttribute('data-bus-id');

    try {
        const driverRef = db.collection("drivers").doc(driverId);
        const driverSnap = await driverRef.get();
        
        if (!driverSnap.exists) {
            showToast("Driver ID not found");
            return;
        }

        const driverData = driverSnap.data();
        
        if (driverData.password !== password) {
            showToast("Incorrect password");
            return;
        }

        if (driverData.busId !== busId) {
            showToast("Driver not assigned to this bus");
            return;
        }

        if (driverData.active === false) {
            showToast("Your account is deactivated. Please contact administrator.");
            return;
        }

        isLoggedIn = true;
        currentUser = driverId;
        userRole = 'driver';
        selectedBusId = busId;

        await db.collection("buses").doc(busId).set({ 
            driver: driverId, 
            driverName: driverData.name,
            status: "active",
            lastUpdate: new Date().toISOString()
        }, { merge: true });

        updateUIAfterLogin(driverData.name, 'driver');
        showToast(`Welcome, ${driverData.name}`);

    } catch (error) {
        console.error("Login error:", error);
        showToast("Error logging in. Please try again.");
    }
}

async function handleStudentLogin() {
    const studentId = document.getElementById('student-id').value.trim();
    const password = document.getElementById('student-password').value;
    const selectedBusOption = document.querySelector('#student-login-modal .bus-option.selected');

    if (!studentId || !password || !selectedBusOption) {
        showToast("Please fill all fields and select a bus");
        return;
    }

    const busId = selectedBusOption.getAttribute('data-bus-id');

    try {
        const studentRef = db.collection("students").doc(studentId);
        const studentSnap = await studentRef.get();
        if (!studentSnap.exists) {
            showToast("Student ID not found");
            return;
        }

        const studentData = studentSnap.data();
        if (studentData.password !== password) {
            showToast("Incorrect password");
            return;
        }

        isLoggedIn = true;
        currentUser = studentId;
        userRole = 'student';
        selectedBusId = busId;

        if (busData[selectedBusId]) {
            showToast(`Welcome, ${studentData.name}. Bus found.`);
        } else {
            showToast(`Welcome, ${studentData.name}. Loading bus data...`);
        }

        updateUIAfterLogin(studentData.name, 'student');
        updateTrackButtonState();

    } catch (error) {
        console.error("Login error:", error);
        showToast("Error logging in. Please try again.");
    }
}

function updateUIAfterLogin(username, role) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-buttons').style.display = 'none';
    document.getElementById('username').textContent = username;
    
    if (role === 'driver') {
        document.getElementById('driver-controls').style.display = 'flex';
        document.getElementById('student-controls').style.display = 'none';
    } else {
        document.getElementById('driver-controls').style.display = 'none';
        document.getElementById('student-controls').style.display = 'flex';
    }
    
    document.getElementById(`${role}-login-modal`).style.display = 'none';
    document.getElementById(`${role}-id`).value = '';
    document.getElementById(`${role}-password`).value = '';
    document.querySelectorAll('.bus-option').forEach(opt => opt.classList.remove('selected'));
}

function handleLogout() {
    if (userRole === 'driver') {
        db.collection("buses").doc(selectedBusId).set({ 
            driver: null, 
            driverName: null,
            status: "inactive" 
        }, { merge: true });
        
        if (gpsWatchId !== null) {
            navigator.geolocation.clearWatch(gpsWatchId);
            gpsWatchId = null;
        }
    }
    
    isLoggedIn = false;
    currentUser = null;
    userRole = null;
    selectedBusId = null;
    
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-buttons').style.display = 'flex';
    document.getElementById('driver-controls').style.display = 'none';
    document.getElementById('student-controls').style.display = 'none';
    
    if (trackedBusMarker) {
        map.removeLayer(trackedBusMarker);
        trackedBusMarker = null;
    }
    
    updateTrackButtonState();
    
    showToast("Logged out successfully");
}

// ==================== GPS & Location Functions ====================
function checkGPSAvailability() {
    if (!navigator.geolocation) {
        document.getElementById('gps-text').textContent = "GPS Not Supported";
        document.getElementById('gps-indicator').className = "gps-indicator gps-inactive";
        document.getElementById('location-permission').style.display = 'block';
        return false;
    }
    return true;
}

function enableLocationHandler() {
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser");
        return;
    }
    
    document.getElementById('location-permission').style.display = 'none';
    centerMapOnUser();
}

function centerMapOnUser() {
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser");
        return;
    }
    
    updateGPSStatus("searching");
    
    navigator.geolocation.getCurrentPosition(
        position => {
            const { latitude, longitude, accuracy } = position.coords;
            
            if (userMarker) {
                map.removeLayer(userMarker);
                if (accuracyCircle) map.removeLayer(accuracyCircle);
            }
            
            userMarker = L.marker([latitude, longitude], {
                icon: L.divIcon({
                    className: 'user-marker',
                    html: '<i class="fas fa-user"></i>',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(map).bindPopup("Your Location").openPopup();
            
            accuracyCircle = L.circle([latitude, longitude], {
                radius: accuracy,
                color: '#3498db',
                fillColor: '#3498db',
                fillOpacity: 0.2,
                weight: 1
            }).addTo(map);
            
            map.setView([latitude, longitude], 16);
            
            updateGPSStatus("active");
        },
        error => {
            console.error("Error getting location:", error);
            updateGPSStatus("inactive");
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    showToast("Location access denied");
                    document.getElementById('location-permission').style.display = 'block';
                    break;
                case error.POSITION_UNAVAILABLE:
                    showToast("Location information unavailable");
                    break;
                case error.TIMEOUT:
                    showToast("Location request timed out");
                    break;
                default:
                    showToast("Unknown error getting location");
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function updateGPSStatus(status) {
    const indicator = document.getElementById('gps-indicator');
    const text = document.getElementById('gps-text');
    
    indicator.className = "gps-indicator";
    
    switch(status) {
        case "active":
            indicator.classList.add("gps-active");
            text.textContent = "GPS Active";
            break;
        case "inactive":
            indicator.classList.add("gps-inactive");
            text.textContent = "GPS Inactive";
            break;
        case "searching":
            indicator.classList.add("gps-searching");
            text.textContent = "Searching...";
            break;
    }
}

// ==================== Driver Functions ====================
function startDriverTracking() {
    if (!selectedBusId) {
        showToast("No bus selected");
        return;
    }
    
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser");
        return;
    }
    
    updateGPSStatus("searching");
    
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
    }
    
    gpsWatchId = navigator.geolocation.watchPosition(
        async (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
            try {
                await sendLocationToServer(selectedBusId, latitude, longitude);
                updateGPSStatus("active");
                
                if (accuracyCircle) {
                    map.removeLayer(accuracyCircle);
                }
                
                accuracyCircle = L.circle([latitude, longitude], {
                    radius: accuracy,
                    color: '#3498db',
                    fillColor: '#3498db',
                    fillOpacity: 0.2,
                    weight: 1
                }).addTo(map);
                
            } catch (error) {
                console.error("Error updating location:", error);
                showToast("Error updating location");
            }
        },
        (error) => {
            console.error("Error watching position:", error);
            updateGPSStatus("inactive");
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    showToast("Location access denied. Please enable location permissions.");
                    break;
                case error.POSITION_UNAVAILABLE:
                    showToast("Location information unavailable");
                    break;
                case error.TIMEOUT:
                    showToast("Location request timed out");
                    break;
                default:
                    showToast("Error getting location");
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
    
    showToast("Started tracking your bus");
}

function stopDriverTracking() {
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    
    db.collection("buses").doc(selectedBusId).set({ 
        status: "inactive" 
    }, { merge: true });
    
    updateGPSStatus("inactive");
    showToast("Stopped tracking your bus");
}

// ==================== Student Functions ====================
function trackBusHandler() {
    if (!selectedBusId) {
        showToast("Please select a bus first.");
        return;
    }
    
    const bus = busData[selectedBusId];
    if (!bus) {
        showToast("Data for the selected bus is still loading. Please wait a moment.");
        return;
    }
    
    if (bus.lat === undefined || bus.lng === undefined) {
        showToast("The location for " + (bus.name || selectedBusId) + " is not available yet.");
        return;
    }
    
    if (bus.status === "inactive") {
        showToast("Warning: " + (bus.name || selectedBusId) + " is currently inactive.");
    }
    
    map.setView([bus.lat, bus.lng], 15);
    
    if (trackedBusMarker) {
        map.removeLayer(trackedBusMarker);
    }
    
    trackedBusMarker = L.marker([bus.lat, bus.lng], {
        icon: L.divIcon({
            className: 'tracked-bus-marker',
            html: '<i class="fas fa-bus"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        })
    }).addTo(map).bindPopup(`Tracked Bus: ${bus.name || selectedBusId}`).openPopup();
    
    showToast(`Now tracking ${bus.name || selectedBusId}`);
}

function updateTrackButtonState() {
    const trackBusBtn = document.getElementById('track-bus');
    if (!trackBusBtn) return;

    if (selectedBusId && busData[selectedBusId] && busData[selectedBusId].lat) {
        trackBusBtn.disabled = false;
        trackBusBtn.title = "Track your selected bus";
    } else {
        trackBusBtn.disabled = true;
        trackBusBtn.title = "Select a bus and wait for location data...";
    }
}

// ==================== Bus List Functions ====================
function updateBusList(buses) {
    const busList = document.getElementById('bus-list');
    busList.innerHTML = '';
    
    let totalBuses = 0;
    let onTimeCount = 0;
    let delayedCount = 0;
    let activeBuses = 0;

    for (const busId in buses) {
        const bus = buses[busId];
        totalBuses++;
        
        if (bus.status === "active") activeBuses++;
        if (bus.status === "delayed") delayedCount++;
        if (bus.status === "active" || !bus.status) onTimeCount++;
        
        const busItem = document.createElement('div');
        busItem.className = 'bus-item';
        busItem.setAttribute('data-bus-id', busId);
        
        const statusClass = bus.status === "active" ? "status-active" : 
                           bus.status === "delayed" ? "status-delayed" : "status-inactive";
        
        busItem.innerHTML = `
            <div class="bus-info">
                <span class="bus-name">${bus.name || busId}</span>
                <span class="bus-status ${statusClass}">${bus.status || "inactive"}</span>
            </div>
            <div class="bus-driver">${bus.driverName || "No driver"}</div>
        `;
        
        busList.appendChild(busItem);
    }

    document.getElementById('total-buses').textContent = totalBuses;
    document.getElementById('active-buses').textContent = activeBuses;
    document.getElementById('delayed-buses').textContent = delayedCount;
}

function filterBusList() {
    const searchTerm = document.getElementById('bus-search').value.toLowerCase();
    const busItems = document.querySelectorAll('.bus-item');
    
    busItems.forEach(item => {
        const busId = item.getAttribute('data-bus-id');
        const busName = item.querySelector('.bus-name').textContent.toLowerCase();
        const shouldShow = busId.includes(searchTerm) || busName.includes(searchTerm);
        item.style.display = shouldShow ? 'flex' : 'none';
    });
}

// ==================== Map & Marker Functions ====================
function updateBusMarker(busId, lat, lng, status) {
    if (markers[busId]) {
        map.removeLayer(markers[busId]);
    }
    
    const busIcon = L.divIcon({
        className: `bus-marker ${status}`,
        html: `<i class="fas fa-bus"></i>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
    
    markers[busId] = L.marker([lat, lng], { icon: busIcon })
        .addTo(map)
        .bindPopup(`
            <strong>${busData[busId]?.name || busId}</strong><br>
            Status: ${status}<br>
            Driver: ${busData[busId]?.driverName || "Unknown"}<br>
            Last update: ${new Date().toLocaleTimeString()}
        `);
}

// ==================== Emergency Functions ====================
async function sendEmergencyAlert(busId, alertType) {
    if (!busId) {
        showToast("No bus selected");
        return;
    }
    
    try {
        const alertRef = db.collection("emergencyAlerts").doc();
        await alertRef.set({
            busId: busId,
            alertType: alertType,
            timestamp: new Date().toISOString(),
            status: "active",
            location: busData[busId] ? {
                lat: busData[busId].lat,
                lng: busData[busId].lng
            } : null
        });
        
        showToast("Emergency alert sent!");
    } catch (error) {
        console.error("Error sending emergency alert:", error);
        showToast("Error sending alert");
    }
}

function setupEmergencyAlertsListener() {
    db.collection("emergencyAlerts")
        .where("status", "==", "active")
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const alert = { id: change.doc.id, ...change.doc.data() };
                    showEmergencyAlert(alert);
                }
            });
        });
}

function showEmergencyAlert(alert) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'emergency-alert';
    alertDiv.innerHTML = `
        <h3>🚨 Emergency Alert</h3>
        <p>Bus: ${alert.busId}</p>
        <p>Type: ${alert.alertType}</p>
        <p>Time: ${new Date(alert.timestamp).toLocaleTimeString()}</p>
        <button onclick="acknowledgeAlert('${alert.id}')">Acknowledge</button>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 30000);
}

function acknowledgeAlert(alertId) {
    db.collection("emergencyAlerts").doc(alertId).update({
        status: "acknowledged"
    });
    
    const alertDiv = document.querySelector('.emergency-alert');
    if (alertDiv) {
        alertDiv.remove();
    }
}

// ==================== Utility Functions ====================
function showToast(message, duration = 3000) {
    const existingToast = document.getElementById('toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// Get bus history for a specific bus
async function getBusHistory(busId, limit = 10) {
    try {
        const historyRef = db.collection("busHistory")
            .where("busId", "==", busId)
            .orderBy("timestamp", "desc")
            .limit(limit);
        
        const snapshot = await historyRef.get();
        const history = [];
        
        snapshot.forEach(doc => {
            history.push(doc.data());
        });
        
        return history;
    } catch (error) {
        console.error("Error getting bus history:", error);
        return [];
    }
}

// ==================== Initialize App ====================
document.addEventListener('DOMContentLoaded', init);