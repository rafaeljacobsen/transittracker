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
        const metroNorthMarkers = new Map(); // Metro North train markers
        let trackingInterval;
        let ferryTrackingInterval;
        let busTrackingInterval;
        let shuttleTrackingInterval;
        let silverLineTrackingInterval;
        let lirrTrackingInterval; // LIRR tracking interval
        let metroNorthTrackingInterval; // Metro North tracking interval
        let lastUpdateTime = 0;
        let lastFerryUpdateTime = 0;
        let lastBusUpdateTime = 0;
        let lastShuttleUpdateTime = 0;
        let lastSilverLineUpdateTime = 0;
        let lastLIRRUpdateTime = 0; // LIRR last update timestamp
        let lastMetroNorthUpdateTime = 0; // Metro North last update timestamp
        
        // State for line highlighting feature
        let highlightedLine = null;
        let highlightedLIRRLine = null; // Separate highlighting for LIRR/MTA
        let highlightedMetroNorthLine = null; // Separate highlighting for Metro North/MTA
        let highlightedSubwayLine = null; // Separate highlighting for MTA Subway
        
        // Bus route loading state
        let busRoutesLoaded = false;
        let busRoutesLoading = false;
        
        // Shuttle route loading state
        let shuttleRoutesLoaded = false;
        let shuttleRoutesLoading = false;
        
        // LIRR route loading state
        let lirrRoutesLoaded = false;
        let lirrRoutesLoading = false;
        
        // Metro North route loading state
        let metroNorthRoutesLoaded = false;
        let metroNorthRoutesLoading = false;
        
        // MTA Subway route loading state
        let subwayRoutesLoaded = false;
        let subwayRoutesLoading = false;
        
        // Bus stop visibility state
        let busStopsVisible = false;
        const busStopLayers = new Map(); // Separate layers for bus stops
        const busStopToRoutes = new Map(); // Track which routes serve each bus stop
        const BUS_STOPS_MIN_ZOOM = 14; // Show bus stops at zoom level 14+
        
        // Performance optimization: Cache marker collections for faster zoom updates
        const stopMarkersCache = new Set(); // Cache all stop markers
        const liveVehicleMarkersCache = new Set(); // Cache all live vehicle markers
        
        // Check if data is ready before proceeding
        if (typeof mbtaStopsData === 'undefined' || !mbtaStopsData) {
            document.getElementById('map').innerHTML = '<div style="text-align: center; padding: 50px; font-size: 18px; color: #666;">Loading MBTA data...</div>';
            // Don't run any more code
            throw new Error('MBTA data not loaded');
        }
        
        // Initialize the map centered on New York/Long Island with canvas renderer for better performance
        map = L.map('map', {
            preferCanvas: true,  // Use canvas for better performance with many objects
            renderer: L.canvas(),
            // Performance optimizations for smoother panning
            zoomAnimation: true,
            fadeAnimation: true,
            markerZoomAnimation: false,  // Disable marker zoom animation for better performance
            inertiaDeceleration: 2000,  // Smoother panning deceleration (higher = smoother)
            inertiaMaxSpeed: Infinity,  // No speed limit for panning
            maxBoundsViscosity: 0.0  // Disable bounds viscosity for smoother panning
        }).setView([40.7589, -73.7250], 10); // Start with MTA view (NYC/Long Island)
        
        // Add OpenStreetMap tiles with performance optimizations
        const osmTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'Â© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            keepBuffer: 2,  // Keep 2 rows/cols of tiles around viewport for smoother panning
            updateWhenIdle: true,  // Only update tiles when panning stops (better performance)
            updateWhenZooming: false  // Don't update during zoom animation
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
        
        map.createPane('metroNorthPane');
        map.getPane('metroNorthPane').style.zIndex = 407; // Metro North - above LIRR
        
        map.createPane('subwayPane');
        map.getPane('subwayPane').style.zIndex = 408; // MTA Subway - above Metro North
        
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
            if (highlightedMetroNorthLine !== null) {
                resetMetroNorthHighlight();
            }
            if (highlightedSubwayLine !== null) {
                resetSubwayHighlight();
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
            // Scale icon size based on zoom: smaller when zoomed out, smaller when zoomed in too
            // More aggressive scaling for better visibility at different zoom levels
            // Zoom 8: 40% size, Zoom 9: 50% size, Zoom 10: 60% size, Zoom 11: 75% size, Zoom 12: 80% size, Zoom 13: 75% size, Zoom 14+: 70% size (capped)
            if (currentZoom <= 8) {
                return Math.round(baseSize * 0.4);
            } else if (currentZoom <= 9) {
                return Math.round(baseSize * 0.5);
            } else if (currentZoom <= 10) {
                return Math.round(baseSize * 0.6);
            } else if (currentZoom <= 11) {
                return Math.round(baseSize * 0.75);
            } else if (currentZoom <= 12) {
                return Math.round(baseSize * 0.8);
            } else if (currentZoom <= 13) {
                return Math.round(baseSize * 0.75);
            } else {
                // Cap at 70% for very high zoom levels to prevent icons from getting too large
                return Math.round(baseSize * 0.7);
            }
        }
        
        // Generalized function to render route tracks (polylines)
        function renderRouteTrack(coords, options = {}) {
            if (!coords || coords.length < 2) {
                return null;
            }
            
            const {
                color = '#666',
                weight = 3,
                opacity = 0.7,
                pane = null,
                popupText = null,
                onClick = null
            } = options;
            
            const polylineOptions = {
                color: color,
                weight: weight,
                opacity: opacity
            };
            
            if (pane) {
                polylineOptions.pane = pane;
            }
            
            const trackLine = L.polyline(coords, polylineOptions);
            
            if (popupText) {
                trackLine.bindPopup(popupText);
            }
            
            if (onClick) {
                trackLine.on('click', onClick);
            }
            
            return trackLine;
        }
        
        // Generalized function to render stop markers (circle markers)
        function renderStopMarker(coords, options = {}) {
            if (!coords || !Array.isArray(coords) || coords.length < 2) {
                return null;
            }
            
            const {
                radius = 5,
                baseRadius = 5,
                fillColor = '#666',
                color = '#fff',
                weight = 1.5,
                opacity = 1,
                fillOpacity = 0.8,
                pane = 'stopsPane',
                tooltipText = null,
                tooltipDirection = 'top',
                onClick = null,
                interactive = true,
                bubblingMouseEvents = false
            } = options;
            
            const marker = L.circleMarker(coords, {
                pane: pane,
                radius: radius,
                baseRadius: baseRadius,
                fillColor: fillColor,
                color: color,
                weight: weight,
                opacity: opacity,
                fillOpacity: fillOpacity,
                interactive: interactive,
                bubblingMouseEvents: bubblingMouseEvents
            });
            
            if (tooltipText) {
                marker.bindTooltip(tooltipText, {
                    direction: tooltipDirection,
                    permanent: false,
                    interactive: true,
                    className: 'custom-tooltip'
                });
            }
            
            if (onClick) {
                marker.on('click', onClick);
            }
            
            // Add to cache for performance optimization
            stopMarkersCache.add(marker);
            
            return marker;
        }
        
        // Generalized function to render live vehicle markers
        function renderLiveVehicleMarker(coords, options = {}) {
            if (!coords || !Array.isArray(coords) || coords.length < 2) {
                return null;
            }
            
            const {
                iconUrl = null,
                iconSize = [12, 12],
                baseIconSize = 12,
                iconAnchor = null,
                popupContent = null,
                tooltipContent = null,
                tooltipDirection = 'top',
                routeName = null,
                displayName = null,
                routeId = null,
                onClick = null,
                zIndexOffset = 0
            } = options;
            
            // Create icon if provided
            let icon = null;
            if (iconUrl) {
                const anchor = iconAnchor || [iconSize[0] / 2, iconSize[1] / 2];
                icon = L.icon({
                    iconUrl: iconUrl,
                    iconSize: iconSize,
                    iconAnchor: anchor,
                    baseIconSize: baseIconSize
                });
            }
            
            const markerOptions = {
                icon: icon,
                pane: 'markerPane'
            };
            
            if (zIndexOffset !== 0) {
                markerOptions.zIndexOffset = zIndexOffset;
            }
            
            const marker = L.marker(coords, markerOptions);
            
            if (popupContent) {
                marker.bindPopup(popupContent);
            }
            
            if (tooltipContent) {
                marker.bindTooltip(tooltipContent, {
                    direction: tooltipDirection,
                    permanent: false,
                    interactive: true,
                    className: 'custom-tooltip'
                });
            }
            
            // Store metadata
            if (routeName !== null) marker.routeName = routeName;
            if (displayName !== null) marker.displayName = displayName;
            if (routeId !== null) marker.routeId = routeId;
            
            if (onClick) {
                marker.on('click', onClick);
            }
            
            // Add to cache for performance optimization
            liveVehicleMarkersCache.add(marker);
            
            return marker;
        }
        
        // Add zoom handler for bus stops visibility and stop sizing
        map.on('zoomend', function() {
            const currentZoom = map.getZoom();
            const zoomSufficient = currentZoom >= BUS_STOPS_MIN_ZOOM;
            const busRoutesChecked = document.getElementById('show-bus-paths')?.checked || false;
            const shouldShowBusStops = zoomSufficient && busRoutesChecked;
            
            // Only update if state changed
            if (shouldShowBusStops !== busStopsVisible) {
                busStopsVisible = shouldShowBusStops;
                toggleBusStopsVisibility(shouldShowBusStops);
            }
            
            // Update all stop marker sizes based on zoom - use cached collections for performance
            // Only update markers that are actually on the map
            stopMarkersCache.forEach(marker => {
                if (map.hasLayer(marker)) {
                    const baseRadius = marker.options.baseRadius || 5;
                    const newRadius = getStopRadius(baseRadius, currentZoom);
                    marker.setRadius(newRadius);
                }
            });
            
            // Update live vehicle icon markers - use cached collections for performance
            liveVehicleMarkersCache.forEach(marker => {
                if (map.hasLayer(marker)) {
                    const icon = marker.options.icon;
                    const baseIconSize = icon.options.baseIconSize;
                    if (baseIconSize) {
                        const newSize = getIconSize(baseIconSize, currentZoom);
                        const newIcon = L.icon({
                            iconUrl: icon.options.iconUrl,
                            iconSize: [newSize, newSize],
                            iconAnchor: [newSize / 2, newSize / 2],
                            baseIconSize: baseIconSize // Preserve base size
                        });
                        marker.setIcon(newIcon);
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
        
        // Initialize layers for Metro North routes (if data available)
        if (typeof metroNorthRoutesData !== 'undefined' && metroNorthRoutesData && metroNorthRoutesData.routes) {
            try {
                Object.keys(metroNorthRoutesData.routes).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    // Don't add to map yet - wait for checkbox
                });
            } catch (e) {
                // Metro North data initialization skipped
            }
        }
        
        // Initialize layers for MTA Subway routes (if data available)
        if (typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData && mtaSubwayRoutesData.routes) {
            try {
                Object.keys(mtaSubwayRoutesData.routes).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    // Don't add to map yet - wait for checkbox
                });
            } catch (e) {
                // MTA Subway data initialization skipped
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
        
        // Metro North lines - will be populated from Metro North data if available
        let metroNorthLines = [];
        if (typeof metroNorthRoutesData !== 'undefined' && metroNorthRoutesData && metroNorthRoutesData.routes) {
            metroNorthLines = Object.keys(metroNorthRoutesData.routes);
        }
        
        // MTA Subway lines - will be populated from subway data if available
        let mtaSubwayLines = [];
        if (typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData && mtaSubwayRoutesData.routes) {
            mtaSubwayLines = Object.keys(mtaSubwayRoutesData.routes);
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
        
        // Metro North paths filter (always set up, even if data not available yet)
        const metroNorthPathsCheckbox = document.getElementById('show-metro-north-paths');
        if (!metroNorthPathsCheckbox) {
            console.error('Metro North paths checkbox not found in DOM!');
        }
        if (metroNorthPathsCheckbox) {
            metroNorthPathsCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                // Only proceed if data is available
                if (metroNorthLines.length === 0) {
                    return;
                }
                
                if (!metroNorthRoutesLoaded && !metroNorthRoutesLoading) {
                    // Load Metro North routes if not already loaded
                    loadMetroNorthRoutes(isChecked);
                } else if (metroNorthRoutesLoaded) {
                    // Toggle visibility of already loaded routes
                    metroNorthLines.forEach(lineName => {
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
        
        // Metro North live tracking filter (always set up, even if data not available yet)
        const metroNorthLiveCheckbox = document.getElementById('show-metro-north-live');
        if (metroNorthLiveCheckbox) {
            metroNorthLiveCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                // Only proceed if data is available
                if (metroNorthLines.length === 0) {
                    return;
                }
                
                // Hide/show Metro North train markers
                metroNorthMarkers.forEach((marker, trainId) => {
                    if (marker) {
                        if (isChecked) {
                            marker.addTo(map);
                        } else {
                            marker.remove();
                        }
                    }
                });
                
                // Control live tracking for Metro North
                if (isChecked) {
                    if (!metroNorthTrackingInterval) {
                        startMetroNorthTracking();
                    }
                } else {
                    stopMetroNorthTracking();
                }
                
                updateStats();
            });
            
            // Start Metro North tracking if checkbox is checked by default and data is available
            if (metroNorthLiveCheckbox.checked && metroNorthLines.length > 0) {
                setTimeout(() => {
                    startMetroNorthTracking();
                }, 2000); // Start after 2 seconds to let everything load
            }
        }
        
        // MTA Subway paths filter (REBUILT FROM SCRATCH - FOLLOWING LIRR PATTERN)
        const subwayPathsCheckbox = document.getElementById('show-mta-subway-paths');
        if (subwayPathsCheckbox && mtaSubwayLines.length > 0) {
            subwayPathsCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                if (!subwayRoutesLoaded && !subwayRoutesLoading) {
                    // Load subway routes if not already loaded
                    loadMTASubwayRoutes(isChecked);
                } else if (subwayRoutesLoaded) {
                    // Toggle visibility of already loaded routes
                    mtaSubwayLines.forEach(lineName => {
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
        
        // Add MTA Subway route colors dynamically if data is available
        if (typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData && mtaSubwayRoutesData.routes) {
            Object.keys(mtaSubwayRoutesData.routes).forEach(routeName => {
                const route = mtaSubwayRoutesData.routes[routeName];
                // Use route-specific color from data
                const color = route.color || '#808183'; // Default gray
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
                                    
                                    const trackLine = renderRouteTrack(cleanCoords, {
                                        color: color,
                                        weight: 3,
                                        opacity: 0.7,
                                        pane: pane,
                                        popupText: `<b>${lineName}</b> Shape ${shapeIndex + 1} Track`
                                    });
                                    
                                    if (trackLine) {
                                        routeTracks.push(trackLine);
                                        totalTracksDrawn++;
                                    }
                                }
                            }
                        });
                    }
                    
                    // Process stop markers - create separate marker for each line
                    stops.forEach(stop => {
                        const stopRoutes = stopToRoutes[stop.stopId] || [];
                        
                        // Check if routes have different colors - only mark as multi-line if colors differ
                        const routeColors = new Set();
                        stopRoutes.forEach(route => {
                            const routeColor = lineColors[route] || color;
                            routeColors.add(routeColor);
                        });
                        const isMultiLine = routeColors.size > 1; // Only multi-line if different colors
                        
                        // Determine if this is a true transfer stop (multiple service types with different colors)
                        const serviceTypes = new Set();
                        stopRoutes.forEach(route => {
                            // Categorize by line type
                            if (route === 'Red Line') serviceTypes.add('Red');
                            else if (route === 'Orange Line') serviceTypes.add('Orange');
                            else if (route === 'Blue Line') serviceTypes.add('Blue');
                            else if (route.startsWith('Green Line')) serviceTypes.add('Green');
                            else if (commuterLines.includes(route) || seasonalLines.includes(route)) {
                                // Group all commuter rail lines together (they share the same color)
                                serviceTypes.add('Commuter');
                            }
                        });
                        
                        // Only mark as transfer stop if different service types AND different colors
                        const isTransferStop = serviceTypes.size > 1 && isMultiLine;
                        // Use route color if not multi-line (same color routes), grey only if different colors
                        const stopFillColor = isMultiLine ? '#D3D3D3' : color; // Light grey for shared stations with different colors
                        
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
                        
                        const popupText = isMultiLine ? 
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: ${stop.type}<br>Lines: ${stopRoutes.join(', ')}<br>Coordinates: ${stop.coords[0].toFixed(6)}, ${stop.coords[1].toFixed(6)}</div>` :
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: ${stop.type}<br>Line: ${lineName}<br>Coordinates: ${stop.coords[0].toFixed(6)}, ${stop.coords[1].toFixed(6)}</div>`;
                        
                        // Use tooltip direction based on latitude
                        const tooltipDirection = stop.coords[0] < 42.361220 ? 'bottom' : 'top';
                        
                        // Create click handler for all subway and commuter rail stops
                        let onClickHandler = null;
                        if (stop.type === 'Subway' || stop.type === 'Commuter Rail') {
                            onClickHandler = function(e) {
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
                            };
                        }
                        
                        // Create marker using generalized function
                        const marker = renderStopMarker(stop.coords, {
                            radius: radius,
                            baseRadius: baseRadius,
                            fillColor: stopFillColor,
                            color: '#fff',
                            weight: 1.5,
                            opacity: 1,
                            fillOpacity: 0.8,
                            pane: 'stopsPane',
                            tooltipText: popupText,
                            tooltipDirection: tooltipDirection,
                            onClick: onClickHandler,
                            interactive: true,
                            bubblingMouseEvents: false
                        });
                        
                        // Add custom properties if needed (colors for multi-line)
                        if (isMultiLine && marker) {
                            marker.options.colors = [color];
                        }
                        
                        // Create a larger invisible hit area for easier clicking (preserve existing behavior)
                        if (marker) {
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
                        }
                        
                        if (marker) {
                            routeMarkers.push(marker);
                            totalStopsDrawn++;
                        }
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
                        requestAnimationFrame(() => processChunk(endIndex)); // Use requestAnimationFrame for smoother rendering
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
                                const trackLine = renderRouteTrack(shape.coords, {
                                    color: color,
                                    weight: 3,
                                    opacity: 0.8,
                                    pane: 'ferryPane',
                                    popupText: `<b>Ferry Route ${lineName}</b> Shape ${shapeIndex + 1}`
                                });
                                
                                if (trackLine) {
                                    routeTracks.push(trackLine);
                                }
                            }
                        });
                    }
                    
                    // Process ferry stop markers
                    stops.forEach(stop => {
                        const stopContent = `
                            <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                                <b>${stop.name}</b><br>
                                Type: ${stop.type}<br>
                                Route: ${lineName}<br>
                                Coordinates: ${stop.coords[0].toFixed(6)}, ${stop.coords[1].toFixed(6)}
                            </div>
                        `;
                        const tooltipDirection = stop.coords[0] < 42.361220 ? 'bottom' : 'top';
                        
                        const marker = renderStopMarker(stop.coords, {
                            radius: 6,
                            baseRadius: 6,
                            fillColor: color,
                            color: '#fff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.9,
                            pane: 'stopsPane',
                            tooltipText: stopContent,
                            tooltipDirection: tooltipDirection
                        });
                        
                        if (marker) {
                            routeMarkers.push(marker);
                        }
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
            // CRITICAL: Convert routeKey to string to ensure consistent key matching
            // JavaScript object keys are always strings, but routeKey might be a number
            const routeKeyStr = String(routeKey);
            
            // Check if the layer already exists and has content
            if (layers[routeKeyStr] && layers[routeKeyStr].getLayers().length > 0) {
                return;
            }
            
            // Create layer if it doesn't exist
            if (!layers[routeKeyStr]) {
                layers[routeKeyStr] = L.layerGroup();
            }
            
            let routeData = null;
            let routeShapes = null;
            let color = '#FFD700';
            let displayName = routeKeyStr;
            
            // Get data based on route type
            if (routeType === 'bus') {
                routeData = mbtaBusData[routeKeyStr];
                routeShapes = typeof busRouteShapes !== 'undefined' ? busRouteShapes[routeKeyStr] : null;
                // CRITICAL: Check if this is actually a bus route in mbtaBusData before using lineColors
                // MTA subway routes also use single-digit IDs ("1", "2", "3") and would overwrite bus colors
                if (mbtaBusData[routeKeyStr] && !mtaSubwayLines.includes(routeKeyStr)) {
                    color = lineColors[routeKeyStr] || '#FFD700';
                } else {
                    color = '#FFD700'; // Default bus yellow - don't use MTA subway colors
                }
                displayName = `Bus Route ${routeKeyStr}`;
            } else if (routeType === 'shuttle') {
                routeData = mbtaShuttleData[routeKeyStr];
                routeShapes = typeof shuttleRouteShapes !== 'undefined' ? shuttleRouteShapes[routeKeyStr] : null;
                color = lineColors[routeKeyStr] || '#FF6B6B';
                displayName = `Shuttle ${routeKeyStr}`;
            } else if (routeType === 'silver') {
                routeData = silverLineData[routeKeyStr];
                routeShapes = typeof silverLineShapes !== 'undefined' ? silverLineShapes[routeKeyStr] : null;
                color = lineColors[routeKeyStr] || '#7C878E';
                displayName = `Silver Line ${routeKeyStr}`;
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
                        layers[routeKeyStr].addLayer(trackLine);
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
                // CRITICAL: Check both string and numeric keys to handle type mismatches
                return !mbtaStopsData || (!mbtaStopsData[lineName] && !mbtaStopsData[Number(lineName)]);
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
                    // CRITICAL: Don't use lineColors if this route ID matches an MTA subway line
                    // MTA subway routes use single-digit IDs ("1", "2", "3") which would overwrite bus colors
                    const color = (mbtaBusData[lineName] && !mtaSubwayLines.includes(lineName) && lineColors[lineName]) 
                        ? lineColors[lineName] 
                        : '#FFD700'; // Default bus yellow
                    
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
                                const trackLine = renderRouteTrack(coords, {
                                    color: color,
                                    weight: 4,
                                    opacity: 1.0,
                                    pane: 'busPane',
                                    popupText: `<b>Bus Route ${lineName}</b>`,
                                    onClick: function(e) {
                                        L.DomEvent.stopPropagation(e);
                                        
                                        // Toggle highlighting for this specific route only
                                        if (isLineHighlighted(lineName)) {
                                            resetHighlight();
                                        } else {
                                            // Load the route if not already loaded
                                            loadSingleRoute(lineName, 'bus');
                                            highlightLine(lineName);
                                        }
                                    }
                                });
                                
                                if (trackLine) {
                                    layers[lineName].addLayer(trackLine);
                                }
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
                    requestAnimationFrame(() => processChunk()); // Use requestAnimationFrame for smoother rendering
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
                // CRITICAL: Check both string and numeric keys to handle type mismatches
                if (mbtaStopsData && (mbtaStopsData[lineName] || mbtaStopsData[Number(lineName)])) return;
                
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
                // CRITICAL: Check both string and numeric keys to handle type mismatches
                if (mbtaStopsData && (mbtaStopsData[lineName] || mbtaStopsData[Number(lineName)])) return;
                
                const stops = mbtaBusData[lineName];
                // CRITICAL: Don't use lineColors if this route ID matches an MTA subway line
                // MTA subway routes use single-digit IDs ("1", "2", "3") which would overwrite bus colors
                const color = (mbtaBusData[lineName] && !mtaSubwayLines.includes(lineName) && lineColors[lineName]) 
                    ? lineColors[lineName] 
                    : '#FFD700'; // Default bus yellow
                
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
                    
                    // Add click handler to highlight this specific route only
                    // Each stop marker is created for a specific route (lineName), so highlight only that route
                    marker.on('click', function(e) {
                        // Prevent map click from firing
                        L.DomEvent.stopPropagation(e);
                        
                        // Highlight only this specific route, not all routes serving the stop
                        const routeToHighlight = lineName;
                        
                        // Check if this route is already highlighted
                        const alreadyHighlighted = isLineHighlighted(routeToHighlight);
                        
                        // If something else is already highlighted, check if this route is part of it
                        if (highlightedLine && !alreadyHighlighted) {
                            const isCurrentlyDimmed = Array.isArray(highlightedLine)
                                ? !highlightedLine.includes(routeToHighlight)
                                : highlightedLine !== routeToHighlight;
                            
                            if (isCurrentlyDimmed) {
                                // Don't allow highlighting a dimmed route - do nothing
                                return;
                            }
                        }
                        
                        // If clicking the same route, reset; otherwise highlight just this route
                        if (alreadyHighlighted) {
                            resetHighlight();
                        } else {
                            // Load the route if not already loaded
                            loadSingleRoute(routeToHighlight, 'bus');
                            highlightLine(routeToHighlight);
                        }
                    });
                    
                    // Add this marker to this route's layer
                    layer.addLayer(marker);
                });
            });
        }
        
        // Function to toggle bus stops visibility
        function toggleBusStopsVisibility(show) {
            // Always check checkbox state - don't show if checkbox is unchecked
            const busRoutesChecked = document.getElementById('show-bus-paths')?.checked || false;
            const zoomSufficient = map.getZoom() >= BUS_STOPS_MIN_ZOOM;
            const shouldShow = show && busRoutesChecked && zoomSufficient;
            
            if (shouldShow) {
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
                            const trackLine = renderRouteTrack(coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.8,
                                pane: 'lirrPane',
                                popupText: `<b>LIRR: ${lineName}</b><br>Route ID: ${route.route_id || 'N/A'}`,
                                onClick: function(e) {
                                    L.DomEvent.stopPropagation(e);
                                    
                                    // Toggle highlighting
                                    if (highlightedLIRRLine === lineName) {
                                        resetLIRRHighlight();
                                    } else {
                                        highlightLIRRLine(lineName);
                                    }
                                }
                            });
                            
                            if (trackLine) {
                                layers[lineName].addLayer(trackLine);
                            }
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
                        
                        // Multi-route stops get light grey fill, single-route stops get route color
                        const fillColor = isMultiRoute ? '#D3D3D3' : color; // Light grey for shared stations
                        
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
        
        // Function to load Metro North routes
        function loadMetroNorthRoutes(showOnMap = false) {
            if (metroNorthRoutesLoaded || metroNorthRoutesLoading) {
                // Already loaded or loading - just show/hide as needed
                if (metroNorthRoutesLoaded) {
                    metroNorthLines.forEach(lineName => {
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
            
            // Check if Metro North data is available
            if (typeof metroNorthRoutesData === 'undefined' || !metroNorthRoutesData || !metroNorthRoutesData.routes) {
                return;
            }
            
            metroNorthRoutesLoading = true;
            
            // Show loading indicator
            const loadingIndicator = document.getElementById('metro-north-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'table-row';
            }
            
            // Process routes
            metroNorthLines.forEach(lineName => {
                const route = metroNorthRoutesData.routes[lineName];
                if (!route) {
                    return;
                }
                // Use route color from data, fallback to lineColors, then default
                const color = route.color || lineColors[lineName] || '#003A70';
                
                // Render route shapes if available
                if (route.shapes && route.shapes.length > 0) {
                    route.shapes.forEach((shape, shapeIndex) => {
                        let coords = shape.coords;
                        
                        if (coords && Array.isArray(coords) && coords.length > 1) {
                            const trackLine = renderRouteTrack(coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.8,
                                pane: 'metroNorthPane',
                                popupText: `<b>Metro North: ${lineName}</b><br>Route ID: ${route.route_id || 'N/A'}<br>Shape ID: ${shape.shape_id || 'N/A'}<br>Points: ${coords.length}`,
                                onClick: function(e) {
                                    L.DomEvent.stopPropagation(e);
                                    
                                    // Toggle highlighting
                                    if (highlightedMetroNorthLine === lineName) {
                                        resetMetroNorthHighlight();
                                    } else {
                                        highlightMetroNorthLine(lineName);
                                    }
                                }
                            });
                            
                            if (trackLine) {
                                layers[lineName].addLayer(trackLine);
                            }
                        }
                    });
                }
                
                // Add to map if requested
                if (showOnMap && layers[lineName]) {
                    map.addLayer(layers[lineName]);
                }
            });
            
            // Hide loading indicator
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            metroNorthRoutesLoaded = true;
            metroNorthRoutesLoading = false;
            
            // Load Metro North stations after routes
            loadMetroNorthStations();
        }
        
        // Function to load Metro North stations (visible at all zoom levels)
        function loadMetroNorthStations() {
            if (typeof metroNorthRoutesData === 'undefined' || !metroNorthRoutesData || !metroNorthRoutesData.routes) {
                return;
            }
            
            // First pass: Build a map of stop_id -> routes serving that stop
            const stopToRoutes = new Map();
            metroNorthLines.forEach(lineName => {
                const route = metroNorthRoutesData.routes[lineName];
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
            
            metroNorthLines.forEach(lineName => {
                const route = metroNorthRoutesData.routes[lineName];
                // Use route color from data, fallback to lineColors, then default
                const color = route?.color || lineColors[lineName] || '#003A70';
                
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
                        
                        // Multi-route stops get light grey fill, single-route stops get route color
                        const fillColor = isMultiRoute ? '#D3D3D3' : color; // Light grey for shared stations
                        
                        // Calculate radius based on zoom
                        const baseRadius = 5; // Metro North stops (smaller)
                        const currentZoom = map.getZoom();
                        const radius = getStopRadius(baseRadius, currentZoom);
                        
                        // Build tooltip with all serving routes (matching MBTA style)
                        const routesText = isMultiRoute ? servingRoutes.join(', ') : lineName;
                        const tooltipText = isMultiRoute ? 
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Lines: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>` :
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Line: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>`;
                        
                        // Use tooltip direction based on latitude (matching MBTA style)
                        const tooltipDirection = stop.lat < 40.76 ? 'bottom' : 'top';
                        
                        // Create click handler for highlighting
                        const onClickHandler = function(e) {
                            L.DomEvent.stopPropagation(e);
                            
                            // Get all routes serving this stop
                            const servingRoutes = stopInfo.routes;
                            
                            // Check if these routes are already highlighted
                            const alreadyHighlighted = Array.isArray(highlightedMetroNorthLine) 
                                ? JSON.stringify(highlightedMetroNorthLine.sort()) === JSON.stringify(servingRoutes.sort())
                                : highlightedMetroNorthLine === lineName && servingRoutes.length === 1;
                            
                            // If something else is already highlighted and this isn't part of it, do nothing
                            if (highlightedMetroNorthLine && !alreadyHighlighted) {
                                // Check if any of the serving routes are currently dimmed
                                const isCurrentlyDimmed = Array.isArray(highlightedMetroNorthLine)
                                    ? !servingRoutes.some(route => highlightedMetroNorthLine.includes(route))
                                    : !servingRoutes.includes(highlightedMetroNorthLine);
                                
                                if (isCurrentlyDimmed) {
                                    // Don't allow highlighting a dimmed line - do nothing
                                    return;
                                }
                            }
                            
                            // Toggle highlighting
                            if (alreadyHighlighted) {
                                resetMetroNorthHighlight();
                            } else {
                                if (servingRoutes.length > 1) {
                                    highlightMultipleMetroNorthLines(servingRoutes);
                                } else {
                                    highlightMetroNorthLine(servingRoutes[0]);
                                }
                            }
                        };
                        
                        // Create marker using generalized function
                        const stationMarker = renderStopMarker([stop.lat, stop.lon], {
                            radius: radius,
                            baseRadius: baseRadius,
                            fillColor: fillColor,
                            color: '#fff',
                            weight: 1.5,
                            opacity: 1,
                            fillOpacity: 0.8,
                            pane: 'stopsPane',
                            tooltipText: tooltipText,
                            tooltipDirection: tooltipDirection,
                            onClick: onClickHandler,
                            interactive: true,
                            bubblingMouseEvents: false
                        });
                        
                        // Add this marker to this route's layer
                        if (layers[lineName] && stationMarker) {
                            layers[lineName].addLayer(stationMarker);
                        }
                    }
                });
            });
        }
        
        // Function to load MTA Subway routes
        // Function to load MTA Subway routes (REBUILT FROM SCRATCH - FOLLOWING LIRR PATTERN)
        function loadMTASubwayRoutes(showOnMap = false) {
            if (subwayRoutesLoaded || subwayRoutesLoading) {
                // Already loaded or loading - just show/hide as needed
                if (subwayRoutesLoaded) {
                    mtaSubwayLines.forEach(lineName => {
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
            
            // Check if subway data is available
            if (typeof mtaSubwayRoutesData === 'undefined' || !mtaSubwayRoutesData || !mtaSubwayRoutesData.routes) {
                return;
            }
            
            subwayRoutesLoading = true;
            
            // Show loading indicator
            const loadingIndicator = document.getElementById('mta-subway-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'table-row';
            }
            
            // Process routes
            mtaSubwayLines.forEach(lineName => {
                const route = mtaSubwayRoutesData.routes[lineName];
                if (!route) {
                    return;
                }
                
                // Use route color from data, fallback to lineColors, then default
                const color = route.color || lineColors[lineName] || '#808183';
                
                // Render route shapes if available
                if (route.shapes && route.shapes.length > 0) {
                    route.shapes.forEach((shape, shapeIndex) => {
                        let coords = shape.coords;
                        
                        if (coords && Array.isArray(coords) && coords.length > 1) {
                            // Create click handler for highlighting (shared by both lines)
                            const onClickHandler = function(e) {
                                L.DomEvent.stopPropagation(e);
                                
                                // Toggle highlighting
                                if (highlightedSubwayLine === lineName) {
                                    resetSubwayHighlight();
                                } else {
                                    highlightSubwayLine(lineName);
                                }
                            };
                            
                            // Create the colored outer track line
                            const trackLine = renderRouteTrack(coords, {
                                color: color,
                                weight: 5,
                                opacity: 0.9,
                                pane: 'subwayPane',
                                popupText: `<b>MTA Subway: ${lineName} Line</b><br>${route.long_name || ''}`,
                                onClick: onClickHandler
                            });
                            
                            // Create a black center line to distinguish subway from commuter rail
                            const centerLine = renderRouteTrack(coords, {
                                color: 'black',
                                weight: 1.5,
                                opacity: 0.6,
                                pane: 'subwayPane',
                                onClick: onClickHandler
                            });
                            
                            // Add track line first, then center line on top
                            if (layers[lineName]) {
                                if (trackLine) {
                                    layers[lineName].addLayer(trackLine);
                                }
                                if (centerLine) {
                                    layers[lineName].addLayer(centerLine);
                                }
                            }
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
            
            subwayRoutesLoaded = true;
            subwayRoutesLoading = false;
            
            // Load subway stations after routes
            loadMTASubwayStations();
        }
        
        // Function to load MTA Subway stations (REBUILT FROM SCRATCH - FOLLOWING LIRR PATTERN)
        function loadMTASubwayStations() {
            if (typeof mtaSubwayRoutesData === 'undefined' || !mtaSubwayRoutesData || !mtaSubwayRoutesData.routes) {
                return;
            }
            
            // First pass: Build a map of stop_id -> routes serving that stop
            const stopToRoutes = new Map();
            mtaSubwayLines.forEach(lineName => {
                const route = mtaSubwayRoutesData.routes[lineName];
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
            mtaSubwayLines.forEach(lineName => {
                const route = mtaSubwayRoutesData.routes[lineName];
                const color = route.color || lineColors[lineName] || '#808183';
                
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
                        
                        // Multi-route stops get light grey fill, single-route stops get route color
                        const fillColor = isMultiRoute ? '#D3D3D3' : color;
                        
                        // Calculate radius based on zoom
                        const baseRadius = 3; // Subway stops (smallest)
                        const currentZoom = map.getZoom();
                        const radius = getStopRadius(baseRadius, currentZoom);
                        
                        // Build tooltip
                        const routesText = isMultiRoute ? servingRoutes.join(', ') : lineName;
                        const tooltipText = isMultiRoute ? 
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Subway<br>Lines: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>` :
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Subway<br>Line: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>`;
                        
                        const tooltipDirection = stop.lat < 40.76 ? 'bottom' : 'top';
                        
                        // Create click handler for highlighting
                        const onClickHandler = function(e) {
                            L.DomEvent.stopPropagation(e);
                            
                            // Get all routes serving this stop
                            const servingRoutes = stopInfo.routes;
                            
                            // Check if these routes are already highlighted
                            const alreadyHighlighted = Array.isArray(highlightedSubwayLine) 
                                ? JSON.stringify(highlightedSubwayLine.sort()) === JSON.stringify(servingRoutes.sort())
                                : highlightedSubwayLine === lineName && servingRoutes.length === 1;
                            
                            // Toggle highlighting
                            if (alreadyHighlighted) {
                                resetSubwayHighlight();
                            } else {
                                if (servingRoutes.length > 1) {
                                    highlightMultipleSubwayLines(servingRoutes);
                                } else {
                                    highlightSubwayLine(servingRoutes[0]);
                                }
                            }
                        };
                        
                        // Create marker using generalized function
                        const stationMarker = renderStopMarker([stop.lat, stop.lon], {
                            radius: radius,
                            baseRadius: baseRadius,
                            fillColor: fillColor,
                            color: '#fff',
                            weight: 0.8,
                            opacity: 1,
                            fillOpacity: 0.8,
                            pane: 'stopsPane',
                            tooltipText: tooltipText,
                            tooltipDirection: tooltipDirection,
                            onClick: onClickHandler,
                            interactive: true,
                            bubblingMouseEvents: false
                        });
                        
                        // Add this marker to this route's layer
                        if (layers[lineName] && stationMarker) {
                            layers[lineName].addLayer(stationMarker);
                        }
                    }
                });
            });
        }
        
        // Function to load Silver Line routes
        function loadSilverLineRoutes() {
            if (!silverLineData || typeof silverLineData !== 'object') {
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
                            const trackLine = renderRouteTrack(shape.coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.7,
                                pane: 'silverLinePane',
                                popupText: `<b>Silver Line ${lineName}</b>`
                            });
                            
                            if (trackLine && layers[lineName]) {
                                layers[lineName].addLayer(trackLine);
                            }
                        }
                    });
                }
                
                // Add stops as markers
                if (stops && Array.isArray(stops)) {
                    stops.forEach(stop => {
                        if (stop.coords && stop.coords.length === 2) {
                            const tooltipText = `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Silver Line ${lineName}</div>`;
                            const tooltipDirection = stop.coords[0] < 42.361220 ? 'bottom' : 'top';
                            
                            const stopMarker = renderStopMarker([stop.coords[0], stop.coords[1]], {
                                radius: 4,
                                baseRadius: 4,
                                fillColor: color,
                                color: color,
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.8,
                                pane: 'stopsPane',
                                tooltipText: tooltipText,
                                tooltipDirection: tooltipDirection
                            });
                            
                            if (stopMarker && layers[lineName]) {
                                layers[lineName].addLayer(stopMarker);
                            }
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
            // CRITICAL: Convert to string for consistent comparison
            const lineNameStr = String(lineName);
            if (Array.isArray(highlightedLine)) {
                return highlightedLine.length === 1 && String(highlightedLine[0]) === lineNameStr;
            }
            return String(highlightedLine) === lineNameStr;
        }
        
        // Function to highlight multiple lines (for multi-line stops)
        function highlightMultipleLines(lineNames) {
            if (!Array.isArray(lineNames) || lineNames.length === 0) return;
            
            // CRITICAL: Convert all line names to strings to ensure consistent key matching
            const lineNamesStr = lineNames.map(name => String(name));
            
            // Store as array if multiple, or single string if one
            highlightedLine = lineNamesStr.length === 1 ? lineNamesStr[0] : lineNamesStr;
            highlightedLIRRLine = null; // Clear LIRR highlighting
            highlightedMetroNorthLine = null; // Clear Metro North highlighting
            
            // Always show highlighted lines (even if checkbox is off)
            lineNamesStr.forEach(lineName => {
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
            
            // Remove dimmed layers from map or show highlighted ones - batch operations for performance
            const layersToRemove = [];
            const layersToAdd = [];
            
            Object.keys(layers).forEach(layerName => {
                // CRITICAL: Check if this is an MBTA bus route first
                // If it's in mbtaBusData, it's an MBTA bus route and should be dimmed (not skipped)
                const isMBTABus = typeof mbtaBusData !== 'undefined' && mbtaBusData && mbtaBusData[layerName];
                
                // Only skip if it's NOT an MBTA bus route AND it's an MTA subway route
                // This prevents MBTA bus routes (like "1" and "4") from being skipped just because
                // they share the same ID with MTA subway routes
                if (!isMBTABus) {
                    const isMTASubway = typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData && mtaSubwayRoutesData.routes && mtaSubwayRoutesData.routes[layerName];
                    if (isMTASubway || lirrLines.includes(layerName) || metroNorthLines.includes(layerName)) {
                        return;
                    }
                }
                
                // MBTA subway/commuter rail lines (in mbtaStopsData) should be dimmed like any other MBTA line
                // Only skip non-MBTA systems (MTA, LIRR, Metro North)
                
                const isDimmed = !lineNamesStr.includes(layerName);
                const layer = layers[layerName];
                const isOnMap = map.hasLayer(layer);
                
                if (isDimmed && isOnMap) {
                    layersToRemove.push(layer);
                } else if (!isDimmed && !isOnMap) {
                    layersToAdd.push(layer);
                }
            });
            
            // Batch remove operations
            layersToRemove.forEach(layer => map.removeLayer(layer));
            // Batch add operations
            layersToAdd.forEach(layer => map.addLayer(layer));
            
            // Also handle bus stop layers separately - batch operations for performance
            const busStopsToRemove = [];
            const busStopsToAdd = [];
            busStopLayers.forEach((layer, layerName) => {
                const isDimmed = !lineNamesStr.includes(layerName);
                const isOnMap = map.hasLayer(layer);
                
                if (isDimmed && isOnMap) {
                    busStopsToRemove.push(layer);
                } else if (!isDimmed && !isOnMap) {
                    busStopsToAdd.push(layer);
                }
            });
            busStopsToRemove.forEach(layer => map.removeLayer(layer));
            busStopsToAdd.forEach(layer => map.addLayer(layer));
            
            // Remove/show live train markers (subway and commuter rail) - batch operations
            const trainMarkersToRemove = [];
            const trainMarkersToAdd = [];
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    const isDimmed = !lineNamesStr.includes(String(marker.routeName));
                    const isOnMap = map.hasLayer(marker);
                    
                    if (isDimmed && isOnMap) {
                        trainMarkersToRemove.push(marker);
                    } else if (!isDimmed && !isOnMap) {
                        trainMarkersToAdd.push(marker);
                    }
                }
            });
            trainMarkersToRemove.forEach(marker => map.removeLayer(marker));
            trainMarkersToAdd.forEach(marker => map.addLayer(marker));
            
            // Remove/show live bus markers - batch operations
            const busMarkersToRemove = [];
            const busMarkersToAdd = [];
            busMarkers.forEach((marker, busId) => {
                if (marker && marker.routeName) {
                    const isDimmed = !lineNamesStr.includes(String(marker.routeName));
                    const isOnMap = map.hasLayer(marker);
                    
                    if (isDimmed && isOnMap) {
                        busMarkersToRemove.push(marker);
                    } else if (!isDimmed && !isOnMap) {
                        busMarkersToAdd.push(marker);
                    }
                }
            });
            busMarkersToRemove.forEach(marker => map.removeLayer(marker));
            busMarkersToAdd.forEach(marker => map.addLayer(marker));
            
            // Remove/show live shuttle markers - batch operations
            const shuttleMarkersToRemove = [];
            const shuttleMarkersToAdd = [];
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker && marker.routeName) {
                    const isDimmed = !lineNamesStr.includes(String(marker.routeName));
                    const isOnMap = map.hasLayer(marker);
                    
                    if (isDimmed && isOnMap) {
                        shuttleMarkersToRemove.push(marker);
                    } else if (!isDimmed && !isOnMap) {
                        shuttleMarkersToAdd.push(marker);
                    }
                }
            });
            shuttleMarkersToRemove.forEach(marker => map.removeLayer(marker));
            shuttleMarkersToAdd.forEach(marker => map.addLayer(marker));
            
            // Remove/show live Silver Line markers - batch operations
            const silverLineMarkersToRemove = [];
            const silverLineMarkersToAdd = [];
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker && marker.routeName) {
                    const isDimmed = !lineNamesStr.includes(String(marker.routeName));
                    const isOnMap = map.hasLayer(marker);
                    
                    if (isDimmed && isOnMap) {
                        silverLineMarkersToRemove.push(marker);
                    } else if (!isDimmed && !isOnMap) {
                        silverLineMarkersToAdd.push(marker);
                    }
                }
            });
            silverLineMarkersToRemove.forEach(marker => map.removeLayer(marker));
            silverLineMarkersToAdd.forEach(marker => map.addLayer(marker));
            
            // Remove live ferry markers (always removed when any line is highlighted) - batch operations
            const ferryMarkersToRemove = [];
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker && map.hasLayer(marker)) {
                    ferryMarkersToRemove.push(marker);
                }
            });
            ferryMarkersToRemove.forEach(marker => map.removeLayer(marker));
            
            // Hide all LIRR lines when highlighting MBTA lines - batch operations
            const lirrLayersToRemove = [];
            lirrLines.forEach(layerName => {
                if (layers[layerName] && map.hasLayer(layers[layerName])) {
                    lirrLayersToRemove.push(layers[layerName]);
                }
            });
            lirrLayersToRemove.forEach(layer => map.removeLayer(layer));
            
            // Remove all LIRR live train markers - batch operations
            const lirrMarkersToRemove = [];
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    lirrMarkersToRemove.push(marker);
                }
            });
            lirrMarkersToRemove.forEach(marker => map.removeLayer(marker));
        }
        
        // Function to highlight a specific line and dim all others
        function highlightLine(lineName) {
            // CRITICAL: Convert lineName to string to ensure consistent key matching
            // JavaScript object keys are always strings, but lineName might be a number
            const lineNameStr = String(lineName);
            highlightedLine = lineNameStr;
            highlightedLIRRLine = null; // Clear LIRR highlighting
            highlightedMetroNorthLine = null; // Clear Metro North highlighting
            
            // Always show the highlighted line (even if checkbox is off)
            if (layers[lineNameStr] && !map.hasLayer(layers[lineNameStr])) {
                map.addLayer(layers[lineNameStr]);
            }
            // Always show stops for highlighted line regardless of zoom
            // Create bus stops if they don't exist yet
            if (busStopLayers.size === 0) {
                createBusStopMarkers();
            }
            if (busStopLayers.has(lineNameStr)) {
                if (!map.hasLayer(busStopLayers.get(lineNameStr))) {
                    busStopLayers.get(lineNameStr).addTo(map);
                }
            }
            
            // Remove dimmed layers from map or show highlighted one
            Object.keys(layers).forEach(layerName => {
                // CRITICAL: Check if this is an MBTA bus route first
                // If it's in mbtaBusData, it's an MBTA bus route and should be dimmed (not skipped)
                const isMBTABus = typeof mbtaBusData !== 'undefined' && mbtaBusData && mbtaBusData[layerName];
                
                // Only skip if it's NOT an MBTA bus route AND it's an MTA subway route
                // This prevents MBTA bus routes (like "1" and "4") from being skipped just because
                // they share the same ID with MTA subway routes
                if (!isMBTABus) {
                    const isMTASubway = typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData && mtaSubwayRoutesData.routes && mtaSubwayRoutesData.routes[layerName];
                    if (isMTASubway || lirrLines.includes(layerName) || metroNorthLines.includes(layerName)) {
                        return;
                    }
                }
                
                // MBTA subway/commuter rail lines (in mbtaStopsData) should be dimmed like any other MBTA line
                // Only skip non-MBTA systems (MTA, LIRR, Metro North)
                
                const isDimmed = layerName !== lineNameStr;
                
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
                const isDimmed = layerName !== lineNameStr;
                
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
                    const isDimmed = String(marker.routeName) !== lineNameStr;
                    
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
                    const isDimmed = String(marker.routeName) !== lineNameStr;
                    
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
                    const isDimmed = String(marker.routeName) !== lineNameStr;
                    
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
            
            // Hide all Metro North lines when highlighting MBTA lines
            metroNorthLines.forEach(layerName => {
                if (layers[layerName] && map.hasLayer(layers[layerName])) {
                    map.removeLayer(layers[layerName]);
                }
            });
            
            // Remove all Metro North live train markers
            metroNorthMarkers.forEach((marker, trainId) => {
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
            
            // Restore Metro North layers based on checkbox state
            const metroNorthPathsChecked = document.getElementById('show-metro-north-paths').checked;
            metroNorthLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (metroNorthPathsChecked) {
                        if (!map.hasLayer(layers[lineName])) {
                            map.addLayer(layers[lineName]);
                        }
                    }
                }
            });
            
            // Restore Metro North live train markers
            const showMetroNorthLive = document.getElementById('show-metro-north-live').checked;
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker) {
                    if (showMetroNorthLive && !map.hasLayer(marker)) {
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
            highlightedSubwayLine = null; // Clear subway highlighting
            
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
                } else {
                    // If marker doesn't have routeName, hide it
                    if (map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Hide all Metro North live markers when highlighting LIRR
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
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
            highlightedSubwayLine = null; // Clear subway highlighting
            
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
                } else {
                    // If marker doesn't have routeName, hide it
                    if (map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Hide all Metro North live markers when highlighting LIRR
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
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
            
            // Restore subway layers based on checkbox state (but respect highlighting)
            if (!highlightedSubwayLine) {
                const subwayPathsChecked = document.getElementById('show-mta-subway-paths').checked;
                mtaSubwayLines.forEach(lineName => {
                    if (layers[lineName]) {
                        if (subwayPathsChecked) {
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
            }
            
            // Restore Metro North layers based on checkbox state
            const metroNorthPathsChecked = document.getElementById('show-metro-north-paths').checked;
            metroNorthLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (metroNorthPathsChecked) {
                        if (!map.hasLayer(layers[lineName])) {
                            map.addLayer(layers[lineName]);
                        }
                    }
                }
            });
            
            // Restore Metro North live train markers
            const showMetroNorthLive = document.getElementById('show-metro-north-live').checked;
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker) {
                    if (showMetroNorthLive && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    }
                }
            });
            
            // Restore MBTA layers based on checkbox states
            Object.keys(layers).forEach(layerName => {
                // Skip LIRR lines
                if (lirrLines.includes(layerName)) {
                    return;
                }
                
                // Skip MTA Subway lines
                if (mtaSubwayLines.includes(layerName)) {
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
        
        // Metro North Highlighting Functions
        
        // Function to highlight multiple Metro North lines (for multi-line stops)
        function highlightMultipleMetroNorthLines(lineNames) {
            highlightedMetroNorthLine = lineNames;
            highlightedLine = null; // Clear MBTA highlighting
            highlightedLIRRLine = null; // Clear LIRR highlighting
            highlightedSubwayLine = null; // Clear subway highlighting
            
            // Remove all dimmed Metro North layers from map, keep highlighted ones
            metroNorthLines.forEach(lineName => {
                const isDimmed = !lineNames.includes(lineName);
                
                if (isDimmed) {
                    if (layers[lineName] && map.hasLayer(layers[lineName])) {
                        map.removeLayer(layers[lineName]);
                    }
                } else {
                    if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                        map.addLayer(layers[lineName]);
                    }
                }
            });
            
            // Remove/show live Metro North markers
            metroNorthMarkers.forEach((marker, trainId) => {
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
                } else {
                    // If marker doesn't have routeName, hide it
                    if (map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Hide all LIRR live markers when highlighting Metro North
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide all MBTA lines when highlighting Metro North lines
            Object.keys(layers).forEach(layerName => {
                // Skip Metro North lines
                if (!metroNorthLines.includes(layerName)) {
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                }
            });
            
            // Hide all LIRR lines when highlighting Metro North lines
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
        
        // Function to highlight a specific Metro North line and dim all others
        function highlightMetroNorthLine(lineName) {
            highlightedMetroNorthLine = lineName;
            highlightedLine = null; // Clear MBTA highlighting
            highlightedLIRRLine = null; // Clear LIRR highlighting
            highlightedSubwayLine = null; // Clear subway highlighting
            
            // Always show the highlighted line (even if checkbox is off)
            if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                map.addLayer(layers[lineName]);
            }
            
            // Remove dimmed layers from map or show highlighted one
            metroNorthLines.forEach(layerName => {
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
            
            // Remove/show live Metro North markers
            metroNorthMarkers.forEach((marker, trainId) => {
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
                } else {
                    // If marker doesn't have routeName, hide it
                    if (map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            // Hide all LIRR live markers when highlighting Metro North
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide all MBTA lines when highlighting Metro North lines
            Object.keys(layers).forEach(layerName => {
                // Skip Metro North lines
                if (!metroNorthLines.includes(layerName)) {
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                }
            });
            
            // Hide all LIRR lines when highlighting Metro North lines
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
        
        // Function to reset Metro North highlighting
        function resetMetroNorthHighlight() {
            highlightedMetroNorthLine = null;
            
            // Add Metro North layers back to map based on checkbox state
            const metroNorthPathsChecked = document.getElementById('show-metro-north-paths').checked;
            metroNorthLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (metroNorthPathsChecked) {
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
            
            // Trigger immediate update to show all trains again
            const showMetroNorthLive = document.getElementById('show-metro-north-live');
            if (showMetroNorthLive && showMetroNorthLive.checked && typeof fetchMetroNorthTrains === 'function') {
                // Immediately fetch and display all trains
                fetchMetroNorthTrains();
            } else {
                // If live tracking is off, just re-add existing markers
                metroNorthMarkers.forEach((marker, trainId) => {
                    if (marker) {
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                });
            }
            
            // Restore MBTA layers based on checkbox states
            Object.keys(layers).forEach(layerName => {
                // Skip Metro North lines
                if (metroNorthLines.includes(layerName)) {
                    return;
                }
                
                // Skip LIRR lines
                if (lirrLines.includes(layerName)) {
                    return;
                }
                
                // Skip MTA Subway lines
                if (mtaSubwayLines.includes(layerName)) {
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
        
        // Function to highlight multiple subway lines (for multi-line stations)
        function highlightMultipleSubwayLines(lineNames) {
            highlightedSubwayLine = lineNames;
            highlightedLine = null; // Clear MBTA highlighting
            highlightedLIRRLine = null; // Clear LIRR highlighting
            highlightedMetroNorthLine = null; // Clear Metro North highlighting
            
            // Remove all dimmed subway layers from map, keep highlighted ones
            mtaSubwayLines.forEach(lineName => {
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
            
            // Hide all other transit lines when highlighting subway lines
            Object.keys(layers).forEach(layerName => {
                // Skip subway lines
                if (!mtaSubwayLines.includes(layerName)) {
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
            
            // Remove all other live vehicle markers
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
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
        
        // Function to highlight a specific subway line and dim all others
        // Function to highlight a specific subway line and dim all others (REBUILT FROM SCRATCH - FOLLOWING LIRR PATTERN)
        function highlightSubwayLine(lineName) {
            highlightedSubwayLine = lineName;
            highlightedLine = null; // Clear MBTA highlighting
            highlightedLIRRLine = null; // Clear LIRR highlighting
            highlightedMetroNorthLine = null; // Clear Metro North highlighting
            
            // Always show the highlighted line (even if checkbox is off)
            if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                map.addLayer(layers[lineName]);
            }
            
            // Remove dimmed layers from map or show highlighted one
            mtaSubwayLines.forEach(layerName => {
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
            
            // Hide all other transit lines when highlighting subway lines
            Object.keys(layers).forEach(layerName => {
                // Skip subway lines
                if (!mtaSubwayLines.includes(layerName)) {
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
            
            // Remove all other live vehicle markers
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
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
        }
        
        // Function to highlight multiple subway lines (for multi-line stations)
        function highlightMultipleSubwayLines(lineNames) {
            highlightedSubwayLine = lineNames;
            highlightedLine = null; // Clear MBTA highlighting
            highlightedLIRRLine = null; // Clear LIRR highlighting
            highlightedMetroNorthLine = null; // Clear Metro North highlighting
            
            // Remove all dimmed subway layers from map, keep highlighted ones
            mtaSubwayLines.forEach(layerName => {
                const isDimmed = !lineNames.includes(layerName);
                
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
            
            // Hide all other transit lines when highlighting subway lines
            Object.keys(layers).forEach(layerName => {
                // Skip subway lines
                if (!mtaSubwayLines.includes(layerName)) {
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
            
            // Remove all other live vehicle markers
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
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
        
        // Function to reset subway highlighting (REBUILT FROM SCRATCH - FOLLOWING LIRR PATTERN)
        function resetSubwayHighlight() {
            highlightedSubwayLine = null;
            
            // Add subway layers back to map based on checkbox state
            const subwayPathsChecked = document.getElementById('show-mta-subway-paths').checked;
            mtaSubwayLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (subwayPathsChecked) {
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
            
            // Restore LIRR layers based on checkbox state
            const lirrPathsCheckedSubwayReset = document.getElementById('show-lirr-paths').checked;
            lirrLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (lirrPathsCheckedSubwayReset) {
                        if (!map.hasLayer(layers[lineName])) {
                            map.addLayer(layers[lineName]);
                        }
                    }
                }
            });
            
            // Restore Metro North layers based on checkbox state
            const metroNorthPathsCheckedSubwayReset = document.getElementById('show-metro-north-paths').checked;
            metroNorthLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (metroNorthPathsCheckedSubwayReset) {
                        if (!map.hasLayer(layers[lineName])) {
                            map.addLayer(layers[lineName]);
                        }
                    }
                }
            });
            
            // Restore MBTA layers based on checkbox states
            Object.keys(layers).forEach(layerName => {
                // Skip subway lines
                if (mtaSubwayLines.includes(layerName)) {
                    return;
                }
                
                // Skip LIRR lines
                if (lirrLines.includes(layerName)) {
                    return;
                }
                
                // Skip Metro North lines
                if (metroNorthLines.includes(layerName)) {
                    return;
                }
                
                // Check if this is a MBTA subway line
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
            
            // Restore LIRR layers based on checkbox state
            const lirrPathsCheckedMNReset = document.getElementById('show-lirr-paths').checked;
            lirrLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (lirrPathsCheckedMNReset) {
                        if (!map.hasLayer(layers[lineName])) {
                            map.addLayer(layers[lineName]);
                        }
                    }
                }
            });
            
            // Restore Metro North layers based on checkbox state
            const metroNorthPathsCheckedMNReset = document.getElementById('show-metro-north-paths').checked;
            metroNorthLines.forEach(lineName => {
                if (layers[lineName]) {
                    if (metroNorthPathsCheckedMNReset) {
                        if (!map.hasLayer(layers[lineName])) {
                            map.addLayer(layers[lineName]);
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
            
            // Restore LIRR live markers
            const showLIRRLive = document.getElementById('show-lirr-live').checked;
            lirrMarkers.forEach((marker, trainId) => {
                if (marker) {
                    if (showLIRRLive && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    }
                }
            });
            
            // Restore Metro North live markers
            const showMetroNorthLive = document.getElementById('show-metro-north-live').checked;
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker) {
                    if (showMetroNorthLive && !map.hasLayer(marker)) {
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
                resetMetroNorthHighlight();
                resetSubwayHighlight();
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
                    
                    // Determine icon URL based on route
                    let iconUrl = 'icons/commuterrailcirc.png'; // Default
                    if (routeName.includes('Red Line') || routeName.includes('Mattapan')) {
                        iconUrl = 'icons/readlinecirc.png';
                    } else if (routeName.includes('Blue Line')) {
                        iconUrl = 'icons/bluelinecirc.png';
                    } else if (routeName.includes('Green Line') || routeName.includes('Green-')) {
                        iconUrl = 'icons/greenlinecirc.png';
                    } else if (routeName.includes('Orange Line')) {
                        iconUrl = 'icons/orangelinecirc.png';
                    }
                    
                    const baseIconSize = 28; // Increased from 20 for better visibility
                    const currentZoom = map.getZoom();
                    const iconSize = getIconSize(baseIconSize, currentZoom);
                    
                    // Get direction information (inbound/outbound)
                    const direction = train.attributes.direction_id === 0 ? 'Inbound' : 'Outbound';
                    
                    // Create popup with train info
                    let popupContent = `
                        <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                            <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                                <img src="${iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
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
                    
                    // Create click handler to highlight the line (for both subway and commuter rail)
                    const onClickHandler = function() {
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
                    };
                    
                    // Create marker using generalized function
                    const trainMarker = renderLiveVehicleMarker([lat, lng], {
                        iconUrl: iconUrl,
                        iconSize: [iconSize, iconSize],
                        baseIconSize: baseIconSize,
                        iconAnchor: [iconSize / 2, iconSize / 2],
                        tooltipContent: popupContent,
                        tooltipDirection: tooltipDirection,
                        routeName: routeName,
                        routeId: routeId,
                        onClick: onClickHandler,
                        zIndexOffset: 200
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
                    
                    // CRITICAL: Convert routeId to string to ensure consistent key matching
                    // JavaScript object keys are always strings, but API might return numbers for single-digit routes
                    const routeIdStr = routeId ? String(routeId) : null;
                    
                    // Check if this is a shuttle
                    const isShuttle = routeIdStr && (
                        routeIdStr.startsWith('Shuttle-') ||
                        (typeof mbtaShuttleData !== 'undefined' && mbtaShuttleData[routeIdStr])
                    );
                    
                    // Map numeric route IDs to Silver Line names
                    const silverLineMap = {'741': 'SL1', '742': 'SL2', '743': 'SL3', '751': 'SL4', '749': 'SL5', '746': 'SLW'};
                    const mappedRouteId = silverLineMap[routeIdStr] || routeIdStr;
                    
                    // Check if this is a Silver Line route (check if it exists in our Silver Line data)
                    const isSilverLine = routeIdStr && (
                        (typeof silverLineData !== 'undefined' && silverLineData[mappedRouteId]) ||
                        silverLineRoutes.includes(mappedRouteId)
                    );
                    
                    // Get route name and color
                    let routeName = isShuttle ? 'Unknown Shuttle' : (isSilverLine ? 'Unknown Silver Line' : 'Unknown Bus Route');
                    let color = isShuttle ? '#FF6B6B' : (isSilverLine ? '#7C878E' : '#FFD700'); // Shuttle red, Silver Line gray, or bus gold
                    let vehicleType = isShuttle ? 'Shuttle' : (isSilverLine ? 'Silver Line' : 'Bus');
                    
                    // Declare layerKey outside the if block so it's accessible throughout
                    // Use string version to match Object.keys() results
                    let layerKey = routeIdStr || 'unknown';
                    
                    if (routeIdStr) {
                        // Always show the route ID from the API
                        if (isSilverLine) {
                            layerKey = mappedRouteId; // Use mapped name for layer key
                            routeName = `Silver Line ${layerKey}`;
                            color = lineColors[layerKey] || color;
                        } else {
                            routeName = isShuttle ? `Shuttle ${routeIdStr}` : `Bus Route ${routeIdStr}`;
                            color = lineColors[routeIdStr] || color;
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
                    
                    const baseIconSize = 22; // Increased from 16 for better visibility
                    const currentZoom = map.getZoom();
                    const iconSize = getIconSize(baseIconSize, currentZoom);
                    
                    // Set z-index: Silver Line under trains (200), buses/shuttles above (250)
                    const zIndex = isSilverLine ? 150 : 250;
                    
                    // Get direction information (inbound/outbound)
                    const direction = bus.attributes.direction_id === 0 ? 'Inbound' : 'Outbound';
                    
                    // Create popup with vehicle info
                    let popupContent = `
                        <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0;">
                            <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                                <img src="${iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
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
                    
                    // Create click handler to highlight the route
                    const onClickHandler = function() {
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
                    };
                    
                    // Create marker using generalized function
                    const vehicleMarker = renderLiveVehicleMarker([lat, lng], {
                        iconUrl: iconUrl,
                        iconSize: [iconSize, iconSize],
                        baseIconSize: baseIconSize,
                        iconAnchor: [iconSize / 2, iconSize / 2],
                        tooltipContent: popupContent,
                        tooltipDirection: tooltipDirection,
                        routeName: layerKey,
                        displayName: routeName,
                        routeId: routeIdStr,
                        onClick: onClickHandler,
                        zIndexOffset: zIndex
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
                    
                    const iconUrl = 'icons/commuterrailcirc.png'; // Use commuter rail icon for now
                    
                    // Create popup with ferry info
                    let popupContent = `
                        <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0;">
                            <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                                <img src="${iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
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
                    
                    // Create marker using generalized function
                    const ferryMarker = renderLiveVehicleMarker([lat, lng], {
                        iconUrl: iconUrl,
                        iconSize: [iconSize, iconSize],
                        baseIconSize: baseIconSize,
                        iconAnchor: [iconSize / 2, iconSize / 2],
                        tooltipContent: popupContent,
                        tooltipDirection: tooltipDirection,
                        routeName: routeName,
                        zIndexOffset: 300
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
        
        // Function to start Metro North live tracking
        function startMetroNorthTracking() {
            if (metroNorthTrackingInterval) {
                clearInterval(metroNorthTrackingInterval);
            }
            
            // Initial fetch
            fetchMetroNorthTrains();
            
            // Set up interval for updates (5 seconds for near real-time)
            metroNorthTrackingInterval = setInterval(fetchMetroNorthTrains, 5000); // Update every 5 seconds
        }
        
        // Function to fetch live Metro North trains from MTA GTFS-RT API
        async function fetchMetroNorthTrains() {
            // Note: MTA feeds are now free and don't require API keys!
            // Source: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr
            
            try {
                const now = Date.now();
                
                // Rate limiting - don't update more than once every 5 seconds
                if (now - lastMetroNorthUpdateTime < 5000) {
                    return;
                }
                
                lastMetroNorthUpdateTime = now;
                
                // MTA Metro North GTFS-RT feed URL (no API key needed!)
                const METRO_NORTH_GTFS_RT_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr';
                
                // Fetch the GTFS-RT feed
                const response = await fetch(METRO_NORTH_GTFS_RT_URL);
                
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
                updateMetroNorthMarkers(vehicles);
                
            } catch (error) {
                console.error('❌ Error fetching Metro North trains:', error);
                console.error('Error details:', error.message);
            }
        }
        
        // Function to update Metro North train markers on the map
        function updateMetroNorthMarkers(vehicles) {
            // Store currently open popups
            const currentMetroNorthPopups = new Map();
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker.isPopupOpen()) {
                    currentMetroNorthPopups.set(trainId, true);
                }
            });
            
            // Clear old markers
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            metroNorthMarkers.clear();
            
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
                        let routeName = 'Metro North Train';
                        let color = '#003A70'; // Default Metro North blue
                        let routeId = null;
                        
                        // Check for headsign/destination in trip descriptor
                        const stopId = vehicle.stopId || vehicle.stop_id;
                        const directionId = vehicle.trip?.directionId || vehicle.trip?.direction_id;
                        
                        // Try to get routeId directly from vehicle.trip if available (GTFS-RT TripDescriptor has route_id field)
                        // Check multiple possible field names (protobuf can use different property access patterns)
                        let tripRouteId = null;
                        if (vehicle.trip) {
                            tripRouteId = vehicle.trip.routeId || 
                                         vehicle.trip.route_id || 
                                         vehicle.trip.routeId ||
                                         (vehicle.trip.routeId !== undefined ? vehicle.trip.routeId : null) ||
                                         (vehicle.trip.route_id !== undefined ? vehicle.trip.route_id : null);
                        }
                        
                        // Also try accessing via bracket notation in case properties are not directly accessible
                        if (!tripRouteId && vehicle.trip) {
                            try {
                                tripRouteId = vehicle.trip['routeId'] || 
                                             vehicle.trip['route_id'] ||
                                             vehicle.trip['routeId'];
                            } catch (e) {
                                // Ignore
                            }
                        }
                        
                        // Protobuf.js sometimes stores fields with numeric keys or in a _fields object
                        if (!tripRouteId && vehicle.trip) {
                            try {
                                // Check if there's a _fields or similar structure
                                if (vehicle.trip._fields) {
                                    tripRouteId = vehicle.trip._fields.routeId || vehicle.trip._fields.route_id;
                                }
                                // Try accessing by field number (route_id is field 5 in TripDescriptor)
                                if (!tripRouteId && vehicle.trip[5]) {
                                    tripRouteId = vehicle.trip[5];
                                }
                            } catch (e) {
                                // Ignore
                            }
                        }
                        
                        if (tripRouteId && metroNorthRoutesData && metroNorthRoutesData.routes) {
                            // Find the route name from route_id directly
                            for (const [name, route] of Object.entries(metroNorthRoutesData.routes)) {
                                if (route.route_id === tripRouteId || route.route_id === String(tripRouteId)) {
                                    routeName = name;
                                    routeId = tripRouteId;
                                    color = lineColors[name] || route.color || color;
                                    break;
                                }
                            }
                        }
                        
                        // CRITICAL: Metro North real-time feed uses trip_short_name, not trip_id!
                        // The tripId from the feed (e.g., "1838") is actually the trip_short_name
                        if (!routeId && tripId && metroNorthRoutesData && metroNorthRoutesData.tripShortNameToRoute) {
                            // Try to map trip_short_name to route_id
                            routeId = metroNorthRoutesData.tripShortNameToRoute[tripId];
                            
                            if (routeId && metroNorthRoutesData.routes) {
                                // Find the route name from route_id
                                for (const [name, route] of Object.entries(metroNorthRoutesData.routes)) {
                                    if (route.route_id === routeId || route.route_id === String(routeId)) {
                                        routeName = name;
                                        color = lineColors[name] || route.color || color;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // If tripId is a simple number and might actually be a route_id, try that
                        // Metro North route_ids are simple numbers (1, 2, 3, 4, 5, 6)
                        if (!routeId && tripId && /^\d+$/.test(tripId) && metroNorthRoutesData && metroNorthRoutesData.routes) {
                            // Check if tripId matches a route_id directly
                            for (const [name, route] of Object.entries(metroNorthRoutesData.routes)) {
                                if (route.route_id === tripId || route.route_id === String(tripId)) {
                                    routeName = name;
                                    routeId = tripId;
                                    color = lineColors[name] || route.color || color;
                                    break;
                                }
                            }
                        }
                        
                        // Also check if trainId might contain route information (some systems encode route in vehicle ID)
                        if (!routeId && trainId && /^\d+$/.test(trainId) && metroNorthRoutesData && metroNorthRoutesData.routes) {
                            // Check if trainId matches a route_id
                            for (const [name, route] of Object.entries(metroNorthRoutesData.routes)) {
                                if (route.route_id === trainId || route.route_id === String(trainId)) {
                                    routeName = name;
                                    routeId = trainId;
                                    color = lineColors[name] || route.color || color;
                                    break;
                                }
                            }
                        }
                        
                        // If we don't have routeId yet, try to map from tripId (exactly like LIRR does)
                        if (!routeId && tripId && metroNorthRoutesData && metroNorthRoutesData.tripToRoute) {
                            // Try exact match first
                            routeId = metroNorthRoutesData.tripToRoute[tripId];
                            
                            // If no exact match, try without date suffix (e.g., "93X_2025-11-20" -> "93X")
                            if (!routeId && tripId.includes('_')) {
                                const tripIdWithoutDate = tripId.split('_')[0];
                                routeId = metroNorthRoutesData.tripToRoute[tripIdWithoutDate];
                            }
                            
                            // Additional fallback: try matching with startDate if available
                            if (!routeId && tripId && startDate) {
                                const tripIdWithDate = `${tripId}_${startDate}`;
                                routeId = metroNorthRoutesData.tripToRoute[tripIdWithDate];
                            }
                            
                            // If still no match, try with different separators or formats
                            if (!routeId && tripId) {
                                // Try matching just the numeric part if tripId is numeric
                                if (/^\d+$/.test(tripId)) {
                                    // Look for any trip that starts with this number or contains it
                                    for (const [tripKey, routeKey] of Object.entries(metroNorthRoutesData.tripToRoute)) {
                                        if (tripKey.startsWith(tripId + '_') || tripKey === tripId || 
                                            tripKey.endsWith('_' + tripId) || tripKey.includes('_' + tripId + '_')) {
                                            routeId = routeKey;
                                            break;
                                        }
                                    }
                                } else {
                                    // For non-numeric tripIds, try partial matching
                                    for (const [tripKey, routeKey] of Object.entries(metroNorthRoutesData.tripToRoute)) {
                                        if (tripKey.includes(tripId) || tripId.includes(tripKey.split('_')[0])) {
                                            routeId = routeKey;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            if (routeId && metroNorthRoutesData.routes) {
                                // Find the route name from route_id
                                for (const [name, route] of Object.entries(metroNorthRoutesData.routes)) {
                                    if (route.route_id === routeId) {
                                        routeName = name;
                                        color = lineColors[name] || route.color || color;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // Debug: Log vehicle structure to understand what's available (only occasionally to avoid spam)
                        if (routeName === 'Metro North Train' && Math.random() < 0.1) {
                            console.log('🔍 Metro North route lookup - available data:', {
                                tripId,
                                tripRouteId,
                                routeId,
                                startDate,
                                trainId,
                                vehicleTripKeys: vehicle.trip ? Object.keys(vehicle.trip) : [],
                                vehicleTrip: vehicle.trip,
                                vehicleVehicle: vehicle.vehicle,
                                tripToRouteSize: metroNorthRoutesData?.tripToRoute ? Object.keys(metroNorthRoutesData.tripToRoute).length : 0,
                                sampleTripIds: metroNorthRoutesData?.tripToRoute ? Object.keys(metroNorthRoutesData.tripToRoute).slice(0, 5) : [],
                                availableRoutes: metroNorthRoutesData?.routes ? Object.keys(metroNorthRoutesData.routes) : []
                            });
                        }
                        
                        // Last resort: If we have a routeId but couldn't find the route name, try to find it by route_id
                        if (routeId && routeName === 'Metro North Train' && metroNorthRoutesData && metroNorthRoutesData.routes) {
                            for (const [name, route] of Object.entries(metroNorthRoutesData.routes)) {
                                if (route.route_id === routeId || route.route_id === String(routeId)) {
                                    routeName = name;
                                    color = lineColors[name] || route.color || color;
                                    break;
                                }
                            }
                        }
                        
                        // If we couldn't map it, show the trip ID
                        if (routeName === 'Metro North Train' && tripId) {
                            routeName = `Trip ${tripId}`;
                        }
                        
                        // Create Metro North train icon
                        const baseIconSize = 20;
                        const currentZoom = map.getZoom();
                        const iconSize = getIconSize(baseIconSize, currentZoom);
                        const iconUrl = 'icons/mtacirc.png';
                        
                        // Create click handler for highlighting (if we have a valid route)
                        let onClickHandler = null;
                        if (routeId && routeName !== 'Metro North Train' && !routeName.startsWith('Trip ')) {
                            onClickHandler = function(e) {
                                L.DomEvent.stopPropagation(e);
                                
                                // Toggle highlighting
                                if (highlightedMetroNorthLine === routeName) {
                                    resetMetroNorthHighlight();
                                } else {
                                    highlightMetroNorthLine(routeName);
                                }
                            };
                        }
                        
                        // Create tooltip with train info
                        let tooltipContent = `
                            <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                                <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                                    <img src="${iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                                    Live Metro North Train
                                </div>`;
                        
                        // Show line if we have route information
                        if (routeId && !routeName.startsWith('Trip ')) {
                            tooltipContent += `<b>Line:</b> ${routeName}<br>`;
                        }
                        
                        // Show terminus/destination from headsign (exactly like LIRR does)
                        // First try to get headsign directly from vehicle.trip.tripProperties if available (GTFS-RT extension)
                        let headsign = vehicle.trip?.tripProperties?.tripHeadsign || 
                                      vehicle.trip?.trip_properties?.trip_headsign ||
                                      vehicle.trip?.tripProperties?.trip_headsign ||
                                      vehicle.trip?.tripHeadsign || 
                                      vehicle.trip?.trip_headsign || 
                                      vehicle.trip?.headsign || null;
                        
                        // CRITICAL: Metro North real-time feed uses trip_short_name, not trip_id!
                        // Try to get headsign from tripShortNameToHeadsign mapping first
                        if (!headsign && tripId && metroNorthRoutesData && metroNorthRoutesData.tripShortNameToHeadsign) {
                            headsign = metroNorthRoutesData.tripShortNameToHeadsign[tripId];
                        }
                        
                        // If not available, try to get from tripToHeadsign mapping (exactly like LIRR)
                        if (!headsign && tripId && metroNorthRoutesData && metroNorthRoutesData.tripToHeadsign) {
                            // Try exact match first
                            headsign = metroNorthRoutesData.tripToHeadsign[tripId];
                            
                            // If no exact match, try without date suffix
                            if (!headsign && tripId.includes('_')) {
                                const tripIdWithoutDate = tripId.split('_')[0];
                                headsign = metroNorthRoutesData.tripToHeadsign[tripIdWithoutDate];
                            }
                            
                            // Additional fallback: try matching with startDate if available
                            if (!headsign && tripId && startDate) {
                                const tripIdWithDate = `${tripId}_${startDate}`;
                                headsign = metroNorthRoutesData.tripToHeadsign[tripIdWithDate];
                            }
                            
                            // If still no match, try matching with different formats
                            if (!headsign && tripId) {
                                // Try matching just the numeric part if tripId is numeric
                                if (/^\d+$/.test(tripId)) {
                                    // Look for any trip that starts with this number or contains it
                                    for (const [tripKey, tripHeadsign] of Object.entries(metroNorthRoutesData.tripToHeadsign)) {
                                        if (tripKey.startsWith(tripId + '_') || tripKey === tripId || 
                                            tripKey.endsWith('_' + tripId) || tripKey.includes('_' + tripId + '_')) {
                                            headsign = tripHeadsign;
                                            break;
                                        }
                                    }
                                } else {
                                    // For non-numeric tripIds, try partial matching
                                    for (const [tripKey, tripHeadsign] of Object.entries(metroNorthRoutesData.tripToHeadsign)) {
                                        if (tripKey.includes(tripId) || tripId.includes(tripKey.split('_')[0])) {
                                            headsign = tripHeadsign;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (headsign) {
                            tooltipContent += `<b>Terminus:</b> ${headsign}<br>`;
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
                        
                        // Create marker using generalized function
                        const trainMarker = renderLiveVehicleMarker([lat, lon], {
                            iconUrl: iconUrl,
                            iconSize: [iconSize, iconSize],
                            baseIconSize: baseIconSize,
                            iconAnchor: [iconSize / 2, iconSize / 2],
                            tooltipContent: tooltipContent,
                            tooltipDirection: tooltipDirection,
                            routeName: routeName,
                            onClick: onClickHandler,
                            zIndexOffset: 200
                        });
                        
                        // Store additional train info for reference
                        if (trainMarker) {
                            trainMarker.trainId = trainId;
                            trainMarker.tripId = tripId;
                        }
                        
                        // Add to map if Metro North live tracking is enabled
                        const metroNorthLiveCheckbox = document.getElementById('show-metro-north-live');
                        let shouldAddToMap = false;
                        
                        if (metroNorthLiveCheckbox && metroNorthLiveCheckbox.checked) {
                            // Don't show Metro North trains if MBTA line is highlighted
                            if (highlightedLine) {
                                // MBTA line is highlighted, hide all Metro North trains
                                // Don't add to map or store
                                return;
                            }
                            
                            // Don't show Metro North trains if LIRR line is highlighted
                            if (highlightedLIRRLine) {
                                // LIRR line is highlighted, hide all Metro North trains
                                // Don't add to map or store
                                return;
                            }
                            
                            // Don't show Metro North trains if subway line is highlighted
                            if (highlightedSubwayLine) {
                                // Subway line is highlighted, hide all Metro North trains
                                // Don't add to map or store
                                return;
                            }
                            
                            // Check if Metro North highlighting is active
                            if (highlightedMetroNorthLine) {
                                // Only show if this train is on the highlighted line
                                const isHighlighted = Array.isArray(highlightedMetroNorthLine)
                                    ? highlightedMetroNorthLine.includes(routeName)
                                    : highlightedMetroNorthLine === routeName;
                                
                                if (isHighlighted) {
                                    shouldAddToMap = true;
                                }
                            } else {
                                // No highlight active, show all trains
                                shouldAddToMap = true;
                            }
                            
                            // Only add to map and store if it should be shown
                            if (shouldAddToMap) {
                                trainMarker.addTo(map);
                                metroNorthMarkers.set(trainId, trainMarker);
                            }
                        }
                        
                        // Restore popup if it was open before
                        if (currentMetroNorthPopups.has(trainId)) {
                            trainMarker.openPopup();
                        }
                    }
                });
            }
        }
        
        // Stop Metro North tracking
        function stopMetroNorthTracking() {
            if (metroNorthTrackingInterval) {
                clearInterval(metroNorthTrackingInterval);
                metroNorthTrackingInterval = null;
            }
            
            // Clear all Metro North train markers
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            metroNorthMarkers.clear();
        }
        
        // MTA Subway Live Tracking Functions
        
        // Function to start Subway live tracking
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
                        const tripShortName = vehicle.trip?.tripShortName || vehicle.trip?.trip_short_name;
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
                        
                        // Try to get routeId directly from vehicle.trip if available (GTFS-RT TripDescriptor has route_id field)
                        const tripRouteId = vehicle.trip?.routeId || vehicle.trip?.route_id;
                        
                        if (tripRouteId && lirrRoutesData && lirrRoutesData.routes) {
                            // Find the route name from route_id directly
                            for (const [name, route] of Object.entries(lirrRoutesData.routes)) {
                                if (route.route_id === tripRouteId) {
                                    routeName = name;
                                    routeId = tripRouteId;
                                    color = lineColors[name] || color;
                                    break;
                                }
                            }
                        }
                        
                        // If we don't have routeId yet, try trip_short_name first (real-time feed often uses this)
                        if (!routeId && tripShortName && lirrRoutesData && lirrRoutesData.tripShortNameToRoute) {
                            routeId = lirrRoutesData.tripShortNameToRoute[tripShortName];
                            
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
                        
                        // If we still don't have routeId, try to map from tripId
                        if (!routeId && tripId && lirrRoutesData && lirrRoutesData.tripToRoute) {
                            // Try exact match first
                            routeId = lirrRoutesData.tripToRoute[tripId];
                            
                            // If no exact match, try without date suffix (e.g., "93X_2025-11-20" -> "93X")
                            if (!routeId && tripId.includes('_')) {
                                const tripIdWithoutDate = tripId.split('_')[0];
                                routeId = lirrRoutesData.tripToRoute[tripIdWithoutDate];
                            }
                            
                            // Additional fallback: try matching with startDate if available
                            if (!routeId && tripId && startDate) {
                                const tripIdWithDate = `${tripId}_${startDate}`;
                                routeId = lirrRoutesData.tripToRoute[tripIdWithDate];
                            }
                            
                            // If still no match, try partial matching (like Metro North does)
                            if (!routeId && tripId) {
                                // Try matching just the numeric part if tripId is numeric
                                if (/^\d+$/.test(tripId)) {
                                    // Look for any trip that starts with this number or contains it
                                    for (const [tripKey, routeKey] of Object.entries(lirrRoutesData.tripToRoute)) {
                                        if (tripKey.startsWith(tripId + '_') || tripKey === tripId || 
                                            tripKey.endsWith('_' + tripId) || tripKey.includes('_' + tripId + '_')) {
                                            routeId = routeKey;
                                            break;
                                        }
                                    }
                                } else {
                                    // Try fuzzy matching - look for trips that contain the tripId
                                    for (const [tripKey, routeKey] of Object.entries(lirrRoutesData.tripToRoute)) {
                                        if (tripKey.includes(tripId) || tripId.includes(tripKey.split('_')[0])) {
                                            routeId = routeKey;
                                            break;
                                        }
                                    }
                                }
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
                        const iconUrl = 'icons/mtacirc.png';
                        
                        // Create click handler for highlighting (if we have a valid route)
                        let onClickHandler = null;
                        if (routeId && routeName !== 'LIRR Train' && !routeName.startsWith('Trip ')) {
                            onClickHandler = function(e) {
                                L.DomEvent.stopPropagation(e);
                                
                                // Toggle highlighting
                                if (highlightedLIRRLine === routeName) {
                                    resetLIRRHighlight();
                                } else {
                                    highlightLIRRLine(routeName);
                                }
                            };
                        }
                        
                        // Create tooltip with train info
                        let tooltipContent = `
                            <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                                <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                                    <img src="${iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                                    Live LIRR Train
                                </div>`;
                        
                        // Show line if we have route information
                        if (routeId && !routeName.startsWith('Trip ')) {
                            tooltipContent += `<b>Line:</b> ${routeName}<br>`;
                        }
                        
                        // Show terminus/destination from headsign
                        // First try to get headsign directly from vehicle.trip.tripProperties if available (GTFS-RT extension)
                        let headsign = vehicle.trip?.tripProperties?.tripHeadsign || 
                                      vehicle.trip?.trip_properties?.trip_headsign ||
                                      vehicle.trip?.tripProperties?.trip_headsign ||
                                      vehicle.trip?.tripHeadsign || 
                                      vehicle.trip?.trip_headsign || 
                                      vehicle.trip?.headsign || null;
                        
                        // If not available, try to get from tripToHeadsign mapping
                        if (!headsign && tripId && lirrRoutesData && lirrRoutesData.tripToHeadsign) {
                            // Try exact match first
                            headsign = lirrRoutesData.tripToHeadsign[tripId];
                            
                            // If no exact match, try without date suffix
                            if (!headsign && tripId.includes('_')) {
                                const tripIdWithoutDate = tripId.split('_')[0];
                                headsign = lirrRoutesData.tripToHeadsign[tripIdWithoutDate];
                            }
                            
                            // Additional fallback: try matching with startDate if available
                            if (!headsign && tripId && startDate) {
                                const tripIdWithDate = `${tripId}_${startDate}`;
                                headsign = lirrRoutesData.tripToHeadsign[tripIdWithDate];
                            }
                        }
                        
                        if (headsign) {
                            tooltipContent += `<b>Terminus:</b> ${headsign}<br>`;
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
                        
                        // Create marker using generalized function
                        const trainMarker = renderLiveVehicleMarker([lat, lon], {
                            iconUrl: iconUrl,
                            iconSize: [iconSize, iconSize],
                            baseIconSize: baseIconSize,
                            iconAnchor: [iconSize / 2, iconSize / 2],
                            tooltipContent: tooltipContent,
                            tooltipDirection: tooltipDirection,
                            routeName: routeName,
                            onClick: onClickHandler,
                            zIndexOffset: 200
                        });
                        
                        // Store additional train info for reference
                        if (trainMarker) {
                            trainMarker.trainId = trainId;
                            trainMarker.tripId = tripId;
                        }
                        
                        // Add to map if LIRR live tracking is enabled
                        const lirrLiveCheckbox = document.getElementById('show-lirr-live');
                        let shouldAddToMap = false;
                        
                        if (lirrLiveCheckbox && lirrLiveCheckbox.checked) {
                            // Don't show LIRR trains if MBTA line is highlighted
                            if (highlightedLine) {
                                // MBTA line is highlighted, hide all LIRR trains
                                // Don't add to map or store
                                return;
                            }
                            
                            // Don't show LIRR trains if subway line is highlighted
                            if (highlightedSubwayLine) {
                                // Subway line is highlighted, hide all LIRR trains
                                // Don't add to map or store
                                return;
                            }
                            
                            // Check if LIRR highlighting is active
                            if (highlightedLIRRLine) {
                                // Only show if this train is on the highlighted line
                                const isHighlighted = Array.isArray(highlightedLIRRLine)
                                    ? highlightedLIRRLine.includes(routeName)
                                    : highlightedLIRRLine === routeName;
                                
                                if (isHighlighted) {
                                    shouldAddToMap = true;
                                }
                            } else {
                                // No highlight active, show all trains
                                shouldAddToMap = true;
                            }
                            
                            // Only add to map and store if it should be shown
                            if (shouldAddToMap) {
                                trainMarker.addTo(map);
                                lirrMarkers.set(trainId, trainMarker);
                            }
                        }
                        
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
        
        // Load Metro North routes if checkbox is checked
        const metroNorthPathsCheckboxOnLoad = document.getElementById('show-metro-north-paths');
        if (metroNorthLines.length > 0 && metroNorthPathsCheckboxOnLoad?.checked) {
            loadMetroNorthRoutes(true);
        }
        
        // Load MTA Subway routes if checkbox is checked
        const subwayPathsCheckboxOnLoad = document.getElementById('show-mta-subway-paths');
        if (mtaSubwayLines.length > 0 && subwayPathsCheckboxOnLoad?.checked) {
            loadMTASubwayRoutes(true);
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
