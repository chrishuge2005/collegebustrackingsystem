// ==================== Firebase Config ====================
// Make sure you included Firebase scripts in your HTML:
// <script type="module" src="./app.js"></script>
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot } from "firebase/firestore";

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
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

    document.getElementById('cancel-driver-login').addEventListener('click', () => {
        document.getElementById('driver-login-modal').style.display = 'none';
    });
    document.getElementById('cancel-student-login').addEventListener('click', () => {
        document.getElementById('student-login-modal').style.display = 'none';
    });

    document.getElementById('confirm-driver-login').addEventListener('click', handleDriverLogin);
    document.getElementById('confirm-student-login').addEventListener('click', handleStudentLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('enable-location').addEventListener('click', enableLocation);
    document.getElementById('zoom-in').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoom-out').addEventListener('click', () => map.zoomOut());
    document.getElementById('locate-me').addEventListener('click', centerMapOnUser);
    document.getElementById('start-tracking').addEventListener('click', startDriverTracking);
    document.getElementById('stop-tracking').addEventListener('click', stopDriverTracking);
    document.getElementById('track-bus').addEventListener('click', trackBus);
    document.getElementById('bus-search').addEventListener('input', filterBusList);
    document.querySelector('.search-box button').addEventListener('click', filterBusList);

    document.querySelectorAll('.bus-option').forEach(option => {
        option.addEventListener('click', function () {
            document.querySelectorAll('.bus-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
}

// ==================== Firebase Bus Functions ====================
async function sendLocationToServer(busId, latitude, longitude) {
    try {
        const busRef = doc(db, "buses", busId);
        await setDoc(busRef, {
            lat: latitude,
            lng: longitude,
            lastUpdate: new Date().toISOString(),
            status: "active"
        }, { merge: true });
        console.log("Location updated in Firebase for bus", busId);
    } catch (error) {
        console.error("Error sending location to Firebase:", error);
    }
}

function loadBusData() {
    const busesCol = collection(db, "buses");
    onSnapshot(busesCol, (snapshot) => {
        busData = {};
        snapshot.forEach(doc => busData[doc.id] = doc.data());
        updateBusList(busData);

        for (const busId in busData) {
            const bus = busData[busId];
            updateBusMarker(busId, bus.lat, bus.lng, bus.status || "inactive");
        }

        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
    }, error => {
        console.error("Error loading bus data from Firebase:", error);
        showToast("Using demo data - Firebase not reachable", 2000);
    });
}

// ==================== Login/Logout ====================
async function handleDriverLogin() {
    const driverId = document.getElementById('driver-id').value;
    const password = document.getElementById('password').value;
    const selectedBusOption = document.querySelector('#driver-login-modal .bus-option.selected');

    if (!driverId || !password || !selectedBusOption) {
        showToast("Please fill all fields and select a bus");
        return;
    }

    const busId = selectedBusOption.getAttribute('data-bus-id');

    try {
        const driverRef = doc(db, "drivers", driverId);
        const driverSnap = await getDoc(driverRef);
        if (!driverSnap.exists()) return showToast("Driver ID not found");

        const driverData = driverSnap.data();
        if (driverData.password !== password) return showToast("Incorrect password");
        if (driverData.busId !== busId) return showToast("Driver not assigned to this bus");

        isLoggedIn = true;
        currentUser = driverId;
        userRole = 'driver';
        selectedBusId = busId;

        // Update bus driver in Firebase
        await setDoc(doc(db, "buses", busId), { driver: driverId, status: "active" }, { merge: true });

        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('login-buttons').style.display = 'none';
        document.getElementById('username').textContent = driverData.name;
        document.getElementById('driver-controls').style.display = 'flex';
        document.getElementById('student-controls').style.display = 'none';
        document.getElementById('driver-login-modal').style.display = 'none';

        showToast(`Welcome, ${driverData.name}`);
    } catch (error) {
        console.error(error);
        showToast("Error logging in");
    }
}

async function handleStudentLogin() {
    const studentId = document.getElementById('student-id').value;
    const password = document.getElementById('student-password').value;
    const selectedBusOption = document.querySelector('#student-login-modal .bus-option.selected');

    if (!studentId || !password || !selectedBusOption) {
        showToast("Please fill all fields and select a bus");
        return;
    }

    const busId = selectedBusOption.getAttribute('data-bus-id');

    try {
        const studentRef = doc(db, "students", studentId);
        const studentSnap = await getDoc(studentRef);
        if (!studentSnap.exists()) return showToast("Student ID not found");

        const studentData = studentSnap.data();
        if (studentData.password !== password) return showToast("Incorrect password");

        isLoggedIn = true;
        currentUser = studentId;
        userRole = 'student';
        selectedBusId = busId;

        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('login-buttons').style.display = 'none';
        document.getElementById('username').textContent = studentData.name;
        document.getElementById('driver-controls').style.display = 'none';
        document.getElementById('student-controls').style.display = 'flex';
        document.getElementById('student-login-modal').style.display = 'none';

        showToast(`Welcome, ${studentData.name}`);
    } catch (error) {
        console.error(error);
        showToast("Error logging in");
    }
}

function handleLogout() {
    isLoggedIn = false;
    currentUser = null;
    userRole = null;

    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }

    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }

    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-buttons').style.display = 'flex';
    document.getElementById('driver-controls').style.display = 'none';
    document.getElementById('student-controls').style.display = 'none';

    showToast("Logged out successfully");
}

// ==================== Driver GPS Tracking ====================
function startDriverTracking() {
    if (!navigator.geolocation) return showToast("Geolocation not supported");

    gpsWatchId = navigator.geolocation.watchPosition(
        pos => {
            const { latitude, longitude, accuracy } = pos.coords;
            if (userMarker) userMarker.setLatLng([latitude, longitude]);
            else userMarker = L.marker([latitude, longitude], { icon: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [32, 32] }) }).addTo(map);

            if (accuracyCircle) accuracyCircle.setLatLng([latitude, longitude]).setRadius(accuracy);
            else accuracyCircle = L.circle([latitude, longitude], { radius: accuracy, color: 'blue', fillOpacity: 0.2 }).addTo(map);

            sendLocationToServer(selectedBusId, latitude, longitude);
        },
        err => showToast("Error accessing location: " + err.message),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
    showToast("Started driver GPS tracking");
}

function stopDriverTracking() {
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
        showToast("Stopped driver GPS tracking");
    }
}

// ==================== Student Bus Tracking ====================
function trackBus() {
    if (!selectedBusId || !busData[selectedBusId]) return showToast("Bus data not available");

    const bus = busData[selectedBusId];
    if (trackedBusMarker) trackedBusMarker.setLatLng([bus.lat, bus.lng]);
    else trackedBusMarker = L.marker([bus.lat, bus.lng], { icon: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [32, 32] }) }).addTo(map);

    map.setView([bus.lat, bus.lng], 16);
}

// ==================== Helper Functions ====================
function showToast(msg, duration = 1500) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

function updateBusMarker(busId, lat, lng, status) {
    if (!lat || !lng) return;
    if (markers[busId]) {
        markers[busId].setLatLng([lat, lng]);
    } else {
        markers[busId] = L.marker([lat, lng], { icon: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [32, 32] }) }).addTo(map);
    }
}

function updateBusList(busData) {
    const busListEl = document.getElementById('bus-list');
    busListEl.innerHTML = "";
    let total = 0, onTime = 0, delayed = 0;

    for (const busId in busData) {
        const bus = busData[busId];
        total++;
        if (bus.status === 'active') onTime++; else delayed++;

        const busItem = document.createElement('div');
        busItem.className = 'bus-item';
        busItem.innerHTML = `
            <div class="bus-icon"><i class="fas fa-bus"></i></div>
            <div class="bus-info">
                <h3>${bus.name || "Bus " + busId}</h3>
                <p>ID: ${busId}</p>
            </div>
            <span class="bus-status ${bus.status === 'active' ? 'status-on-time' : 'status-delayed'}">${bus.status || 'inactive'}</span>
        `;
        busListEl.appendChild(busItem);
    }

    document.getElementById('total-buses').textContent = total;
    document.getElementById('on-time').textContent = onTime;
    document.getElementById('delayed').textContent = delayed;
}

function filterBusList() {
    const query = document.getElementById('bus-search').value.toLowerCase();
    document.querySelectorAll('.bus-item').forEach(item => {
        const name = item.querySelector('h3').textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
}

function enableLocation() {
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => map.setView([pos.coords.latitude, pos.coords.longitude], 14));
}

function centerMapOnUser() {
    if (userMarker) map.setView(userMarker.getLatLng(), 16);
}

function checkGPSAvailability() {
    const gpsIndicator = document.getElementById('gps-indicator');
    const gpsText = document.getElementById('gps-text');
    if ("geolocation" in navigator) {
        gpsIndicator.classList.remove('gps-inactive');
        gpsIndicator.classList.add('gps-active');
        gpsText.textContent = "GPS Active";
    }
}

// ==================== Initialize ====================
window.onload = init;
