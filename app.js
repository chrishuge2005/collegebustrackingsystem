// Import the functions you need from the SDKs you need
        import { initializeApp } from "firebase/app";
        import { getAnalytics } from "firebase/analytics";
        // TODO: Add SDKs for Firebase products that you want to use
        // https://firebase.google.com/docs/web/setup#available-libraries

        // Your web app's Firebase configuration
        // For Firebase JS SDK v7.20.0 and later, measurementId is optional
        const firebaseConfig = {
        apiKey: "AIzaSyBKBFZ26mQOYBs_P8V-yfWZN0yZW0aE1mQ",
        authDomain: "college-bus-tracking-sys-a565c.firebaseapp.com",
        projectId: "college-bus-tracking-sys-a565c",
        storageBucket: "college-bus-tracking-sys-a565c.firebasestorage.app",
        messagingSenderId: "67601661951",
        appId: "1:67601661951:web:4b90d4a700c49038d931ca",
        measurementId: "G-27CHYQZFEZ"
        };

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        const analytics = getAnalytics(app);
        // Credentials
        const driverCredentials = {
            "driver1": { password: "pass1", busId: "1", name: "John Smith" },
            "driver2": { password: "pass2", busId: "2", name: "Maria Garcia" },
            "driver3": { password: "pass3", busId: "3", name: "Robert Johnson" },
            "driver4": { password: "pass4", busId: "4", name: "Sarah Wilson" }
        };
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
        let busActivityStatus = {
            "1": false,
            "2": false, 
            "3": false,
            "4": false
        };        

        const studentCredentials = {
            "student1": { password: "pass1", name: "Alex Johnson" },
            "student2": { password: "pass2", name: "Emma Davis" },
            "student3": { password: "pass3", name: "Michael Brown" }
        };

        const fallbackBusData = {
            "1": { 
                lat: 12.9716 + (Math.random() - 0.5) * 0.01, 
                lng: 77.5946 + (Math.random() - 0.5) * 0.01, 
                name: "Campus Shuttle A", 
                status: "on-time", 
                lastUpdate: new Date(),
                route: "Main Campus Loop"
            },
            "2": { 
                lat: 12.9352 + (Math.random() - 0.5) * 0.01, 
                lng: 77.6245 + (Math.random() - 0.5) * 0.01, 
                name: "North Route", 
                status: "delayed", 
                lastUpdate: new Date(Date.now() - 120000),
                route: "North Campus Express"
            },
            "3": { 
                lat: 12.9876 + (Math.random() - 0.5) * 0.01, 
                lng: 77.5512 + (Math.random() - 0.5) * 0.01, 
                name: "South Route", 
                status: "arriving", 
                lastUpdate: new Date(Date.now() - 30000),
                route: "South Residence Halls"
            },
            "4": { 
                lat: 12.9563 + (Math.random() - 0.5) * 0.01, 
                lng: 77.5768 + (Math.random() - 0.5) * 0.01, 
                name: "East Route", 
                status: "on-time", 
                lastUpdate: new Date(Date.now() - 60000),
                route: "East Campus Connector"
            }
        };

        // Initialize abort controller
        let currentAbortController = null;

        // Add this new function to send location updates to the backend
        async function sendLocationToServer(busId, latitude, longitude) {
    try {
        const response = await fetch(`${API_BASE_URL}/buses/${busId}/location`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                lat: latitude,
                lng: longitude,
                timestamp: new Date().toISOString()
            }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Location updated:", data);
    } catch (error) {
        console.error("Error sending location:", error);
    }
}


        // Initialize application
        function init() {
            // Initialize map with default location
            map = L.map("map").setView([12.9716, 77.5946], 14);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '© OpenStreetMap contributors',
            }).addTo(map);
            
            checkGPSAvailability();
            setupEventListeners();
            
            // Try to get location, but don't block if denied
            if (navigator.geolocation) {
                updateGPSStatus("searching");
                
                // Use a timeout for location request
                const locationTimeout = setTimeout(() => {
                    updateGPSStatus("inactive");
                    showToast("Location request taking too long. Using default location.");
                    userLocation = { lat: 12.9716, lng: 77.5946 };
                    loadBusData();
                }, 5000);

                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        clearTimeout(locationTimeout);
                        const { latitude, longitude } = position.coords;
                        userLocation = { lat: latitude, lng: longitude };
                        map.setView([latitude, longitude], 14);
                        updateGPSStatus("active");
                        document.getElementById('location-permission').style.display = 'none';
                        loadBusData();
                    },
                    (error) => {
                        clearTimeout(locationTimeout);
                        console.error("Error getting location:", error);
                        handleLocationError(error);
                        userLocation = { lat: 12.9716, lng: 77.5946 };
                        loadBusData();
                    },
                    {
                        enableHighAccuracy: true,   // use GPS if available
                        timeout: 20000,             // wait up to 20s
                        maximumAge: 0               // don’t reuse old location
                    }
                );
            } else {
                document.getElementById('location-permission').style.display = 'block';
                document.getElementById('enable-location').disabled = true;
                document.getElementById('enable-location').textContent = "Geolocation not supported";
                userLocation = { lat: 12.9716, lng: 77.5946 };
                loadBusData();
            }

            setInterval(loadBusData, 15000);
        }

        function setupEventListeners() {
            // Login buttons
            document.getElementById('driver-login-btn').addEventListener('click', () => {
                document.getElementById('driver-login-modal').style.display = 'flex';
            });
            
            document.getElementById('student-login-btn').addEventListener('click', () => {
                document.getElementById('student-login-modal').style.display = 'flex';
            });
            
            // Close modals
            document.querySelectorAll('.close-modal').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.modal').forEach(modal => {
                        modal.style.display = 'none';
                    });
                });
            });
            
            // Cancel buttons
            document.getElementById('cancel-driver-login').addEventListener('click', () => {
                document.getElementById('driver-login-modal').style.display = 'none';
            });
            
            document.getElementById('cancel-student-login').addEventListener('click', () => {
                document.getElementById('student-login-modal').style.display = 'none';
            });
            
            // Login confirm buttons
            document.getElementById('confirm-driver-login').addEventListener('click', handleDriverLogin);
            document.getElementById('confirm-student-login').addEventListener('click', handleStudentLogin);
            
            // Logout button
            document.getElementById('logout-btn').addEventListener('click', handleLogout);
            
            // Enable location button
            document.getElementById('enable-location').addEventListener('click', enableLocation);
            
            // Map controls
            document.getElementById('zoom-in').addEventListener('click', () => {
                map.zoomIn();
            });
            
            document.getElementById('zoom-out').addEventListener('click', () => {
                map.zoomOut();
            });
            
            document.getElementById('locate-me').addEventListener('click', centerMapOnUser);
            
            // Driver controls
            document.getElementById('start-tracking').addEventListener('click', startDriverTracking);
            document.getElementById('stop-tracking').addEventListener('click', stopDriverTracking);
            
            // Student controls
            document.getElementById('track-bus').addEventListener('click', trackBus);
            
            // Bus selection
            document.querySelectorAll('.bus-option').forEach(option => {
                option.addEventListener('click', function() {
                    document.querySelectorAll('.bus-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    this.classList.add('selected');
                });
            });
            
            // Search functionality
            document.getElementById('bus-search').addEventListener('input', filterBusList);
            document.querySelector('.search-box button').addEventListener('click', filterBusList);
        }

        function handleDriverLogin() {
            const driverId = document.getElementById('driver-id').value;
            const password = document.getElementById('password').value;
            const selectedBusOption = document.querySelector('#driver-login-modal .bus-option.selected');
            
            if (!driverId || !password || !selectedBusOption) {
                showToast("Please fill all fields and select a bus");
                return;
            }
            
            const busId = selectedBusOption.getAttribute('data-bus-id');
            
            // Check credentials
            if (driverCredentials[driverId] && driverCredentials[driverId].password === password) {
                isLoggedIn = true;
                currentUser = driverId;
                userRole = 'driver';
                
                // Update UI
                document.getElementById('user-info').style.display = 'flex';
                document.getElementById('login-buttons').style.display = 'none';
                document.getElementById('username').textContent = driverCredentials[driverId].name;
                document.getElementById('driver-controls').style.display = 'flex';
                document.getElementById('student-controls').style.display = 'none';
                // ✅ Save the selected bus for tracking
                selectedBusId = busId;

                
                // Close modal
                document.getElementById('driver-login-modal').style.display = 'none';
                
                showToast(`Welcome, ${driverCredentials[driverId].name}`);
            } else {
                showToast("Invalid driver ID or password");
            }
        }

        function handleStudentLogin() {
            const studentId = document.getElementById('student-id').value;
            const password = document.getElementById('student-password').value;
            const selectedBusOption = document.querySelector('#student-login-modal .bus-option.selected');
            
            if (!studentId || !password || !selectedBusOption) {
                showToast("Please fill all fields and select a bus");
                return;
            }
            
            const busId = selectedBusOption.getAttribute('data-bus-id');
            
            // Check credentials
            if (studentCredentials[studentId] && studentCredentials[studentId].password === password) {
                isLoggedIn = true;
                currentUser = studentId;
                userRole = 'student';
                
                // Update UI
                document.getElementById('user-info').style.display = 'flex';
                document.getElementById('login-buttons').style.display = 'none';
                document.getElementById('username').textContent = studentCredentials[studentId].name;
                document.getElementById('driver-controls').style.display = 'none';
                document.getElementById('student-controls').style.display = 'flex';
                
                // Close modal
                document.getElementById('student-login-modal').style.display = 'none';
                
                showToast(`Welcome, ${studentCredentials[studentId].name}`);
            } else {
                showToast("Invalid student ID or password");
            }
        }

        function handleLogout() {
            isLoggedIn = false;
            currentUser = null;
            userRole = null;
            
            // Stop any active tracking
            if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId);
                gpsWatchId = null;
            }
            
            // Remove user marker
            if (userMarker) {
                map.removeLayer(userMarker);
                userMarker = null;
            }
            
            // Remove accuracy circle
            if (accuracyCircle) {
                map.removeLayer(accuracyCircle);
                accuracyCircle = null;
            }
            
            // Reset bus activity status
            for (const busId in busActivityStatus) {
                busActivityStatus[busId] = false;
            }
            
            // Reset UI
            document.getElementById('user-info').style.display = 'none';
            document.getElementById('login-buttons').style.display = 'flex';
            document.getElementById('driver-controls').style.display = 'none';
            document.getElementById('student-controls').style.display = 'none';
            
            showToast("Logged out successfully");
        }

        function enableLocation() {
            if (navigator.geolocation) {
                updateGPSStatus("searching");
                
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        userLocation = { lat: latitude, lng: longitude };
                        map.setView([latitude, longitude], 14);
                        updateGPSStatus("active");
                        
                        document.getElementById('location-permission').style.display = 'none';
                        showToast("Location access enabled!");
                    },
                    (error) => {
                        console.error("Error getting location:", error);
                        updateGPSStatus("inactive");
                        showToast("Please enable location permissions in your browser settings");
                    }
                );
            }
        }

        function centerMapOnUser() {
            if (userLocation) {
                map.setView([userLocation.lat, userLocation.lng], 16);
                showToast("Centered on your location");
            } else {
                showToast("Your location is not available");
            }
        }

        function startDriverTracking() {
            if (!isLoggedIn || userRole !== 'driver') {
                showToast("Please login as a driver first");
                return;
            }
            
            const busId = driverCredentials[currentUser].busId;
            
            // Set this bus as active
            busActivityStatus[busId] = true;
            selectedBusId = busId;
            
            // Update UI
            document.getElementById('stop-tracking').style.display = 'block';
            document.getElementById('start-tracking').style.display = 'none';
            
            // Start GPS tracking
            if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId);
            }
            
            if (navigator.geolocation) {
                gpsWatchId = navigator.geolocation.watchPosition(
                    (position) => {
                        const { latitude, longitude, accuracy } = position.coords;
                        
                        // Update user location
                        userLocation = { lat: latitude, lng: longitude };
                        
                        // Update bus data with current position
                        if (busData[busId]) {
                            busData[busId].lat = latitude;
                            busData[busId].lng = longitude;
                            busData[busId].lastUpdate = new Date();
                            busData[busId].status = "active";
                        }
                        
                        // Send the live location to the backend for students to see
                        sendLocationToServer(busId, latitude, longitude);
                        
                        // Update user marker
                        updateUserPosition(latitude, longitude, accuracy);
                        
                        // Center map on user if they're being tracked
                        map.setView([latitude, longitude], 16);
                        
                        updateGPSStatus("active");
                    },
                    (error) => {
                        console.error("Error watching position:", error);
                        updateGPSStatus("error");
                    },
                    { 
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 5000
                    }
                );
            }
            
            showToast(`Started tracking Bus ${busId}`);
        }

        function stopDriverTracking() {
            if (!isLoggedIn || userRole !== 'driver') return;
            
            const busId = driverCredentials[currentUser].busId;
            
            // Set bus as inactive
            busActivityStatus[busId] = false;
            
            // Update UI
            document.getElementById('stop-tracking').style.display = 'none';
            document.getElementById('start-tracking').style.display = 'block';
            
            // Stop GPS tracking
            if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId);
                gpsWatchId = null;
            }
            
            // Remove user marker and accuracy circle
            if (userMarker) {
                map.removeLayer(userMarker);
                userMarker = null;
            }
            
            if (accuracyCircle) {
                map.removeLayer(accuracyCircle);
                accuracyCircle = null;
            }
            
            updateGPSStatus("inactive");
            showToast("Stopped tracking");
        }

        function trackBus() {
    if (!isLoggedIn || userRole !== 'student') {
        showToast("Please login as a student first");
        return;
    }

    // ✅ Use the bus selected during login
    const busId = selectedBusId;
    if (!busId || !busData[busId]) {
        showToast("Selected bus is not active or available");
        return;
    }

    const bus = busData[busId];
    map.setView([bus.lat, bus.lng], 16);

    if (trackedBusMarker) {
        map.removeLayer(trackedBusMarker);
    }

    const trackedBusIcon = L.divIcon({
        html: '<div class="tracked-bus-marker"><i class="fas fa-bus"></i></div>',
        className: 'tracked-bus-marker-container',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    trackedBusMarker = L.marker([bus.lat, bus.lng], { icon: trackedBusIcon })
        .addTo(map)
        .bindPopup(`<strong>Tracked Bus ${busId}</strong><br>${bus.name}`)
        .openPopup();

    showToast(`Now tracking Bus ${busId}`);
}

        function updateUserPosition(lat, lng, accuracy) {
            // Create or update user marker
            const userIcon = L.divIcon({
                html: '<div class="user-marker"><i class="fas fa-user"></i></div>',
                className: 'user-marker-container',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            
            if (!userMarker) {
                userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
            } else {
                userMarker.setLatLng([lat, lng]);
            }
            
            // Create or update accuracy circle
            if (!accuracyCircle) {
                accuracyCircle = L.circle([lat, lng], {
                    radius: accuracy,
                    color: '#3388ff',
                    fillColor: '#3388ff',
                    fillOpacity: 0.2,
                    weight: 1
                }).addTo(map);
            } else {
                accuracyCircle.setLatLng([lat, lng]);
                accuracyCircle.setRadius(accuracy);
            }
        }

        function filterBusList() {
            const searchTerm = document.getElementById('bus-search').value.toLowerCase();
            const busItems = document.querySelectorAll('.bus-item');
            
            busItems.forEach(item => {
                const busName = item.querySelector('h3').textContent.toLowerCase();
                const busId = item.dataset.busId;
                
                if (busName.includes(searchTerm) || busId.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        function handleLocationError(error) {
            let errorMsg = "Unable to get your location";
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = "Location access denied. Please enable location permissions in your browser settings.";
                    document.getElementById('location-permission').style.display = 'block';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = "Location information unavailable.";
                    break;
                case error.TIMEOUT:
                    errorMsg = "Location request timed out.";
                    break;
            }
            updateGPSStatus("inactive");
            showToast(errorMsg);
        }

        function updateGPSStatus(status) {
            const indicator = document.getElementById('gps-indicator');
            const text = document.getElementById('gps-text');
            
            indicator.classList.remove('gps-active', 'gps-inactive', 'gps-searching');
            
            switch(status) {
                case "active":
                    indicator.classList.add('gps-active');
                    text.textContent = 'GPS Active';
                    break;
                case "inactive":
                    indicator.classList.add('gps-inactive');
                    text.textContent = 'GPS Inactive';
                    break;
                case "searching":
                    indicator.classList.add('gps-searching');
                    text.textContent = 'Searching...';
                    break;
                case "unavailable":
                    indicator.classList.add('gps-inactive');
                    text.textContent = 'GPS Unavailable';
                    break;
                case "error":
                    indicator.classList.add('gps-inactive');
                    text.textContent = 'GPS Error';
                    break;
            }
        }

        function checkGPSAvailability() {
            if ("geolocation" in navigator) {
                updateGPSStatus("inactive");
            } else {
                updateGPSStatus("unavailable");
                showToast("GPS is not available on this device");
            }
        }

        function showToast(message, duration = 3000) {
            const toast = document.getElementById('toast');
            const toastMessage = document.getElementById('toast-message');
            
            toastMessage.textContent = message;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, duration);
        }

        async function loadBusData() {
            // If there's a previous request still going, cancel it
            if (currentAbortController) {
                currentAbortController.abort();
            }

            try {
                // First check if we're online
                if (!navigator.onLine) {
                    throw new Error("You are offline. Using fallback data.");
                }

                const API_BASE_URL = "https://bus-tracker-backend-96uu.onrender.com";
                const timeoutDuration = 60000; // 10 seconds
                
                // Create a new AbortController for THIS request
                currentAbortController = new AbortController();
                const timeoutId = setTimeout(() => {
                    currentAbortController.abort();
                }, timeoutDuration);
                
                // Test if backend is reachable first
                try {
                    const testResponse = await fetch(`${API_BASE_URL}/health`, {
                        signal: currentAbortController.signal,
                        method: 'GET'
                    });
                    
                    if (!testResponse.ok) {
                        throw new Error("Backend not available");
                    }
                } catch (testError) {
                    // If health check fails, use fallback immediately
                    throw new Error("Backend server is not reachable");
                }
                
                // Now fetch actual bus data WITH THE SAME SIGNAL (timeout still active)
                const response = await fetch(`${API_BASE_URL}/buses`, {
                    signal: currentAbortController.signal,
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });
                
                // Clear timeout only after BOTH requests succeed
                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                const apiBusData = await response.json();
                busData = { ...apiBusData };
                
                updateBusList(busData);
                
                for (const busId in busData) {
                    const bus = busData[busId];
                    let status = bus.status;
                    
                    if (busActivityStatus[busId] === false) {
                        status = "inactive";
                    }
                    
                    updateBusMarker(busId, bus.lat, bus.lng, status);
                }
                
                document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
                console.log("Bus data successfully loaded from API");
                
            } catch (error) {
                // Only show the error if it was NOT an abort
                if (error.name !== 'AbortError') {
                    console.warn("Using fallback data:", error.message);
                    
                    // Use fallback data with some randomization to simulate real data
                    const now = new Date();
                    busData = { ...fallbackBusData };
                    
                    // Simulate some movement for demo purposes
                    for (const busId in busData) {
                        // Add small random movement to make it look live
                        busData[busId].lat += (Math.random() - 0.5) * 0.001;
                        busData[busId].lng += (Math.random() - 0.5) * 0.001;
                        busData[busId].lastUpdate = new Date(now.getTime() - Math.random() * 120000);
                        
                        // Randomly set some buses as active for demo
                        if (Math.random() > 0.5) {
                            busData[busId].status = ["on-time", "delayed", "arriving"][Math.floor(Math.random() * 3)];
                        }
                    }
                    
                    updateBusList(busData);
                    for (const busId in busData) {
                        const bus = busData[busId];
                        updateBusMarker(busId, bus.lat, bus.lng, bus.status);
                    }
                    
                    showToast("Using demo data - backend not available", 2000);
                } else {
                    console.log("Request was aborted as intended (timeout).");
                }
            }
        }

        function updateBusMarker(busId, lat, lng, status) {
            let markerColor;
            switch(status) {
                case "on-time": markerColor = "#10b981"; break;
                case "delayed": markerColor = "#ef4444"; break;
                case "arriving": markerColor = "#f59e0b"; break;
                case "inactive": markerColor = "#6b7280"; break;
                case "active": markerColor = "#2563eb"; break;
                default: markerColor = "#2563eb";
            }

            const busIcon = L.divIcon({
                html: `<div style="background-color:${markerColor};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-bus"></i></div>`,
                className: 'bus-marker',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            if (markers[busId]) {
                markers[busId].setLatLng([lat, lng]);
                markers[busId].setIcon(busIcon);
            } else {
                markers[busId] = L.marker([lat, lng], { icon: busIcon })
                    .addTo(map)
                    .bindPopup(`<strong>Bus ${busId}</strong><br>Status: <span class="status-${status}">${status}</span>`);
                    
                markers[busId].on('click', function() {
                    map.setView([lat, lng], 16);
                });
            }
        }

        function updateBusList(busData) {
            const busList = document.getElementById('bus-list');
            busList.innerHTML = '';

            let activeCount = 0;
            let onTimeCount = 0;
            let delayedCount = 0;

            for (const busId in busData) {
                const bus = busData[busId];
                const busItem = document.createElement('div');
                busItem.className = 'bus-item';
                busItem.dataset.busId = busId; // Fixed the syntax error here

                let status = bus.status || "inactive";
                if (busActivityStatus[busId] === true) {
                    status = "active";
                    activeCount++;
                }

                if (status === "on-time") onTimeCount++;
                if (status === "delayed") delayedCount++;

                busItem.innerHTML = `
                    <div class="bus-icon"><i class="fas fa-bus"></i></div>
                    <div class="bus-info">
                        <h3>${bus.name || `Bus ${busId}`}</h3>
                        <p>ID: ${busId} | Status: <span class="status-${status}">${status}</span></p>
                    </div>
                    <span class="bus-status status-${status}">${status}</span>
                `;

                busItem.addEventListener('click', () => {
                    const busLocation = busData[busId] || fallbackBusData[busId];
                    map.setView([busLocation.lat, busLocation.lng], 16);
                    if (markers[busId]) {
                        markers[busId].openPopup();
                    }
                });

                busList.appendChild(busItem);
            }

            document.getElementById('active-buses').textContent = activeCount;
            document.getElementById('total-buses').textContent = Object.keys(busData).length;
            document.getElementById('on-time').textContent = onTimeCount;
            document.getElementById('delayed').textContent = delayedCount;
        }

        // Initialize the application
        window.onload = init;
    