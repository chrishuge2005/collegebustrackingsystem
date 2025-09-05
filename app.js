// Initialize variables
let map;
let markers = {};
let userMarker = null;
let selectedBusId = null;
let gpsWatchId = null;
let accuracyCircle = null;
let isLoggedIn = false;
let currentUser = null;
let userLocation = null;
let userRole = null;
let trackedBusMarker = null;
let busData = {};
let busActivityStatus = { "1": false, "2": false, "3": false, "4": false };

// Firebase imports
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBKBFZ26mQOYBs_P8V-yfWZN0yZW0aE1mQ",
  authDomain: "college-bus-tracking-sys-a565c.firebaseapp.com",
  databaseURL: "https://college-bus-tracking-sys-a565c-default-rtdb.firebaseio.com",
  projectId: "college-bus-tracking-sys-a565c",
  storageBucket: "college-bus-tracking-sys-a565c.appspot.com",
  messagingSenderId: "67601661951",
  appId: "1:67601661951:web:4b90d4a700c49038d931ca",
  measurementId: "G-27CHYQZFEZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Credentials
const driverCredentials = {
    "driver1": { password: "pass1", busId: "1", name: "John Smith" },
    "driver2": { password: "pass2", busId: "2", name: "Maria Garcia" },
    "driver3": { password: "pass3", busId: "3", name: "Robert Johnson" },
    "driver4": { password: "pass4", busId: "4", name: "Sarah Wilson" }
};

const studentCredentials = {
    "student1": { password: "pass1", name: "Alex Johnson" },
    "student2": { password: "pass2", name: "Emma Davis" },
    "student3": { password: "pass3", name: "Michael Brown" }
};

// Initialize map
function init() {
    map = L.map("map").setView([12.9716, 77.5946], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    checkGPSAvailability();
    setupEventListeners();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                userLocation = { lat: latitude, lng: longitude };
                map.setView([latitude, longitude], 14);
                document.getElementById('location-permission').style.display = 'none';
            },
            (error) => {
                console.error(error);
                userLocation = { lat: 12.9716, lng: 77.5946 };
            }
        );
    }
}

// Event listeners
function setupEventListeners() {
    document.getElementById('driver-login-btn').addEventListener('click', () => {
        document.getElementById('driver-login-modal').style.display = 'flex';
    });

    document.getElementById('student-login-btn').addEventListener('click', () => {
        document.getElementById('student-login-modal').style.display = 'flex';
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
        });
    });

    document.getElementById('confirm-driver-login').addEventListener('click', handleDriverLogin);
    document.getElementById('confirm-student-login').addEventListener('click', handleStudentLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('enable-location').addEventListener('click', enableLocation);
    document.getElementById('locate-me').addEventListener('click', centerMapOnUser);
    document.getElementById('start-tracking').addEventListener('click', startDriverTracking);
    document.getElementById('stop-tracking').addEventListener('click', stopDriverTracking);
    document.getElementById('track-bus').addEventListener('click', trackBusFirebase);
}

// Driver login
function handleDriverLogin() {
    const driverId = document.getElementById('driver-id').value;
    const password = document.getElementById('password').value;
    const selectedBusOption = document.querySelector('#driver-login-modal .bus-option.selected');

    if (!driverId || !password || !selectedBusOption) {
        showToast("Fill all fields & select a bus");
        return;
    }

    if (driverCredentials[driverId] && driverCredentials[driverId].password === password) {
        isLoggedIn = true;
        currentUser = driverId;
        userRole = 'driver';
        selectedBusId = driverCredentials[driverId].busId;

        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('login-buttons').style.display = 'none';
        document.getElementById('username').textContent = driverCredentials[driverId].name;
        document.getElementById('driver-controls').style.display = 'flex';
        document.getElementById('student-controls').style.display = 'none';

        document.getElementById('driver-login-modal').style.display = 'none';
        showToast(`Welcome, ${driverCredentials[driverId].name}`);
    } else {
        showToast("Invalid driver ID or password");
    }
}

// Student login
function handleStudentLogin() {
    const studentId = document.getElementById('student-id').value;
    const password = document.getElementById('student-password').value;
    const selectedBusOption = document.querySelector('#student-login-modal .bus-option.selected');

    if (!studentId || !password || !selectedBusOption) {
        showToast("Fill all fields & select a bus");
        return;
    }

    if (studentCredentials[studentId] && studentCredentials[studentId].password === password) {
        isLoggedIn = true;
        currentUser = studentId;
        userRole = 'student';
        selectedBusId = selectedBusOption.getAttribute('data-bus-id');

        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('login-buttons').style.display = 'none';
        document.getElementById('username').textContent = studentCredentials[studentId].name;
        document.getElementById('driver-controls').style.display = 'none';
        document.getElementById('student-controls').style.display = 'flex';

        document.getElementById('student-login-modal').style.display = 'none';
        showToast(`Welcome, ${studentCredentials[studentId].name}`);
    } else {
        showToast("Invalid student ID or password");
    }
}

// Logout
function handleLogout() {
    isLoggedIn = false;
    currentUser = null;
    userRole = null;

    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }

    if (userMarker) map.removeLayer(userMarker);
    if (accuracyCircle) map.removeLayer(accuracyCircle);
    if (trackedBusMarker) map.removeLayer(trackedBusMarker);

    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-buttons').style.display = 'flex';
    document.getElementById('driver-controls').style.display = 'none';
    document.getElementById('student-controls').style.display = 'none';

    showToast("Logged out");
}

// Driver tracking with Firebase
function startDriverTracking() {
    if (!isLoggedIn || userRole !== 'driver') {
        showToast("Login as driver first");
        return;
    }

    const busId = selectedBusId;
    busActivityStatus[busId] = true;

    if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);

    if (navigator.geolocation) {
        gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                userLocation = { lat: latitude, lng: longitude };

                // Update Firebase
                set(ref(db, 'buses/' + busId), {
                    lat: latitude,
                    lng: longitude,
                    status: "active",
                    timestamp: new Date().toISOString()
                });

                updateUserPosition(latitude, longitude, accuracy);
                map.setView([latitude, longitude], 16);
            },
            (error) => console.error("Error tracking location", error),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    }

    document.getElementById('stop-tracking').style.display = 'block';
    document.getElementById('start-tracking').style.display = 'none';
    showToast(`Started tracking Bus ${busId}`);
}

function stopDriverTracking() {
    if (!isLoggedIn || userRole !== 'driver') return;

    const busId = selectedBusId;
    busActivityStatus[busId] = false;

    if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;

    if (userMarker) map.removeLayer(userMarker);
    if (accuracyCircle) map.removeLayer(accuracyCircle);

    document.getElementById('stop-tracking').style.display = 'none';
    document.getElementById('start-tracking').style.display = 'block';

    showToast("Stopped tracking");
}

// Student tracks bus via Firebase
function trackBusFirebase() {
    if (!isLoggedIn || userRole !== 'student') {
        showToast("Login as student first");
        return;
    }

    const busId = selectedBusId;
    if (!busId) return showToast("Select a bus first");

    const busRef = ref(db, 'buses/' + busId);
    onValue(busRef, (snapshot) => {
        const bus = snapshot.val();
        if (!bus) return;

        map.setView([bus.lat, bus.lng], 16);

        if (trackedBusMarker) map.removeLayer(trackedBusMarker);

        const trackedBusIcon = L.divIcon({
            html: '<div class="tracked-bus-marker"><i class="fas fa-bus"></i></div>',
            className: 'tracked-bus-marker-container',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        trackedBusMarker = L.marker([bus.lat, bus.lng], { icon: trackedBusIcon })
            .addTo(map)
            .bindPopup(`<strong>Tracked Bus ${busId}</strong><br>Status: ${bus.status}`)
            .openPopup();
    });

    showToast(`Now tracking Bus ${busId}`);
}

// Update user marker
function updateUserPosition(lat, lng, accuracy) {
    const userIcon = L.divIcon({
        html: '<div class="user-marker"><i class="fas fa-user"></i></div>',
        className: 'user-marker-container',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    if (!userMarker) userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
    else userMarker.setLatLng([lat, lng]);

    if (!accuracyCircle) {
        accuracyCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#3388ff',
            fillColor: '#3388ff',
            fillOpacity: 0.2
        }).addTo(map);
    } else {
        accuracyCircle.setLatLng([lat, lng]);
        accuracyCircle.setRadius(accuracy);
    }
}

// Location & GPS helpers
function enableLocation() {
    if (!navigator.geolocation) return showToast("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            userLocation = { lat: latitude, lng: longitude };
            map.setView([latitude, longitude], 14);
            showToast("Location enabled!");
        },
        (err) => showToast("Enable location in browser settings")
    );
}

function centerMapOnUser() {
    if (userLocation) map.setView([userLocation.lat, userLocation.lng], 16);
    else showToast("Your location not available");
}

function showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

function checkGPSAvailability() {
    if (!("geolocation" in navigator)) showToast("GPS not available");
}

// Initialize
window.onload = init;
