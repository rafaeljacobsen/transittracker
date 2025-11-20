// Global variables that need to be accessible outside DOMContentLoaded
let map; // Leaflet map instance - needs to be global for switchTab function

// Wrap everything in DOMContentLoaded to ensure DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Global variables - declare these first
    const trainMarkers = new Map();
        const ferryMarkers = new Map();
        const busMarkers = new Map();
        const shuttleMarkers = new Map();
        const silverLineMarkers = new Map();
        const lirrMarkers = new Map(); // LIRR train markers
        let trackingInterval;
        let ferryTrackingInterval;
        let busTrackingInterval;
        let shuttleTrackingInterval;
        let silverLineTrackingInterval;
        let lirrTrackingInterval; // LIRR tracking interval
        let lastUpdateTime = 0;
        let lastFerryUpdateTime = 0;
        let lastBusUpdateTime = 0;
        let lastShuttleUpdateTime = 0;
        let lastSilverLineUpdateTime = 0;
        let lastLIRRUpdateTime = 0; // LIRR last update timestamp
        
        // State for line highlighting feature
        let highlightedLine = null;
        let highlightedLIRRLine = null; // Separate highlighting for LIRR/MTA
        
        // Bus route loading state
        let busRoutesLoaded = false;
        let busRoutesLoading = false;
        
        // Shuttle route loading state
        let shuttleRoutesLoaded = false;
        let shuttleRoutesLoading = false;
        
        // LIRR route loading state
        let lirrRoutesLoaded = false;
        let lirrRoutesLoading = false;
        
        // Bus stop visibility state
        let busStopsVisible = false;
        const busStopLayers = new Map(); // Separate layers for bus stops
        const busStopToRoutes = new Map(); // Track which routes serve each bus stop
        const BUS_STOPS_MIN_ZOOM = 14; // Show bus stops at zoom level 14+
        
        // Check if data is ready before proceeding
        if (typeof mbtaStopsData === 'undefined' || !mbtaStopsData) {
            document.getElementById('map').innerHTML = '<div style="text-align: center; padding: 50px; font-size: 18px; color: #666;">Loading MBTA data...</div>';
            // Don't run any more code
            throw new Error('MBTA data not loaded');
        }
        
        // Initialize the map centered on New York/Long Island with canvas renderer for better performance
        map = L.map('map', {
            preferCanvas: true,  // Use canvas for better performance with many objects
            renderer: L.canvas()
        }).setView([42.361220, -71.057083], 11);
        
        // Add OpenStreetMap tiles
        const osmTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'Â© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        });
        
        osmTiles.addTo(map);
        
        // Create custom panes for proper z-ordering of transit lines
        // Default panes have z-index: tilePane(200), overlayPane(400), shadowPane(500), markerPane(600), tooltipPane(650), popupPane(700)
        map.createPane('ferryPane');
        map.getPane('ferryPane').style.zIndex = 401; // At the bottom
        
        map.createPane('busPane');
        map.getPane('busPane').style.zIndex = 403; // Above ferries
        
        map.createPane('commuterRailPane');
        map.getPane('commuterRailPane').style.zIndex = 405; // Above buses
        
        map.createPane('lirrPane');
        map.getPane('lirrPane').style.zIndex = 406; // LIRR - above MBTA commuter rail
        
        map.createPane('silverLinePane');
        map.getPane('silverLinePane').style.zIndex = 408; // Above commuter rail
        
        map.createPane('subwayPane');
        map.getPane('subwayPane').style.zIndex = 410; // Above silver line
        
        map.createPane('stopsPane');
        map.getPane('stopsPane').style.zIndex = 450; // Above all tracks, below markers
        
        // Add click handler to map to reset highlight when clicking empty space
        map.on('click', function(e) {
            if (highlightedLine !== null) {
                resetHighlight();
            }
            if (highlightedLIRRLine !== null) {
                resetLIRRHighlight();
            }
        });
        
        // Function to calculate stop radius based on zoom level
        function getStopRadius(baseRadius, currentZoom) {
            // Scale radius based on zoom: smaller when zoomed out, larger when zoomed in
            // Zoom 8-9: 60% size, Zoom 10-11: 80% size, Zoom 12+: 100% size
            if (currentZoom <= 9) {
                return baseRadius * 0.6;
            } else if (currentZoom <= 11) {
                return baseRadius * 0.8;
            } else {
                return baseRadius;
            }
        }
        
        // Function to calculate icon size based on zoom level
        function getIconSize(baseSize, currentZoom) {
            // Scale icon size based on zoom: smaller when zoomed out
            // Zoom 8-9: 60% size, Zoom 10-11: 80% size, Zoom 12+: 100% size
            if (currentZoom <= 9) {
                return Math.round(baseSize * 0.6);
            } else if (currentZoom <= 11) {
                return Math.round(baseSize * 0.8);
            } else {
                return baseSize;
            }
        }
        
        // Add zoom handler for bus stops visibility and stop sizing
        map.on('zoomend', function() {
            const currentZoom = map.getZoom();
            const shouldShowBusStops = currentZoom >= BUS_STOPS_MIN_ZOOM;
            
            // Only update if state changed
            if (shouldShowBusStops !== busStopsVisible) {
                busStopsVisible = shouldShowBusStops;
                toggleBusStopsVisibility(shouldShowBusStops);
            }
            
            // Update all stop marker sizes based on zoom
            map.eachLayer(function(layer) {
                if (layer instanceof L.CircleMarker && layer.options.pane === 'stopsPane') {
                    // Get the base radius from the marker's stored base radius
                    const baseRadius = layer.options.baseRadius || 5;
                    const newRadius = getStopRadius(baseRadius, currentZoom);
                    layer.setRadius(newRadius);
                }
                // Update live train/bus/ferry icon markers
                else if (layer instanceof L.Marker && layer.options.icon) {
                    const icon = layer.options.icon;
                    const baseIconSize = icon.options.baseIconSize;
                    if (baseIconSize) {
                        const newSize = getIconSize(baseIconSize, currentZoom);
                        const newIcon = L.icon({
                            iconUrl: icon.options.iconUrl,
                            iconSize: [newSize, newSize],
                            iconAnchor: [newSize / 2, newSize / 2],
                            baseIconSize: baseIconSize // Preserve base size
                        });
                        layer.setIcon(newIcon);
                    }
                }
            });
        });
        
        
        // Create layer groups for each transit line
        const layers = {};
        
        // Initialize layers for all lines
        if (mbtaStopsData && typeof mbtaStopsData === 'object') {
            try {
                Object.keys(mbtaStopsData).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    // Don't add to map yet - wait for checkbox
                });
            } catch (e) {
                // Silently handle any errors
            }
        }
        
        // Initialize layers for bus routes
        if (mbtaBusData && typeof mbtaBusData === 'object') {
            try {
                Object.keys(mbtaBusData).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    // Don't add to map yet - wait for checkbox
                });
            } catch (e) {
                // Silently handle any errors
            }
        }
        
        // Initialize layers for shuttle routes
        if (mbtaShuttleData && typeof mbtaShuttleData === 'object') {
            try {
                Object.keys(mbtaShuttleData).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    // Don't add to map yet - wait for checkbox
                });
            } catch (e) {
                // Silently handle any errors
            }
        }
        
        // Initialize layers for ferry routes
        if (mbtaFerryData && typeof mbtaFerryData === 'object') {
            try {
                Object.keys(mbtaFerryData).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    map.addLayer(layers[lineName]);
                });
            } catch (e) {
                // Silently handle any errors
            }
        }
        
        // Initialize layers for LIRR routes (if data available)
        if (typeof lirrRoutesData !== 'undefined' && lirrRoutesData && lirrRoutesData.routes) {
            try {
                Object.keys(lirrRoutesData.routes).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    // Don't add to map yet - wait for checkbox
                });
            } catch (e) {
                // LIRR data initialization skipped
            }
        }
        
        // Generate filter checkboxes dynamically
        const filterContainer = document.getElementById('filter-checkboxes');
        
        // Define subway, commuter rail, seasonal rail, and bus lines
        const subwayLines = ['Red Line', 'Orange Line', 'Blue Line', 'Green Line B', 'Green Line C', 'Green Line D', 'Green Line E', 'Mattapan Trolley'];
        const commuterLines = ['Fairmount Line', 'Fall River/New Bedford Line', 'Fitchburg Line', 'Framingham/Worcester Line', 'Franklin/Foxboro Line', 'Greenbush Line', 'Haverhill Line', 'Kingston Line', 'Lowell Line', 'Needham Line', 'Newburyport/Rockport Line', 'Providence/Stoughton Line', 'Foxboro Event Service'];
        const seasonalLines = ['CapeFLYER'];
        const busLines = ['1', '4', '7', '8', '9', '10', '11', '14', '15', '16', '17', '18', '19', '21', '22', '23', '24', '26', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '47', '50', '51', '52', '55', '57', '59', '60', '61', '62', '64', '65', '66', '67', '68', '69', '70', '71', '73', '74', '75', '76', '77', '78', '80', '83', '85', '86', '87', '88', '89', '90', '91', '92', '93', '94', '95', '96', '97', '99', '100', '101', '104', '105', '106', '108', '109', '110', '111', '112', '114', '116', '119', '120', '121', '131', '132', '134', '137', '171', '201', '202', '210', '211', '215', '216', '217', '220', '222', '225', '226', '230', '236', '238', '240', '245', '350', '351', '411', '424', '428', '430', '435', '436', '439', '441', '442', '450', '451', '455', '456', '501', '504', '505', '553', '554', '556', '558', '627', '708', '712', '713', '714', '716', '747'];
        const silverLineRoutes = ['SL1', 'SL2', 'SL3', 'SL4', 'SL5', 'SLW'];
        const ferryLines = ['Boat-F4', 'Boat-F1', 'Boat-EastBoston', 'Boat-Lynn', 'Boat-F6', 'Boat-F7', 'Boat-F8'];
        
        // LIRR lines - will be populated from LIRR data if available
        let lirrLines = [];
        if (typeof lirrRoutesData !== 'undefined' && lirrRoutesData && lirrRoutesData.routes) {
            lirrLines = Object.keys(lirrRoutesData.routes);
        }

        
        // Add event listeners for category filters
        // Subway paths filter
        document.getElementById('show-subway-paths').addEventListener('change', function() {
            const isChecked = this.checked;
            subwayLines.forEach(lineName => {
                if (mbtaStopsData[lineName] && layers[lineName]) {
                    if (isChecked) {
                        map.addLayer(layers[lineName]);
                    } else {
                        map.removeLayer(layers[lineName]);
                    }
                }
            });
            updateStats();
        });
        
        // Subway live tracking filter
        document.getElementById('show-subway-live').addEventListener('change', function() {
            const isChecked = this.checked;
            
            // Hide/show train markers for subway lines ONLY
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    if (subwayLines.includes(marker.routeName)) {
                        if (isChecked) {
                            marker.addTo(map);
                        } else {
                            marker.remove();
                        }
                    }
                }
            });
            
            // Control live tracking for subway lines
            if (isChecked) {
                // Resume live tracking if it was stopped
                if (!trackingInterval) {
                    startLiveTracking();
                }
            } else {
                // Check if any other services are still active for live tracking
                const hasCommuter = document.getElementById('show-commuter-live').checked;
                const hasSeasonal = document.getElementById('show-seasonal-live').checked;
                const hasBus = document.getElementById('show-bus-live').checked;
                const hasSilver = document.getElementById('show-silver-line-live').checked;
                const hasFerry = document.getElementById('show-ferry-live').checked;
                
                // If no categories are checked, stop live tracking
                if (!hasCommuter && !hasSeasonal && !hasBus && !hasSilver && !hasFerry) {
                    stopLiveTracking();
                }
            }
            
            updateStats();
        });
        
        // Commuter rail paths filter
        document.getElementById('show-commuter-paths').addEventListener('change', function() {
            const isChecked = this.checked;
            commuterLines.forEach(lineName => {
                if (mbtaStopsData[lineName] && layers[lineName]) {
                    if (isChecked) {
                        map.addLayer(layers[lineName]);
                    } else {
                        map.removeLayer(layers[lineName]);
                    }
                }
            });
            updateStats();
        });
        
        // Commuter rail live tracking filter
        document.getElementById('show-commuter-live').addEventListener('change', function() {
            const isChecked = this.checked;
            
            // Hide/show train markers for commuter rail lines ONLY
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    if (commuterLines.includes(marker.routeName) || (marker.routeId && marker.routeId.startsWith('CR-'))) {
                        if (isChecked) {
                            marker.addTo(map);
                        } else {
                            marker.remove();
                        }
                    }
                }
            });
            
            // Control live tracking for commuter rail lines
            if (isChecked) {
                // Resume live tracking if it was stopped
                if (!trackingInterval) {
                    startLiveTracking();
                }
            } else {
                // Check if any other services are still active for live tracking
                const hasSubway = document.getElementById('show-subway-live').checked;
                const hasSeasonal = document.getElementById('show-seasonal-live').checked;
                const hasBus = document.getElementById('show-bus-live').checked;
                const hasSilver = document.getElementById('show-silver-line-live').checked;
                const hasFerry = document.getElementById('show-ferry-live').checked;
                
                // If no categories are checked, stop live tracking
                if (!hasSubway && !hasSeasonal && !hasBus && !hasSilver && !hasFerry) {
                    stopLiveTracking();
                }
            }
            
            updateStats();
        });
        
        // Seasonal rail paths filter
        document.getElementById('show-seasonal-paths').addEventListener('change', function() {
            const isChecked = this.checked;
            seasonalLines.forEach(lineName => {
                if (mbtaStopsData[lineName] && layers[lineName]) {
                    if (isChecked) {
                        map.addLayer(layers[lineName]);
                    } else {
                        map.removeLayer(layers[lineName]);
                    }
                }
            });
            updateStats();
        });
        
        // Seasonal rail live tracking filter
        document.getElementById('show-seasonal-live').addEventListener('change', function() {
            const isChecked = this.checked;
            
            // Hide/show train markers for seasonal rail lines ONLY
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    if (seasonalLines.includes(marker.routeName)) {
                        if (isChecked) {
                            marker.addTo(map);
                        } else {
                            marker.remove();
                        }
                    }
                }
            });
            
            // Control live tracking for seasonal rail lines
            if (isChecked) {
                // Resume live tracking if it was stopped
                if (!trackingInterval) {
                    startLiveTracking();
                }
            } else {
                // Check if any other services are still active for live tracking
                const hasSubway = document.getElementById('show-subway-live').checked;
                const hasCommuter = document.getElementById('show-commuter-live').checked;
                const hasBus = document.getElementById('show-bus-live').checked;
                const hasSilver = document.getElementById('show-silver-line-live').checked;
                const hasFerry = document.getElementById('show-ferry-live').checked;
                
                // If no categories are checked, stop live tracking
                if (!hasSubway && !hasCommuter && !hasBus && !hasSilver && !hasFerry) {
                    stopLiveTracking();
                }
            }
            
            updateStats();
        });
        
        // Bus paths filter - OPTIMIZED
        document.getElementById('show-bus-paths').addEventListener('change', function() {
            const isChecked = this.checked;
            
            if (mbtaBusData && typeof mbtaBusData === 'object') {
                if (isChecked) {
                    // Load bus routes progressively when checkbox is enabled
                    loadBusRoutesChunked(true);
                    
                    // Also show bus stops if zoom level is sufficient
                    if (map.getZoom() >= BUS_STOPS_MIN_ZOOM) {
                        if (busStopLayers.size === 0) {
                            createBusStopMarkers();
                        }
                        busStopLayers.forEach((layer, lineName) => {
                            if (layers[lineName] && map.hasLayer(layers[lineName])) {
                                layer.addTo(map);
                            }
                        });
                    }
                } else {
                    // Hide all bus route layers
                    Object.keys(mbtaBusData).forEach(lineName => {
                        if (mbtaStopsData && mbtaStopsData[lineName]) return;
                        if (layers[lineName]) {
                            map.removeLayer(layers[lineName]);
                        }
                    });
                    
                    // Also hide bus stops
                    busStopLayers.forEach((layer) => {
                        if (map.hasLayer(layer)) {
                            map.removeLayer(layer);
                        }
                    });
                    
                    // Hide loading indicator if it's showing
                    const loadingIndicator = document.getElementById('bus-loading-indicator');
                    if (loadingIndicator) {
                        loadingIndicator.style.display = 'none';
                    }
                }
            }
            updateStats();
        });
        
        // Bus live tracking filter
        document.getElementById('show-bus-live').addEventListener('change', function() {
            const isChecked = this.checked;
            
            // Hide/show bus markers
            busMarkers.forEach((marker, busId) => {
                if (marker) {
                    if (isChecked) {
                        marker.addTo(map);
                    } else {
                        marker.remove();
                    }
                }
            });
            
            // Control live tracking for bus routes
            if (isChecked) {
                // Resume live tracking if it was stopped
                if (!trackingInterval) {
                    startLiveTracking();
                }
            } else {
                // Check if any other services are still active for live tracking
                const hasSubway = document.getElementById('show-subway-live').checked;
                const hasCommuter = document.getElementById('show-commuter-live').checked;
                const hasSeasonal = document.getElementById('show-seasonal-live').checked;
                const hasShuttle = document.getElementById('show-shuttle-live').checked;
                const hasSilver = document.getElementById('show-silver-line-live').checked;
                const hasFerry = document.getElementById('show-ferry-live').checked;
                
                // If no categories are checked, stop live tracking
                if (!hasSubway && !hasCommuter && !hasSeasonal && !hasShuttle && !hasSilver && !hasFerry) {
                    stopLiveTracking();
                }
            }
            
            updateStats();
        });
        
        // Shuttle paths filter
        document.getElementById('show-shuttle-paths').addEventListener('change', function() {
            const isChecked = this.checked;
            
            if (mbtaShuttleData && typeof mbtaShuttleData === 'object') {
                if (isChecked) {
                    // Load shuttle routes when checkbox is enabled
                    loadShuttleRoutesChunked(true);
                } else {
                    // Hide all shuttle route layers
                    Object.keys(mbtaShuttleData).forEach(lineName => {
                        if (layers[lineName]) {
                            map.removeLayer(layers[lineName]);
                        }
                    });
                }
            }
            updateStats();
        });
        
        // Shuttle live tracking filter
        document.getElementById('show-shuttle-live').addEventListener('change', function() {
            const isChecked = this.checked;
            
            // Hide/show shuttle markers
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker) {
                    if (isChecked) {
                        marker.addTo(map);
                    } else {
                        marker.remove();
                    }
                }
            });
            
            // Control live tracking for shuttles
            if (isChecked) {
                // Resume live tracking if it was stopped
                if (!trackingInterval) {
                    startLiveTracking();
                }
            } else {
                // Check if any other services are still active for live tracking
                const hasSubway = document.getElementById('show-subway-live').checked;
                const hasCommuter = document.getElementById('show-commuter-live').checked;
                const hasSeasonal = document.getElementById('show-seasonal-live').checked;
                const hasBus = document.getElementById('show-bus-live').checked;
                const hasSilver = document.getElementById('show-silver-line-live').checked;
                const hasFerry = document.getElementById('show-ferry-live').checked;
                
                // If no categories are checked, stop live tracking
                if (!hasSubway && !hasCommuter && !hasSeasonal && !hasBus && !hasSilver && !hasFerry) {
                    stopLiveTracking();
                }
            }
            
            updateStats();
        });
        
        // Silver Line paths filter
        document.getElementById('show-silver-line-paths').addEventListener('change', function() {
            const isChecked = this.checked;
            
            if (silverLineData && typeof silverLineData === 'object') {
                if (isChecked) {
                    // Load Silver Line routes when checkbox is enabled
                    loadSilverLineRoutes();
                } else {
                    // Hide all Silver Line route layers
                    Object.keys(silverLineData).forEach(lineName => {
                        if (layers[lineName]) {
                            map.removeLayer(layers[lineName]);
                        }
                    });
                }
            }
            updateStats();
        });
        
        // Silver Line live tracking filter
        document.getElementById('show-silver-line-live').addEventListener('change', function() {
            const isChecked = this.checked;
            
            // Hide/show Silver Line markers
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker) {
                    if (isChecked) {
                        marker.addTo(map);
                    } else {
                        marker.remove();
                    }
                }
            });
            
            // Control live tracking for Silver Line
            if (isChecked) {
                // Resume live tracking if it was stopped
                if (!trackingInterval) {
                    startLiveTracking();
                }
            } else {
                // Check if any other services are still active for live tracking
                const hasSubway = document.getElementById('show-subway-live').checked;
                const hasCommuter = document.getElementById('show-commuter-live').checked;
                const hasSeasonal = document.getElementById('show-seasonal-live').checked;
                const hasBus = document.getElementById('show-bus-live').checked;
                const hasShuttle = document.getElementById('show-shuttle-live').checked;
                const hasFerry = document.getElementById('show-ferry-live').checked;
                
                // If no categories are checked, stop live tracking
                if (!hasSubway && !hasCommuter && !hasSeasonal && !hasBus && !hasShuttle && !hasFerry) {
                    stopLiveTracking();
                }
            }
            
            updateStats();
        });
        
        // Ferry paths filter
        document.getElementById('show-ferry-paths').addEventListener('change', function() {
            const isChecked = this.checked;
            ferryLines.forEach(lineName => {
                if (mbtaFerryData[lineName] && layers[lineName]) {
                    if (isChecked) {
                        map.addLayer(layers[lineName]);
                    } else {
                        map.removeLayer(layers[lineName]);
                    }
                }
            });
            updateStats();
        });
        
        // Ferry live tracking filter
        document.getElementById('show-ferry-live').addEventListener('change', function() {
            const isChecked = this.checked;
            
            // Hide/show ferry markers
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker) {
                    if (isChecked) {
                        marker.addTo(map);
                    } else {
                        marker.remove();
                    }
                }
            });
            
            // Control live tracking for ferry routes
            if (isChecked) {
                // Resume live tracking if it was stopped
                if (!trackingInterval) {
                    startLiveTracking();
                }
            } else {
                // Check if any other services are still active for live tracking
                const hasSubway = document.getElementById('show-subway-live').checked;
                const hasCommuter = document.getElementById('show-commuter-live').checked;
                const hasSeasonal = document.getElementById('show-seasonal-live').checked;
                const hasBus = document.getElementById('show-bus-live').checked;
                
                // If no categories are checked, stop live tracking
                if (!hasSubway && !hasCommuter && !hasSeasonal && !hasBus) {
                    stopLiveTracking();
                }
            }
            
            updateStats();
        });
        
        // LIRR paths filter (if LIRR data is available)
        const lirrPathsCheckbox = document.getElementById('show-lirr-paths');
        if (lirrPathsCheckbox && lirrLines.length > 0) {
            lirrPathsCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                if (!lirrRoutesLoaded && !lirrRoutesLoading) {
                    // Load LIRR routes if not already loaded
                    loadLIRRRoutes(isChecked);
                } else if (lirrRoutesLoaded) {
                    // Toggle visibility of already loaded routes
                    lirrLines.forEach(lineName => {
                        if (layers[lineName]) {
                            if (isChecked) {
                                map.addLayer(layers[lineName]);
                            } else {
                                map.removeLayer(layers[lineName]);
                            }
                        }
                    });
                }
                
                updateStats();
            });
        }
        
        // LIRR live tracking filter (if LIRR data is available)
        const lirrLiveCheckbox = document.getElementById('show-lirr-live');
        if (lirrLiveCheckbox && lirrLines.length > 0) {
            lirrLiveCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                // Hide/show LIRR train markers
                lirrMarkers.forEach((marker, trainId) => {
                    if (marker) {
                        if (isChecked) {
                            marker.addTo(map);
                        } else {
                            marker.remove();
                        }
                    }
                });
                
                // Control live tracking for LIRR
                if (isChecked) {
                    if (!lirrTrackingInterval) {
                        startLIRRTracking();
                    }
                } else {
                    if (lirrTrackingInterval) {
                        clearInterval(lirrTrackingInterval);
                        lirrTrackingInterval = null;
                    }
                }
                
                updateStats();
            });
            
            // Start LIRR tracking if checkbox is checked by default
            if (lirrLiveCheckbox.checked) {
                setTimeout(() => {
                    startLIRRTracking();
                }, 2000); // Start after 2 seconds to let everything load
            }
        }
        
        // Color scheme for different lines
        const lineColors = {
            'Red Line': '#DA291C',
            'Orange Line': '#FF6600',
            'Blue Line': '#003DA5',
            'Green Line B': '#00843D',
            'Green Line C': '#00843D',
            'Green Line D': '#00843D',
            'Green Line E': '#00843D',
            'Mattapan Trolley': '#DA291C',
            'Fairmount Line': '#800080',
            'Fall River/New Bedford Line': '#800080',
            'Fitchburg Line': '#800080',
            'Foxboro Event Service': '#800080',
            'Framingham/Worcester Line': '#800080',
            'Franklin/Foxboro Line': '#800080',
            'Greenbush Line': '#800080',
            'Haverhill Line': '#800080',
            'Kingston Line': '#800080',
            'Lowell Line': '#800080',
            'Needham Line': '#800080',
            'Newburyport/Rockport Line': '#800080',
            'Providence/Stoughton Line': '#800080',
            // Bus routes - all yellow
            '71': '#FFD700',
            '73': '#FFD700',
            // Ferry routes - all blue
            'Boat-F4': '#008EAA',
            'Boat-F1': '#008EAA',
            'Boat-EastBoston': '#008EAA',
            'Boat-Lynn': '#008EAA',
            'Boat-F6': '#008EAA',
            'Boat-F7': '#008EAA',
            'Boat-F8': '#008EAA',
            // Silver Line routes - official MBTA color
            'SL1': '#7C878E',
            'SL2': '#7C878E',
            'SL3': '#7C878E',
            'SL4': '#7C878E',
            'SL5': '#7C878E',
            'SLW': '#7C878E'
        };
        
        // Add LIRR route colors dynamically if data is available
        if (typeof lirrRoutesData !== 'undefined' && lirrRoutesData && lirrRoutesData.routes) {
            Object.keys(lirrRoutesData.routes).forEach(routeName => {
                const route = lirrRoutesData.routes[routeName];
                // Use route-specific color or default LIRR navy blue
                const color = route.color || '#00305E';
                // Ensure color has # prefix if it doesn't
                lineColors[routeName] = color.startsWith('#') ? color : '#' + color;
            });
        }

        
                    // Create markers and tracks for all routes
            const markers = [];
            const stopMarkers = new Map(); // Track markers by stopId for multi-line stops
            
            if (typeof mbtaStopsData !== 'undefined' && typeof routeShapes !== 'undefined') {
                
                let totalTracksDrawn = 0;
                let totalStopsDrawn = 0;
                
                // Batch processing for better performance
                const processRoute = (lineName, stops, color) => {
                    const routeMarkers = [];
                    const routeTracks = [];
                    
                    // Process track shapes
                    if (routeShapes[lineName] && routeShapes[lineName].length > 0) {
                        routeShapes[lineName].forEach((shape, shapeIndex) => {
                            if (shape.coords && shape.coords.length > 1) {
                                // Optimized duplicate coordinate removal
                                const cleanCoords = [];
                                let prevLat = null, prevLon = null;
                                
                                for (let i = 0; i < shape.coords.length; i++) {
                                    const coord = shape.coords[i];
                                    if (prevLat !== coord[0] || prevLon !== coord[1]) {
                                        cleanCoords.push(coord);
                                        prevLat = coord[0];
                                        prevLon = coord[1];
                                    }
                                }
                                
                                if (cleanCoords.length > 1) {
                                    // Determine which pane to use based on line type
                                    let pane = 'subwayPane';
                                    if (commuterLines.includes(lineName) || seasonalLines.includes(lineName)) {
                                        pane = 'commuterRailPane';
                                    }
                                    
                                    const trackLine = L.polyline(cleanCoords, {
                                        color: color,
                                        weight: 3,
                                        opacity: 0.7,
                                        pane: pane
                                    });
                                    
                                    trackLine.bindPopup(`<b>${lineName}</b> Shape ${shapeIndex + 1} Track`);
                                    routeTracks.push(trackLine);
                                    totalTracksDrawn++;
                                }
                            }
                        });
                    }
                    
                    // Process stop markers - create separate marker for each line
                    stops.forEach(stop => {
                        const stopRoutes = stopToRoutes[stop.stopId] || [];
                        const isMultiLine = stopRoutes.length > 1;
                        
                        // Determine if this is a true transfer stop (multiple service types)
                        const serviceTypes = new Set();
                        stopRoutes.forEach(route => {
                            // Categorize by line type
                            if (route === 'Red Line') serviceTypes.add('Red');
                            else if (route === 'Orange Line') serviceTypes.add('Orange');
                            else if (route === 'Blue Line') serviceTypes.add('Blue');
                            else if (route.startsWith('Green Line')) serviceTypes.add('Green');
                            else if (commuterLines.includes(route) || seasonalLines.includes(route)) {
                                // Each commuter rail line counts as its own type for transfer detection
                                serviceTypes.add('Commuter-' + route);
                            }
                        });
                        
                        const isTransferStop = serviceTypes.size > 1;
                        const stopFillColor = isTransferStop ? '#FFFFFF' : color;
                        
                        // Set radius based on stop type only, not on number of lines (reduced size)
                        let baseRadius;
                        if (stop.type === 'Bus' || stop.type === 'Shuttle') {
                            baseRadius = 3.5; // Bus/shuttle stops (smaller)
                        } else {
                            baseRadius = 5; // Subway/rail stops (smaller)
                        }
                        
                        // Calculate initial radius based on current zoom
                        const currentZoom = map.getZoom();
                        const radius = getStopRadius(baseRadius, currentZoom);
                        
                        // Create a NEW marker for THIS line (each line gets its own marker instance)
                        const marker = L.circleMarker(stop.coords, {
                            pane: 'stopsPane',
                            radius: radius,
                            baseRadius: baseRadius, // Store for zoom updates
                            fillColor: stopFillColor,
                            color: '#fff',
                            weight: 1.5,
                            opacity: 1,
                            fillOpacity: 0.8,
                            colors: isMultiLine ? [color] : undefined,
                            // Increase the interactive area for easier clicking
                            interactive: true,
                            bubblingMouseEvents: false
                        });
                        
                        // Create a larger invisible hit area for easier clicking
                        const hitRadius = 15; // Larger click radius
                        marker.on('add', function() {
                            const element = marker.getElement();
                            if (element) {
                                // Increase the pointer-events area
                                element.style.pointerEvents = 'auto';
                                element.style.cursor = 'pointer';
                                // Add padding to make click area larger
                                const currentRadius = parseFloat(element.getAttribute('r') || '6');
                                element.setAttribute('data-original-radius', currentRadius);
                                // Create larger invisible circle for clicking
                                const parent = element.parentElement;
                                if (parent) {
                                    const hitCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                                    hitCircle.setAttribute('cx', element.getAttribute('cx'));
                                    hitCircle.setAttribute('cy', element.getAttribute('cy'));
                                    hitCircle.setAttribute('r', hitRadius);
                                    hitCircle.setAttribute('fill', 'transparent');
                                    hitCircle.setAttribute('stroke', 'none');
                                    hitCircle.style.pointerEvents = 'auto';
                                    hitCircle.style.cursor = 'pointer';
                                    parent.insertBefore(hitCircle, element);
                                }
                            }
                        });
                        
                        const popupText = isMultiLine ? 
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: ${stop.type}<br>Lines: ${stopRoutes.join(', ')}<br>Coordinates: ${stop.coords[0].toFixed(6)}, ${stop.coords[1].toFixed(6)}</div>` :
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: ${stop.type}<br>Line: ${lineName}<br>Coordinates: ${stop.coords[0].toFixed(6)}, ${stop.coords[1].toFixed(6)}</div>`;
                        
                        // Use tooltip for all stops, direction based on latitude
                        const tooltipDirection = stop.coords[0] < 42.361220 ? 'bottom' : 'top';
                        marker.bindTooltip(popupText, { 
                            direction: tooltipDirection,
                            permanent: false,
                            interactive: true,
                            className: 'custom-tooltip'
                        });
                        
                        // Add click handler for all subway and commuter rail stops
                        if (stop.type === 'Subway' || stop.type === 'Commuter Rail') {
                            marker.on('click', function(e) {
                                // Prevent map click from firing
                                L.DomEvent.stopPropagation(e);
                                
                                // Get all routes serving this stop
                                const servingRoutes = stopToRoutes && stop.stopId ? stopToRoutes[stop.stopId] : [lineName];
                                
                                // Check if these routes are already highlighted
                                const alreadyHighlighted = Array.isArray(highlightedLine) 
                                    ? JSON.stringify(highlightedLine.sort()) === JSON.stringify(servingRoutes.sort())
                                    : highlightedLine === lineName && servingRoutes.length === 1;
                                
                                // If something else is already highlighted and this isn't part of it, do nothing
                                if (highlightedLine && !alreadyHighlighted) {
                                    // Check if any of the serving routes are currently dimmed
                                    const isCurrentlyDimmed = Array.isArray(highlightedLine)
                                        ? !servingRoutes.some(route => highlightedLine.includes(route))
                                        : !servingRoutes.includes(highlightedLine);
                                    
                                    if (isCurrentlyDimmed) {
                                        // Don't allow highlighting a dimmed line - do nothing
                                        return;
                                    }
                                }
                                
                                // If clicking the same stop/routes, reset; otherwise highlight
                                if (alreadyHighlighted) {
                                    resetHighlight();
                                } else {
                                    highlightMultipleLines(servingRoutes);
                                }
                            });
                        }
                        
                        routeMarkers.push(marker);
                        totalStopsDrawn++;
                    });
                    
                    return { markers: routeMarkers, tracks: routeTracks };
                };
                
                // Process routes in chunks to prevent UI freezing
                const routes = Object.entries(mbtaStopsData);
                const chunkSize = 5; // Process 5 routes at a time
                
                const processChunk = (startIndex) => {
                    const endIndex = Math.min(startIndex + chunkSize, routes.length);
                    const chunk = routes.slice(startIndex, endIndex);
                    
                    chunk.forEach(([lineName, stops]) => {
                        const color = lineColors[lineName] || '#666';
                        const result = processRoute(lineName, stops, color);
                        
                        // Batch add markers and tracks to layers
                        result.markers.forEach(marker => {
                            markers.push(marker);
                            layers[lineName].addLayer(marker);
                        });
                        
                        result.tracks.forEach(track => {
                            markers.push(track);
                            layers[lineName].addLayer(track);
                        });
                    });
                    
                    // Process next chunk if there are more routes
                    if (endIndex < routes.length) {
                        setTimeout(() => processChunk(endIndex), 10); // 10ms delay between chunks
                    } else {
        
                    }
                };
                
                // Start processing
                processChunk(0);
                
            } else {
                console.error('Cannot create markers: mbtaStopsData or routeShapes is undefined');
            }
            
            // Create bus route markers and tracks - OPTIMIZED WITH CHUNKED LOADING
            // Don't load all bus routes at once - only initialize layers
            if (mbtaBusData) {
                // Just initialize empty layer groups for now
                Object.keys(mbtaBusData).forEach(lineName => {
                    if (mbtaStopsData && mbtaStopsData[lineName]) {
                        return; // Skip subway/commuter rail
                    }
                    layers[lineName] = L.layerGroup();
                });
            }
            
            // Create ferry route markers and tracks
            if (mbtaFerryData && ferryRouteShapes) {
                Object.keys(mbtaFerryData).forEach(lineName => {
                    const stops = mbtaFerryData[lineName];
                    const color = '#008EAA'; // Ferry blue color
                    const routeMarkers = [];
                    const routeTracks = [];
                    
                    // Process ferry route shapes
                    if (ferryRouteShapes[lineName] && ferryRouteShapes[lineName].length > 0) {
                        ferryRouteShapes[lineName].forEach((shape, shapeIndex) => {
                            if (shape.coords && shape.coords.length > 1) {
                                const trackLine = L.polyline(shape.coords, {
                                    color: color,
                                    weight: 3,
                                    opacity: 0.8,
                                    pane: 'ferryPane'
                                });
                                
                                trackLine.bindPopup(`<b>Ferry Route ${lineName}</b> Shape ${shapeIndex + 1}`);
                                routeTracks.push(trackLine);
                            }
                        });
                    }
                    
                    // Process ferry stop markers
                    stops.forEach(stop => {
                        const marker = L.circleMarker(stop.coords, {
                            pane: 'stopsPane',
                            radius: 6,
                            fillColor: color,
                            color: '#fff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.9
                        });
                        
                        // Use tooltip for all stops, direction based on latitude
                        const stopContent = `
                            <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                                <b>${stop.name}</b><br>
                                Type: ${stop.type}<br>
                                Route: ${lineName}<br>
                                Coordinates: ${stop.coords[0].toFixed(6)}, ${stop.coords[1].toFixed(6)}
                            </div>
                        `;
                        const tooltipDirection = stop.coords[0] < 42.361220 ? 'bottom' : 'top';
                        marker.bindTooltip(stopContent, { 
                            direction: tooltipDirection,
                            permanent: false,
                            interactive: true,
                            className: 'custom-tooltip'
                        });
                        
                        routeMarkers.push(marker);
                    });
                    
                    // Add markers and tracks to layers
                    routeMarkers.forEach(marker => {
                        layers[lineName].addLayer(marker);
                    });
                    
                    routeTracks.forEach(track => {
                        layers[lineName].addLayer(track);
                    });
                });
            }
        
        // Update stats display (no-op since stats were removed)
        function updateStats() {
            // Stats display was removed - function kept for compatibility
        }
        
        // Function to load a single route (bus, shuttle, or silver line)
        function loadSingleRoute(routeKey, routeType = 'bus') {
            // Check if the layer already exists and has content
            if (layers[routeKey] && layers[routeKey].getLayers().length > 0) {
                return;
            }
            
            // Create layer if it doesn't exist
            if (!layers[routeKey]) {
                layers[routeKey] = L.layerGroup();
            }
            
            let routeData = null;
            let routeShapes = null;
            let color = '#FFD700';
            let displayName = routeKey;
            
            // Get data based on route type
            if (routeType === 'bus') {
                routeData = mbtaBusData[routeKey];
                routeShapes = typeof busRouteShapes !== 'undefined' ? busRouteShapes[routeKey] : null;
                color = lineColors[routeKey] || '#FFD700';
                displayName = `Bus Route ${routeKey}`;
            } else if (routeType === 'shuttle') {
                routeData = mbtaShuttleData[routeKey];
                routeShapes = typeof shuttleRouteShapes !== 'undefined' ? shuttleRouteShapes[routeKey] : null;
                color = lineColors[routeKey] || '#FF6B6B';
                displayName = `Shuttle ${routeKey}`;
            } else if (routeType === 'silver') {
                routeData = silverLineData[routeKey];
                routeShapes = typeof silverLineShapes !== 'undefined' ? silverLineShapes[routeKey] : null;
                color = lineColors[routeKey] || '#7C878E';
                displayName = `Silver Line ${routeKey}`;
            }
            
            // Load route shapes if available
            if (routeShapes && routeShapes.length > 0) {
                routeShapes.forEach((shape, shapeIndex) => {
                    let coords = null;
                    
                    // Handle encoded polyline format (from API)
                    if (shape.polyline && typeof polyline !== 'undefined') {
                        coords = polyline.decode(shape.polyline);
                    }
                    // Handle coordinate array format (from GTFS)
                    else if (shape.coords && Array.isArray(shape.coords)) {
                        coords = shape.coords;
                    }
                    
                    if (coords && coords.length > 1) {
                        const trackLine = L.polyline(coords, {
                            color: color,
                            weight: 4,
                            opacity: 0.7,
                            pane: 'busPane'
                        });
                        trackLine.bindPopup(`<b>${displayName}</b>`);
                        layers[routeKey].addLayer(trackLine);
                    }
                });
            }
        }
        
        // Function to load bus routes - SIMPLIFIED (tracks only, no stop markers)
        function loadBusRoutesChunked(showOnMap = false) {
            if (busRoutesLoaded || busRoutesLoading) {
                // Already loaded or loading - just show/hide as needed
                if (busRoutesLoaded) {
                    Object.keys(mbtaBusData).forEach(lineName => {
                        if (mbtaStopsData && mbtaStopsData[lineName]) return;
                        if (layers[lineName]) {
                            if (showOnMap) {
                                map.addLayer(layers[lineName]);
                            } else {
                                map.removeLayer(layers[lineName]);
                            }
                        }
                    });
                }
                return;
            }
            
            busRoutesLoading = true;
            const busRoutes = Object.keys(mbtaBusData).filter(lineName => {
                return !mbtaStopsData || !mbtaStopsData[lineName];
            });
            
            
            // Show loading indicator
            const loadingIndicator = document.getElementById('bus-loading-indicator');
            const loadingText = document.getElementById('bus-loading-text');
            if (loadingIndicator) {
                loadingIndicator.style.display = '';
            }
            
            // Process routes in chunks - ONLY SHOW ROUTE LINES, NOT INDIVIDUAL STOPS
            const CHUNK_SIZE = 20; // Process 20 routes at a time
            let currentIndex = 0;
            
            const processChunk = () => {
                const endIndex = Math.min(currentIndex + CHUNK_SIZE, busRoutes.length);
                
                for (let i = currentIndex; i < endIndex; i++) {
                    const lineName = busRoutes[i];
                    const stops = mbtaBusData[lineName];
                    const color = lineColors[lineName] || '#FFD700';
                    
                    // ONLY render route shapes if available - skip individual stop markers for performance
                    if (typeof busRouteShapes !== 'undefined' && busRouteShapes[lineName] && busRouteShapes[lineName].length > 0) {
                        busRouteShapes[lineName].forEach((shape, shapeIndex) => {
                            let coords = null;
                            
                            // Handle encoded polyline format (from API)
                            if (shape.polyline && typeof polyline !== 'undefined') {
                                coords = polyline.decode(shape.polyline);
                            }
                            // Handle coordinate array format (from GTFS)
                            else if (shape.coords && Array.isArray(shape.coords)) {
                                coords = shape.coords;
                            }
                            
                            if (coords && coords.length > 1) {
                                const trackLine = L.polyline(coords, {
                                    color: color,
                                    weight: 4,
                                    opacity: 1.0
                                });
                                trackLine.bindPopup(`<b>Bus Route ${lineName}</b>`);
                                layers[lineName].addLayer(trackLine);
                            }
                        });
                    }
                    // If no route shapes, don't draw any fallback lines
                    
                    // Add to map if requested
                    if (showOnMap && layers[lineName]) {
                        layers[lineName].addTo(map);
                    }
                }
                
                currentIndex = endIndex;
                
                // Update progress
                const progress = Math.round((currentIndex / busRoutes.length) * 100);
                
                // Update loading text
                if (loadingText) {
                    loadingText.textContent = `Loading bus routes... ${progress}%`;
                }
                
                // Process next chunk if there are more routes
                if (currentIndex < busRoutes.length) {
                    setTimeout(() => processChunk(), 10); // 10ms delay between chunks
                } else {
                    busRoutesLoaded = true;
                    busRoutesLoading = false;
                    
                    // Hide loading indicator
                    if (loadingIndicator) {
                        loadingIndicator.style.display = 'none';
                    }
                    
                }
            };
            
            // Start processing
            processChunk();
        }
        
        // Function to create bus stop markers (called once when needed)
        function createBusStopMarkers() {
            if (busStopLayers.size > 0) {
                return; // Already created
            }
            
            // First pass: Build busStopToRoutes mapping
            busStopToRoutes.clear();
            Object.keys(mbtaBusData).forEach(lineName => {
                // Skip if this is a subway line (in mbtaStopsData)
                if (mbtaStopsData && mbtaStopsData[lineName]) return;
                
                const stops = mbtaBusData[lineName];
                stops.forEach(stop => {
                    const stopKey = stop.stopId;
                    if (!busStopToRoutes.has(stopKey)) {
                        busStopToRoutes.set(stopKey, []);
                    }
                    if (!busStopToRoutes.get(stopKey).includes(lineName)) {
                        busStopToRoutes.get(stopKey).push(lineName);
                    }
                });
            });
            
            // Second pass: Create markers - separate marker instance for each route
            Object.keys(mbtaBusData).forEach(lineName => {
                // Skip if this is a subway line (in mbtaStopsData)
                if (mbtaStopsData && mbtaStopsData[lineName]) return;
                
                const stops = mbtaBusData[lineName];
                const color = lineColors[lineName] || '#FFD700';
                
                if (!busStopLayers.has(lineName)) {
                    busStopLayers.set(lineName, L.layerGroup());
                }
                
                const layer = busStopLayers.get(lineName);
                
                stops.forEach(stop => {
                    const stopKey = stop.stopId;
                    const servingRoutes = busStopToRoutes.get(stopKey) || [lineName];
                    const isMultiRoute = servingRoutes.length > 1;
                    
                    // Create a NEW marker instance for THIS route (each route gets its own marker)
                    const baseRadius = 3.5; // Bus stops (smaller)
                    const currentZoom = map.getZoom();
                    const radius = getStopRadius(baseRadius, currentZoom);
                    
                    const marker = L.circleMarker(stop.coords, {
                        pane: 'stopsPane',
                        radius: radius,
                        baseRadius: baseRadius, // Store for zoom updates
                        fillColor: color,
                        color: '#fff',
                        weight: 1.5,
                        opacity: 1,
                        fillOpacity: 0.8,
                        interactive: true,
                        bubblingMouseEvents: false
                    });
                    
                    // Build tooltip text showing all routes
                    const routesText = isMultiRoute ? servingRoutes.join(', ') : lineName;
                    const tooltipText = `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>${isMultiRoute ? 'Routes' : 'Route'}: ${routesText}<br>Type: ${stop.type}</div>`;
                    marker.bindTooltip(tooltipText, {
                        direction: 'top',
                        permanent: false,
                        interactive: true,
                        className: 'custom-tooltip'
                    });
                    
                    // Add click handler to highlight all serving routes
                    marker.on('click', function(e) {
                        // Prevent map click from firing
                        L.DomEvent.stopPropagation(e);
                        
                        // Get all routes serving this stop
                        const routes = busStopToRoutes.get(stopKey) || [lineName];
                        
                        // Check if these routes are already highlighted
                        const alreadyHighlighted = Array.isArray(highlightedLine) 
                            ? JSON.stringify(highlightedLine.sort()) === JSON.stringify(routes.sort())
                            : highlightedLine === routes[0] && routes.length === 1;
                        
                        // If something else is already highlighted, check if this is part of it
                        if (highlightedLine && !alreadyHighlighted) {
                            const isCurrentlyDimmed = Array.isArray(highlightedLine)
                                ? !routes.some(route => highlightedLine.includes(route))
                                : !routes.includes(highlightedLine);
                            
                            if (isCurrentlyDimmed) {
                                // Don't allow highlighting a dimmed stop - do nothing
                                return;
                            }
                        }
                        
                        // If clicking the same stop/routes, reset; otherwise highlight
                        if (alreadyHighlighted) {
                            resetHighlight();
                        } else {
                            highlightMultipleLines(routes);
                        }
                    });
                    
                    // Add this marker to this route's layer
                    layer.addLayer(marker);
                });
            });
        }
        
        // Function to toggle bus stops visibility
        function toggleBusStopsVisibility(show) {
            if (show) {
                // Create stops if they don't exist yet
                if (busStopLayers.size === 0) {
                    createBusStopMarkers();
                }
                
                // If a line is highlighted, only show that line's stops
                if (highlightedLine) {
                    const linesToShow = Array.isArray(highlightedLine) ? highlightedLine : [highlightedLine];
                    busStopLayers.forEach((layer, lineName) => {
                        if (linesToShow.includes(lineName)) {
                            if (!map.hasLayer(layer)) {
                                layer.addTo(map);
                            }
                        } else {
                            if (map.hasLayer(layer)) {
                                map.removeLayer(layer);
                            }
                        }
                    });
                } else {
                    // No line highlighted - show bus stops for routes that are currently visible
                    busStopLayers.forEach((layer, lineName) => {
                        // Only show if the route itself is visible (checkbox checked)
                        if (layers[lineName] && map.hasLayer(layers[lineName])) {
                            layer.addTo(map);
                        }
                    });
                }
            } else {
                // Hide all bus stops (unless a line is highlighted)
                if (!highlightedLine) {
                    busStopLayers.forEach((layer) => {
                        if (map.hasLayer(layer)) {
                            map.removeLayer(layer);
                        }
                    });
                }
            }
        }
        
        // Function to load shuttle routes - similar to bus routes
        function loadShuttleRoutesChunked(showOnMap = false) {
            if (shuttleRoutesLoaded || shuttleRoutesLoading) {
                // Already loaded or loading - just show/hide as needed
                if (shuttleRoutesLoaded) {
                    Object.keys(mbtaShuttleData).forEach(lineName => {
                        if (layers[lineName]) {
                            if (showOnMap) {
                                map.addLayer(layers[lineName]);
                            } else {
                                map.removeLayer(layers[lineName]);
                            }
                        }
                    });
                }
                return;
            }
            
            shuttleRoutesLoading = true;
            const shuttleRoutes = Object.keys(mbtaShuttleData);
            
            // Process routes
            for (let i = 0; i < shuttleRoutes.length; i++) {
                const lineName = shuttleRoutes[i];
                const stops = mbtaShuttleData[lineName];
                const color = lineColors[lineName] || '#FF6B6B'; // Default shuttle red
                
                // Render route shapes if available
                if (typeof shuttleRouteShapes !== 'undefined' && shuttleRouteShapes[lineName] && shuttleRouteShapes[lineName].length > 0) {
                    shuttleRouteShapes[lineName].forEach((shape, shapeIndex) => {
                        let coords = null;
                        
                        // Handle encoded polyline format (from API)
                        if (shape.polyline && typeof polyline !== 'undefined') {
                            coords = polyline.decode(shape.polyline);
                        }
                        // Handle coordinate array format (from GTFS)
                        else if (shape.coords && Array.isArray(shape.coords)) {
                            coords = shape.coords;
                        }
                        
                        if (coords && coords.length > 1) {
                            const trackLine = L.polyline(coords, {
                                color: color,
                                weight: 4,
                                opacity: 1.0
                            });
                            trackLine.bindPopup(`<b>Shuttle ${lineName}</b>`);
                            layers[lineName].addLayer(trackLine);
                        }
                    });
                }
                
                // Add to map if requested
                if (showOnMap && layers[lineName]) {
                    layers[lineName].addTo(map);
                }
            }
            
            shuttleRoutesLoaded = true;
            shuttleRoutesLoading = false;
        }
        
        // Function to load LIRR routes
        function loadLIRRRoutes(showOnMap = false) {
            if (lirrRoutesLoaded || lirrRoutesLoading) {
                // Already loaded or loading - just show/hide as needed
                if (lirrRoutesLoaded) {
                    lirrLines.forEach(lineName => {
                        if (layers[lineName]) {
                            if (showOnMap) {
                                map.addLayer(layers[lineName]);
                            } else {
                                map.removeLayer(layers[lineName]);
                            }
                        }
                    });
                }
                return;
            }
            
            // Check if LIRR data is available
            if (typeof lirrRoutesData === 'undefined' || !lirrRoutesData || !lirrRoutesData.routes) {
                console.warn('LIRR data not available. Please run parse-lirr-data.py first.');
                return;
            }
            
            lirrRoutesLoading = true;
            
            // Show loading indicator
            const loadingIndicator = document.getElementById('lirr-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'table-row';
            }
            
            // Process routes
            lirrLines.forEach(lineName => {
                const route = lirrRoutesData.routes[lineName];
                const color = lineColors[lineName] || '#00305E'; // Navy blue default
                
                // Render route shapes if available
                if (route.shapes && route.shapes.length > 0) {
                    route.shapes.forEach((shape, shapeIndex) => {
                        let coords = shape.coords;
                        
                        if (coords && Array.isArray(coords) && coords.length > 1) {
                            const trackLine = L.polyline(coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.8,
                                pane: 'lirrPane'
                            });
                            
                            trackLine.bindPopup(`<b>LIRR: ${lineName}</b><br>Route ID: ${route.route_id || 'N/A'}`);
                            
                            // Add click handler for highlighting
                            trackLine.on('click', function(e) {
                                L.DomEvent.stopPropagation(e);
                                
                                // Toggle highlighting
                                if (highlightedLIRRLine === lineName) {
                                    resetLIRRHighlight();
                                } else {
                                    highlightLIRRLine(lineName);
                                }
                            });
                            
                            layers[lineName].addLayer(trackLine);
                        }
                    });
                }
                
                // Add to map if requested
                if (showOnMap && layers[lineName]) {
                    layers[lineName].addTo(map);
                }
            });
            
            // Hide loading indicator
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            lirrRoutesLoaded = true;
            lirrRoutesLoading = false;
            
            // Load LIRR stations after routes
            loadLIRRStations();
        }
        
        // Function to load LIRR stations (visible at all zoom levels)
        function loadLIRRStations() {
            if (typeof lirrRoutesData === 'undefined' || !lirrRoutesData || !lirrRoutesData.routes) {
                return;
            }
            
            // First pass: Build a map of stop_id -> routes serving that stop
            const stopToRoutes = new Map();
            lirrLines.forEach(lineName => {
                const route = lirrRoutesData.routes[lineName];
                if (route && route.stops) {
                    route.stops.forEach(stop => {
                        if (!stopToRoutes.has(stop.stop_id)) {
                            stopToRoutes.set(stop.stop_id, {
                                stop: stop,
                                routes: []
                            });
                        }
                        stopToRoutes.get(stop.stop_id).routes.push(lineName);
                    });
                }
            });
            
            // Second pass: Create markers and add to route layers
            // Create a SEPARATE marker instance for each route (not shared)
            
            lirrLines.forEach(lineName => {
                const route = lirrRoutesData.routes[lineName];
                const color = lineColors[lineName] || '#00305E'; // Get route color
                
                if (!route || !route.stops) {
                    return;
                }
                
                // Add each stop to this route's layer
                route.stops.forEach(stop => {
                    if (stop.lat && stop.lon) {
                        // Get all routes serving this stop
                        const stopInfo = stopToRoutes.get(stop.stop_id);
                        const servingRoutes = stopInfo.routes;
                        const isMultiRoute = servingRoutes.length > 1;
                        
                        // Multi-route stops get white fill, single-route stops get route color
                        const fillColor = isMultiRoute ? '#FFFFFF' : color;
                        
                        // Calculate radius based on zoom
                        const baseRadius = 5; // LIRR stops (smaller)
                        const currentZoom = map.getZoom();
                        const radius = getStopRadius(baseRadius, currentZoom);
                        
                        // Create a NEW station marker for THIS route (each route gets its own marker instance)
                        const stationMarker = L.circleMarker([stop.lat, stop.lon], {
                            radius: radius,
                            baseRadius: baseRadius, // Store for zoom updates
                            fillColor: fillColor,
                            color: '#fff',
                            weight: 1.5,
                            opacity: 1,
                            fillOpacity: 0.8,
                            pane: 'stopsPane',
                            interactive: true,
                            bubblingMouseEvents: false
                        });
                        
                        // Build tooltip with all serving routes (matching MBTA style)
                        const routesText = isMultiRoute ? servingRoutes.join(', ') : lineName;
                        const tooltipText = isMultiRoute ? 
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Lines: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>` :
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Line: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>`;
                        
                        // Use tooltip direction based on latitude (matching MBTA style)
                        const tooltipDirection = stop.lat < 40.76 ? 'bottom' : 'top';
                        stationMarker.bindTooltip(tooltipText, { 
                            direction: tooltipDirection,
                            permanent: false,
                            interactive: true,
                            className: 'custom-tooltip'
                        });
                        
                        // Add click handler for highlighting
                        stationMarker.on('click', function(e) {
                            L.DomEvent.stopPropagation(e);
                            
                            // Get all routes serving this stop
                            const servingRoutes = stopInfo.routes;
                            
                            // Check if these routes are already highlighted
                            const alreadyHighlighted = Array.isArray(highlightedLIRRLine) 
                                ? JSON.stringify(highlightedLIRRLine.sort()) === JSON.stringify(servingRoutes.sort())
                                : highlightedLIRRLine === lineName && servingRoutes.length === 1;
                            
                            // If something else is already highlighted and this isn't part of it, do nothing
                            if (highlightedLIRRLine && !alreadyHighlighted) {
                                // Check if any of the serving routes are currently dimmed
                                const isCurrentlyDimmed = Array.isArray(highlightedLIRRLine)
                                    ? !servingRoutes.some(route => highlightedLIRRLine.includes(route))
                                    : !servingRoutes.includes(highlightedLIRRLine);
                                
                                if (isCurrentlyDimmed) {
                                    // Don't allow highlighting a dimmed line - do nothing
                                    return;
                                }
                            }
                            
                            // Toggle highlighting
                            if (alreadyHighlighted) {
                                resetLIRRHighlight();
                            } else {
                                if (servingRoutes.length > 1) {
                                    highlightMultipleLIRRLines(servingRoutes);
                                } else {
                                    highlightLIRRLine(servingRoutes[0]);
                                }
                            }
                        });
                        
                        // Add this marker to this route's layer
                        if (layers[lineName]) {
                            layers[lineName].addLayer(stationMarker);
                        }
                    }
                });
            });
        }
        
        // Function to load Silver Line routes
        function loadSilverLineRoutes() {
            if (!silverLineData || typeof silverLineData !== 'object') {
                console.warn('Silver Line data not available');
                return;
            }
            
            const silverRoutes = Object.keys(silverLineData);
            
            // Process routes
            silverRoutes.forEach(lineName => {
                const stops = silverLineData[lineName];
                const color = lineColors[lineName] || '#7C878E'; // Official MBTA Silver Line color
                
                // Create layer if it doesn't exist
                if (!layers[lineName]) {
                    layers[lineName] = L.layerGroup();
                }
                
                // Render route shapes if available
                if (typeof silverLineShapes !== 'undefined' && silverLineShapes[lineName] && silverLineShapes[lineName].length > 0) {
                    silverLineShapes[lineName].forEach((shape, shapeIndex) => {
                        if (shape.coords && Array.isArray(shape.coords) && shape.coords.length > 1) {
                            const trackLine = L.polyline(shape.coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.7,
                                pane: 'silverLinePane'
                            });
                            trackLine.bindPopup(`<b>Silver Line ${lineName}</b>`);
                            layers[lineName].addLayer(trackLine);
                        }
                    });
                }
                
                // Add stops as markers
                if (stops && Array.isArray(stops)) {
                    stops.forEach(stop => {
                        if (stop.coords && stop.coords.length === 2) {
                            const stopMarker = L.circleMarker([stop.coords[0], stop.coords[1]], {
                                pane: 'stopsPane',
                                radius: 4,
                                fillColor: color,
                                color: color,
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.8
                            });
                            stopMarker.bindTooltip(`<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Silver Line ${lineName}</div>`, {
                                direction: stop.coords[0] < 42.361220 ? 'bottom' : 'top',
                                permanent: false,
                                interactive: true,
                                className: 'custom-tooltip'
                            });
                            layers[lineName].addLayer(stopMarker);
                        }
                    });
                }
                
                // Add to map if checkbox is checked
                if (document.getElementById('show-silver-line-paths').checked && layers[lineName]) {
                    layers[lineName].addTo(map);
                }
            });
        }
        
        // Helper function to check if a line is currently highlighted
        function isLineHighlighted(lineName) {
            if (!highlightedLine) return false;
            if (Array.isArray(highlightedLine)) {
                return highlightedLine.length === 1 && highlightedLine[0] === lineName;
            }
            return highlightedLine === lineName;
        }
        
        // Function to highlight multiple lines (for multi-line stops)
        function highlightMultipleLines(lineNames) {
            if (!Array.isArray(lineNames) || lineNames.length === 0) return;
            
            // Store as array if multiple, or single string if one
            highlightedLine = lineNames.length === 1 ? lineNames[0] : lineNames;
            highlightedLIRRLine = null; // Clear LIRR highlighting
            
            // Always show highlighted lines (even if checkbox is off)
            lineNames.forEach(lineName => {
                if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                    map.addLayer(layers[lineName]);
                }
                // Always show stops for highlighted lines regardless of zoom
                // Create bus stops if they don't exist yet
                if (busStopLayers.size === 0) {
                    createBusStopMarkers();
                }
                if (busStopLayers.has(lineName)) {
                    if (!map.hasLayer(busStopLayers.get(lineName))) {
                        busStopLayers.get(lineName).addTo(map);
                    }
                }
            });
            
            // Remove dimmed layers from map or show highlighted ones
            Object.keys(layers).forEach(layerName => {
                const isDimmed = !lineNames.includes(layerName);
                
                if (isDimmed) {
                    // Remove dimmed layer from map
                    if (map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                } else {
                    // Ensure highlighted layer is on map
                    if (!map.hasLayer(layers[layerName])) {
                        map.addLayer(layers[layerName]);
                    }
                }
            });
            
            // Also handle bus stop layers separately - remove dimmed ones, show highlighted ones
            busStopLayers.forEach((layer, layerName) => {
                const isDimmed = !lineNames.includes(layerName);
                
                if (isDimmed) {
                    // Remove dimmed bus stop layers from the map
                    if (map.hasLayer(layer)) {
                        map.removeLayer(layer);
                    }
                } else {
                    // Always show highlighted route's stops regardless of zoom
                    if (!map.hasLayer(layer)) {
                        layer.addTo(map);
                    }
                }
            });
            
            // Remove/show live train markers (subway and commuter rail)
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    const isDimmed = !lineNames.includes(marker.routeName);
                    
                    if (isDimmed) {
                        // Remove dimmed marker from map
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Ensure highlighted marker is on map
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Remove/show live bus markers
            busMarkers.forEach((marker, busId) => {
                if (marker && marker.routeName) {
                    const isDimmed = !lineNames.includes(marker.routeName);
                    
                    if (isDimmed) {
                        // Remove dimmed marker from map
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Ensure highlighted marker is on map
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Remove/show live shuttle markers
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker && marker.routeName) {
                    const isDimmed = !lineNames.includes(marker.routeName);
                    
                    if (isDimmed) {
                        // Remove dimmed marker from map
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Ensure highlighted marker is on map
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Remove/show live Silver Line markers
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker && marker.routeName) {
                    const isDimmed = !lineNames.includes(marker.routeName);
                    
                    if (isDimmed) {
                        // Remove dimmed marker from map
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Ensure highlighted marker is on map
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Remove live ferry markers (always removed when any line is highlighted)
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide all LIRR lines when highlighting MBTA lines
            lirrLines.forEach(layerName => {
                if (layers[layerName] && map.hasLayer(layers[layerName])) {
                    map.removeLayer(layers[layerName]);
                }
            });
            
            // Remove all LIRR live train markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
        
        // Function to highlight a specific line and dim all others
        function highlightLine(lineName) {
            highlightedLine = lineName;
            highlightedLIRRLine = null; // Clear LIRR highlighting
            
            // Always show the highlighted line (even if checkbox is off)
            if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                map.addLayer(layers[lineName]);
            }
            // Always show stops for highlighted line regardless of zoom
            // Create bus stops if they don't exist yet
            if (busStopLayers.size === 0) {
                createBusStopMarkers();
            }
            if (busStopLayers.has(lineName)) {
                if (!map.hasLayer(busStopLayers.get(lineName))) {
                    busStopLayers.get(lineName).addTo(map);
                }
            }
            
            // Remove dimmed layers from map or show highlighted one
            Object.keys(layers).forEach(layerName => {
                const isDimmed = layerName !== lineName;
                
                if (isDimmed) {
                    // Remove dimmed layer from map
                    if (map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                } else {
                    // Ensure highlighted layer is on map
                    if (!map.hasLayer(layers[layerName])) {
                        map.addLayer(layers[layerName]);
                    }
                }
            });
            
            // Also handle bus stop layers separately - remove dimmed ones, show highlighted one
            busStopLayers.forEach((layer, layerName) => {
                const isDimmed = layerName !== lineName;
                
                if (isDimmed) {
                    // Remove dimmed bus stop layers from the map
                    if (map.hasLayer(layer)) {
                        map.removeLayer(layer);
                    }
                } else {
                    // Always show highlighted route's stops regardless of zoom
                    if (!map.hasLayer(layer)) {
                        layer.addTo(map);
                    }
                }
            });
            
            // Remove/show live train markers (subway and commuter rail)
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    const isDimmed = marker.routeName !== lineName;
                    
                    if (isDimmed) {
                        // Remove dimmed marker from map
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Ensure highlighted marker is on map
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Remove/show live bus markers
            busMarkers.forEach((marker, busId) => {
                if (marker && marker.routeName) {
                    const isDimmed = marker.routeName !== lineName;
                    
                    if (isDimmed) {
                        // Remove dimmed marker from map
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Ensure highlighted marker is on map
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Remove/show live shuttle markers
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker && marker.routeName) {
                    const isDimmed = marker.routeName !== lineName;
                    
                    if (isDimmed) {
                        // Remove dimmed marker from map
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Ensure highlighted marker is on map
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Remove/show live Silver Line markers
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker && marker.routeName) {
                    const isDimmed = marker.routeName !== lineName;
                    
                    if (isDimmed) {
                        // Remove dimmed marker from map
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Ensure highlighted marker is on map
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Remove live ferry markers (always removed when any line is highlighted)
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide all LIRR lines when highlighting MBTA lines
            lirrLines.forEach(layerName => {
                if (layers[layerName] && map.hasLayer(layers[layerName])) {
                    map.removeLayer(layers[layerName]);
                }
            });
            
            // Remove all LIRR live train markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
        
        // Function to reset all lines to normal opacity
        function resetHighlight() {
            highlightedLine = null;
            
            // Add layers back to map based on checkbox states
            Object.keys(layers).forEach(layerName => {
                // Check if this is a subway line
                if (subwayLines.includes(layerName)) {
                    if (document.getElementById('show-subway-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    } else {
                        if (map.hasLayer(layers[layerName])) {
                            map.removeLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a commuter rail line
                else if (commuterLines.includes(layerName)) {
                    if (document.getElementById('show-commuter-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    } else {
                        if (map.hasLayer(layers[layerName])) {
                            map.removeLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a seasonal rail line
                else if (seasonalLines.includes(layerName)) {
                    if (document.getElementById('show-seasonal-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    } else {
                        if (map.hasLayer(layers[layerName])) {
                            map.removeLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a bus route
                else if (typeof mbtaBusData !== 'undefined' && mbtaBusData[layerName]) {
                    if (document.getElementById('show-bus-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    } else {
                        if (map.hasLayer(layers[layerName])) {
                            map.removeLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a shuttle route
                else if (typeof mbtaShuttleData !== 'undefined' && mbtaShuttleData[layerName]) {
                    if (document.getElementById('show-shuttle-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    } else {
                        if (map.hasLayer(layers[layerName])) {
                            map.removeLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a Silver Line route
                else if (typeof silverLineData !== 'undefined' && silverLineData[layerName]) {
                    if (document.getElementById('show-silver-line-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    } else {
                        if (map.hasLayer(layers[layerName])) {
                            map.removeLayer(layers[layerName]);
                        }
                    }
                }
            });
            
            // Reset bus stop layers separately
            busStopLayers.forEach((layer, layerName) => {
                // Manage bus stop layer visibility based on checkbox, zoom, and route visibility
                const busRoutesChecked = document.getElementById('show-bus-paths').checked;
                const zoomSufficient = map.getZoom() >= BUS_STOPS_MIN_ZOOM;
                const routeLayerVisible = layers[layerName] && map.hasLayer(layers[layerName]);
                
                if (busRoutesChecked && zoomSufficient && routeLayerVisible) {
                    // Show stops for this route if route is visible and conditions are met
                    if (!map.hasLayer(layer)) {
                        layer.addTo(map);
                    }
                } else {
                    // Hide stops otherwise
                    if (map.hasLayer(layer)) {
                        map.removeLayer(layer);
                    }
                }
            });
            
            // Add live train markers back based on checkbox states
            trainMarkers.forEach((marker, trainId) => {
                if (marker) {
                    // Check if marker should be visible based on its route type
                    let shouldShow = false;
                    if (marker.routeName) {
                        if (subwayLines.includes(marker.routeName)) {
                            shouldShow = document.getElementById('show-subway-live').checked;
                        } else if (commuterLines.includes(marker.routeName)) {
                            shouldShow = document.getElementById('show-commuter-live').checked;
                        } else if (seasonalLines.includes(marker.routeName)) {
                            shouldShow = document.getElementById('show-seasonal-live').checked;
                        }
                    }
                    
                    if (shouldShow && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    } else if (!shouldShow && map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Add live bus markers back based on checkbox
            const showBusLive = document.getElementById('show-bus-live').checked;
            busMarkers.forEach((marker, busId) => {
                if (marker) {
                    if (showBusLive && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    } else if (!showBusLive && map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Add live shuttle markers back based on checkbox
            const showShuttleLive = document.getElementById('show-shuttle-live').checked;
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker) {
                    if (showShuttleLive && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    } else if (!showShuttleLive && map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Add live Silver Line markers back based on checkbox
            const showSilverLive = document.getElementById('show-silver-line-live').checked;
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker) {
                    if (showSilverLive && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    } else if (!showSilverLive && map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Add live ferry markers back based on checkbox
            const showFerryLive = document.getElementById('show-ferry-live').checked;
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker) {
                    if (showFerryLive && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    } else if (!showFerryLive && map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Restore LIRR layers based on checkbox state
            const lirrPathsChecked = document.getElementById('show-lirr-paths').checked;
            lirrLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (lirrPathsChecked) {
                        if (!map.hasLayer(layers[lineName])) {
                            map.addLayer(layers[lineName]);
                        }
                    }
                }
            });
            
            // Restore LIRR live train markers
            const showLIRRLive = document.getElementById('show-lirr-live').checked;
            lirrMarkers.forEach((marker, trainId) => {
                if (marker) {
                    if (showLIRRLive && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    }
                }
            });
        }
        
        // LIRR Highlighting Functions
        
        // Function to highlight multiple LIRR lines (for multi-line stops)
        function highlightMultipleLIRRLines(lineNames) {
            highlightedLIRRLine = lineNames;
            highlightedLine = null; // Clear MBTA highlighting
            
            // Remove all dimmed LIRR layers from map, keep highlighted ones
            lirrLines.forEach(lineName => {
                const isDimmed = !lineNames.includes(lineName);
                
                if (isDimmed) {
                    // Remove dimmed layer from map
                    if (layers[lineName] && map.hasLayer(layers[lineName])) {
                        map.removeLayer(layers[lineName]);
                    }
                } else {
                    // Ensure highlighted layer is on map
                    if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                        map.addLayer(layers[lineName]);
                    }
                }
            });
            
            // Remove/show live LIRR markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    const isDimmed = !lineNames.includes(marker.routeName);
                    
                    if (isDimmed) {
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Hide all MBTA lines when highlighting LIRR lines
            Object.keys(layers).forEach(layerName => {
                // Skip LIRR lines
                if (!lirrLines.includes(layerName)) {
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                }
            });
            
            // Hide all MBTA bus stop layers
            busStopLayers.forEach((layer, layerName) => {
                if (map.hasLayer(layer)) {
                    map.removeLayer(layer);
                }
            });
            
            // Remove all MBTA live vehicle markers
            trainMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            busMarkers.forEach((marker, busId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
        
        // Function to highlight a specific LIRR line and dim all others
        function highlightLIRRLine(lineName) {
            highlightedLIRRLine = lineName;
            highlightedLine = null; // Clear MBTA highlighting
            
            // Always show the highlighted line (even if checkbox is off)
            if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                map.addLayer(layers[lineName]);
            }
            
            // Remove dimmed layers from map or show highlighted one
            lirrLines.forEach(layerName => {
                const isDimmed = layerName !== lineName;
                
                if (isDimmed) {
                    // Remove dimmed layer from map
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                } else {
                    // Ensure highlighted layer is on map
                    if (layers[layerName] && !map.hasLayer(layers[layerName])) {
                        map.addLayer(layers[layerName]);
                    }
                }
            });
            
            // Remove/show live LIRR markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    const isDimmed = marker.routeName !== lineName;
                    
                    if (isDimmed) {
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
            
            // Hide all MBTA lines when highlighting LIRR lines
            Object.keys(layers).forEach(layerName => {
                // Skip LIRR lines
                if (!lirrLines.includes(layerName)) {
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                }
            });
            
            // Hide all MBTA bus stop layers
            busStopLayers.forEach((layer, layerName) => {
                if (map.hasLayer(layer)) {
                    map.removeLayer(layer);
                }
            });
            
            // Remove all MBTA live vehicle markers
            trainMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            busMarkers.forEach((marker, busId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
        
        // Function to reset LIRR highlighting
        function resetLIRRHighlight() {
            highlightedLIRRLine = null;
            
            // Add LIRR layers back to map based on checkbox state
            const lirrPathsChecked = document.getElementById('show-lirr-paths').checked;
            lirrLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (lirrPathsChecked) {
                        if (!map.hasLayer(layers[lineName])) {
                            map.addLayer(layers[lineName]);
                        }
                    } else {
                        if (map.hasLayer(layers[lineName])) {
                            map.removeLayer(layers[lineName]);
                        }
                    }
                }
            });
            
            // Add live LIRR markers back based on checkbox state
            const showLIRRLive = document.getElementById('show-lirr-live').checked;
            lirrMarkers.forEach((marker, trainId) => {
                if (marker) {
                    if (showLIRRLive && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    } else if (!showLIRRLive && map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Restore MBTA layers based on checkbox states
            Object.keys(layers).forEach(layerName => {
                // Skip LIRR lines
                if (lirrLines.includes(layerName)) {
                    return;
                }
                
                // Check if this is a subway line
                if (subwayLines.includes(layerName)) {
                    if (document.getElementById('show-subway-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a commuter rail line
                else if (commuterLines.includes(layerName)) {
                    if (document.getElementById('show-commuter-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a seasonal rail line
                else if (seasonalLines.includes(layerName)) {
                    if (document.getElementById('show-seasonal-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a bus route
                else if (typeof mbtaBusData !== 'undefined' && mbtaBusData[layerName]) {
                    if (document.getElementById('show-bus-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a shuttle route
                else if (typeof mbtaShuttleData !== 'undefined' && mbtaShuttleData[layerName]) {
                    if (document.getElementById('show-shuttle-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a Silver Line route
                else if (typeof silverLineData !== 'undefined' && silverLineData[layerName]) {
                    if (document.getElementById('show-silver-line-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    }
                }
                // Check if this is a ferry route
                else if (typeof mbtaFerryData !== 'undefined' && mbtaFerryData[layerName]) {
                    if (document.getElementById('show-ferry-paths').checked) {
                        if (!map.hasLayer(layers[layerName])) {
                            map.addLayer(layers[layerName]);
                        }
                    }
                }
            });
            
            // Restore MBTA bus stop layers
            busStopLayers.forEach((layer, layerName) => {
                const busRoutesChecked = document.getElementById('show-bus-paths').checked;
                const zoomSufficient = map.getZoom() >= BUS_STOPS_MIN_ZOOM;
                const routeLayerVisible = layers[layerName] && map.hasLayer(layers[layerName]);
                
                if (busRoutesChecked && zoomSufficient && routeLayerVisible) {
                    if (!map.hasLayer(layer)) {
                        layer.addTo(map);
                    }
                }
            });
            
            // Restore MBTA live vehicle markers
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    let shouldShow = false;
                    if (subwayLines.includes(marker.routeName)) {
                        shouldShow = document.getElementById('show-subway-live').checked;
                    } else if (commuterLines.includes(marker.routeName)) {
                        shouldShow = document.getElementById('show-commuter-live').checked;
                    } else if (seasonalLines.includes(marker.routeName)) {
                        shouldShow = document.getElementById('show-seasonal-live').checked;
                    }
                    
                    if (shouldShow && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    }
                }
            });
            
            busMarkers.forEach((marker, busId) => {
                if (marker && document.getElementById('show-bus-live').checked) {
                    if (!map.hasLayer(marker)) {
                        marker.addTo(map);
                    }
                }
            });
            
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker && document.getElementById('show-shuttle-live').checked) {
                    if (!map.hasLayer(marker)) {
                        marker.addTo(map);
                    }
                }
            });
            
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker && document.getElementById('show-silver-line-live').checked) {
                    if (!map.hasLayer(marker)) {
                        marker.addTo(map);
                    }
                }
            });
            
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker && document.getElementById('show-ferry-live').checked) {
                    if (!map.hasLayer(marker)) {
                        marker.addTo(map);
                    }
                }
            });
        }

        
        // Add keyboard event listener for Escape key to reset highlighting
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' || event.key === 'Esc') {
                resetHighlight();
                resetLIRRHighlight();
            }
        });

        
        // Filter controls are now generated dynamically above
        

        
        // Panel toggle functionality
        function togglePanel(panelId) {
            const panel = document.getElementById(panelId);
            const toggle = panel.querySelector('.panel-toggle');
            
            if (panel.classList.contains('panel-hidden')) {
                // Show panel
                panel.classList.remove('panel-hidden');
                toggle.textContent = 'â—€';
            } else {
                // Hide panel
                panel.classList.add('panel-hidden');
                toggle.textContent = 'â–¶';
            }
        }
        
        // Lines section toggle functionality
        function toggleLinesSection() {
            const linesSection = document.getElementById('lines-section');
            const toggle = document.querySelector('.lines-toggle');
            
            if (linesSection.classList.contains('collapsed')) {
                // Show lines section
                linesSection.classList.remove('collapsed');
                toggle.textContent = 'âˆ’';
                toggle.classList.remove('collapsed');
            } else {
                // Hide lines section
                linesSection.classList.add('collapsed');
                toggle.textContent = '+';
                toggle.classList.add('collapsed');
            }
        }
        
        // Initialize stats
        updateStats();
        
        // Add scale control
        const scaleControl = L.control.scale({
            position: 'bottomleft'
        }).addTo(map);
        

        

        
        // Live MBTA Train Tracking
        

        
        // Function to fetch live train positions
        async function fetchLiveTrains() {
            try {
                const now = Date.now();
                if (now - lastUpdateTime < 5000) { // Rate limit: 5 seconds
                    return;
                }
                
                const response = await fetch('https://api-v3.mbta.com/vehicles?filter[route_type]=0,1,2&include=route,trip');
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                lastUpdateTime = now;
                
                if (data.data && data.data.length > 0) {
                    updateTrainMarkers(data.data, data.included);
                }
                
            } catch (error) {
                console.error('Error fetching MBTA trains:', error);
            }
        }
        
        // Function to fetch live bus positions
        async function fetchLiveBuses() {
            try {
                const now = Date.now();
                if (now - lastBusUpdateTime < 5000) { // Rate limit: 5 seconds
                    return;
                }
                
                const response = await fetch('https://api-v3.mbta.com/vehicles?filter[route_type]=3&include=route');
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                lastBusUpdateTime = now;
                
                if (data.data && data.data.length > 0) {
                    updateBusMarkers(data.data);
                }
                
            } catch (error) {
                console.error('Error fetching MBTA buses:', error);
            }
        }
        
        // Function to fetch live ferry positions
        async function fetchLiveFerries() {
            try {
                const now = Date.now();
                if (now - lastUpdateTime < 5000) { // Rate limit: 5 seconds
                    return;
                }
                
                const response = await fetch('https://api-v3.mbta.com/vehicles?filter[route_type]=4&include=route');
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                lastUpdateTime = now;
                
                if (data.data && data.data.length > 0) {
                    updateFerryMarkers(data.data);
                }
                
            } catch (error) {
                console.error('Error fetching MBTA ferries:', error);
            }
        }
        
        // Function to update train markers on the map
        function updateTrainMarkers(trains, included) {
            // Build a map of trip IDs to trip headsigns
            const tripMap = new Map();
            if (included && Array.isArray(included)) {
                included.forEach(item => {
                    if (item.type === 'trip' && item.attributes && item.attributes.headsign) {
                        tripMap.set(item.id, item.attributes.headsign);
                    }
                });
            }
            
            // Store current popup states before clearing markers
            const currentPopups = new Map();
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.isPopupOpen && marker.isPopupOpen()) {
                    currentPopups.set(trainId, marker.getPopup().getContent());
                }
            });
            
            // Clear old train markers
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            trainMarkers.clear();
            
            // Create new train markers
                            trains.forEach(train => {
                    if (train.attributes && train.attributes.latitude && train.attributes.longitude) {
                        const trainId = train.id; // Vehicle ID (physical train)
                        const tripId = train.relationships?.trip?.data?.id; // Trip ID (scheduled run)
                        const lat = train.attributes.latitude;
                        const lng = train.attributes.longitude;
                        const heading = train.attributes.heading || 0;
                        const speed = train.attributes.speed;
                        const currentStatus = train.attributes.current_status;
                        const routeId = train.relationships?.route?.data?.id;
                        const label = train.attributes.label; // Train car number/label
                        

                        

                    
                    // Get route name and color with better matching
                    let routeName = 'Unknown Route';
                    let color = '#666';
                    
                    if (routeId && mbtaStopsData) {

                        
                        // Better route matching logic
                        if (mbtaStopsData) {
                            Object.keys(mbtaStopsData).forEach(name => {
                                // Check for exact matches first
                                if (name === routeId || 
                                    name.replace(/\s+/g, '') === routeId ||
                                    name.replace(/\s+/g, '') === routeId.replace(/\s+/g, '') ||
                                    routeId.includes(name.replace(/\s+/g, '')) ||
                                    name.includes(routeId.replace(/\s+/g, ''))) {
                                    routeName = name;
                                    color = lineColors[name] || '#666';
                                }
                            });
                            
                            // If no match found, try partial matching for commuter rail
                            if (routeName === 'Unknown Route' && routeId.startsWith('CR-')) {
                                // First try to match against mbtaStopsData
                                Object.keys(mbtaStopsData).forEach(name => {
                                    if (name.includes('Line') && routeId.includes(name.split(' ')[0])) {
                                        routeName = name;
                                        color = lineColors[name] || '#800080'; // Default purple for commuter rail
                                    }
                                });
                                
                                // If still no match, try to match against commuterLines array
                                if (routeName === 'Unknown Route') {
                                    const routeSuffix = routeId.substring(3); // Remove "CR-" prefix
                                    const routeSuffixNoSpaces = routeSuffix.replace(/\s+/g, '').toLowerCase();
                                    
                                    commuterLines.forEach(lineName => {
                                        const lineNameNoSpaces = lineName.replace(/\s+/g, '').toLowerCase();
                                        
                                        // Match without spaces (e.g., "NewBedford" matches "New Bedford")
                                        if (lineNameNoSpaces.includes(routeSuffixNoSpaces) || 
                                            routeSuffixNoSpaces.includes(lineNameNoSpaces.split('/')[0]) ||
                                            lineName.toLowerCase().includes(routeSuffix.toLowerCase()) || 
                                            routeSuffix.toLowerCase().includes(lineName.split(' ')[0].toLowerCase())) {
                                            routeName = lineName;
                                            color = lineColors[lineName] || '#800080'; // Default purple for commuter rail
                                        }
                                    });
                                }
                            }
                            
                            // If still no match, try to identify Green Line routes specifically
                            if (routeName === 'Unknown Route' && (routeId.includes('Green') || routeId.includes('GL'))) {
                                // Try to match specific Green Line branch
                                if (routeId.includes('Green-B') || routeId.includes('GL-B')) {
                                    routeName = 'Green Line B';
                                } else if (routeId.includes('Green-C') || routeId.includes('GL-C')) {
                                    routeName = 'Green Line C';
                                } else if (routeId.includes('Green-D') || routeId.includes('GL-D')) {
                                    routeName = 'Green Line D';
                                } else if (routeId.includes('Green-E') || routeId.includes('GL-E')) {
                                    routeName = 'Green Line E';
                                } else {
                                    routeName = 'Green Line';
                                }
                                color = lineColors['Green Line B'] || '#00843D';
                            }
                        }
                    }
                    
                    // Create train marker with custom line-specific icons
                    const baseIconSize = 20;
                    const currentZoom = map.getZoom();
                    const iconSize = getIconSize(baseIconSize, currentZoom);
                    
                    let trainIcon;
                    
                    if (routeName.includes('Red Line') || routeName.includes('Mattapan')) {
                        trainIcon = L.icon({
                            iconUrl: 'icons/readlinecirc.png',
                            iconSize: [iconSize, iconSize],
                            iconAnchor: [iconSize / 2, iconSize / 2],
                            baseIconSize: baseIconSize
                        });
                    } else if (routeName.includes('Blue Line')) {
                        trainIcon = L.icon({
                            iconUrl: 'icons/bluelinecirc.png',
                            iconSize: [iconSize, iconSize],
                            iconAnchor: [iconSize / 2, iconSize / 2],
                            baseIconSize: baseIconSize
                        });
                    } else if (routeName.includes('Green Line') || routeName.includes('Green-')) {
                        trainIcon = L.icon({
                            iconUrl: 'icons/greenlinecirc.png',
                            iconSize: [iconSize, iconSize],
                            iconAnchor: [iconSize / 2, iconSize / 2],
                            baseIconSize: baseIconSize
                        });
                    } else if (routeName.includes('Orange Line')) {
                        trainIcon = L.icon({
                            iconUrl: 'icons/orangelinecirc.png',
                            iconSize: [iconSize, iconSize],
                            iconAnchor: [iconSize / 2, iconSize / 2],
                            baseIconSize: baseIconSize
                        });
                    } else {
                        // Use commuter rail icon for all other routes (CapeFlyer, Fairmount, etc.)
                        trainIcon = L.icon({
                            iconUrl: 'icons/commuterrailcirc.png',
                            iconSize: [iconSize, iconSize],
                            iconAnchor: [iconSize / 2, iconSize / 2],
                            baseIconSize: baseIconSize
                        });
                    }
                    
                    const trainMarker = L.marker([lat, lng], {
                        icon: trainIcon,
                        zIndexOffset: 200
                    });
                    
                    // Get direction information (inbound/outbound)
                    const direction = train.attributes.direction_id === 0 ? 'Inbound' : 'Outbound';
                    
                    // Create popup with train info
                    let popupContent = `
                        <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                            <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                                <img src="${trainIcon.options.iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                                Live Train
                            </div>
                            <b>Route:</b> ${routeName === 'Unknown Route' ? (routeId.startsWith('CR-') ? routeId.substring(3) + ' Line' : routeId) : routeName}<br>`;
                    
                    // Only show speed if it's a valid number
                    if (speed !== null && speed !== undefined && speed !== 'none' && !isNaN(speed) && speed > 0) {
                        popupContent += `<b>Speed:</b> ${Math.round(speed)} mph<br>`;
                    }
                    
                    // Add current status if available
                    if (currentStatus) {
                        let statusText = currentStatus;
                        if (currentStatus === 'STOPPED_AT') {
                            statusText = 'Stopped';
                        } else if (currentStatus === 'IN_TRANSIT_TO') {
                            statusText = 'In Transit';
                        } else if (currentStatus === 'INCOMING_AT') {
                            statusText = 'Incoming';
                        }
                        popupContent += `<b>Status:</b> ${statusText}<br>`;
                    }
                    
                    popupContent += `<b>Vehicle ID:</b> ${trainId}<br>`;
                    
                    // Show trip ID if available (simplified to show only the last number)
                    if (tripId) {
                        const simplifiedTripId = tripId.includes('-') ? tripId.split('-').pop() : tripId;
                        popupContent += `<b>Trip ID:</b> ${simplifiedTripId}<br>`;
                    }
                    
                    // Show terminus using API headsign for all routes
                    const headsign = tripId ? tripMap.get(tripId) : null;
                    
                    if (headsign) {
                        // Use the API headsign as terminus (works for subway AND commuter rail)
                        popupContent += `<b>Terminus:</b> ${headsign}<br>`;
                    } else {
                        // Fallback logic only when headsign unavailable
                        if (routeId && routeId.startsWith('CR-')) {
                            // Commuter rail fallback
                            const lineName = routeId.substring(3); // Remove "CR-" prefix
                            const northStationLines = ['Fitchburg', 'Lowell', 'Rockport', 'Newburyport', 'Haverhill'];
                            
                            if (train.attributes.direction_id === 0) {
                                // Outbound: show the line's terminus
                                popupContent += `<b>Terminus:</b> ${lineName}<br>`;
                            } else {
                                // Inbound: show Boston station
                                const terminus = northStationLines.includes(lineName) ? 'North Station' : 'South Station';
                                popupContent += `<b>Terminus:</b> ${terminus}<br>`;
                            }
                        } else {
                            // For subway or other routes without headsign
                            popupContent += `<b>Terminus:</b> Unspecified<br>`;
                        }
                    }
                    
                    popupContent += `
                        <b>Position:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
                        <b>Last Update:</b> ${new Date().toLocaleTimeString()}
                        </div>
                    `;
                    
                    // Use tooltip for all trains, direction based on latitude
                    const tooltipDirection = lat < 42.361220 ? 'bottom' : 'top';
                    trainMarker.bindTooltip(popupContent, { 
                        direction: tooltipDirection,
                        permanent: false,
                        interactive: true,
                        className: 'custom-tooltip'
                    });
                    
                    // Store route name and ID with marker for filtering
                    trainMarker.routeName = routeName;
                    trainMarker.routeId = routeId;
                    
                    // Add click handler to highlight the line (for both subway and commuter rail)
                    trainMarker.on('click', function() {
                        if (subwayLines.includes(routeName) || commuterLines.includes(routeName) || routeId.startsWith('CR-')) {
                            // If this line is already highlighted, reset; otherwise highlight it
                            if (isLineHighlighted(routeName)) {
                                resetHighlight();
                            } else {
                                // Don't allow highlighting if something else is already highlighted
                                if (highlightedLine) {
                                    // Check if this route is currently dimmed
                                    const isCurrentlyDimmed = Array.isArray(highlightedLine)
                                        ? !highlightedLine.includes(routeName)
                                        : highlightedLine !== routeName;
                                    
                                    if (isCurrentlyDimmed) {
                                        // Don't allow highlighting a dimmed line - do nothing
                                        return;
                                    }
                                }
                                highlightLine(routeName);
                            }
                        }
                    });
                    
                    // Add to map and store reference (only if the category is checked)
                    let shouldShow = false;
                    
                    // Check if this train should be shown based on live tracking checkbox states
                    // IMPORTANT: Check commuter rail FIRST before subway, since commuter rail lines also contain "Line"
                    if ((commuterLines.includes(routeName) || (routeId && routeId.startsWith('CR-'))) && document.getElementById('show-commuter-live').checked) {
                        shouldShow = true;
                    } else if (seasonalLines.includes(routeName) && document.getElementById('show-seasonal-live').checked) {
                        shouldShow = true;
                    } else if (subwayLines.includes(routeName) && document.getElementById('show-subway-live').checked) {
                        shouldShow = true;
                    }
                    
                    // Check if we should add to map (considering both checkbox and highlight state)
                    if (shouldShow) {
                        // Don't show MBTA trains if LIRR line is highlighted
                        if (highlightedLIRRLine) {
                            // LIRR line is highlighted, hide all MBTA trains
                            // (don't add to map)
                        } else if (highlightedLine) {
                            // MBTA line is highlighted, only show markers for that line
                            const isHighlighted = Array.isArray(highlightedLine)
                                ? highlightedLine.includes(routeName)
                                : highlightedLine === routeName;
                            
                            if (isHighlighted) {
                                trainMarker.addTo(map);
                            }
                        } else {
                            // No highlight active, show all markers based on checkbox
                            trainMarker.addTo(map);
                        }
                    }
                    
                    trainMarkers.set(trainId, trainMarker);
                    
                    // Restore popup if it was open before
                    if (currentPopups.has(trainId)) {
                        trainMarker.openPopup();
                    }
                }
            });
            

        }
        
        // Function to update bus markers on the map
        function updateBusMarkers(buses) {
            // Store current popup states before clearing markers
            const currentBusPopups = new Map();
            busMarkers.forEach((marker, busId) => {
                if (marker && marker.isPopupOpen && marker.isPopupOpen()) {
                    currentBusPopups.set(busId, marker.getPopup().getContent());
                }
            });
            const currentShuttlePopups = new Map();
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker && marker.isPopupOpen && marker.isPopupOpen()) {
                    currentShuttlePopups.set(shuttleId, marker.getPopup().getContent());
                }
            });
            const currentSilverLinePopups = new Map();
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker && marker.isPopupOpen && marker.isPopupOpen()) {
                    currentSilverLinePopups.set(silverId, marker.getPopup().getContent());
                }
            });
            
            // Clear old bus markers
            busMarkers.forEach((marker, busId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            busMarkers.clear();
            
            // Clear old shuttle markers
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            shuttleMarkers.clear();
            
            // Clear old Silver Line markers
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            silverLineMarkers.clear();
            
            // Create new bus/shuttle/Silver Line markers
            buses.forEach(bus => {
                if (bus.attributes && bus.attributes.latitude && bus.attributes.longitude) {
                    const vehicleId = bus.id; // Vehicle ID (physical bus)
                    const tripId = bus.relationships?.trip?.data?.id; // Trip ID (scheduled run)
                    const lat = bus.attributes.latitude;
                    const lng = bus.attributes.longitude;
                    const heading = bus.attributes.heading || 0;
                    const speed = bus.attributes.speed;
                    const currentStatus = bus.attributes.current_status;
                    const routeId = bus.relationships?.route?.data?.id;
                    const label = bus.attributes.label; // Bus number/label
                    
                    // Check if this is a shuttle
                    const isShuttle = routeId && (
                        routeId.startsWith('Shuttle-') ||
                        (typeof mbtaShuttleData !== 'undefined' && mbtaShuttleData[routeId])
                    );
                    
                    // Map numeric route IDs to Silver Line names
                    const silverLineMap = {'741': 'SL1', '742': 'SL2', '743': 'SL3', '751': 'SL4', '749': 'SL5', '746': 'SLW'};
                    const mappedRouteId = silverLineMap[routeId] || routeId;
                    
                    // Check if this is a Silver Line route (check if it exists in our Silver Line data)
                    const isSilverLine = routeId && (
                        (typeof silverLineData !== 'undefined' && silverLineData[mappedRouteId]) ||
                        silverLineRoutes.includes(mappedRouteId)
                    );
                    
                    // Get route name and color
                    let routeName = isShuttle ? 'Unknown Shuttle' : (isSilverLine ? 'Unknown Silver Line' : 'Unknown Bus Route');
                    let color = isShuttle ? '#FF6B6B' : (isSilverLine ? '#7C878E' : '#FFD700'); // Shuttle red, Silver Line gray, or bus gold
                    let vehicleType = isShuttle ? 'Shuttle' : (isSilverLine ? 'Silver Line' : 'Bus');
                    
                    // Declare layerKey outside the if block so it's accessible throughout
                    let layerKey = routeId || 'unknown';
                    
                    if (routeId) {
                        // Always show the route ID from the API
                        if (isSilverLine) {
                            layerKey = mappedRouteId; // Use mapped name for layer key
                            routeName = `Silver Line ${layerKey}`;
                            color = lineColors[layerKey] || color;
                        } else {
                            routeName = isShuttle ? `Shuttle ${routeId}` : `Bus Route ${routeId}`;
                            color = lineColors[routeId] || color;
                        }
                        
                        // Ensure this route has a layer (create one if it doesn't exist)
                        if (!layers[layerKey]) {
                            layers[layerKey] = L.layerGroup();
                        }
                    }
                    
                    // Create marker with appropriate icon
                    let iconUrl = 'icons/buscirc.png'; // Default to bus icon
                    
                    if (isSilverLine) {
                        iconUrl = 'icons/silverlinecirc.png';
                    }
                    
                    const baseIconSize = 16;
                    const currentZoom = map.getZoom();
                    const iconSize = getIconSize(baseIconSize, currentZoom);
                    
                    const vehicleIcon = L.icon({
                        iconUrl: iconUrl,
                        iconSize: [iconSize, iconSize],
                        iconAnchor: [iconSize / 2, iconSize / 2],
                        baseIconSize: baseIconSize
                    });
                    
                    // Set z-index: Silver Line under trains (200), buses/shuttles above (250)
                    const zIndex = isSilverLine ? 150 : 250;
                    
                    const vehicleMarker = L.marker([lat, lng], {
                        icon: vehicleIcon,
                        zIndexOffset: zIndex
                    });
                    
                    // Get direction information (inbound/outbound)
                    const direction = bus.attributes.direction_id === 0 ? 'Inbound' : 'Outbound';
                    
                    // Create popup with vehicle info
                    let popupContent = `
                        <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0;">
                            <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                                <img src="${vehicleIcon.options.iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                                Live ${vehicleType}
                            </div>
                            <b>Route:</b> ${routeName}<br>
                            <b>Direction:</b> ${direction}<br>`;
                    
                    // Only show speed if it's a valid number
                    if (speed !== null && speed !== undefined && speed !== 'none' && !isNaN(speed) && speed > 0) {
                        popupContent += `<b>Speed:</b> ${Math.round(speed)} mph<br>`;
                    }
                    
                    // Show status if available
                    if (currentStatus && currentStatus !== 'none') {
                        let statusText = currentStatus;
                        if (currentStatus === 'STOPPED_AT') {
                            statusText = 'Stopped';
                        } else if (currentStatus === 'IN_TRANSIT_TO') {
                            statusText = 'In Transit';
                        } else if (currentStatus === 'INCOMING_AT') {
                            statusText = 'Incoming';
                        }
                        popupContent += `<b>Status:</b> ${statusText}<br>`;
                    }
                    
                    popupContent += `<b>Vehicle ID:</b> ${vehicleId}<br>`;
                    
                    // Show trip ID if available (simplified to show only the last number)
                    if (tripId) {
                        const simplifiedTripId = tripId.includes('-') ? tripId.split('-').pop() : tripId;
                        popupContent += `<b>Trip ID:</b> ${simplifiedTripId}<br>`;
                    }
                    
                    popupContent += `
                        <b>Position:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
                        <b>Last Update:</b> ${new Date().toLocaleTimeString()}
                        </div>
                    `;
                    
                    // Use tooltip for all vehicles, direction based on latitude
                    const tooltipDirection = lat < 42.361220 ? 'bottom' : 'top';
                    vehicleMarker.bindTooltip(popupContent, { 
                        direction: tooltipDirection,
                        permanent: false,
                        interactive: true,
                        className: 'custom-tooltip'
                    });
                    
                    // Store route name with marker for filtering (use layerKey for matching with layers)
                    vehicleMarker.routeName = layerKey; // Use layerKey instead of routeId for layer matching
                    vehicleMarker.displayName = routeName; // Keep formatted name for display
                    vehicleMarker.routeId = routeId; // Keep original routeId for reference
                    
                    // Add click handler to highlight the route
                    vehicleMarker.on('click', function() {
                        // If this route is already highlighted, reset; otherwise highlight it
                        if (isLineHighlighted(layerKey)) {
                            resetHighlight();
                        } else {
                            // Don't allow highlighting if something else is already highlighted
                            if (highlightedLine) {
                                // Check if this route is currently dimmed
                                const isCurrentlyDimmed = Array.isArray(highlightedLine)
                                    ? !highlightedLine.includes(layerKey)
                                    : highlightedLine !== layerKey;
                                
                                if (isCurrentlyDimmed) {
                                    // Don't allow highlighting a dimmed line - do nothing
                                    return;
                                }
                            }
                            
                            // Load the specific single route
                            if (isShuttle) {
                                loadSingleRoute(layerKey, 'shuttle');
                            } else if (isSilverLine) {
                                loadSingleRoute(layerKey, 'silver');
                            } else {
                                loadSingleRoute(layerKey, 'bus');
                            }
                            
                            // Always highlight the route (layer will be created even if empty)
                            highlightLine(layerKey);
                        }
                    });
                    
                    // Add to map and store reference based on vehicle type
                    if (isShuttle) {
                        // Add to map if shuttle live tracking checkbox is checked
                        if (document.getElementById('show-shuttle-live').checked) {
                            // Don't show MBTA shuttles if LIRR line is highlighted
                            if (highlightedLIRRLine) {
                                // LIRR line is highlighted, hide all MBTA shuttles
                                // (don't add to map)
                            } else if (highlightedLine) {
                                // MBTA line is highlighted, only show markers for that line
                                const isHighlighted = Array.isArray(highlightedLine)
                                    ? highlightedLine.includes(layerKey)
                                    : highlightedLine === layerKey;
                                
                                if (isHighlighted) {
                                    vehicleMarker.addTo(map);
                                }
                            } else {
                                // No highlight active, show all markers based on checkbox
                                vehicleMarker.addTo(map);
                            }
                        }
                        
                        shuttleMarkers.set(vehicleId, vehicleMarker);
                        
                        // Restore popup if it was open before
                        if (currentShuttlePopups.has(vehicleId)) {
                            vehicleMarker.openPopup();
                        }
                    } else if (isSilverLine) {
                        // Add to map if Silver Line live tracking checkbox is checked
                        if (document.getElementById('show-silver-line-live').checked) {
                            // Don't show MBTA Silver Line if LIRR line is highlighted
                            if (highlightedLIRRLine) {
                                // LIRR line is highlighted, hide all MBTA Silver Line vehicles
                                // (don't add to map)
                            } else if (highlightedLine) {
                                // MBTA line is highlighted, only show markers for that line
                                const isHighlighted = Array.isArray(highlightedLine)
                                    ? highlightedLine.includes(layerKey)
                                    : highlightedLine === layerKey;
                                
                                if (isHighlighted) {
                                    vehicleMarker.addTo(map);
                                }
                            } else {
                                // No highlight active, show all markers based on checkbox
                                vehicleMarker.addTo(map);
                            }
                        }
                        
                        silverLineMarkers.set(vehicleId, vehicleMarker);
                        
                        // Restore popup if it was open before
                        if (currentSilverLinePopups.has(vehicleId)) {
                            vehicleMarker.openPopup();
                        }
                    } else {
                        // Add to map if bus live tracking checkbox is checked
                        if (document.getElementById('show-bus-live').checked) {
                            // Don't show MBTA buses if LIRR line is highlighted
                            if (highlightedLIRRLine) {
                                // LIRR line is highlighted, hide all MBTA buses
                                // (don't add to map)
                            } else if (highlightedLine) {
                                // MBTA line is highlighted, only show markers for that line
                                const isHighlighted = Array.isArray(highlightedLine)
                                    ? highlightedLine.includes(layerKey)
                                    : highlightedLine === layerKey;
                                
                                if (isHighlighted) {
                                    vehicleMarker.addTo(map);
                                }
                            } else {
                                // No highlight active, show all markers based on checkbox
                                vehicleMarker.addTo(map);
                            }
                        }
                        
                        busMarkers.set(vehicleId, vehicleMarker);
                        
                        // Restore popup if it was open before
                        if (currentBusPopups.has(vehicleId)) {
                            vehicleMarker.openPopup();
                        }
                    }
                }
            });
        }
        
        // Function to update ferry markers on the map
        function updateFerryMarkers(ferries) {
            // Clear old ferry markers
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            ferryMarkers.clear();
            
            // Create new ferry markers
            ferries.forEach(ferry => {
                if (ferry.attributes && ferry.attributes.latitude && ferry.attributes.longitude) {
                    const ferryId = ferry.id; // Vehicle ID (physical ferry)
                    const tripId = ferry.relationships?.trip?.data?.id; // Trip ID (scheduled run)
                    const lat = ferry.attributes.latitude;
                    const lng = ferry.attributes.longitude;
                    const heading = ferry.attributes.heading || 0;
                    const speed = ferry.attributes.speed;
                    const currentStatus = ferry.attributes.current_status;
                    const routeId = ferry.relationships?.route?.data?.id;
                    const label = ferry.attributes.label; // Ferry name/label
                    
                    // Get route name and color
                    let routeName = 'Unknown Ferry Route';
                    let color = '#008EAA'; // Default ferry blue
                    
                    if (routeId && mbtaFerryData) {
                        if (mbtaFerryData[routeId]) {
                            routeName = mbtaFerryData[routeId][0]?.name || routeId;
                            color = lineColors[routeId] || '#008EAA';
                        }
                    }
                    
                    // Create ferry marker with boat icon
                    const baseIconSize = 16;
                    const currentZoom = map.getZoom();
                    const iconSize = getIconSize(baseIconSize, currentZoom);
                    
                    const ferryIcon = L.icon({
                        iconUrl: 'icons/commuterrailcirc.png', // Use commuter rail icon for now
                        iconSize: [iconSize, iconSize],
                        iconAnchor: [iconSize / 2, iconSize / 2],
                        baseIconSize: baseIconSize
                    });
                    
                    const ferryMarker = L.marker([lat, lng], {
                        icon: ferryIcon,
                        zIndexOffset: 300
                    });
                    
                    // Create popup with ferry info
                    let popupContent = `
                        <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0;">
                            <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                                <img src="${ferryIcon.options.iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                                Live Ferry
                            </div>
                            <b>Route:</b> ${routeName}<br>`;
                    
                    // Only show speed if it's a valid number
                    if (speed !== null && speed !== undefined && speed !== 'none' && !isNaN(speed) && speed > 0) {
                        popupContent += `<b>Speed:</b> ${Math.round(speed)} mph<br>`;
                    }
                    
                    // Add current status if available
                    if (currentStatus) {
                        let statusText = currentStatus;
                        if (currentStatus === 'STOPPED_AT') {
                            statusText = 'Stopped';
                        } else if (currentStatus === 'IN_TRANSIT_TO') {
                            statusText = 'In Transit';
                        } else if (currentStatus === 'INCOMING_AT') {
                            statusText = 'Incoming';
                        }
                        popupContent += `<b>Status:</b> ${statusText}<br>`;
                    }
                    
                    popupContent += `<b>Vehicle ID:</b> ${ferryId}<br>`;
                    
                    // Show trip ID if available (simplified to show only the last number)
                    if (tripId) {
                        const simplifiedTripId = tripId.includes('-') ? tripId.split('-').pop() : tripId;
                        popupContent += `<b>Trip ID:</b> ${simplifiedTripId}<br>`;
                    }
                    
                    popupContent += `
                        <b>Position:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
                        <b>Last Update:</b> ${new Date().toLocaleTimeString()}
                        </div>
                    `;
                    
                    // Use tooltip for all ferries, direction based on latitude
                    const tooltipDirection = lat < 42.361220 ? 'bottom' : 'top';
                    ferryMarker.bindTooltip(popupContent, { 
                        direction: tooltipDirection,
                        permanent: false,
                        interactive: true,
                        className: 'custom-tooltip'
                    });
                    
                    // Add to map and store reference (only if ferry checkbox is checked and no line is highlighted)
                    if (document.getElementById('show-ferry-live').checked && !highlightedLine && !highlightedLIRRLine) {
                        ferryMarker.addTo(map);
                    }
                    ferryMarkers.set(ferryId, ferryMarker);
                }
            });
        }
        
        // Start live tracking
        function startLiveTracking() {
            if (trackingInterval) {
                clearInterval(trackingInterval);
            }
            if (busTrackingInterval) {
                clearInterval(busTrackingInterval);
            }
            
            // Initial fetch
            fetchLiveTrains();
            fetchLiveBuses();
            
            // Set up interval for updates
            trackingInterval = setInterval(fetchLiveTrains, 5000); // Update every 5 seconds
            busTrackingInterval = setInterval(fetchLiveBuses, 5000); // Update every 5 seconds for buses
        }
        

        
        // Stop live tracking for a specific category
        function stopLiveTrackingForCategory(category) {
            // Clear markers for the specific category
            if (category === 'subway') {
                // Clear subway train markers
                trainMarkers.forEach((marker, trainId) => {
                    if (marker && marker.routeName && subwayLines.includes(marker.routeName)) {
                        if (marker.remove) marker.remove();
                    }
                });
            } else if (category === 'commuter') {
                // Clear commuter rail train markers
                trainMarkers.forEach((marker, trainId) => {
                    if (marker && marker.routeName && (commuterLines.includes(marker.routeName) || (marker.routeId && marker.routeId.startsWith('CR-')))) {
                        if (marker.remove) marker.remove();
                    }
                });
            } else if (category === 'seasonal') {
                // Clear seasonal rail train markers
                trainMarkers.forEach((marker, trainId) => {
                    if (marker && marker.routeName && seasonalLines.includes(marker.routeName)) {
                        if (marker.remove) marker.remove();
                    }
                });
            } else if (category === 'bus') {
                // Clear bus markers
                busMarkers.forEach((marker, busId) => {
                    if (marker && marker.remove) marker.remove();
                });
            }
            
            // Check if any categories are still checked for live tracking
            const hasSubway = document.getElementById('show-subway-live').checked;
            const hasCommuter = document.getElementById('show-commuter-live').checked;
            const hasSeasonal = document.getElementById('show-seasonal-live').checked;
            const hasBus = document.getElementById('show-bus-live').checked;
            const hasShuttle = document.getElementById('show-shuttle-live').checked;
            const hasSilver = document.getElementById('show-silver-line-live').checked;
            const hasFerry = document.getElementById('show-ferry-live').checked;
            
            // If no categories are checked, stop all live tracking
            if (!hasSubway && !hasCommuter && !hasSeasonal && !hasBus && !hasShuttle && !hasSilver && !hasFerry) {
                stopLiveTracking();
            }
        }
        
        // Stop live tracking
        function stopLiveTracking() {
            if (trackingInterval) {
                clearInterval(trackingInterval);
                trackingInterval = null;
            }
            if (busTrackingInterval) {
                clearInterval(busTrackingInterval);
                busTrackingInterval = null;
            }
            
            // Clear all train markers
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            trainMarkers.clear();
            
            // Clear all bus markers
            busMarkers.forEach((marker, busId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            busMarkers.clear();
        }
        
        // LIRR Live Tracking Functions
        
        // Function to start LIRR live tracking
        function startLIRRTracking() {
            if (lirrTrackingInterval) {
                clearInterval(lirrTrackingInterval);
            }
            
            // Initial fetch
            fetchLIRRTrains();
            
            // Set up interval for updates (5 seconds for near real-time)
            lirrTrackingInterval = setInterval(fetchLIRRTrains, 5000); // Update every 5 seconds
        }
        
        // Function to fetch live LIRR trains from MTA GTFS-RT API
        async function fetchLIRRTrains() {
            // Note: MTA feeds are now free and don't require API keys!
            // Source: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr
            
            try {
                const now = Date.now();
                
                // Rate limiting - don't update more than once every 5 seconds
                if (now - lastLIRRUpdateTime < 5000) {
                    return;
                }
                
                lastLIRRUpdateTime = now;
                
                // MTA LIRR GTFS-RT feed URL (no API key needed!)
                const LIRR_GTFS_RT_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr';
                
                // Fetch the GTFS-RT feed
                const response = await fetch(LIRR_GTFS_RT_URL);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const buffer = await response.arrayBuffer();
                
                // Load GTFS-RT proto definition (use local file to avoid GitHub Pages URL resolution issues)
                const root = await protobuf.load('./gtfs-realtime.proto');
                const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
                
                // Decode the protobuf
                const feed = FeedMessage.decode(new Uint8Array(buffer));
                
                // Extract vehicle positions
                const vehicles = [];
                feed.entity.forEach(entity => {
                    if (entity.vehicle && entity.vehicle.position) {
                        vehicles.push(entity.vehicle);
                    }
                });
                
                // Update markers with vehicle data
                updateLIRRMarkers(vehicles);
                
            } catch (error) {
                console.error('❌ Error fetching LIRR trains:', error);
                console.error('Error details:', error.message);
            }
        }
        
        // Function to update LIRR train markers on the map
        function updateLIRRMarkers(vehicles) {
            // Store currently open popups
            const currentLIRRPopups = new Map();
            lirrMarkers.forEach((marker, trainId) => {
                if (marker.isPopupOpen()) {
                    currentLIRRPopups.set(trainId, true);
                }
            });
            
            // Clear old markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            lirrMarkers.clear();
            
            // Process vehicle position data from GTFS-RT
            if (vehicles && Array.isArray(vehicles)) {
                vehicles.forEach(vehicle => {
                    if (vehicle.position && vehicle.position.latitude && vehicle.position.longitude) {
                        const lat = vehicle.position.latitude;
                        const lon = vehicle.position.longitude;
                        const trainId = vehicle.vehicle?.id || 'unknown';
                        const tripId = vehicle.trip?.tripId || vehicle.trip?.trip_id;
                        const startDate = vehicle.trip?.startDate || vehicle.trip?.start_date;
                        const currentStopSequence = vehicle.currentStopSequence || vehicle.current_stop_sequence;
                        const currentStatus = vehicle.currentStatus || vehicle.current_status;
                        
                        // Map trip_id to route using the tripToRoute mapping
                        let routeName = 'LIRR Train';
                        let color = '#00305E'; // Default LIRR navy blue
                        let routeId = null;
                        
                        // Check for headsign/destination in trip descriptor
                        const stopId = vehicle.stopId || vehicle.stop_id;
                        const directionId = vehicle.trip?.directionId || vehicle.trip?.direction_id;
                        
                        
                        if (tripId && lirrRoutesData && lirrRoutesData.tripToRoute) {
                            // Try exact match first
                            routeId = lirrRoutesData.tripToRoute[tripId];
                            
                            // If no exact match, try without date suffix (e.g., "93X_2025-11-20" -> "93X")
                            if (!routeId && tripId.includes('_')) {
                                const tripIdWithoutDate = tripId.split('_')[0];
                                routeId = lirrRoutesData.tripToRoute[tripIdWithoutDate];
                            }
                            
                            if (routeId && lirrRoutesData.routes) {
                                // Find the route name from route_id
                                for (const [name, route] of Object.entries(lirrRoutesData.routes)) {
                                    if (route.route_id === routeId) {
                                        routeName = name;
                                        color = lineColors[name] || color;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // If we couldn't map it, show the trip ID
                        if (routeName === 'LIRR Train' && tripId) {
                            routeName = `Trip ${tripId}`;
                        }
                        
                        // Create LIRR train icon
                        const baseIconSize = 20;
                        const currentZoom = map.getZoom();
                        const iconSize = getIconSize(baseIconSize, currentZoom);
                        
                        const lirrIcon = L.icon({
                            iconUrl: 'icons/mtacirc.png',
                            iconSize: [iconSize, iconSize],
                            iconAnchor: [iconSize / 2, iconSize / 2],
                            baseIconSize: baseIconSize
                        });
                        
                        const trainMarker = L.marker([lat, lon], {
                            icon: lirrIcon,
                            zIndexOffset: 200
                        });
                        
                        // Store train info for reference
                        trainMarker.routeName = routeName;
                        trainMarker.trainId = trainId;
                        trainMarker.tripId = tripId;
                        
                        // Add click handler for highlighting (if we have a valid route)
                        if (routeId && routeName !== 'LIRR Train' && !routeName.startsWith('Trip ')) {
                            trainMarker.on('click', function(e) {
                                L.DomEvent.stopPropagation(e);
                                
                                // Toggle highlighting
                                if (highlightedLIRRLine === routeName) {
                                    resetLIRRHighlight();
                                } else {
                                    highlightLIRRLine(routeName);
                                }
                            });
                        }
                        
                        // Create tooltip with train info
                        let tooltipContent = `
                            <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                                <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                                    <img src="${lirrIcon.options.iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                                    Live LIRR Train
                                </div>`;
                        
                        // Show line if we have route information
                        if (routeId && !routeName.startsWith('Trip ')) {
                            tooltipContent += `<b>Line:</b> ${routeName}<br>`;
                        }
                        
                        // Show terminus/destination from headsign
                        if (tripId && lirrRoutesData && lirrRoutesData.tripToHeadsign) {
                            // Try exact match first
                            let headsign = lirrRoutesData.tripToHeadsign[tripId];
                            
                            // If no exact match, try without date suffix
                            if (!headsign && tripId.includes('_')) {
                                const tripIdWithoutDate = tripId.split('_')[0];
                                headsign = lirrRoutesData.tripToHeadsign[tripIdWithoutDate];
                            }
                            
                            if (headsign) {
                                tooltipContent += `<b>Terminus:</b> ${headsign}<br>`;
                            }
                        }
                        
                        tooltipContent += `<b>Train ID:</b> ${trainId}<br>`;
                        
                        // Show trip ID
                        if (tripId) {
                            tooltipContent += `<b>Trip:</b> ${tripId}<br>`;
                        }
                        
                        // Add status if available
                        if (currentStatus) {
                            let statusText = currentStatus;
                            if (currentStatus === 'STOPPED_AT' || currentStatus === 0) {
                                statusText = 'Stopped at Station';
                            } else if (currentStatus === 'IN_TRANSIT_TO' || currentStatus === 1) {
                                statusText = 'In Transit';
                            } else if (currentStatus === 'INCOMING_AT' || currentStatus === 2) {
                                statusText = 'Approaching Station';
                            }
                            tooltipContent += `<b>Status:</b> ${statusText}<br>`;
                        }
                        
                        tooltipContent += `
                            <b>Position:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}<br>
                            <b>Last Update:</b> ${new Date().toLocaleTimeString()}
                            </div>
                        `;
                        
                        // Use tooltip for all trains, direction based on latitude
                        const tooltipDirection = lat < 40.76 ? 'bottom' : 'top';
                        trainMarker.bindTooltip(tooltipContent, { 
                            direction: tooltipDirection,
                            permanent: false,
                            interactive: true,
                            className: 'custom-tooltip'
                        });
                        
                        // Add to map if LIRR live tracking is enabled
                        const lirrLiveCheckbox = document.getElementById('show-lirr-live');
                        if (lirrLiveCheckbox && lirrLiveCheckbox.checked) {
                            // Don't show LIRR trains if MBTA line is highlighted
                            if (highlightedLine) {
                                // MBTA line is highlighted, hide all LIRR trains
                                return;
                            }
                            
                            // Check if LIRR highlighting is active
                            if (highlightedLIRRLine) {
                                // Only show if this train is on the highlighted line
                                const isHighlighted = Array.isArray(highlightedLIRRLine)
                                    ? highlightedLIRRLine.includes(routeName)
                                    : highlightedLIRRLine === routeName;
                                
                                if (isHighlighted) {
                                    trainMarker.addTo(map);
                                }
                            } else {
                                // No highlight active, show all trains
                                trainMarker.addTo(map);
                            }
                        }
                        
                        lirrMarkers.set(trainId, trainMarker);
                        
                        // Restore popup if it was open before
                        if (currentLIRRPopups.has(trainId)) {
                            trainMarker.openPopup();
                        }
                    }
                });
            }
            
        }
        
        // Stop LIRR tracking
        function stopLIRRTracking() {
            if (lirrTrackingInterval) {
                clearInterval(lirrTrackingInterval);
                lirrTrackingInterval = null;
            }
            
            // Clear all LIRR train markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            lirrMarkers.clear();
        }
        
        // Initially show layers based on checkbox states
        if (mbtaStopsData && typeof mbtaStopsData === 'object') {
            Object.keys(mbtaStopsData).forEach(lineName => {
                if (layers[lineName]) {
                    // Check if this line should be shown based on checkbox states
                    let shouldShow = false;
                    
                    if (subwayLines.includes(lineName) && document.getElementById('show-subway-paths').checked) {
                        shouldShow = true;
                    } else if (commuterLines.includes(lineName) && document.getElementById('show-commuter-paths').checked) {
                        shouldShow = true;
                    } else if (seasonalLines.includes(lineName) && document.getElementById('show-seasonal-paths').checked) {
                        shouldShow = true;
                    }
                    
                    if (shouldShow) {
                        map.addLayer(layers[lineName]);
                    }
                }
            });
        }
        
        // Don't show bus layers by default since checkbox is unchecked
        // Bus layers will be shown when checkbox is checked
        if (mbtaBusData && typeof mbtaBusData === 'object') {
            // Store bus layers but don't add them to map yet
            Object.keys(mbtaBusData).forEach(lineName => {
                if (layers[lineName]) {
                    // Don't add to map - wait for checkbox to be checked
                }
            });
        }
        
        if (mbtaFerryData && typeof mbtaFerryData === 'object') {
            Object.keys(mbtaFerryData).forEach(lineName => {
                if (layers[lineName]) {
                    if (document.getElementById('show-ferry-paths').checked) {
                        map.addLayer(layers[lineName]);
                    }
                }
            });
        }
        
        // Load Silver Line data if checkbox is checked by default (no delay needed - proper z-ordering via panes)
        if (document.getElementById('show-silver-line-paths').checked) {
            loadSilverLineRoutes();
        }
        
        // Load LIRR routes if checkbox is checked by default
        if (lirrLines.length > 0 && document.getElementById('show-lirr-paths')?.checked) {
            loadLIRRRoutes(true);
        }
        
        // Start tracking after a short delay to let the map load
        setTimeout(() => {
            startLiveTracking();
        }, 500);
        
        // Initialize bus stops visibility based on current zoom level
        setTimeout(() => {
            const currentZoom = map.getZoom();
            if (currentZoom >= BUS_STOPS_MIN_ZOOM && document.getElementById('show-bus-paths').checked) {
                busStopsVisible = true;
                toggleBusStopsVisibility(true);
            }
        }, 1000);
}); // End DOMContentLoaded
