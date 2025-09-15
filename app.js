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
let busListener = null;

// ==================== Initialize App ====================
function init() {
    try {
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
    } catch (error) {
        console.error("Error initializing app:", error);
        showToast("Error initializing application. Please refresh the page.");
    }
}

// ==================== Event Listeners ====================
function setupEventListeners() {
    try {
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
    } catch (error) {
        console.error("Error setting up event listeners:", error);
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
        return true;
    } catch (error) {
        console.error("Error sending location to Firebase:", error);
        showToast("Error updating location. Please check your connection.");
        throw error;
    }
}

function loadBusData() {
    try {
        if (busListener) busListener(); // Remove previous listener if exists
        
        busListener = db.collection("buses").onSnapshot((snapshot) => {
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

            // If student is tracking a bus, update the map
            if (userRole === 'student' && selectedBusId && busData[selectedBusId]) {
                updateTrackedBusOnMap();
            }
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
            
            // If student is tracking a bus, update the map with demo data
            if (userRole === 'student' && selectedBusId && busData[selectedBusId]) {
                updateTrackedBusOnMap();
            }
        });
    } catch (error) {
        console.error("Error loading bus data:", error);
        showToast("Error loading bus data. Please refresh the page.");
    }
}

// ==================== Login/Logout ====================
async function handleDriverLogin() {
    try {
        const driverId = document.getElementById('driver-id').value.trim();
        const password = document.getElementById('password').value;
        const selectedBusOption = document.querySelector('#driver-login-modal .bus-option.selected');

        if (!driverId || !password || !selectedBusOption) {
            showToast("Please fill all fields and select a bus");
            return;
        }

        const busId = selectedBusOption.getAttribute('data-bus-id');

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
    try {
        const studentId = document.getElementById('student-id').value.trim();
        const password = document.getElementById('student-password').value;
        const selectedBusOption = document.querySelector('#student-login-modal .bus-option.selected');

        if (!studentId || !password || !selectedBusOption) {
            showToast("Please fill all fields and select a bus");
            return;
        }

        const busId = selectedBusOption.getAttribute('data-bus-id');

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

        updateUIAfterLogin(studentData.name, 'student');
        updateTrackButtonState();

        // Start listening for bus updates
        setupBusTracking();

    } catch (error) {
        console.error("Login error:", error);
        showToast("Error logging in. Please try again.");
    }
}

function updateUIAfterLogin(username, role) {
    try {
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('login-buttons').style.display = 'none';
        document.getElementById('username').textContent = username;
        
        if (role === 'driver') {
            document.getElementById('driver-controls').style.display = 'flex';
            document.getElementById('student-controls').style.display = 'none';
            // Show start tracking button, hide stop tracking button
            document.getElementById('start-tracking').style.display = 'block';
            document.getElementById('stop-tracking').style.display = 'none';
        } else {
            document.getElementById('driver-controls').style.display = 'none';
            document.getElementById('student-controls').style.display = 'flex';
        }
        
        document.getElementById(`${role}-login-modal`).style.display = 'none';
        
        // Clear login fields
        const idField = document.getElementById(`${role}-id`);
        const passwordField = document.getElementById(`${role === 'driver' ? 'password' : 'student-password'}`);
        
        if (idField) idField.value = '';
        if (passwordField) passwordField.value = '';
        
        document.querySelectorAll('.bus-option').forEach(opt => opt.classList.remove('selected'));
    } catch (error) {
        console.error("Error updating UI after login:", error);
    }
}

function handleLogout() {
    try {
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
        
        // Clean up bus listener
        if (busListener) {
            busListener();
            busListener = null;
        }
        
        // Remove tracked bus marker
        if (trackedBusMarker) {
            map.removeLayer(trackedBusMarker);
            trackedBusMarker = null;
        }
        
        isLoggedIn = false;
        currentUser = null;
        userRole = null;
        selectedBusId = null;
        
        document.getElementById('user-info').style.display = 'none';
        document.getElementById('login-buttons').style.display = 'flex';
        document.getElementById('driver-controls').style.display = 'none';
        document.getElementById('student-controls').style.display = 'none';
        
        updateTrackButtonState();
        
        showToast("Logged out successfully");
    } catch (error) {
        console.error("Error during logout:", error);
        showToast("Error during logout. Please refresh the page.");
    }
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
            
            // If driver is tracking, also update the bus location
            if (userRole === 'driver' && selectedBusId && gpsWatchId !== null) {
                sendLocationToServer(selectedBusId, latitude, longitude)
                    .catch(error => {
                        console.error("Error updating bus location:", error);
                    });
            }
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
                    showToast("Location request timed out. Please check your GPS signal.");
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
    
    if (!indicator || !text) return;
    
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
            text.textContent = "Searching GPS";
            break;
        default:
            indicator.classList.add("gps-inactive");
            text.textContent = "GPS Unknown";
    }
}

function startDriverTracking() {
    if (!selectedBusId) {
        showToast("Please select a bus first");
        return;
    }
    
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser");
        return;
    }
    
    // Update UI
    document.getElementById('start-tracking').style.display = 'none';
    document.getElementById('stop-tracking').style.display = 'block';
    
    // Start watching position
    gpsWatchId = navigator.geolocation.watchPosition(
        position => {
            const { latitude, longitude } = position.coords;
            
            // Update user marker
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
            }).addTo(map).bindPopup("Your Location (Bus)").openPopup();
            
            accuracyCircle = L.circle([latitude, longitude], {
                radius: position.coords.accuracy,
                color: '#3498db',
                fillColor: '#3498db',
                fillOpacity: 0.2,
                weight: 1
            }).addTo(map);
            
            // Send location to server
            sendLocationToServer(selectedBusId, latitude, longitude)
                .catch(error => {
                    console.error("Error updating bus location:", error);
                });
        },
        error => {
            console.error("Error watching position:", error);
            showToast("Error tracking location. Please check your GPS.");
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
    
    showToast("Started tracking your bus location");
}

function stopDriverTracking() {
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    
    // Update UI
    document.getElementById('start-tracking').style.display = 'block';
    document.getElementById('stop-tracking').style.display = 'none';
    
    // Update bus status to inactive
    db.collection("buses").doc(selectedBusId).set({
        status: "inactive",
        lastUpdate: new Date().toISOString()
    }, { merge: true });
    
    showToast("Stopped tracking your bus location");
}

// ==================== Student Tracking Functions ====================
function setupBusTracking() {
    if (!selectedBusId) return;
    
    // Listen for updates to the selected bus
    db.collection("buses").doc(selectedBusId).onSnapshot(doc => {
        if (doc.exists) {
            const bus = doc.data();
            if (bus.lat && bus.lng) {
                updateTrackedBusOnMap();
            }
        }
    }, error => {
        console.error("Error listening to bus updates:", error);
    });
}

function updateTrackedBusOnMap() {
    if (!selectedBusId || !busData[selectedBusId]) return;
    
    const bus = busData[selectedBusId];
    
    // Remove previous tracked bus marker
    if (trackedBusMarker) {
        map.removeLayer(trackedBusMarker);
    }
    
    // Create new marker for tracked bus
    trackedBusMarker = L.marker([bus.lat, bus.lng], {
        icon: L.divIcon({
            className: 'bus-marker tracked',
            html: '<i class="fas fa-bus"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        })
    }).addTo(map).bindPopup(`Tracked Bus: ${bus.name || selectedBusId}`).openPopup();
    
    // Center map on tracked bus if it's far away
    const currentCenter = map.getCenter();
    const busLatLng = L.latLng(bus.lat, bus.lng);
    
    if (map.distance(currentCenter, busLatLng) > 5000) { // More than 5km away
        map.setView([bus.lat, bus.lng], 14);
    }
    
    // Update bus info panel
    updateBusInfoPanel(bus);
}

function updateBusInfoPanel(bus) {
    const infoPanel = document.getElementById('bus-info');
    if (!infoPanel) return;
    
    infoPanel.innerHTML = `
        <h3>${bus.name || selectedBusId}</h3>
        <p><strong>Status:</strong> <span class="status-${bus.status || 'inactive'}">${bus.status || 'Inactive'}</span></p>
        <p><strong>Driver:</strong> ${bus.driverName || 'Not assigned'}</p>
        <p><strong>Last Update:</strong> ${bus.lastUpdate ? new Date(bus.lastUpdate).toLocaleTimeString() : 'Unknown'}</p>
    `;
}

function trackBusHandler() {
    if (!selectedBusId) {
        showToast("Please select a bus to track");
        return;
    }
    
    if (!busData[selectedBusId] || !busData[selectedBusId].lat) {
        showToast("Selected bus location data not available");
        return;
    }
    
    updateTrackedBusOnMap();
    showToast(`Now tracking ${busData[selectedBusId].name || selectedBusId}`);
}

// ==================== UI Helper Functions ====================
function updateBusList(buses) {
    const busListContainer = document.getElementById('bus-list');
    if (!busListContainer) return;
    
    let html = '';
    
    for (const busId in buses) {
        const bus = buses[busId];
        const statusClass = `status-${bus.status || 'inactive'}`;
        
        html += `
            <div class="bus-option" data-bus-id="${busId}">
                <div class="bus-info">
                    <h4>${bus.name || busId}</h4>
                    <p class="bus-status ${statusClass}">${bus.status || 'Inactive'}</p>
                </div>
                <div class="bus-driver">${bus.driverName || 'No driver'}</div>
            </div>
        `;
    }
    
    busListContainer.innerHTML = html;
    
    // Add event listeners to new bus options
    document.querySelectorAll('.bus-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.bus-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            selectedBusId = this.getAttribute('data-bus-id');
            updateTrackButtonState();
        });
    });
}

function filterBusList() {
    const searchTerm = document.getElementById('bus-search').value.toLowerCase();
    const busOptions = document.querySelectorAll('.bus-option');
    
    busOptions.forEach(option => {
        const busName = option.querySelector('h4').textContent.toLowerCase();
        const busId = option.getAttribute('data-bus-id').toLowerCase();
        
        if (busName.includes(searchTerm) || busId.includes(searchTerm)) {
            option.style.display = 'flex';
        } else {
            option.style.display = 'none';
        }
    });
}

function updateTrackButtonState() {
    const trackButton = document.getElementById('track-bus');
    if (!trackButton) return;
    
    if (userRole === 'student' && selectedBusId) {
        trackButton.disabled = false;
        trackButton.classList.remove('disabled');
    } else {
        trackButton.disabled = true;
        trackButton.classList.add('disabled');
    }
}

function updateBusMarker(busId, lat, lng, status) {
    // Remove existing marker if it exists
    if (markers[busId]) {
        map.removeLayer(markers[busId]);
    }
    
    // Create new marker
    const marker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: `bus-marker ${status}`,
            html: '<i class="fas fa-bus"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        })
    }).addTo(map);
    
    // Add popup with bus info
    const bus = busData[busId] || {};
    marker.bindPopup(`
        <strong>${bus.name || busId}</strong><br>
        Status: ${status}<br>
        Driver: ${bus.driverName || 'Not assigned'}<br>
        Last Update: ${bus.lastUpdate ? new Date(bus.lastUpdate).toLocaleTimeString() : 'Unknown'}
    `);
    
    // Store marker reference
    markers[busId] = marker;
}

function showToast(message, duration = 3000) {
    // Remove existing toast if any
    const existingToast = document.getElementById('toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.textContent = message;
    
    // Add to document
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

function setupEmergencyAlertsListener() {
    db.collection("emergencyAlerts").orderBy("timestamp", "desc").limit(5).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const alert = change.doc.data();
                showEmergencyAlert(alert);
            }
        });
    });
}

function sendEmergencyAlert(busId, alertType) {
    if (!busId) {
        showToast("Please select a bus first");
        return;
    }
    
    const bus = busData[busId] || {};
    
    db.collection("emergencyAlerts").add({
        busId: busId,
        busName: bus.name || busId,
        alertType: alertType,
        timestamp: new Date().toISOString(),
        handled: false
    }).then(() => {
        showToast("Emergency alert sent!");
    }).catch(error => {
        console.error("Error sending emergency alert:", error);
        showToast("Error sending emergency alert");
    });
}

function showEmergencyAlert(alert) {
    // Create alert element
    const alertElement = document.createElement('div');
    alertElement.className = 'emergency-alert';
    alertElement.innerHTML = `
        <div class="alert-header">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>EMERGENCY ALERT</h3>
            <button class="dismiss-alert">&times;</button>
        </div>
        <div class="alert-content">
            <p><strong>Bus:</strong> ${alert.busName}</p>
            <p><strong>Type:</strong> ${alert.alertType}</p>
            <p><strong>Time:</strong> ${new Date(alert.timestamp).toLocaleTimeString()}</p>
        </div>
    `;
    
    // Add to alerts container
    const alertsContainer = document.getElementById('emergency-alerts');
    if (alertsContainer) {
        alertsContainer.appendChild(alertElement);
    }
    
    // Add dismiss functionality
    const dismissBtn = alertElement.querySelector('.dismiss-alert');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            alertElement.remove();
        });
    }
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        if (alertElement.parentNode) {
            alertElement.remove();
        }
    }, 10000);
    
    // Also show as toast
    showToast(`EMERGENCY: ${alert.busName} - ${alert.alertType}`, 5000);
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', init);