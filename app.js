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
        const mtaSubwayMarkers = new Map(); // MTA Subway train markers
        const shoreLineEastMarkers = new Map(); // Shore Line East train markers
        const amtrakMarkers = new Map(); // Amtrak train markers
        const hartfordLineMarkers = new Map(); // Hartford Line train markers
        const njTransitMarkers = new Map(); // NJ Transit train markers
        const septaMarkers = new Map(); // SEPTA train markers
        let trackingInterval;
        let ferryTrackingInterval;
        let busTrackingInterval;
        let shuttleTrackingInterval;
        let silverLineTrackingInterval;
        let lirrTrackingInterval; // LIRR tracking interval
        let metroNorthTrackingInterval; // Metro North tracking interval
        let mtaSubwayTrackingInterval; // MTA Subway tracking interval
        let shoreLineEastTrackingInterval; // Shore Line East tracking interval
        let amtrakTrackingInterval; // Amtrak tracking interval
        let hartfordLineTrackingInterval; // Hartford Line tracking interval
        let njTransitTrackingInterval; // NJ Transit tracking interval
        let septaTrackingInterval; // SEPTA tracking interval
        let lastUpdateTime = 0;
        let lastFerryUpdateTime = 0;
        let lastBusUpdateTime = 0;
        let lastShuttleUpdateTime = 0;
        let lastSilverLineUpdateTime = 0;
        let lastLIRRUpdateTime = 0; // LIRR last update timestamp
        let lastMetroNorthUpdateTime = 0; // Metro North last update timestamp
        let lastMtaSubwayUpdateTime = 0; // MTA Subway last update timestamp
        let lastShoreLineEastUpdateTime = 0; // Shore Line East last update timestamp
        let lastAmtrakUpdateTime = 0; // Amtrak last update timestamp
        let lastHartfordLineUpdateTime = 0; // Hartford Line last update timestamp
        let lastNJTransitUpdateTime = 0; // NJ Transit last update timestamp
        let lastSEPTAUpdateTime = 0; // SEPTA last update timestamp
        
        // State for line highlighting feature
        let highlightedLine = null;
        let highlightedLIRRLine = null; // Separate highlighting for LIRR/MTA
        let highlightedMetroNorthLine = null; // Separate highlighting for Metro North/MTA
        let highlightedSubwayLine = null; // Separate highlighting for MTA Subway
        let highlightedShoreLineEastLine = null; // Separate highlighting for Shore Line East
        let highlightedAmtrakLine = null; // Separate highlighting for Amtrak
        let highlightedHartfordLineLine = null; // Separate highlighting for Hartford Line
        let highlightedNJTransitLine = null; // Separate highlighting for NJ Transit
        let highlightedSEPTALine = null; // Separate highlighting for SEPTA

        let highlightedCombinedStation = null;
        
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
        
        // Shore Line East route loading state
        let shoreLineEastRoutesLoaded = false;
        let shoreLineEastRoutesLoading = false;
        
        // Amtrak route loading state
        let amtrakRoutesLoaded = false;
        let amtrakRoutesLoading = false;
        
        // Hartford Line route loading state
        let hartfordLineRoutesLoaded = false;
        let hartfordLineRoutesLoading = false;
        
        // NJ Transit route loading state
        let njTransitRoutesLoaded = false;
        let njTransitRoutesLoading = false;
        let septaRoutesLoaded = false;
        let septaRoutesLoading = false;
        
        // Bus stop visibility state
        let busStopsVisible = false;
        const busStopLayers = new Map(); // Separate layers for bus stops
        const busStopToRoutes = new Map(); // Track which routes serve each bus stop
        const BUS_STOPS_MIN_ZOOM = 14; // Show bus stops at zoom level 14+
        
        // Performance optimization: Cache marker collections for faster zoom updates
        const stopMarkersCache = new Set(); // Cache all stop markers
        const liveVehicleMarkersCache = new Set(); // Cache all live vehicle markers
        
        // Combined stations data (multi-system stations)
        let combinedStationsData = null;
        
        // Checkbox cache for performance - avoids repeated DOM queries
        const checkboxCache = {};
        const CHECKBOX_IDS = [
            'show-subway-paths', 'show-subway-live',
            'show-commuter-paths', 'show-commuter-live',
            'show-seasonal-paths', 'show-seasonal-live',
            'show-bus-paths', 'show-bus-live',
            'show-shuttle-paths', 'show-shuttle-live',
            'show-silver-line-paths', 'show-silver-line-live',
            'show-ferry-paths', 'show-ferry-live',
            'show-lirr-paths', 'show-lirr-live',
            'show-metro-north-paths', 'show-metro-north-live',
            'show-mta-subway-paths', 'show-mta-subway-live',
            'show-shore-line-east-paths', 'show-shore-line-east-live',
            'show-amtrak-paths', 'show-amtrak-live',
            'show-hartford-line-paths', 'show-hartford-line-live',
            'show-nj-transit-paths', 'show-nj-transit-live',
            'show-septa-paths', 'show-septa-live'
        ];
        
        // Initialize checkbox cache - call after DOM is ready
        function initCheckboxCache() {
            CHECKBOX_IDS.forEach(id => {
                checkboxCache[id] = document.getElementById(id);
            });
        }
        
        // Get checkbox checked state from cache (fast)
        function isChecked(checkboxId) {
            const checkbox = checkboxCache[checkboxId];
            return checkbox ? checkbox.checked : false;
        }
        
        // Check if data is ready before proceeding
        if (typeof mbtaStopsData === 'undefined' || !mbtaStopsData) {
            document.getElementById('map').innerHTML = '<div style="text-align: center; padding: 50px; font-size: 18px; color: #666;">Loading MBTA data...</div>';
            // Don't run any more code
            throw new Error('MBTA data not loaded');
        }
        
        // Initialize the map centered on New York/Long Island (SVG renderer so station/track clicks work)
        map = L.map('map', {
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
        map.createPane('amtrakPane');
        map.getPane('amtrakPane').style.zIndex = 398; // Amtrak - ALWAYS at the very bottom
        
        map.createPane('ctrailPane');
        map.getPane('ctrailPane').style.zIndex = 399.5; // Shore Line East/CTrail - above Amtrak
        
        map.createPane('hartfordLinePane');
        map.getPane('hartfordLinePane').style.zIndex = 400; // Hartford Line - above Shore Line East
        
        map.createPane('ferryPane');
        map.getPane('ferryPane').style.zIndex = 401; // Above Hartford Line
        
        map.createPane('busPane');
        map.getPane('busPane').style.zIndex = 403; // Above ferries
        
        map.createPane('commuterRailPane');
        map.getPane('commuterRailPane').style.zIndex = 405; // Above buses
        
        map.createPane('njTransitPane');
        map.getPane('njTransitPane').style.zIndex = 405.5; // NJ Transit - above MBTA commuter, below LIRR
        
        map.createPane('septaPane');
        map.getPane('septaPane').style.zIndex = 405.6; // SEPTA - above NJ Transit
        
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
        
        map.createPane('combinedStationsPane');
        map.getPane('combinedStationsPane').style.zIndex = 455; // Above other stops so gold markers are always on top
        
        // Add click handler to map to reset highlight when clicking empty space.
        // Ignore clicks that hit an interactive layer (station, track, etc.) so highlighting a line by clicking a station doesn't immediately get cleared by a bubbling map click.
        map.on('click', function(e) {
            const target = e.originalEvent && e.originalEvent.target;
            if (target && typeof target.closest === 'function' && target.closest('.leaflet-interactive')) {
                return; // Click was on a layer, not empty map
            }
            if (highlightedLine !== null || highlightedLIRRLine !== null || 
                highlightedMetroNorthLine !== null || highlightedSubwayLine !== null ||
                highlightedNJTransitLine !== null || highlightedSEPTALine !== null ||
                highlightedShoreLineEastLine !== null || highlightedAmtrakLine !== null ||
                highlightedHartfordLineLine !== null || highlightedCombinedStation !== null) {
                resetAllHighlights();
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
            const busRoutesChecked = isChecked('show-bus-paths');
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
        // Layer keys by system so bus and subway can share names (e.g. "1", "4", "B") without collision
        function layerKeyForSystem(systemPrefix, lineName) { return systemPrefix + '-' + lineName; }
        function displayNameFromLayerKey(layerKey) {
            if (layerKey.startsWith('mta-subway-')) return layerKey.slice('mta-subway-'.length);
            if (layerKey.startsWith('mbta-bus-')) return layerKey.slice('mbta-bus-'.length);
            return layerKey;
        }
        
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
        
        // Initialize layers for bus routes (prefixed so "1", "4" etc. don't collide with MTA subway)
        if (mbtaBusData && typeof mbtaBusData === 'object') {
            try {
                Object.keys(mbtaBusData).forEach(lineName => {
                    layers[layerKeyForSystem('mbta-bus', lineName)] = L.layerGroup();
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
        
        // Initialize layers for Shore Line East routes (if data available)
        if (typeof shoreLineEastRoutesData !== 'undefined' && shoreLineEastRoutesData && shoreLineEastRoutesData.routes) {
            try {
                Object.keys(shoreLineEastRoutesData.routes).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    // Don't add to map yet - wait for checkbox
                });
            } catch (e) {
                // Shore Line East data initialization skipped
            }
        }
        
        // Initialize layers for Amtrak routes (if data available)
        if (typeof amtrakRoutesData !== 'undefined' && amtrakRoutesData && amtrakRoutesData.routes) {
            try {
                Object.keys(amtrakRoutesData.routes).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    // Don't add to map yet - wait for checkbox
                });
            } catch (e) {
                // Amtrak data initialization skipped
            }
        }
        
        // Initialize layers for Hartford Line routes (if data available)
        if (typeof hartfordLineRoutesData !== 'undefined' && hartfordLineRoutesData && hartfordLineRoutesData.routes) {
            try {
                Object.keys(hartfordLineRoutesData.routes).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                    // Don't add to map yet - wait for checkbox
                });
            } catch (e) {
                // Hartford Line data initialization skipped
            }
        }
        
        // Initialize layers for NJ Transit routes (if data available)
        if (typeof njTransitRoutesData !== 'undefined' && njTransitRoutesData && njTransitRoutesData.routes) {
            try {
                Object.keys(njTransitRoutesData.routes).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                });
            } catch (e) {
                // NJ Transit data initialization skipped
            }
        }
        
        // Initialize layers for SEPTA routes (if data available)
        if (typeof septaRoutesData !== 'undefined' && septaRoutesData && septaRoutesData.routes) {
            try {
                Object.keys(septaRoutesData.routes).forEach(lineName => {
                    layers[lineName] = L.layerGroup();
                });
            } catch (e) {
                // SEPTA data initialization skipped
            }
        }
        
        // Initialize layers for MTA Subway routes (prefixed so "1", "4", "B" etc. don't collide with bus)
        if (typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData && mtaSubwayRoutesData.routes) {
            try {
                Object.keys(mtaSubwayRoutesData.routes).forEach(lineName => {
                    layers[layerKeyForSystem('mta-subway', lineName)] = L.layerGroup();
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
        
        // Shore Line East lines - will be populated from Shore Line East data if available
        let shoreLineEastLines = [];
        if (typeof shoreLineEastRoutesData !== 'undefined' && shoreLineEastRoutesData && shoreLineEastRoutesData.routes) {
            shoreLineEastLines = Object.keys(shoreLineEastRoutesData.routes);
        }
        
        // Amtrak lines - will be populated from Amtrak data if available
        let amtrakLines = [];
        if (typeof amtrakRoutesData !== 'undefined' && amtrakRoutesData && amtrakRoutesData.routes) {
            amtrakLines = Object.keys(amtrakRoutesData.routes);
        }
        
        // Hartford Line lines - will be populated from Hartford Line data if available
        let hartfordLineLines = [];
        if (typeof hartfordLineRoutesData !== 'undefined' && hartfordLineRoutesData && hartfordLineRoutesData.routes) {
            hartfordLineLines = Object.keys(hartfordLineRoutesData.routes);
        }
        
        // MTA Subway lines - will be populated from subway data if available
        let mtaSubwayLines = [];
        if (typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData && mtaSubwayRoutesData.routes) {
            mtaSubwayLines = Object.keys(mtaSubwayRoutesData.routes);
        }
        
        // NJ Transit lines - will be populated from NJ Transit data if available
        let njTransitLines = [];
        if (typeof njTransitRoutesData !== 'undefined' && njTransitRoutesData && njTransitRoutesData.routes) {
            njTransitLines = Object.keys(njTransitRoutesData.routes);
        }

        // SEPTA lines - will be populated from SEPTA data if available
        let septaLines = [];
        if (typeof septaRoutesData !== 'undefined' && septaRoutesData && septaRoutesData.routes) {
            septaLines = Object.keys(septaRoutesData.routes);
        }

        // Initialize checkbox cache for performance
        initCheckboxCache();
        
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
                const hasCommuter = isChecked('show-commuter-live');
                const hasSeasonal = isChecked('show-seasonal-live');
                const hasBus = isChecked('show-bus-live');
                const hasSilver = isChecked('show-silver-line-live');
                const hasFerry = isChecked('show-ferry-live');
                
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
                const hasSubway = isChecked('show-subway-live');
                const hasSeasonal = isChecked('show-seasonal-live');
                const hasBus = isChecked('show-bus-live');
                const hasSilver = isChecked('show-silver-line-live');
                const hasFerry = isChecked('show-ferry-live');
                
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
                const hasSubway = isChecked('show-subway-live');
                const hasCommuter = isChecked('show-commuter-live');
                const hasBus = isChecked('show-bus-live');
                const hasSilver = isChecked('show-silver-line-live');
                const hasFerry = isChecked('show-ferry-live');
                
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
                        if (busStopLayers.size === 0) createBusStopMarkers();
                        busStopLayers.forEach((layer, lineName) => {
                            const layerKey = layerKeyForSystem('mbta-bus', lineName);
                            if (layers[layerKey] && map.hasLayer(layers[layerKey])) layer.addTo(map);
                        });
                    }
                } else {
                    Object.keys(mbtaBusData).forEach(lineName => {
                        if (mbtaStopsData && mbtaStopsData[lineName]) return;
                        const layerKey = layerKeyForSystem('mbta-bus', lineName);
                        if (layers[layerKey]) map.removeLayer(layers[layerKey]);
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
                const hasSubway = isChecked('show-subway-live');
                const hasCommuter = isChecked('show-commuter-live');
                const hasSeasonal = isChecked('show-seasonal-live');
                const hasShuttle = isChecked('show-shuttle-live');
                const hasSilver = isChecked('show-silver-line-live');
                const hasFerry = isChecked('show-ferry-live');
                
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
                const hasSubway = isChecked('show-subway-live');
                const hasCommuter = isChecked('show-commuter-live');
                const hasSeasonal = isChecked('show-seasonal-live');
                const hasBus = isChecked('show-bus-live');
                const hasSilver = isChecked('show-silver-line-live');
                const hasFerry = isChecked('show-ferry-live');
                
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
                const hasSubway = isChecked('show-subway-live');
                const hasCommuter = isChecked('show-commuter-live');
                const hasSeasonal = isChecked('show-seasonal-live');
                const hasBus = isChecked('show-bus-live');
                const hasShuttle = isChecked('show-shuttle-live');
                const hasFerry = isChecked('show-ferry-live');
                
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
                const hasSubway = isChecked('show-subway-live');
                const hasCommuter = isChecked('show-commuter-live');
                const hasSeasonal = isChecked('show-seasonal-live');
                const hasBus = isChecked('show-bus-live');
                
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
            
            // Start LIRR tracking after routes are loaded (delayed to avoid conflicts)
            if (lirrLiveCheckbox.checked) {
                setTimeout(() => startLIRRTracking(), 500);
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
            
            // Start Metro North tracking after routes are loaded (delayed to avoid conflicts)
            if (metroNorthLiveCheckbox.checked && metroNorthLines.length > 0) {
                setTimeout(() => startMetroNorthTracking(), 1000);
            }
        }
        
        // Shore Line East paths filter
        const shoreLineEastPathsCheckbox = document.getElementById('show-shore-line-east-paths');
        if (shoreLineEastPathsCheckbox) {
            shoreLineEastPathsCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                // Only proceed if data is available
                if (shoreLineEastLines.length === 0) {
                    return;
                }
                
                if (!shoreLineEastRoutesLoaded && !shoreLineEastRoutesLoading) {
                    // Load Shore Line East routes if not already loaded
                    loadShoreLineEastRoutes(isChecked);
                } else if (shoreLineEastRoutesLoaded) {
                    // Toggle visibility of already loaded routes
                    shoreLineEastLines.forEach(lineName => {
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
        
        // Amtrak paths filter
        const amtrakPathsCheckbox = document.getElementById('show-amtrak-paths');
        if (amtrakPathsCheckbox) {
            amtrakPathsCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                // Only proceed if data is available
                if (amtrakLines.length === 0) {
                    return;
                }
                
                if (!amtrakRoutesLoaded && !amtrakRoutesLoading) {
                    // Load Amtrak routes if not already loaded
                    loadAmtrakRoutes(isChecked);
                } else if (amtrakRoutesLoaded) {
                    // Toggle visibility of already loaded routes
                    amtrakLines.forEach(lineName => {
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
            // Start Amtrak tracking when Paths are shown and Live is already checked
            const amtrakLiveCheckbox = document.getElementById('show-amtrak-live');
            if (amtrakLiveCheckbox && amtrakLiveCheckbox.checked && amtrakLines.length > 0) {
                setTimeout(() => startAmtrakTracking(), 500);
            }
        }
        
        // Amtrak live tracking filter
        const amtrakLiveCheckbox = document.getElementById('show-amtrak-live');
        if (amtrakLiveCheckbox) {
            amtrakLiveCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                if (amtrakLines.length === 0) {
                    return;
                }
                
                amtrakMarkers.forEach((marker, trainId) => {
                    if (marker) {
                        if (isChecked) {
                            if (!map.hasLayer(marker)) marker.addTo(map);
                        } else {
                            if (map.hasLayer(marker)) marker.remove();
                        }
                    }
                });
                
                if (isChecked) {
                    if (!amtrakTrackingInterval) {
                        startAmtrakTracking();
                    }
                } else {
                    stopAmtrakTracking();
                }
                
                updateStats();
            });
        }
        
        // Shore Line East live tracking filter
        const shoreLineEastLiveCheckbox = document.getElementById('show-shore-line-east-live');
        if (shoreLineEastLiveCheckbox) {
            shoreLineEastLiveCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                // Only proceed if data is available
                if (shoreLineEastLines.length === 0) {
                    return;
                }
                
                // Hide/show Shore Line East train markers
                shoreLineEastMarkers.forEach((marker, trainId) => {
                    if (marker) {
                        if (isChecked) {
                            marker.addTo(map);
                        } else {
                            marker.remove();
                        }
                    }
                });
                
                // Control live tracking for Shore Line East (placeholder for future real-time feed)
                // TODO: Implement real-time tracking when GTFS-Realtime feed is available
                
                updateStats();
            });
        }
        
        // Hartford Line paths filter
        const hartfordLinePathsCheckbox = document.getElementById('show-hartford-line-paths');
        if (hartfordLinePathsCheckbox) {
            hartfordLinePathsCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                // Only proceed if data is available
                if (hartfordLineLines.length === 0) {
                    return;
                }
                
                if (!hartfordLineRoutesLoaded && !hartfordLineRoutesLoading) {
                    // Load Hartford Line routes if not already loaded
                    loadHartfordLineRoutes(isChecked);
                } else if (hartfordLineRoutesLoaded) {
                    // Toggle visibility of already loaded routes
                    hartfordLineLines.forEach(lineName => {
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
        
        // Hartford Line live tracking filter
        const hartfordLineLiveCheckbox = document.getElementById('show-hartford-line-live');
        if (hartfordLineLiveCheckbox) {
            hartfordLineLiveCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                // Only proceed if data is available
                if (hartfordLineLines.length === 0) {
                    return;
                }
                
                // Hide/show Hartford Line train markers
                hartfordLineMarkers.forEach((marker, trainId) => {
                    if (marker) {
                        if (isChecked) {
                            marker.addTo(map);
                        } else {
                            marker.remove();
                        }
                    }
                });
                
                // Control live tracking for Hartford Line (placeholder for future real-time feed)
                // TODO: Implement real-time tracking when GTFS-Realtime feed is available
                
                updateStats();
            });
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
                    mtaSubwayLines.forEach(lineName => {
                        const layerKey = layerKeyForSystem('mta-subway', lineName);
                        if (layers[layerKey]) {
                            if (isChecked) map.addLayer(layers[layerKey]);
                            else map.removeLayer(layers[layerKey]);
                        }
                    });
                }
                updateStats();
            });
        }
        
        // MTA Subway live tracking filter
        const subwayLiveCheckbox = document.getElementById('show-mta-subway-live');
        if (subwayLiveCheckbox && mtaSubwayLines.length > 0) {
            subwayLiveCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                
                // Hide/show subway train markers using same visibility rules as elsewhere (respects highlight state)
                mtaSubwayMarkers.forEach((marker, trainId) => {
                    if (marker) {
                        const shouldShow = shouldShowMarker('subway', marker.routeName, 'show-mta-subway-live');
                        if (shouldShow) {
                            if (!map.hasLayer(marker)) marker.addTo(map);
                        } else {
                            if (map.hasLayer(marker)) {
                                closeMarkerPopupAndTooltip(marker);
                                map.removeLayer(marker);
                            }
                        }
                    }
                });
                
                // Control live tracking for subway
                if (isChecked) {
                    if (!mtaSubwayTrackingInterval) {
                        startMtaSubwayTracking();
                    }
                } else {
                    stopMtaSubwayTracking();
                }
                
                updateStats();
            });
            
            // Start subway tracking after routes are loaded (delayed to avoid conflicts)
            if (subwayLiveCheckbox.checked) {
                setTimeout(() => startMtaSubwayTracking(), 1500);
            }
        }
        
        // NJ Transit paths filter (if data available)
        const njTransitPathsCheckbox = document.getElementById('show-nj-transit-paths');
        if (njTransitPathsCheckbox && njTransitLines.length > 0) {
            njTransitPathsCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                if (!njTransitRoutesLoaded && !njTransitRoutesLoading) {
                    loadNJTransitRoutes(isChecked);
                } else if (njTransitRoutesLoaded) {
                    njTransitLines.forEach(lineName => {
                        if (layers[lineName]) {
                            if (isChecked) map.addLayer(layers[lineName]);
                            else map.removeLayer(layers[lineName]);
                        }
                    });
                }
                updateStats();
            });
        }
        
        // NJ Transit live tracking (requires NJ_TRANSIT_VEHICLES_URL set and server running)
        const njTransitLiveCheckbox = document.getElementById('show-nj-transit-live');
        if (njTransitLiveCheckbox && njTransitLines.length > 0) {
            njTransitLiveCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                njTransitMarkers.forEach((marker, trainId) => {
                    if (marker) {
                        if (isChecked) {
                            const shouldShow = shouldShowMarker('njTransit', marker.routeName, 'show-nj-transit-live');
                            if (shouldShow && !map.hasLayer(marker)) marker.addTo(map);
                        } else {
                            if (map.hasLayer(marker)) map.removeLayer(marker);
                        }
                    }
                });
                if (isChecked) {
                    if (!njTransitTrackingInterval) startNJTransitTracking();
                } else {
                    stopNJTransitTracking();
                }
                updateStats();
            });
            if (njTransitLiveCheckbox.checked) {
                setTimeout(() => startNJTransitTracking(), 500);
            }
        }
        
        // SEPTA paths filter (if data available)
        const septaPathsCheckbox = document.getElementById('show-septa-paths');
        if (septaPathsCheckbox && septaLines.length > 0) {
            septaPathsCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                if (!septaRoutesLoaded && !septaRoutesLoading) {
                    loadSEPTARoutes(isChecked);
                } else if (septaRoutesLoaded) {
                    septaLines.forEach(lineName => {
                        if (layers[lineName]) {
                            if (isChecked) map.addLayer(layers[lineName]);
                            else map.removeLayer(layers[lineName]);
                        }
                    });
                }
                updateStats();
            });
        }
        
        // SEPTA live tracking (Regional Rail GTFS-RT)
        const septaLiveCheckbox = document.getElementById('show-septa-live');
        if (septaLiveCheckbox && septaLines.length > 0) {
            septaLiveCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                septaMarkers.forEach((marker, trainId) => {
                    if (marker) {
                        if (isChecked) {
                            const shouldShow = shouldShowMarker('septa', marker.routeName, 'show-septa-live');
                            if (shouldShow && !map.hasLayer(marker)) marker.addTo(map);
                        } else {
                            if (map.hasLayer(marker)) map.removeLayer(marker);
                        }
                    }
                });
                if (isChecked) {
                    if (!septaTrackingInterval) startSEPTATracking();
                } else {
                    stopSEPTATracking();
                }
                updateStats();
            });
            if (septaLiveCheckbox.checked) {
                setTimeout(() => startSEPTATracking(), 500);
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
        
        // Add Amtrak route colors dynamically if data is available
        if (typeof amtrakRoutesData !== 'undefined' && amtrakRoutesData && amtrakRoutesData.routes) {
            Object.keys(amtrakRoutesData.routes).forEach(routeName => {
                const route = amtrakRoutesData.routes[routeName];
                const color = route.color || '#003366';
                lineColors[routeName] = color.startsWith('#') ? color : '#' + color;
            });
        }
        
        // Add NJ Transit route colors dynamically if data is available
        if (typeof njTransitRoutesData !== 'undefined' && njTransitRoutesData && njTransitRoutesData.routes) {
            Object.keys(njTransitRoutesData.routes).forEach(routeName => {
                const route = njTransitRoutesData.routes[routeName];
                const color = (route && route.color) || '#008C45';
                lineColors[routeName] = (typeof color === 'string' && color.startsWith('#')) ? color : '#' + (color || '008C45');
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
                                    // Leaflet SVG renderer uses <path> for CircleMarker, not <circle>, so cx/cy are null — use getBBox() or map position
                                    let cx = element.getAttribute('cx');
                                    let cy = element.getAttribute('cy');
                                    if (cx == null || cy == null) {
                                        if (typeof element.getBBox === 'function') {
                                            const bbox = element.getBBox();
                                            cx = bbox.x + bbox.width / 2;
                                            cy = bbox.y + bbox.height / 2;
                                        } else {
                                            const map = marker.getMap();
                                            if (map) {
                                                const pt = map.latLngToLayerPoint(marker.getLatLng());
                                                cx = pt.x;
                                                cy = pt.y;
                                            }
                                        }
                                    } else {
                                        cx = parseFloat(cx);
                                        cy = parseFloat(cy);
                                    }
                                    const parent = element.parentElement;
                                    if (parent && typeof cx === 'number' && !Number.isNaN(cx) && typeof cy === 'number' && !Number.isNaN(cy)) {
                                        const hitCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                                        hitCircle.setAttribute('cx', cx);
                                        hitCircle.setAttribute('cy', cy);
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
                        const layerKey = layerKeyForSystem('mbta-bus', lineName);
                        if (layers[layerKey]) {
                            if (showOnMap) map.addLayer(layers[layerKey]);
                            else map.removeLayer(layers[layerKey]);
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
                                
                                const layerKey = layerKeyForSystem('mbta-bus', lineName);
                                if (trackLine && layers[layerKey]) layers[layerKey].addLayer(trackLine);
                            }
                        });
                    }
                    const layerKey = layerKeyForSystem('mbta-bus', lineName);
                    if (showOnMap && layers[layerKey]) layers[layerKey].addTo(map);
                }
                
                currentIndex = endIndex;
                
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
            const busRoutesChecked = isChecked('show-bus-paths');
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
            
            // Second pass: Create ONE marker per unique stop (not per route)
            const renderedLIRRStops = new Set();
            
            lirrLines.forEach(lineName => {
                const route = lirrRoutesData.routes[lineName];
                const color = lineColors[lineName] || '#00305E'; // Get route color
                
                if (!route || !route.stops) {
                    return;
                }
                
                // Add each stop to this route's layer (only if not already rendered)
                route.stops.forEach(stop => {
                    // Skip if already rendered
                    if (stop.lat && stop.lon && !renderedLIRRStops.has(stop.stop_id)) {
                        renderedLIRRStops.add(stop.stop_id);
                        
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
            
            // Second pass: Create ONE marker per unique stop (not per route)
            const renderedMetroNorthStops = new Set();
            
            metroNorthLines.forEach(lineName => {
                const route = metroNorthRoutesData.routes[lineName];
                // Use route color from data, fallback to lineColors, then default
                const color = route?.color || lineColors[lineName] || '#003A70';
                
                if (!route || !route.stops) {
                    return;
                }
                
                // Add each stop to this route's layer (only if not already rendered)
                route.stops.forEach(stop => {
                    // Skip if already rendered
                    if (stop.lat && stop.lon && !renderedMetroNorthStops.has(stop.stop_id)) {
                        renderedMetroNorthStops.add(stop.stop_id);
                        
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
        
        // Function to load NJ Transit routes
        function loadNJTransitRoutes(showOnMap = false) {
            if (njTransitRoutesLoaded || njTransitRoutesLoading) {
                if (njTransitRoutesLoaded) {
                    njTransitLines.forEach(lineName => {
                        if (layers[lineName]) {
                            if (showOnMap) map.addLayer(layers[lineName]);
                            else map.removeLayer(layers[lineName]);
                        }
                    });
                }
                return;
            }
            if (typeof njTransitRoutesData === 'undefined' || !njTransitRoutesData || !njTransitRoutesData.routes) {
                return;
            }
            njTransitRoutesLoading = true;
            const loadingIndicator = document.getElementById('nj-transit-loading-indicator');
            if (loadingIndicator) loadingIndicator.style.display = 'table-row';
            
            njTransitLines.forEach(lineName => {
                const route = njTransitRoutesData.routes[lineName];
                const color = (route && route.color) || lineColors[lineName] || '#008C45';
                if (route && route.shapes && route.shapes.length > 0) {
                    route.shapes.forEach((shape) => {
                        const coords = shape.coords;
                        if (coords && Array.isArray(coords) && coords.length > 1) {
                            const trackLine = renderRouteTrack(coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.8,
                                pane: 'njTransitPane',
                                popupText: `<b>NJ Transit: ${lineName}</b><br>Route ID: ${route.route_id || 'N/A'}`,
                                onClick: function(e) {
                                    L.DomEvent.stopPropagation(e);
                                    if (highlightedNJTransitLine === lineName) {
                                        resetNJTransitHighlight();
                                    } else {
                                        highlightNJTransitLine(lineName);
                                    }
                                }
                            });
                            if (trackLine && layers[lineName]) layers[lineName].addLayer(trackLine);
                        }
                    });
                }
                if (showOnMap && layers[lineName]) map.addLayer(layers[lineName]);
            });
            
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            njTransitRoutesLoaded = true;
            njTransitRoutesLoading = false;
            loadNJTransitStations();
        }
        
        // Function to load NJ Transit stations
        function loadNJTransitStations() {
            if (typeof njTransitRoutesData === 'undefined' || !njTransitRoutesData || !njTransitRoutesData.routes) return;
            const stopToRoutes = new Map();
            njTransitLines.forEach(lineName => {
                const route = njTransitRoutesData.routes[lineName];
                if (route && route.stops) {
                    route.stops.forEach(stop => {
                        if (!stopToRoutes.has(stop.stop_id)) {
                            stopToRoutes.set(stop.stop_id, { stop: stop, routes: [] });
                        }
                        stopToRoutes.get(stop.stop_id).routes.push(lineName);
                    });
                }
            });
            const renderedNJTransitStops = new Set();
            njTransitLines.forEach(lineName => {
                const route = njTransitRoutesData.routes[lineName];
                const color = (route && route.color) || lineColors[lineName] || '#008C45';
                if (!route || !route.stops) return;
                route.stops.forEach(stop => {
                    if (!stop.lat || !stop.lon || renderedNJTransitStops.has(stop.stop_id)) return;
                    renderedNJTransitStops.add(stop.stop_id);
                    const stopInfo = stopToRoutes.get(stop.stop_id);
                    const servingRoutes = stopInfo.routes;
                    const isMultiRoute = servingRoutes.length > 1;
                    const fillColor = isMultiRoute ? '#D3D3D3' : color;
                    const baseRadius = 5;
                    const radius = getStopRadius(baseRadius, map.getZoom());
                    const stationMarker = L.circleMarker([stop.lat, stop.lon], {
                        radius: radius,
                        baseRadius: baseRadius,
                        fillColor: fillColor,
                        color: '#fff',
                        weight: 1.5,
                        opacity: 1,
                        fillOpacity: 0.8,
                        pane: 'stopsPane',
                        interactive: true,
                        bubblingMouseEvents: false
                    });
                    const routesText = isMultiRoute ? servingRoutes.join(', ') : lineName;
                    const tooltipText = isMultiRoute ?
                        `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Lines: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>` :
                        `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Line: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>`;
                    const tooltipDirection = stop.lat < 40.76 ? 'bottom' : 'top';
                    stationMarker.bindTooltip(tooltipText, { direction: tooltipDirection, permanent: false, interactive: true, className: 'custom-tooltip' });
                    stationMarker.on('click', function(e) {
                        L.DomEvent.stopPropagation(e);
                        const servingRoutes = stopInfo.routes;
                        const alreadyHighlighted = Array.isArray(highlightedNJTransitLine)
                            ? JSON.stringify(highlightedNJTransitLine.sort()) === JSON.stringify(servingRoutes.sort())
                            : highlightedNJTransitLine === lineName && servingRoutes.length === 1;
                        if (highlightedNJTransitLine && !alreadyHighlighted) {
                            const isCurrentlyDimmed = Array.isArray(highlightedNJTransitLine)
                                ? !servingRoutes.some(r => highlightedNJTransitLine.includes(r))
                                : !servingRoutes.includes(highlightedNJTransitLine);
                            if (isCurrentlyDimmed) return;
                        }
                        if (alreadyHighlighted) resetNJTransitHighlight();
                        else if (servingRoutes.length > 1) highlightMultipleNJTransitLines(servingRoutes);
                        else highlightNJTransitLine(servingRoutes[0]);
                    });
                    if (layers[lineName]) layers[lineName].addLayer(stationMarker);
                });
            });
        }
        
        // Function to load SEPTA routes
        function loadSEPTARoutes(showOnMap = false) {
            if (septaRoutesLoaded || septaRoutesLoading) {
                if (septaRoutesLoaded) {
                    septaLines.forEach(lineName => {
                        if (layers[lineName]) {
                            if (showOnMap) map.addLayer(layers[lineName]);
                            else map.removeLayer(layers[lineName]);
                        }
                    });
                }
                return;
            }
            if (typeof septaRoutesData === 'undefined' || !septaRoutesData || !septaRoutesData.routes) {
                return;
            }
            septaRoutesLoading = true;
            const loadingIndicator = document.getElementById('septa-loading-indicator');
            if (loadingIndicator) loadingIndicator.style.display = 'table-row';
            
            septaLines.forEach(lineName => {
                const route = septaRoutesData.routes[lineName];
                const color = (route && route.color) || lineColors[lineName] || '#1F4E79';
                if (route && route.shapes && route.shapes.length > 0) {
                    route.shapes.forEach((shape) => {
                        const coords = shape.coords;
                        if (coords && Array.isArray(coords) && coords.length > 1) {
                            const trackLine = renderRouteTrack(coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.8,
                                pane: 'septaPane',
                                popupText: `<b>SEPTA: ${lineName}</b><br>Route ID: ${route.route_id || 'N/A'}`,
                                onClick: function(e) {
                                    L.DomEvent.stopPropagation(e);
                                    if (highlightedSEPTALine === lineName) {
                                        resetSEPTAHighlight();
                                    } else {
                                        highlightSEPTALine(lineName);
                                    }
                                }
                            });
                            if (trackLine && layers[lineName]) layers[lineName].addLayer(trackLine);
                        }
                    });
                }
                if (showOnMap && layers[lineName]) map.addLayer(layers[lineName]);
            });
            
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            septaRoutesLoaded = true;
            septaRoutesLoading = false;
            loadSEPTAStations();
        }
        
        // Function to load SEPTA stations
        function loadSEPTAStations() {
            if (typeof septaRoutesData === 'undefined' || !septaRoutesData || !septaRoutesData.routes) return;
            const stopToRoutes = new Map();
            septaLines.forEach(lineName => {
                const route = septaRoutesData.routes[lineName];
                if (route && route.stops) {
                    route.stops.forEach(stop => {
                        if (!stopToRoutes.has(stop.stop_id)) {
                            stopToRoutes.set(stop.stop_id, { stop: stop, routes: [] });
                        }
                        stopToRoutes.get(stop.stop_id).routes.push(lineName);
                    });
                }
            });
            const rendered = new Set();
            septaLines.forEach(lineName => {
                const route = septaRoutesData.routes[lineName];
                const color = (route && route.color) || lineColors[lineName] || '#1F4E79';
                if (!route || !route.stops) return;
                route.stops.forEach(stop => {
                    if (!stop.lat || !stop.lon || rendered.has(stop.stop_id)) return;
                    rendered.add(stop.stop_id);
                    const stopInfo = stopToRoutes.get(stop.stop_id);
                    const servingRoutes = stopInfo.routes;
                    const isMultiRoute = servingRoutes.length > 1;
                    const fillColor = isMultiRoute ? '#D3D3D3' : color;
                    const baseRadius = 5;
                    const radius = getStopRadius(baseRadius, map.getZoom());
                    const stationMarker = L.circleMarker([stop.lat, stop.lon], {
                        radius: radius,
                        baseRadius: baseRadius,
                        fillColor: fillColor,
                        color: '#fff',
                        weight: 1.5,
                        opacity: 1,
                        fillOpacity: 0.8,
                        pane: 'stopsPane',
                        interactive: true,
                        bubblingMouseEvents: false
                    });
                    const routesText = isMultiRoute ? servingRoutes.join(', ') : lineName;
                    const tooltipText = isMultiRoute ?
                        `<div style="font-size: 11px;"><b>${stop.name}</b><br>SEPTA<br>Lines: ${routesText}</div>` :
                        `<div style="font-size: 11px;"><b>${stop.name}</b><br>SEPTA<br>Line: ${routesText}</div>`;
                    const tooltipDirection = stop.lat < 40.76 ? 'bottom' : 'top';
                    stationMarker.bindTooltip(tooltipText, { direction: tooltipDirection, permanent: false, interactive: true, className: 'custom-tooltip' });
                    stationMarker.on('click', function(e) {
                        L.DomEvent.stopPropagation(e);
                        const servingRoutes = stopInfo.routes;
                        const alreadyHighlighted = Array.isArray(highlightedSEPTALine)
                            ? JSON.stringify(highlightedSEPTALine.slice().sort()) === JSON.stringify(servingRoutes.slice().sort())
                            : highlightedSEPTALine === lineName && servingRoutes.length === 1;
                        if (highlightedSEPTALine && !alreadyHighlighted) {
                            const isCurrentlyDimmed = Array.isArray(highlightedSEPTALine)
                                ? !servingRoutes.some(r => highlightedSEPTALine.includes(r))
                                : !servingRoutes.includes(highlightedSEPTALine);
                            if (isCurrentlyDimmed) return;
                        }
                        if (alreadyHighlighted) resetSEPTAHighlight();
                        else if (servingRoutes.length > 1) highlightMultipleSEPTALines(servingRoutes);
                        else highlightSEPTALine(servingRoutes[0]);
                    });
                    if (layers[lineName]) layers[lineName].addLayer(stationMarker);
                });
            });
        }
        
        // Function to load Shore Line East routes
        function loadShoreLineEastRoutes(showOnMap = false) {
            if (shoreLineEastRoutesLoaded || shoreLineEastRoutesLoading) {
                // Already loaded or loading - just show/hide as needed
                if (shoreLineEastRoutesLoaded) {
                    shoreLineEastLines.forEach(lineName => {
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
            
            // Check if Shore Line East data is available
            if (typeof shoreLineEastRoutesData === 'undefined' || !shoreLineEastRoutesData || !shoreLineEastRoutesData.routes) {
                return;
            }
            
            
            shoreLineEastRoutesLoading = true;
            
            // Show loading indicator
            const loadingIndicator = document.getElementById('shore-line-east-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'table-row';
            }
            
            // Process routes
            shoreLineEastLines.forEach(lineName => {
                const route = shoreLineEastRoutesData.routes[lineName];
                if (!route) {
                    return;
                }
                // Force Shore Line East to use blue (different from Amtrak's #CAE4F1)
                const color = lineColors[lineName] || '#0066CC';
                
                // Shore Line East uses Amtrak tracks from New Haven to New London
                // New Haven: lat 41.297714, lon -72.92667
                // New London: lat 41.354267, lon -72.093225
                // Extract track geometry from Amtrak data if Shore Line East shapes are empty
                let shoreLineEastCoords = [];
                
                if ((!route.shapes || route.shapes.length === 0) && 
                    typeof amtrakRoutesData !== 'undefined' && amtrakRoutesData && amtrakRoutesData.routes) {
                    
                    // Find Amtrak route with track data (Northeast Regional or Acela)
                    const amtrakRouteNames = ['Northeast Regional', 'Acela'];
                    for (const amtrakRouteName of amtrakRouteNames) {
                        const amtrakRoute = amtrakRoutesData.routes[amtrakRouteName];
                        if (amtrakRoute && amtrakRoute.shapes && amtrakRoute.shapes.length > 0) {
                            // Extract coords within New Haven to New London bounds
                            // Longitude bounds: -72.93 (New Haven west) to -72.09 (New London east)
                            for (const shape of amtrakRoute.shapes) {
                                if (shape.coords && Array.isArray(shape.coords)) {
                                    const filteredCoords = shape.coords.filter(coord => {
                                        const lat = coord[0];
                                        const lon = coord[1];
                                        // Filter for Connecticut coastline segment (New Haven to New London)
                                        return lat >= 41.25 && lat <= 41.40 && lon >= -72.95 && lon <= -72.05;
                                    });
                                    if (filteredCoords.length > 10) {
                                        // Use Amtrak's exact track order (do not sort - track follows coast, not straight W-E)
                                        shoreLineEastCoords = filteredCoords;
                                        break;
                                    }
                                }
                            }
                            if (shoreLineEastCoords.length > 0) break;
                        }
                    }
                }
                
                // Render route shapes - use extracted Amtrak coords if Shore Line East has none
                if (route.shapes && route.shapes.length > 0) {
                    route.shapes.forEach((shape, shapeIndex) => {
                        let coords = shape.coords;
                        
                        if (coords && Array.isArray(coords) && coords.length > 1) {
                            const trackLine = renderRouteTrack(coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.8,
                                pane: 'ctrailPane',
                                popupText: `<b>Shore Line East: ${lineName}</b><br>Route ID: ${route.route_id || 'N/A'}`,
                                onClick: function(e) {
                                    L.DomEvent.stopPropagation(e);
                                    
                                    // Toggle highlighting
                                    if (highlightedShoreLineEastLine === lineName) {
                                        resetShoreLineEastHighlight();
                                    } else {
                                        highlightShoreLineEastLine(lineName);
                                    }
                                }
                            });
                            
                            if (trackLine) {
                                layers[lineName].addLayer(trackLine);
                            }
                        } else {
                        }
                    });
                } else if (shoreLineEastCoords.length > 1) {
                    // Use extracted Amtrak track geometry
                    const trackLine = renderRouteTrack(shoreLineEastCoords, {
                        color: color,
                        weight: 4,
                        opacity: 0.8,
                        pane: 'ctrailPane',
                        popupText: `<b>Shore Line East: ${lineName}</b><br>New Haven - New London`,
                        onClick: function(e) {
                            L.DomEvent.stopPropagation(e);
                            
                            // Toggle highlighting
                            if (highlightedShoreLineEastLine === lineName) {
                                resetShoreLineEastHighlight();
                            } else {
                                highlightShoreLineEastLine(lineName);
                            }
                        }
                    });
                    
                    if (trackLine) {
                        layers[lineName].addLayer(trackLine);
                    }
                } else {
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
            
            shoreLineEastRoutesLoaded = true;
            shoreLineEastRoutesLoading = false;
            
            
            // Load Shore Line East stations after routes
            loadShoreLineEastStations();
        }
        
        // Function to load Shore Line East stations (visible at all zoom levels)
        function loadShoreLineEastStations() {
            if (typeof shoreLineEastRoutesData === 'undefined' || !shoreLineEastRoutesData || !shoreLineEastRoutesData.routes) {
                return;
            }
            // Shore Line East runs New Haven to New London only. GTFS sometimes includes Stamford (Metro North);
            // exclude stops outside this corridor so highlighting SLE doesn't show Stamford.
            const SLE_LON_MIN = -72.95;
            const SLE_LON_MAX = -72.05;
            const SLE_LAT_MIN = 41.25;
            const SLE_LAT_MAX = 41.40;
            function isInShoreLineEastCorridor(lat, lon) {
                return lat >= SLE_LAT_MIN && lat <= SLE_LAT_MAX && lon >= SLE_LON_MIN && lon <= SLE_LON_MAX;
            }
            
            // First pass: Build a map of stop_id -> routes serving that stop (only stops in corridor)
            const stopToRoutes = new Map();
            shoreLineEastLines.forEach(lineName => {
                const route = shoreLineEastRoutesData.routes[lineName];
                if (route && route.stops) {
                    route.stops.forEach(stop => {
                        if (!stop.lat || !stop.lon || !isInShoreLineEastCorridor(Number(stop.lat), Number(stop.lon))) return;
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
            
            // Second pass: Create ONE marker per unique stop (not per route)
            const renderedShoreLineEastStops = new Set();
            
            shoreLineEastLines.forEach(lineName => {
                const route = shoreLineEastRoutesData.routes[lineName];
                // Force Shore Line East to use blue (different from Amtrak's #CAE4F1)
                const color = lineColors[lineName] || '#0066CC';
                
                if (!route || !route.stops) {
                    return;
                }
                
                // Add each stop to this route's layer (only if not already rendered and in corridor)
                route.stops.forEach(stop => {
                    if (!stop.lat || !stop.lon || !isInShoreLineEastCorridor(Number(stop.lat), Number(stop.lon))) return;
                    // Skip if already rendered
                    if (!renderedShoreLineEastStops.has(stop.stop_id)) {
                        renderedShoreLineEastStops.add(stop.stop_id);
                        
                        const stopInfo = stopToRoutes.get(stop.stop_id);
                        const servingRoutes = stopInfo.routes;
                        const isMultiRoute = servingRoutes.length > 1;
                        const fillColor = isMultiRoute ? '#D3D3D3' : color;
                        
                        const baseRadius = 5;
                        const currentZoom = map.getZoom();
                        const radius = getStopRadius(baseRadius, currentZoom);
                        
                        const routesText = isMultiRoute ? servingRoutes.join(', ') : lineName;
                        const tooltipText = isMultiRoute ? 
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Lines: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>` :
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Line: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>`;
                        
                        const tooltipDirection = stop.lat < 40.76 ? 'bottom' : 'top';
                        
                        const onClickHandler = function(e) {
                            L.DomEvent.stopPropagation(e);
                            const servingRoutes = stopInfo.routes;
                            const alreadyHighlighted = Array.isArray(highlightedShoreLineEastLine) 
                                ? JSON.stringify(highlightedShoreLineEastLine.sort()) === JSON.stringify(servingRoutes.sort())
                                : highlightedShoreLineEastLine === lineName && servingRoutes.length === 1;
                            
                            if (highlightedShoreLineEastLine && !alreadyHighlighted) {
                                const isCurrentlyDimmed = Array.isArray(highlightedShoreLineEastLine)
                                    ? !servingRoutes.some(route => highlightedShoreLineEastLine.includes(route))
                                    : !servingRoutes.includes(highlightedShoreLineEastLine);
                                
                                if (isCurrentlyDimmed) {
                                    return;
                                }
                            }
                            
                            if (alreadyHighlighted) {
                                resetShoreLineEastHighlight();
                            } else {
                                if (servingRoutes.length > 1) {
                                    highlightMultipleShoreLineEastLines(servingRoutes);
                                } else {
                                    highlightShoreLineEastLine(servingRoutes[0]);
                                }
                            }
                        };
                        
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
                        
                        if (layers[lineName] && stationMarker) {
                            layers[lineName].addLayer(stationMarker);
                        }
                    }
                });
            });
        }
        
        // Function to load Amtrak routes
        function loadAmtrakRoutes(showOnMap = false, onComplete = null) {
            if (amtrakRoutesLoaded || amtrakRoutesLoading) {
                // Already loaded or loading - just show/hide as needed
                if (amtrakRoutesLoaded) {
                    amtrakLines.forEach(lineName => {
                        if (layers[lineName]) {
                            if (showOnMap) {
                                map.addLayer(layers[lineName]);
                            } else {
                                map.removeLayer(layers[lineName]);
                            }
                        }
                    });
                    if (onComplete) onComplete();
                }
                return;
            }
            
            // Check if Amtrak data is available
            if (typeof amtrakRoutesData === 'undefined' || !amtrakRoutesData || !amtrakRoutesData.routes) {
                return;
            }
            
            amtrakRoutesLoading = true;
            
            // Show loading indicator
            const loadingIndicator = document.getElementById('amtrak-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'table-row';
            }
            
            // Process routes
            amtrakLines.forEach(lineName => {
                const route = amtrakRoutesData.routes[lineName];
                if (!route) {
                    return;
                }
                // Use route color from data, fallback to lineColors, then default
                const color = route.color || lineColors[lineName] || '#CAE4F1';
                
                // Render route shapes if available
                if (route.shapes && route.shapes.length > 0) {
                    route.shapes.forEach((shape, shapeIndex) => {
                        let coords = shape.coords;
                        
                        if (coords && Array.isArray(coords) && coords.length > 1) {
                            const trackLine = renderRouteTrack(coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.8,
                                pane: 'amtrakPane',
                                popupText: `<b>Amtrak: ${lineName}</b><br>Route ID: ${route.route_id || 'N/A'}`,
                                onClick: function(e) {
                                    L.DomEvent.stopPropagation(e);
                                    
                                    // Toggle highlighting
                                    if (highlightedAmtrakLine === lineName) {
                                        resetAmtrakHighlight();
                                    } else {
                                        highlightAmtrakLine(lineName);
                                    }
                                }
                            });
                            
                            if (trackLine) {
                                layers[lineName].addLayer(trackLine);
                            }
                        } else {
                        }
                    });
                } else {
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
            
            amtrakRoutesLoaded = true;
            amtrakRoutesLoading = false;
            
            // Load Amtrak stations after routes
            loadAmtrakStations();
        }
        
        // Amtrak station connections mapping (built automatically)
        const amtrakStationConnections = new Map(); // stop_id -> array of MBTA connections
        
        // Helper function to normalize station names for matching
        function normalizeStationName(name) {
            if (!name) return '';
            return name.toLowerCase()
                .replace(/\s*station\s*/gi, ' ')
                .replace(/\s*amtrak\s*/gi, ' ')
                .replace(/\s*stop\s*/gi, ' ')
                .replace(/[^\w\s]/g, '') // Remove punctuation
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();
        }
        
        // Helper function to calculate distance between two coordinates (Haversine formula)
        // Returns distance in kilometers
        function calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371; // Earth's radius in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }
        
        /*
         * UNIFIED CONNECTION FINDER - Searches ALL transit systems
         * =========================================================
         * NOTE TO DEVELOPER: When adding a new transit agency, update this function
         * to include the new data source. All systems should connect to all other systems.
         * 
         * Current systems searched:
         * - MBTA: mbtaStopsData, mbtaBusData, silverLineData, mbtaFerryData
         * - MTA: lirrRoutesData, metroNorthRoutesData, mtaSubwayRoutesData
         * - CTrail: shoreLineEastRoutesData, hartfordLineRoutesData
         * - Amtrak: amtrakRoutesData
         */
        function findAllConnections(station, excludeSystem = null) {
            const connections = [];
            const stationLat = station.lat || (station.coords && station.coords[0]);
            const stationLon = station.lon || (station.coords && station.coords[1]);
            const stationName = station.name;
            
            if (!stationLat || !stationLon || !stationName) return connections;
            
            const normalizedName = normalizeStationName(stationName);
            const proximityThreshold = 0.5; // 0.5 km = same area
            const maxConnectionDistanceKm = 1; // Never combine stations over 1 km apart, even if names match
            
            // Helper to check name/proximity match (distance always required: never match if > 1 km)
            function isMatch(otherName, otherLat, otherLon) {
                const normalizedOther = normalizeStationName(otherName);
                const distance = calculateDistance(stationLat, stationLon, otherLat, otherLon);
                if (distance > maxConnectionDistanceKm) return { match: false, distance, nameMatch: false };
                const nameMatch = normalizedName === normalizedOther ||
                    (normalizedName.length > 5 && normalizedOther.length > 5 &&
                     (normalizedName.includes(normalizedOther) || normalizedOther.includes(normalizedName)));
                return { match: nameMatch || distance <= proximityThreshold, distance, nameMatch };
            }
            
            // Helper to add connection
            function addConnection(system, lineName, stopName, stopId, coords, distance, nameMatch) {
                connections.push({
                    system: system,
                    lineName: lineName,
                    stationName: stopName,
                    stopId: stopId,
                    coords: coords,
                    matchMethod: nameMatch ? 'name' : 'proximity',
                    distance: distance
                });
            }
            
            // ===== MBTA SYSTEMS =====
            if (excludeSystem !== 'mbta') {
                // MBTA Subway/Commuter Rail
                if (typeof mbtaStopsData !== 'undefined' && mbtaStopsData) {
                    Object.keys(mbtaStopsData).forEach(lineName => {
                        const stops = mbtaStopsData[lineName];
                        if (Array.isArray(stops)) {
                            stops.forEach(stop => {
                                if (stop.coords && stop.coords.length === 2) {
                                    const result = isMatch(stop.name, stop.coords[0], stop.coords[1]);
                                    if (result.match) {
                                        addConnection(stop.type === 'Commuter Rail' ? 'mbta_commuter' : 'mbta_subway',
                                            lineName, stop.name, stop.stopId, stop.coords, result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
                
                // MBTA Bus
                if (typeof mbtaBusData !== 'undefined' && mbtaBusData) {
                    Object.keys(mbtaBusData).forEach(lineName => {
                        const stops = mbtaBusData[lineName];
                        if (Array.isArray(stops)) {
                            stops.forEach(stop => {
                                if (stop.coords && stop.coords.length === 2) {
                                    const result = isMatch(stop.name, stop.coords[0], stop.coords[1]);
                                    if (result.match) {
                                        addConnection('mbta_bus', lineName, stop.name, stop.stopId, stop.coords, result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
                
                // Silver Line
                if (typeof silverLineData !== 'undefined' && silverLineData) {
                    Object.keys(silverLineData).forEach(lineName => {
                        const stops = silverLineData[lineName];
                        if (Array.isArray(stops)) {
                            stops.forEach(stop => {
                                if (stop.coords && stop.coords.length === 2) {
                                    const result = isMatch(stop.name, stop.coords[0], stop.coords[1]);
                                    if (result.match) {
                                        addConnection('mbta_silver', lineName, stop.name, stop.stopId, stop.coords, result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
                
                // Ferry
                if (typeof mbtaFerryData !== 'undefined' && mbtaFerryData) {
                    Object.keys(mbtaFerryData).forEach(lineName => {
                        const stops = mbtaFerryData[lineName];
                        if (Array.isArray(stops)) {
                            stops.forEach(stop => {
                                if (stop.coords && stop.coords.length === 2) {
                                    const result = isMatch(stop.name, stop.coords[0], stop.coords[1]);
                                    if (result.match) {
                                        addConnection('mbta_ferry', lineName, stop.name, stop.stopId, stop.coords, result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
            }
            
            // ===== MTA SYSTEMS =====
            if (excludeSystem !== 'mta') {
                // LIRR
                if (typeof lirrRoutesData !== 'undefined' && lirrRoutesData && lirrRoutesData.routes) {
                    Object.keys(lirrRoutesData.routes).forEach(lineName => {
                        const route = lirrRoutesData.routes[lineName];
                        if (route && route.stops) {
                            route.stops.forEach(stop => {
                                if (stop.lat && stop.lon) {
                                    const result = isMatch(stop.name, stop.lat, stop.lon);
                                    if (result.match) {
                                        addConnection('lirr', lineName, stop.name, stop.stop_id, [stop.lat, stop.lon], result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
                
                // Metro North
                if (typeof metroNorthRoutesData !== 'undefined' && metroNorthRoutesData && metroNorthRoutesData.routes) {
                    Object.keys(metroNorthRoutesData.routes).forEach(lineName => {
                        const route = metroNorthRoutesData.routes[lineName];
                        if (route && route.stops) {
                            route.stops.forEach(stop => {
                                if (stop.lat && stop.lon) {
                                    const result = isMatch(stop.name, stop.lat, stop.lon);
                                    if (result.match) {
                                        addConnection('metro_north', lineName, stop.name, stop.stop_id, [stop.lat, stop.lon], result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
                
                // MTA Subway
                if (typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData && mtaSubwayRoutesData.routes) {
                    Object.keys(mtaSubwayRoutesData.routes).forEach(lineName => {
                        const route = mtaSubwayRoutesData.routes[lineName];
                        if (route && route.stops) {
                            route.stops.forEach(stop => {
                                if (stop.lat && stop.lon) {
                                    const result = isMatch(stop.name, stop.lat, stop.lon);
                                    if (result.match) {
                                        addConnection('mta_subway', lineName, stop.name, stop.stop_id, [stop.lat, stop.lon], result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
            }
            
            // ===== CTRAIL SYSTEMS =====
            if (excludeSystem !== 'ctrail') {
                // Shore Line East
                if (typeof shoreLineEastRoutesData !== 'undefined' && shoreLineEastRoutesData && shoreLineEastRoutesData.routes) {
                    Object.keys(shoreLineEastRoutesData.routes).forEach(lineName => {
                        const route = shoreLineEastRoutesData.routes[lineName];
                        if (route && route.stops) {
                            route.stops.forEach(stop => {
                                if (stop.lat && stop.lon) {
                                    const result = isMatch(stop.name, stop.lat, stop.lon);
                                    if (result.match) {
                                        addConnection('shore_line_east', lineName, stop.name, stop.stop_id, [stop.lat, stop.lon], result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
                
                // Hartford Line
                if (typeof hartfordLineRoutesData !== 'undefined' && hartfordLineRoutesData && hartfordLineRoutesData.routes) {
                    Object.keys(hartfordLineRoutesData.routes).forEach(lineName => {
                        const route = hartfordLineRoutesData.routes[lineName];
                        if (route && route.stops) {
                            route.stops.forEach(stop => {
                                if (stop.lat && stop.lon) {
                                    const result = isMatch(stop.name, stop.lat, stop.lon);
                                    if (result.match) {
                                        addConnection('hartford_line', lineName, stop.name, stop.stop_id, [stop.lat, stop.lon], result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
            }
            
            // ===== AMTRAK =====
            if (excludeSystem !== 'amtrak') {
                if (typeof amtrakRoutesData !== 'undefined' && amtrakRoutesData && amtrakRoutesData.routes) {
                    Object.keys(amtrakRoutesData.routes).forEach(lineName => {
                        const route = amtrakRoutesData.routes[lineName];
                        if (route && route.stops) {
                            route.stops.forEach(stop => {
                                if (stop.lat && stop.lon) {
                                    const result = isMatch(stop.name, stop.lat, stop.lon);
                                    if (result.match) {
                                        addConnection('amtrak', lineName, stop.name, stop.stop_id, [stop.lat, stop.lon], result.distance, result.nameMatch);
                                    }
                                }
                            });
                        }
                    });
                }
            }
            
            // Remove duplicates (same system + lineName + stationName)
            const seen = new Set();
            return connections.filter(conn => {
                const key = `${conn.system}|${conn.lineName}|${conn.stationName}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }
        
        // Backwards compatibility wrapper
        function findMBTAConnections(station) {
            return findAllConnections(station, 'amtrak');
        }
        
        // Function to load Amtrak stations (visible at all zoom levels)
        function loadAmtrakStations() {
            if (typeof amtrakRoutesData === 'undefined' || !amtrakRoutesData || !amtrakRoutesData.routes) {
                return;
            }
            
            // First pass: Build a map of stop_id -> routes serving that stop
            const stopToRoutes = new Map();
            amtrakLines.forEach(lineName => {
                const route = amtrakRoutesData.routes[lineName];
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
            
            // Build connection mapping for all Amtrak stations (finds connections to ALL other systems)
            stopToRoutes.forEach((stopInfo, stopId) => {
                const connections = findAllConnections(stopInfo.stop, 'amtrak');
                if (connections.length > 0) {
                    amtrakStationConnections.set(stopId, connections);
                }
            });
            
            // Second pass: Create ONE marker per unique stop (not per route)
            // Track which stops have been rendered to avoid duplicates
            const renderedAmtrakStops = new Set();
            
            amtrakLines.forEach(lineName => {
                const route = amtrakRoutesData.routes[lineName];
                const color = route?.color || lineColors[lineName] || '#CAE4F1';
                
                if (!route || !route.stops) {
                    return;
                }
                
                // Add each stop to this route's layer (only if not already rendered)
                route.stops.forEach(stop => {
                    // Skip if already rendered
                    if (stop.lat && stop.lon && !renderedAmtrakStops.has(stop.stop_id)) {
                        renderedAmtrakStops.add(stop.stop_id);
                        
                        const stopInfo = stopToRoutes.get(stop.stop_id);
                        const servingRoutes = stopInfo.routes;
                        const isMultiRoute = servingRoutes.length > 1;
                        const fillColor = isMultiRoute ? '#D3D3D3' : color;
                        
                        const baseRadius = 5;
                        const currentZoom = map.getZoom();
                        const radius = getStopRadius(baseRadius, currentZoom);
                        
                        const routesText = isMultiRoute ? servingRoutes.join(', ') : lineName;
                        
                        // Get connections for this station
                        const connections = amtrakStationConnections.get(stop.stop_id) || [];
                        let connectionsText = '';
                        if (connections.length > 0) {
                            const connectionLines = [...new Set(connections.map(c => c.lineName))];
                            connectionsText = `<br>Connections: ${connectionLines.join(', ')}`;
                        }
                        
                        const tooltipText = isMultiRoute ? 
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Amtrak<br>Lines: ${routesText}${connectionsText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>` :
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Amtrak<br>Line: ${routesText}${connectionsText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>`;
                        
                        const tooltipDirection = stop.lat < 40.76 ? 'bottom' : 'top';
                        
                        const onClickHandler = function(e) {
                            L.DomEvent.stopPropagation(e);
                            const servingRoutes = stopInfo.routes;
                            const alreadyHighlighted = Array.isArray(highlightedAmtrakLine) 
                                ? JSON.stringify(highlightedAmtrakLine.sort()) === JSON.stringify(servingRoutes.sort())
                                : highlightedAmtrakLine === lineName && servingRoutes.length === 1;
                            
                            if (highlightedAmtrakLine && !alreadyHighlighted) {
                                const isCurrentlyDimmed = Array.isArray(highlightedAmtrakLine)
                                    ? !servingRoutes.some(route => highlightedAmtrakLine.includes(route))
                                    : !servingRoutes.includes(highlightedAmtrakLine);
                                
                                if (isCurrentlyDimmed) {
                                    return;
                                }
                            }
                            
                            // Get connections for this station
                            const connections = amtrakStationConnections.get(stop.stop_id) || [];
                            
                            if (alreadyHighlighted) {
                                resetAmtrakHighlight();
                            } else {
                                if (servingRoutes.length > 1) {
                                    highlightMultipleAmtrakLines(servingRoutes, connections);
                                } else {
                                    highlightAmtrakLine(servingRoutes[0], connections);
                                }
                            }
                        };
                        
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
                        
                        if (layers[lineName] && stationMarker) {
                            layers[lineName].addLayer(stationMarker);
                        }
                    }
                });
            });
        }
        
        // Function to load Hartford Line routes
        function loadHartfordLineRoutes(showOnMap = false) {
            if (hartfordLineRoutesLoaded || hartfordLineRoutesLoading) {
                // Already loaded or loading - just show/hide as needed
                if (hartfordLineRoutesLoaded) {
                    hartfordLineLines.forEach(lineName => {
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
            
            // Check if Hartford Line data is available
            if (typeof hartfordLineRoutesData === 'undefined' || !hartfordLineRoutesData || !hartfordLineRoutesData.routes) {
                return;
            }
            
            
            hartfordLineRoutesLoading = true;
            
            // Show loading indicator
            const loadingIndicator = document.getElementById('hartford-line-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'table-row';
            }
            
            // Process routes
            hartfordLineLines.forEach(lineName => {
                const route = hartfordLineRoutesData.routes[lineName];
                if (!route) {
                    return;
                }
                // Use route color from data, fallback to lineColors, then default
                const color = route.color || lineColors[lineName] || '#003366';
                
                // Render route shapes if available
                if (route.shapes && route.shapes.length > 0) {
                    route.shapes.forEach((shape, shapeIndex) => {
                        let coords = shape.coords;
                        
                        if (coords && Array.isArray(coords) && coords.length > 1) {
                            const trackLine = renderRouteTrack(coords, {
                                color: color,
                                weight: 4,
                                opacity: 0.8,
                                pane: 'hartfordLinePane',
                                popupText: `<b>Hartford Line: ${lineName}</b><br>Route ID: ${route.route_id || 'N/A'}`,
                                onClick: function(e) {
                                    L.DomEvent.stopPropagation(e);
                                    
                                    // Toggle highlighting
                                    if (highlightedHartfordLineLine === lineName) {
                                        resetHartfordLineHighlight();
                                    } else {
                                        highlightHartfordLineLine(lineName);
                                    }
                                }
                            });
                            
                            if (trackLine) {
                                layers[lineName].addLayer(trackLine);
                            }
                        } else {
                        }
                    });
                } else {
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
            
            hartfordLineRoutesLoaded = true;
            hartfordLineRoutesLoading = false;
            
            // Load Hartford Line stations after routes
            loadHartfordLineStations();
        }
        
        // Function to load Hartford Line stations (visible at all zoom levels)
        function loadHartfordLineStations() {
            if (typeof hartfordLineRoutesData === 'undefined' || !hartfordLineRoutesData || !hartfordLineRoutesData.routes) {
                return;
            }
            
            // First pass: Build a map of stop_id -> routes serving that stop
            const stopToRoutes = new Map();
            hartfordLineLines.forEach(lineName => {
                const route = hartfordLineRoutesData.routes[lineName];
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
            
            // Second pass: Create ONE marker per unique stop (not per route)
            const renderedHartfordLineStops = new Set();
            
            hartfordLineLines.forEach(lineName => {
                const route = hartfordLineRoutesData.routes[lineName];
                const color = route?.color || lineColors[lineName] || '#003366';
                
                if (!route || !route.stops) {
                    return;
                }
                
                // Add each stop to this route's layer (only if not already rendered)
                route.stops.forEach(stop => {
                    // Skip if already rendered
                    if (stop.lat && stop.lon && !renderedHartfordLineStops.has(stop.stop_id)) {
                        renderedHartfordLineStops.add(stop.stop_id);
                        
                        const stopInfo = stopToRoutes.get(stop.stop_id);
                        const servingRoutes = stopInfo.routes;
                        const isMultiRoute = servingRoutes.length > 1;
                        const fillColor = isMultiRoute ? '#D3D3D3' : color;
                        
                        const baseRadius = 5;
                        const currentZoom = map.getZoom();
                        const radius = getStopRadius(baseRadius, currentZoom);
                        
                        const routesText = isMultiRoute ? servingRoutes.join(', ') : lineName;
                        const tooltipText = isMultiRoute ? 
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Lines: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>` :
                            `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${stop.name}</b><br>Type: Commuter Rail<br>Line: ${routesText}<br>Coordinates: ${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>`;
                        
                        const tooltipDirection = stop.lat < 40.76 ? 'bottom' : 'top';
                        
                        const onClickHandler = function(e) {
                            L.DomEvent.stopPropagation(e);
                            const servingRoutes = stopInfo.routes;
                            const alreadyHighlighted = Array.isArray(highlightedHartfordLineLine) 
                                ? JSON.stringify(highlightedHartfordLineLine.sort()) === JSON.stringify(servingRoutes.sort())
                                : highlightedHartfordLineLine === lineName && servingRoutes.length === 1;
                            
                            if (highlightedHartfordLineLine && !alreadyHighlighted) {
                                const isCurrentlyDimmed = Array.isArray(highlightedHartfordLineLine)
                                    ? !servingRoutes.some(route => highlightedHartfordLineLine.includes(route))
                                    : !servingRoutes.includes(highlightedHartfordLineLine);
                                
                                if (isCurrentlyDimmed) {
                                    return;
                                }
                            }
                            
                            if (alreadyHighlighted) {
                                resetHartfordLineHighlight();
                            } else {
                                if (servingRoutes.length > 1) {
                                    highlightMultipleHartfordLineLines(servingRoutes);
                                } else {
                                    highlightHartfordLineLine(servingRoutes[0]);
                                }
                            }
                        };
                        
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
                        const layerKey = layerKeyForSystem('mta-subway', lineName);
                        if (layers[layerKey]) {
                            if (showOnMap) map.addLayer(layers[layerKey]);
                            else map.removeLayer(layers[layerKey]);
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
                    console.warn(`⚠️ Route ${lineName} not found in mtaSubwayRoutesData.routes`);
                    return;
                }
                const layerKey = layerKeyForSystem('mta-subway', lineName);

                // Use route color from data, fallback to lineColors, then default
                const color = route.color || lineColors[lineName] || '#808183';
                
                // B train: data sometimes has 0 shapes; use D (same trunk) so track is drawn
                let shapesToRender = route.shapes;
                if (lineName === 'B' && (!shapesToRender || shapesToRender.length === 0)) {
                    const fallback = mtaSubwayRoutesData.routes['D'] || mtaSubwayRoutesData.routes['F'] || mtaSubwayRoutesData.routes['M'];
                    if (fallback && fallback.shapes && fallback.shapes.length > 0) {
                        shapesToRender = fallback.shapes;
                    }
                }
                
                // Render route shapes if available
                if (shapesToRender && shapesToRender.length > 0) {
                    shapesToRender.forEach((shape, shapeIndex) => {
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
                            if (layers[layerKey]) {
                                if (trackLine) layers[layerKey].addLayer(trackLine);
                                if (centerLine) layers[layerKey].addLayer(centerLine);
                            }
                        }
                    });
                }

                // Add to map if requested
                if (showOnMap && layers[layerKey]) {
                    layers[layerKey].addTo(map);
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
            // Sync layer visibility to checkboxes (e.g. after init load).
            // Skip restore when any system is highlighted so we don't re-add all markers (e.g. A train) and wipe the user's highlight.
            if (typeof restoreAllLayersAndMarkers === 'function') {
                const anyHighlighted = highlightedLine || highlightedSubwayLine || highlightedLIRRLine ||
                    highlightedMetroNorthLine || highlightedShoreLineEastLine || highlightedAmtrakLine ||
                    highlightedHartfordLineLine || highlightedCombinedStation;
                if (!anyHighlighted) {
                    restoreAllLayersAndMarkers();
                }
            }
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
            
            // Second pass: Create ONE marker per unique stop (not per route)
            const renderedSubwayStops = new Set();
            
            mtaSubwayLines.forEach(lineName => {
                const route = mtaSubwayRoutesData.routes[lineName];
                const color = route.color || lineColors[lineName] || '#808183';
                
                if (!route || !route.stops) {
                    return;
                }
                
                // Add each stop to this route's layer (only if not already rendered)
                route.stops.forEach(stop => {
                    // Skip if already rendered
                    if (stop.lat && stop.lon && !renderedSubwayStops.has(stop.stop_id)) {
                        renderedSubwayStops.add(stop.stop_id);
                        
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
                        const layerKey = layerKeyForSystem('mta-subway', lineName);
                        if (layers[layerKey] && stationMarker) {
                            layers[layerKey].addLayer(stationMarker);
                        }
                    }
                });
            });
        }
        
        // Function to load combined/multi-system stations (gold center markers)
        function loadCombinedStations() {
            if (!combinedStationsData) {
                return;
            }
            
            // Create a layer group for combined stations if it doesn't exist
            if (!layers['combined-stations']) {
                layers['combined-stations'] = L.layerGroup();
            }
            
            Object.entries(combinedStationsData).forEach(([stationName, station]) => {
                if (!station.lat || !station.lon || !station.systems || station.systems.length < 2) {
                    return;
                }
                
                const baseRadius = 5.5; // Slightly bigger than regular stops (5)
                const currentZoom = map.getZoom();
                const radius = getStopRadius(baseRadius, currentZoom);
                
                // Build tooltip showing all systems
                let systemsHtml = station.systems.map(sys => {
                    const routes = sys.routes.slice(0, 3).join(', ');
                    const moreRoutes = sys.routes.length > 3 ? ` (+${sys.routes.length - 3} more)` : '';
                    return `<b>${sys.system}:</b> ${routes}${moreRoutes}`;
                }).join('<br>');
                
                const tooltipText = `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;"><b>${station.name}</b><br><span style="color: #DAA520; font-weight: bold;">Multi-System Station</span><br>${systemsHtml}<br>Coordinates: ${station.lat.toFixed(6)}, ${station.lon.toFixed(6)}</div>`;
                
                const tooltipDirection = station.lat < 41.0 ? 'bottom' : 'top';
                
                // Create marker with gold center, white outline; on top of other stops, fully opaque
                const marker = L.circleMarker([station.lat, station.lon], {
                    radius: radius,
                    fillColor: '#FFD700', // Gold center
                    color: '#fff', // White outline like other stops
                    weight: 1.5,
                    opacity: 1,
                    fillOpacity: 1,
                    pane: 'combinedStationsPane'
                });
                
                marker.bindTooltip(tooltipText, {
                    permanent: false,
                    direction: tooltipDirection,
                    offset: [0, tooltipDirection === 'bottom' ? 10 : -10],
                    className: 'stop-tooltip'
                });
                
                // Store base radius for zoom updates
                marker._baseRadius = baseRadius;
                marker._stationData = station; // Store station data for click handler
                stopMarkersCache.add(marker);
                
                // Click handler to highlight all routes from all systems
                marker.on('click', function(e) {
                    L.DomEvent.stopPropagation(e);
                    
                    const stationData = this._stationData;
                    if (!stationData) return;
                    
                    // Use the unified highlight function for combined stations
                    highlightCombinedStation(stationData);
                });
                
                layers['combined-stations'].addLayer(marker);
            });
            
            // Add combined stations layer to map
            layers['combined-stations'].addTo(map);
        }
        
        // Helper function to check if a station name is in the combined stations list
        function isCombinedStation(stationName) {
            if (!combinedStationsData) return false;
            // Check exact match first
            if (combinedStationsData[stationName]) return true;
            // Check case-insensitive match
            const lowerName = stationName.toLowerCase();
            return Object.keys(combinedStationsData).some(key => key.toLowerCase() === lowerName);
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
                if (isChecked('show-silver-line-paths') && layers[lineName]) {
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
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            highlightedCombinedStation = null;
            
            // Always show highlighted lines (even if checkbox is off); bus uses prefixed layer key
            lineNamesStr.forEach(lineName => {
                const layer = layers[lineName] || layers[layerKeyForSystem('mbta-bus', lineName)];
                if (layer && !map.hasLayer(layer)) map.addLayer(layer);
                if (busStopLayers.size === 0) createBusStopMarkers();
                if (busStopLayers.has(lineName) && !map.hasLayer(busStopLayers.get(lineName))) busStopLayers.get(lineName).addTo(map);
            });
            
            // Remove dimmed layers from map or show highlighted ones - batch operations for performance
            const layersToRemove = [];
            const layersToAdd = [];
            
            // Hide all other tracks: only show highlighted MBTA layers; remove every other system (MTA, LIRR, Metro North, SLE, Amtrak, Hartford)
            Object.keys(layers).forEach(layerKey => {
                const isOtherAgency = layerKey.startsWith('mta-subway-') || lirrLines.includes(layerKey) || metroNorthLines.includes(layerKey) || njTransitLines.includes(layerKey) || septaLines.includes(layerKey) || shoreLineEastLines.includes(layerKey) || amtrakLines.includes(layerKey) || hartfordLineLines.includes(layerKey);
                const isDimmed = isOtherAgency ? true : (layerKey.startsWith('mbta-bus-') ? !lineNamesStr.includes(displayNameFromLayerKey(layerKey)) : !lineNamesStr.includes(layerKey));
                const layer = layers[layerKey];
                const isOnMap = map.hasLayer(layer);
                if (isDimmed && isOnMap) layersToRemove.push(layer);
                else if (!isDimmed && !isOnMap) layersToAdd.push(layer);
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
            
            // Remove all other systems' live markers (layers already removed in loop above)
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) map.removeLayer(marker);
            });
            shoreLineEastMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) map.removeLayer(marker);
            });
            amtrakMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) map.removeLayer(marker);
            });
            hartfordLineMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) map.removeLayer(marker);
            });
        }
        
        // Function to highlight a specific line and dim all others
        function highlightLine(lineName) {
            
            // CRITICAL: Convert lineName to string to ensure consistent key matching
            // JavaScript object keys are always strings, but lineName might be a number
            const lineNameStr = String(lineName);
            highlightedLine = lineNameStr;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            highlightedCombinedStation = null;
            
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
            
            // Remove dimmed layers from map or show highlighted one (hide all other tracks including MTA, LIRR, etc.)
            const highlightedLayerKey = layerKeyForSystem('mbta-bus', lineNameStr);
            Object.keys(layers).forEach(layerKey => {
                const isHighlighted = layerKey === lineNameStr || layerKey === highlightedLayerKey;
                const isDimmed = !isHighlighted;
                if (isDimmed) {
                    if (layers[layerKey] && map.hasLayer(layers[layerKey])) map.removeLayer(layers[layerKey]);
                } else {
                    if (layers[layerKey] && !map.hasLayer(layers[layerKey])) map.addLayer(layers[layerKey]);
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
            
            // Hide all MTA Subway live markers when highlighting MBTA lines
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
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
                if (layers[layerName] && map.hasLayer(layers[layerName])) map.removeLayer(layers[layerName]);
            });
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) map.removeLayer(marker);
            });
            // Hide Shore Line East, Amtrak, Hartford layers and markers
            shoreLineEastLines.forEach(layerName => {
                if (layers[layerName] && map.hasLayer(layers[layerName])) map.removeLayer(layers[layerName]);
            });
            shoreLineEastMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) map.removeLayer(marker);
            });
            amtrakLines.forEach(layerName => {
                if (layers[layerName] && map.hasLayer(layers[layerName])) map.removeLayer(layers[layerName]);
            });
            amtrakMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) map.removeLayer(marker);
            });
            hartfordLineLines.forEach(layerName => {
                if (layers[layerName] && map.hasLayer(layers[layerName])) map.removeLayer(layers[layerName]);
            });
            hartfordLineMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) map.removeLayer(marker);
            });
        }
        
        // Function to reset MBTA highlighting (unified path: clear + restore)
        function resetHighlight() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }
        
        // LIRR Highlighting Functions
        
        // Function to highlight multiple LIRR lines (for multi-line stops)
        function highlightMultipleLIRRLines(lineNames) {
            highlightedLIRRLine = lineNames;
            highlightedLine = null; // Clear MBTA highlighting
            highlightedSubwayLine = null; // Clear subway highlighting
            highlightedNJTransitLine = null;
            highlightedSEPTALine = null;
            
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
            const showingEntireLIRR = lineNames.length === lirrLines.length;
            lirrMarkers.forEach((marker, trainId) => {
                if (!marker) return;
                const hasNoLine = !marker.routeName || marker.routeName === 'LIRR Train' ||
                    (typeof marker.routeName === 'string' && marker.routeName.startsWith('Trip '));
                const isOnHighlightedLine = marker.routeName && lineNames.includes(marker.routeName);
                const showMarker = isOnHighlightedLine || (showingEntireLIRR && hasNoLine);
                if (showMarker) {
                    if (!map.hasLayer(marker)) marker.addTo(map);
                } else {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            
            // Hide all Metro North live markers when highlighting LIRR
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            // Hide all MTA Subway live markers when highlighting LIRR
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide all non-LIRR layers when highlighting LIRR lines
            Object.keys(layers).forEach(layerName => {
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
            highlightedLine = null;
            highlightedSubwayLine = null;
            highlightedMetroNorthLine = null;
            highlightedNJTransitLine = null;
            highlightedSEPTALine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            
            hideEverythingExcept([lineName]);
        }
        
        // Function to reset LIRR highlighting (unified path: clear + restore)
        function resetLIRRHighlight() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }
        
        // Metro North Highlighting Functions
        
        // Function to highlight multiple Metro North lines (for multi-line stops)
        function highlightMultipleMetroNorthLines(lineNames) {
            highlightedMetroNorthLine = lineNames;
            highlightedLine = null; // Clear MBTA highlighting
            highlightedLIRRLine = null; // Clear LIRR highlighting
            highlightedNJTransitLine = null;
            highlightedSEPTALine = null;
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
            highlightedNJTransitLine = null;
            highlightedSEPTALine = null;
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
            
            // Re-evaluate visibility of all markers using centralized function
            updateAllMarkerVisibility();
            
            // Hide all non-Metro North layers when highlighting Metro North lines
            Object.keys(layers).forEach(layerName => {
                if (!metroNorthLines.includes(layerName)) {
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                }
            });
            
            // Remove all LIRR live train markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
        
        // Function to reset Metro North highlighting (unified path: clear + restore)
        function resetMetroNorthHighlight() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }
        
        // NJ Transit Highlighting Functions
        function highlightMultipleNJTransitLines(lineNames) {
            highlightedNJTransitLine = lineNames;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            njTransitLines.forEach(lineName => {
                const isDimmed = !lineNames.includes(lineName);
                if (isDimmed && layers[lineName] && map.hasLayer(layers[lineName])) map.removeLayer(layers[lineName]);
                else if (!isDimmed && layers[lineName] && !map.hasLayer(layers[lineName])) map.addLayer(layers[lineName]);
            });
            // Hide other systems' layers
            Object.keys(layers).forEach(layerName => {
                if (!njTransitLines.includes(layerName) && layers[layerName] && map.hasLayer(layers[layerName])) {
                    map.removeLayer(layers[layerName]);
                }
            });
            // Hide live markers from other systems
            [lirrMarkers, metroNorthMarkers, mtaSubwayMarkers, septaMarkers, shoreLineEastMarkers, amtrakMarkers, hartfordLineMarkers, trainMarkers, busMarkers, shuttleMarkers, silverLineMarkers, ferryMarkers].forEach(markerMap => {
                markerMap.forEach((marker) => {
                    if (marker && map.hasLayer(marker)) map.removeLayer(marker);
                });
            });
            busStopLayers.forEach((layer) => { if (layer && map.hasLayer(layer)) map.removeLayer(layer); });
        }
        
        function highlightNJTransitLine(lineName) {
            highlightedNJTransitLine = lineName;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            hideEverythingExcept([lineName]);
        }
        
        function resetNJTransitHighlight() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }
        
        // SEPTA Highlighting Functions
        function highlightMultipleSEPTALines(lineNames) {
            highlightedSEPTALine = lineNames;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedNJTransitLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            septaLines.forEach(lineName => {
                const isDimmed = !lineNames.includes(lineName);
                if (isDimmed && layers[lineName] && map.hasLayer(layers[lineName])) map.removeLayer(layers[lineName]);
                else if (!isDimmed && layers[lineName] && !map.hasLayer(layers[lineName])) map.addLayer(layers[lineName]);
            });
            Object.keys(layers).forEach(layerName => {
                if (!septaLines.includes(layerName) && layers[layerName] && map.hasLayer(layers[layerName])) {
                    map.removeLayer(layers[layerName]);
                }
            });
            [lirrMarkers, metroNorthMarkers, mtaSubwayMarkers, njTransitMarkers, shoreLineEastMarkers, amtrakMarkers, hartfordLineMarkers, trainMarkers, busMarkers, shuttleMarkers, silverLineMarkers, ferryMarkers].forEach(markerMap => {
                markerMap.forEach((marker) => {
                    if (marker && map.hasLayer(marker)) map.removeLayer(marker);
                });
            });
            busStopLayers.forEach((layer) => { if (layer && map.hasLayer(layer)) map.removeLayer(layer); });
        }
        
        function highlightSEPTALine(lineName) {
            highlightedSEPTALine = lineName;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedNJTransitLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            hideEverythingExcept([lineName]);
        }
        
        function resetSEPTAHighlight() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }

        // Close popup/tooltip before removing a marker so the card doesn't stay visible (e.g. A train when 7 is highlighted)
        function closeMarkerPopupAndTooltip(marker) {
            if (!marker) return;
            if (typeof marker.closePopup === 'function') marker.closePopup();
            if (typeof marker.closeTooltip === 'function') marker.closeTooltip();
        }
        
        // Helper function: Hide everything except the specified lines
        // options.layerKeyPrefix (e.g. 'mta-subway'): linesToShow are display names for that system only
        function hideEverythingExcept(linesToShow, options) {
            const prefix = options && options.layerKeyPrefix;
            Object.keys(layers).forEach(layerKey => {
                const show = prefix
                    ? (layerKey.startsWith(prefix + '-') && linesToShow.includes(displayNameFromLayerKey(layerKey)))
                    : linesToShow.includes(layerKey);
                if (!show) {
                    if (layers[layerKey] && map.hasLayer(layers[layerKey])) map.removeLayer(layers[layerKey]);
                } else {
                    if (layers[layerKey] && !map.hasLayer(layers[layerKey])) map.addLayer(layers[layerKey]);
                }
            });
            
            // Hide all live markers (close popup/tooltip first so "Live A Train" etc. doesn't stay on screen)
            trainMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            busMarkers.forEach((marker, busId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            shuttleMarkers.forEach((marker, shuttleId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            silverLineMarkers.forEach((marker, silverId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            ferryMarkers.forEach((marker, ferryId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            shoreLineEastMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            amtrakMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            hartfordLineMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            njTransitMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            septaMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            
            // Show only live markers for the highlighted lines
            linesToShow.forEach(lineName => {
                // Show Shore Line East markers if this is a Shore Line East line
                if (shoreLineEastLines.includes(lineName)) {
                    const showLive = isChecked('show-shore-line-east-live');
                    if (showLive) {
                        shoreLineEastMarkers.forEach((marker, trainId) => {
                            if (marker && marker.routeName === lineName && !map.hasLayer(marker)) {
                                marker.addTo(map);
                            }
                        });
                    }
                }
                // Show Amtrak markers if this is an Amtrak line
                if (amtrakLines.includes(lineName)) {
                    const showLive = isChecked('show-amtrak-live');
                    if (showLive) {
                        amtrakMarkers.forEach((marker, trainId) => {
                            if (marker && marker.routeName === lineName && !map.hasLayer(marker)) {
                                marker.addTo(map);
                            }
                        });
                    }
                }
                // Show Hartford Line markers if this is a Hartford Line line
                if (hartfordLineLines.includes(lineName)) {
                    const showLive = isChecked('show-hartford-line-live');
                    if (showLive) {
                        hartfordLineMarkers.forEach((marker, trainId) => {
                            if (marker && marker.routeName === lineName && !map.hasLayer(marker)) {
                                marker.addTo(map);
                            }
                        });
                    }
                }
                // Show LIRR markers if this is a LIRR line
                if (lirrLines.includes(lineName)) {
                    const showLive = isChecked('show-lirr-live');
                    if (showLive) {
                        lirrMarkers.forEach((marker, trainId) => {
                            if (marker && marker.routeName === lineName && !map.hasLayer(marker)) {
                                marker.addTo(map);
                            }
                        });
                    }
                }
                // Show Metro North markers if this is a Metro North line
                if (metroNorthLines.includes(lineName)) {
                    const showLive = isChecked('show-metro-north-live');
                    if (showLive) {
                        metroNorthMarkers.forEach((marker, trainId) => {
                            if (marker && marker.routeName === lineName && !map.hasLayer(marker)) {
                                marker.addTo(map);
                            }
                        });
                    }
                }
                // Show NJ Transit markers if this is an NJ Transit line
                if (njTransitLines.includes(lineName)) {
                    const showLive = isChecked('show-nj-transit-live');
                    if (showLive) {
                        njTransitMarkers.forEach((marker, trainId) => {
                            if (marker && marker.routeName === lineName && !map.hasLayer(marker)) {
                                marker.addTo(map);
                            }
                        });
                    }
                }
                // Show SEPTA markers if this is a SEPTA line
                if (septaLines.includes(lineName)) {
                    const showLive = isChecked('show-septa-live');
                    if (showLive) {
                        septaMarkers.forEach((marker, trainId) => {
                            if (marker && marker.routeName === lineName && !map.hasLayer(marker)) {
                                marker.addTo(map);
                            }
                        });
                    }
                }
                // Show MTA Subway markers if this is a MTA Subway line
                if (mtaSubwayLines.includes(lineName)) {
                    const showLive = isChecked('show-mta-subway-live');
                    if (showLive) {
                        let reAdded = 0;
                        const reAddedRoutes = {};
                        mtaSubwayMarkers.forEach((marker, trainId) => {
                            if (marker && marker.routeName === lineName && !map.hasLayer(marker)) {
                                marker.addTo(map);
                                reAdded++;
                                reAddedRoutes[marker.routeName] = (reAddedRoutes[marker.routeName] || 0) + 1;
                            }
                        });
                    }
                }
                // Show MBTA markers if this is an MBTA line
                if (subwayLines.includes(lineName) || commuterLines.includes(lineName) || seasonalLines.includes(lineName)) {
                    let showLive = false;
                    if (subwayLines.includes(lineName)) {
                        showLive = isChecked('show-subway-live');
                    } else if (commuterLines.includes(lineName)) {
                        showLive = isChecked('show-commuter-live');
                    } else if (seasonalLines.includes(lineName)) {
                        showLive = isChecked('show-seasonal-live');
                    }
                    if (showLive) {
                        trainMarkers.forEach((marker, trainId) => {
                            if (marker && marker.routeName === lineName && !map.hasLayer(marker)) {
                                marker.addTo(map);
                            }
                        });
                    }
                }
            });
        }
        
        // Function to highlight multiple Shore Line East lines (for multi-line stops)
        function highlightMultipleShoreLineEastLines(lineNames) {
            highlightedShoreLineEastLine = lineNames;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            
            // Ensure routes are loaded before highlighting
            if (!shoreLineEastRoutesLoaded && !shoreLineEastRoutesLoading) {
                loadShoreLineEastRoutes(true);
            }
            
            hideEverythingExcept(lineNames);
            updateAllMarkerVisibility(); // Update marker visibility immediately
        }
        
        // Function to highlight a specific Shore Line East line
        function highlightShoreLineEastLine(lineName) {
            
            highlightedShoreLineEastLine = lineName;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            
            // Ensure routes are loaded before highlighting
            if (!shoreLineEastRoutesLoaded && !shoreLineEastRoutesLoading) {
                loadShoreLineEastRoutes(true);
            }
            
            hideEverythingExcept([lineName]);
            updateAllMarkerVisibility(); // Update marker visibility immediately
        }
        
        // Single source of truth: should this route layer be visible when no highlight is active?
        // Used by restoreAllLayersAndMarkers so we never depend on a snapshot.
        function shouldShowLayerWhenNoHighlight(layerKey) {
            // Prefixed keys (agency/mode) so same name never conflates bus vs train
            if (layerKey.startsWith('mta-subway-')) return isChecked('show-mta-subway-paths');
            if (layerKey.startsWith('mbta-bus-')) return isChecked('show-bus-paths');
            if (subwayLines.includes(layerKey)) return isChecked('show-subway-paths');
            if (commuterLines.includes(layerKey)) return isChecked('show-commuter-paths');
            if (seasonalLines.includes(layerKey)) return isChecked('show-seasonal-paths');
            if (typeof mbtaShuttleData !== 'undefined' && mbtaShuttleData[layerKey]) return isChecked('show-shuttle-paths');
            if (typeof silverLineData !== 'undefined' && silverLineData[layerKey]) return isChecked('show-silver-line-paths');
            if (typeof mbtaFerryData !== 'undefined' && mbtaFerryData[layerKey]) return isChecked('show-ferry-paths');
            if (lirrLines.includes(layerKey)) return isChecked('show-lirr-paths');
            if (metroNorthLines.includes(layerKey)) return isChecked('show-metro-north-paths');
            if (shoreLineEastLines.includes(layerKey)) return isChecked('show-shore-line-east-paths');
            if (amtrakLines.includes(layerKey)) return isChecked('show-amtrak-paths');
            if (hartfordLineLines.includes(layerKey)) return isChecked('show-hartford-line-paths');
            if (njTransitLines.includes(layerKey)) return isChecked('show-nj-transit-paths');
            if (septaLines.includes(layerKey)) return isChecked('show-septa-paths');
            if (layerKey === 'combined-stations') return true; // Always show when no highlight
            return false;
        }
        
        // Single place to clear all highlight state (used by every unhighlight path)
        function clearAllHighlightState() {
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedNJTransitLine = null;
            highlightedSEPTALine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            highlightedCombinedStation = null;
        }
        
        // Restore map to "no highlight" state using checkboxes only (single source of truth).
        // Never depends on a snapshot, so Escape / same-stop unclick always restores correctly.
        function restoreAllLayersAndMarkers() {
            // Layers: add/remove by checkbox only
            Object.keys(layers).forEach(layerName => {
                const layer = layers[layerName];
                if (!layer) return;
                const shouldShow = shouldShowLayerWhenNoHighlight(layerName);
                if (shouldShow && !map.hasLayer(layer)) {
                    map.addLayer(layer);
                } else if (!shouldShow && map.hasLayer(layer)) {
                    map.removeLayer(layer);
                }
            });
            
            // Bus stop layers: show if bus paths on, zoom sufficient, and route layer is visible
            const busPathsOn = isChecked('show-bus-paths');
            const zoomSufficient = map.getZoom() >= BUS_STOPS_MIN_ZOOM;
            busStopLayers.forEach((layer, layerName) => {
                const busLayerKey = layerKeyForSystem('mbta-bus', layerName);
                const routeLayerVisible = layers[busLayerKey] && map.hasLayer(layers[busLayerKey]);
                const shouldShow = busPathsOn && zoomSufficient && routeLayerVisible;
                if (shouldShow && !map.hasLayer(layer)) {
                    layer.addTo(map);
                } else if (!shouldShow && map.hasLayer(layer)) {
                    map.removeLayer(layer);
                }
            });
            
            // Restore all markers based on checkboxes
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    let shouldShow = false;
                    if (subwayLines.includes(marker.routeName)) {
                        shouldShow = isChecked('show-subway-live');
                    } else if (commuterLines.includes(marker.routeName)) {
                        shouldShow = isChecked('show-commuter-live');
                    } else if (seasonalLines.includes(marker.routeName)) {
                        shouldShow = isChecked('show-seasonal-live');
                    }
                    if (shouldShow && !map.hasLayer(marker)) {
                        marker.addTo(map);
                    } else if (!shouldShow && map.hasLayer(marker)) {
                        map.removeLayer(marker);
                    }
                }
            });
            
            busMarkers.forEach((marker, busId) => {
                const shouldShow = isChecked('show-bus-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            shuttleMarkers.forEach((marker, shuttleId) => {
                const shouldShow = isChecked('show-shuttle-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            silverLineMarkers.forEach((marker, silverId) => {
                const shouldShow = isChecked('show-silver-line-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            ferryMarkers.forEach((marker, ferryId) => {
                const shouldShow = isChecked('show-ferry-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            lirrMarkers.forEach((marker, trainId) => {
                const shouldShow = isChecked('show-lirr-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            metroNorthMarkers.forEach((marker, trainId) => {
                const shouldShow = isChecked('show-metro-north-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            mtaSubwayMarkers.forEach((marker, trainId) => {
                const shouldShow = shouldShowMarker('subway', marker.routeName, 'show-mta-subway-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    closeMarkerPopupAndTooltip(marker);
                    map.removeLayer(marker);
                }
            });
            
            shoreLineEastMarkers.forEach((marker, trainId) => {
                const shouldShow = isChecked('show-shore-line-east-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            amtrakMarkers.forEach((marker, trainId) => {
                const shouldShow = isChecked('show-amtrak-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            hartfordLineMarkers.forEach((marker, trainId) => {
                const shouldShow = isChecked('show-hartford-line-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            njTransitMarkers.forEach((marker, trainId) => {
                const shouldShow = isChecked('show-nj-transit-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            septaMarkers.forEach((marker, trainId) => {
                const shouldShow = isChecked('show-septa-live');
                if (shouldShow && marker && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Restore all combined station markers to full opacity
            if (layers['combined-stations']) {
                layers['combined-stations'].eachLayer(marker => {
                    marker.setStyle({ opacity: 1, fillOpacity: 1 });
                });
            }
        }
        
        // Function to reset Shore Line East highlighting (unified path: clear + restore)
        function resetShoreLineEastHighlight() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }
        
        // Function to get ALL connecting lines from connections array (all systems)
        function getConnectingLines(connections) {
            if (!connections || connections.length === 0) return [];
            
            const allLines = [];
            connections.forEach(conn => {
                if (!allLines.includes(conn.lineName)) {
                    allLines.push(conn.lineName);
                }
            });
            return allLines;
        }
        
        // Backwards compatibility - MBTA only
        function getConnectingMBTALines(connections) {
            if (!connections || connections.length === 0) return [];
            
            const mbtaLines = [];
            connections.forEach(conn => {
                if (conn.system === 'mbta_subway' || conn.system === 'mbta_commuter' || 
                    conn.system === 'subway' || conn.system === 'commuter_rail') {
                    if (!mbtaLines.includes(conn.lineName)) {
                        mbtaLines.push(conn.lineName);
                    }
                }
            });
            return mbtaLines;
        }
        
        // Function to highlight connecting MBTA lines/stations
        function highlightConnectingMBTALines(connections) {
            if (!connections || connections.length === 0) return [];
            
            // Get connecting MBTA lines
            const mbtaLines = getConnectingMBTALines(connections);
            if (mbtaLines.length > 0) {
                // Set highlightedLine so updateAllMarkerVisibility knows to show these MBTA lines
                if (mbtaLines.length === 1) {
                    highlightedLine = mbtaLines[0];
                } else {
                    highlightedLine = mbtaLines;
                }
                // Show the highlighted MBTA lines
                mbtaLines.forEach(lineName => {
                    if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                        map.addLayer(layers[lineName]);
                    }
                });
            }
            return mbtaLines;
        }
        
        // Function to highlight multiple Amtrak lines (for multi-line stops)
        function highlightMultipleAmtrakLines(lineNames, connections = []) {
            highlightedAmtrakLine = lineNames;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            highlightedHartfordLineLine = null;
            
            // Ensure Amtrak routes are loaded before highlighting
            if (!amtrakRoutesLoaded && !amtrakRoutesLoading) {
                loadAmtrakRoutes(true);
            } else if (amtrakRoutesLoaded) {
                // Make sure all Amtrak lines are shown
                lineNames.forEach(lineName => {
                    if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                        map.addLayer(layers[lineName]);
                    }
                });
            }
            
            // Get ALL connecting lines (from all systems)
            const connectingLines = getConnectingLines(connections);
            const connectingMBTALines = getConnectingMBTALines(connections);
            
            // Hide everything except Amtrak lines AND all connecting lines
            const allLinesToShow = [...lineNames, ...connectingLines];
            hideEverythingExcept(allLinesToShow);
            
            // Set highlightedLine for connecting MBTA lines (for marker visibility)
            if (connectingMBTALines.length > 0) {
                if (connectingMBTALines.length === 1) {
                    highlightedLine = connectingMBTALines[0];
                } else {
                    highlightedLine = connectingMBTALines;
                }
            } else {
                highlightedLine = null;
            }
            
            updateAllMarkerVisibility(); // Update marker visibility immediately
        }
        
        // Function to highlight a specific Amtrak line
        function highlightAmtrakLine(lineName, connections = []) {
            highlightedAmtrakLine = lineName;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            highlightedHartfordLineLine = null;
            
            // CRITICAL: Ensure Amtrak routes are loaded and shown
            if (!amtrakRoutesLoaded && !amtrakRoutesLoading) {
                loadAmtrakRoutes(true);
                // Wait a bit for routes to load, then continue
                setTimeout(() => {
                    highlightAmtrakLine(lineName, connections);
                }, 100);
                return;
            }
            
            // Get ALL connecting lines (from all systems)
            const connectingLines = getConnectingLines(connections);
            const connectingMBTALines = getConnectingMBTALines(connections);
            
            // Build list of all lines to show: Amtrak line(s) + all connecting lines
            const allLinesToShow = [lineName, ...connectingLines];
            hideEverythingExcept(allLinesToShow);
            
            // Make sure the Amtrak line layer is on the map
            if (layers[lineName]) {
                if (!map.hasLayer(layers[lineName])) map.addLayer(layers[lineName]);
            }
            
            // Set highlightedLine for connecting MBTA lines (for marker visibility)
            if (connectingMBTALines.length > 0) {
                if (connectingMBTALines.length === 1) {
                    highlightedLine = connectingMBTALines[0];
                } else {
                    highlightedLine = connectingMBTALines;
                }
            } else {
                highlightedLine = null;
            }
            
            updateAllMarkerVisibility();
        }
        
        // Function to reset Amtrak highlighting (unified path: clear + restore)
        function resetAmtrakHighlight() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }
        
        // Function to highlight multiple Hartford Line lines (for multi-line stops)
        function highlightMultipleHartfordLineLines(lineNames) {
            highlightedHartfordLineLine = lineNames;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            
            lineNames.forEach(lineName => {
                if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                    map.addLayer(layers[lineName]);
                }
            });
            
            hartfordLineLines.forEach(layerName => {
                if (!lineNames.includes(layerName)) {
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                }
            });
            
            Object.keys(layers).forEach(layerName => {
                if (!lineNames.includes(layerName) && !hartfordLineLines.includes(layerName)) {
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                }
            });
            
            // Hide all live train markers from other systems
            // Hide LIRR markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide Metro North markers
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide MTA Subway markers
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide Shore Line East markers
            shoreLineEastMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide MBTA live vehicle markers
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
            
            updateAllMarkerVisibility(); // Update marker visibility immediately to prevent refresh issues
        }
        
        // Function to highlight a specific Hartford Line line
        function highlightHartfordLineLine(lineName) {
            
            highlightedHartfordLineLine = lineName;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedSubwayLine = null;
            highlightedShoreLineEastLine = null;
            
            if (layers[lineName] && !map.hasLayer(layers[lineName])) {
                map.addLayer(layers[lineName]);
            }
            
            hartfordLineLines.forEach(layerName => {
                if (layerName !== lineName) {
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                }
            });
            
            Object.keys(layers).forEach(layerName => {
                if (layerName !== lineName && !hartfordLineLines.includes(layerName)) {
                    if (layers[layerName] && map.hasLayer(layers[layerName])) {
                        map.removeLayer(layers[layerName]);
                    }
                }
            });
            
            // Hide all live train markers from other systems
            // Hide LIRR markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide Metro North markers
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide MTA Subway markers
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide Shore Line East markers
            shoreLineEastMarkers.forEach((marker, trainId) => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            
            // Hide MBTA live vehicle markers
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
            
            updateAllMarkerVisibility(); // Update marker visibility immediately to prevent refresh issues
        }
        
        // Function to reset Hartford Line highlighting (unified path: clear + restore)
        function resetHartfordLineHighlight() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }
        
        // Function to highlight multiple subway lines (for multi-line stations)
        function highlightMultipleSubwayLines(lineNames) {
            highlightedSubwayLine = lineNames;
            highlightedLine = null; // Clear MBTA highlighting
            highlightedLIRRLine = null; // Clear LIRR highlighting
            highlightedMetroNorthLine = null; // Clear Metro North highlighting
            highlightedShoreLineEastLine = null; // Clear Shore Line East highlighting
            highlightedAmtrakLine = null; // Clear Amtrak highlighting
            highlightedHartfordLineLine = null; // Clear Hartford Line highlighting
            
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
            
            // Hide all non–MTA-subway layers when highlighting subway
            Object.keys(layers).forEach(layerKey => {
                if (!layerKey.startsWith('mta-subway-')) {
                    if (layers[layerKey] && map.hasLayer(layers[layerKey])) map.removeLayer(layers[layerKey]);
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
            
            // Hide MTA subway trains that don't match the highlighted lines
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker) {
                    // Extract route ID from trainId (format: "routeId_tripId")
                    const routeId = trainId.split('_')[0];
                    if (!lineNames.includes(routeId)) {
                        // Hide trains from other routes
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                        }
                    } else {
                        // Show trains from the highlighted routes
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    }
                }
            });
        }
        
        // Function to highlight a specific subway line and dim all others
        // Function to highlight a specific subway line and dim all others (REBUILT FROM SCRATCH - FOLLOWING LIRR PATTERN)
        function highlightSubwayLine(lineName) {
            highlightedSubwayLine = lineName;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            
            // Ensure subway routes are loaded before highlighting
            if (!subwayRoutesLoaded && !subwayRoutesLoading) {
                loadMTASubwayRoutes(true);
            }
            
            hideEverythingExcept([lineName], { layerKeyPrefix: 'mta-subway' });
            
            // Remove dimmed layers from map or show highlighted one (use prefixed layer keys)
            mtaSubwayLines.forEach(displayName => {
                const layerKey = layerKeyForSystem('mta-subway', displayName);
                const isDimmed = displayName !== lineName;
                if (isDimmed) {
                    if (layers[layerKey] && map.hasLayer(layers[layerKey])) map.removeLayer(layers[layerKey]);
                } else {
                    if (layers[layerKey]) {
                        const hasContent = layers[layerKey].getLayers().length > 0;
                        if (hasContent && !map.hasLayer(layers[layerKey])) map.addLayer(layers[layerKey]);
                    }
                }
            });
            
            // Hide all non–MTA-subway layers when highlighting subway
            Object.keys(layers).forEach(layerKey => {
                if (!layerKey.startsWith('mta-subway-')) {
                    if (layers[layerKey] && map.hasLayer(layers[layerKey])) map.removeLayer(layers[layerKey]);
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
            
            // Hide MTA subway trains that don't match the highlighted line
            let removedCount = 0;
            let shownCount = 0;
            const routeIdsOnMap = [];
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker) {
                    // Extract route ID from trainId (format: "routeId_tripId")
                    const routeId = trainId.split('_')[0];
                    if (routeId !== lineName) {
                        // Hide trains from other routes
                        if (map.hasLayer(marker)) {
                            map.removeLayer(marker);
                            removedCount++;
                        }
                    } else {
                        // Show trains from the highlighted route
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                        if (map.hasLayer(marker)) shownCount++;
                    }
                    if (map.hasLayer(marker)) routeIdsOnMap.push(routeId);
                }
            });
        }
        
        // Function to highlight multiple subway lines (for multi-line stations)
        function highlightMultipleSubwayLines(lineNames) {
            highlightedSubwayLine = lineNames;
            highlightedLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedShoreLineEastLine = null;
            highlightedAmtrakLine = null;
            highlightedHartfordLineLine = null;
            
            hideEverythingExcept(lineNames, { layerKeyPrefix: 'mta-subway' });
        }
        
        // Function to reset subway highlighting (unified path: clear + restore)
        function resetSubwayHighlight() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }

        // Unified highlight function for multi-system stations
        function highlightCombinedStation(station) {
            
            // Toggle off if same station clicked again
            if (highlightedCombinedStation === station.name) {
                resetAllHighlights();
                return;
            }
            
            // Reset all existing highlights first (but preserve saved state)
            highlightedLine = null;
            highlightedAmtrakLine = null;
            highlightedLIRRLine = null;
            highlightedMetroNorthLine = null;
            highlightedShoreLineEastLine = null;
            highlightedHartfordLineLine = null;
            highlightedSubwayLine = null;
            highlightedCombinedStation = null;
            
            highlightedCombinedStation = station.name;
            
            // Collect all routes to highlight
            const routesToHighlight = new Set();
            station.systems.forEach(sys => {
                if (sys.routes) {
                    sys.routes.forEach(route => routesToHighlight.add(route));
                }
            });
            
            // Remove non-highlighted layers, show highlighted ones (matching other highlight functions)
            Object.keys(layers).forEach(layerName => {
                const layer = layers[layerName];
                if (!layer) return;
                
                if (routesToHighlight.has(layerName)) {
                    // Show highlighted routes
                    if (!map.hasLayer(layer)) {
                        map.addLayer(layer);
                    }
                } else if (layerName === 'combined-stations') {
                    // Hide other combined stations, keep only the selected one
                    layer.eachLayer(marker => {
                        if (marker._stationData && marker._stationData.name !== station.name) {
                            marker.setStyle({ opacity: 0, fillOpacity: 0 });
                        } else {
                            marker.setStyle({ opacity: 1, fillOpacity: 1 });
                        }
                    });
                } else {
                    // Remove non-highlighted routes from map
                    if (map.hasLayer(layer)) {
                        map.removeLayer(layer);
                    }
                }
            });
            
            // Selectively remove live markers - keep ones for highlighted routes
            trainMarkers.forEach((marker, id) => {
                if (marker && marker.routeName && !routesToHighlight.has(String(marker.routeName))) {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            busMarkers.forEach((marker, id) => {
                if (marker && marker.routeName && !routesToHighlight.has(String(marker.routeName))) {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            shuttleMarkers.forEach((marker, id) => {
                if (marker && marker.routeName && !routesToHighlight.has(String(marker.routeName))) {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            silverLineMarkers.forEach((marker, id) => {
                if (marker && marker.routeName && !routesToHighlight.has(String(marker.routeName))) {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            ferryMarkers.forEach((marker, id) => {
                if (marker && marker.routeName && !routesToHighlight.has(String(marker.routeName))) {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            lirrMarkers.forEach((marker, id) => {
                if (marker && marker.routeName && !routesToHighlight.has(String(marker.routeName))) {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            metroNorthMarkers.forEach((marker, id) => {
                if (marker && marker.routeName && !routesToHighlight.has(String(marker.routeName))) {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            mtaSubwayMarkers.forEach((marker, id) => {
                if (marker && marker.routeName && !routesToHighlight.has(String(marker.routeName))) {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
        }
        
        // Reset all highlights from all systems (single path: clear + restore)
        function resetAllHighlights() {
            clearAllHighlightState();
            restoreAllLayersAndMarkers();
        }
        
        // Add keyboard event listener for Escape key to reset highlighting
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' || event.key === 'Esc') {
                resetAllHighlights();
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
        
        // Lines section toggle functionality - made global for onclick handlers
        window.toggleLinesSection = function(tabName) {
            const sectionId = tabName ? `${tabName}-lines-section` : 'lines-section';
            const linesSection = document.getElementById(sectionId);
            const toggle = event?.target || document.querySelector(`#${tabName || 'mbta'}-tab .lines-toggle`);
            
            if (!linesSection) return;
            
            if (linesSection.classList.contains('collapsed')) {
                // Show lines section
                linesSection.classList.remove('collapsed');
                if (toggle) {
                    toggle.textContent = '−';
                    toggle.classList.remove('collapsed');
                }
            } else {
                // Hide lines section
                linesSection.classList.add('collapsed');
                if (toggle) {
                    toggle.textContent = '+';
                    toggle.classList.add('collapsed');
                }
            }
        };
        
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
                    if ((commuterLines.includes(routeName) || (routeId && routeId.startsWith('CR-'))) && isChecked('show-commuter-live')) {
                        shouldShow = true;
                    } else if (seasonalLines.includes(routeName) && isChecked('show-seasonal-live')) {
                        shouldShow = true;
                    } else if (subwayLines.includes(routeName) && isChecked('show-subway-live')) {
                        shouldShow = true;
                    }
                    
                    // Check if we should add to map (considering both checkbox and highlight state)
                    if (shouldShow) {
                        // Don't show MBTA trains if other systems are highlighted (including CTrail)
                        if (isAnyOtherSystemHighlighted()) {
                            // Other systems are highlighted, hide all MBTA trains
                            // (don't add to map)
                        } else if (isMBTALineHighlighted()) {
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
                        if (isChecked('show-shuttle-live')) {
                            // Don't show MBTA shuttles if other systems are highlighted (including CTrail)
                            if (isAnyOtherSystemHighlighted()) {
                                // Other systems are highlighted, hide all MBTA shuttles
                                // (don't add to map)
                            } else if (isMBTALineHighlighted()) {
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
                        if (isChecked('show-silver-line-live')) {
                            // Don't show MBTA Silver Line if other systems are highlighted (including CTrail)
                            if (isAnyOtherSystemHighlighted()) {
                                // Other systems are highlighted, hide all MBTA Silver Line vehicles
                                // (don't add to map)
                            } else if (isMBTALineHighlighted()) {
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
                        if (isChecked('show-bus-live')) {
                            // Don't show MBTA buses if other systems are highlighted (including CTrail)
                            if (isAnyOtherSystemHighlighted()) {
                                // Other systems are highlighted, hide all MBTA buses
                                // (don't add to map)
                            } else if (isMBTALineHighlighted()) {
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
                    
                    // Add to map and store reference (only if ferry checkbox is checked and no other system is highlighted)
                    if (isChecked('show-ferry-live') && 
                        !isMBTALineHighlighted() && !isAnyOtherSystemHighlighted()) {
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
            const hasSubway = isChecked('show-subway-live');
            const hasCommuter = isChecked('show-commuter-live');
            const hasSeasonal = isChecked('show-seasonal-live');
            const hasBus = isChecked('show-bus-live');
            const hasShuttle = isChecked('show-shuttle-live');
            const hasSilver = isChecked('show-silver-line-live');
            const hasFerry = isChecked('show-ferry-live');
            
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
                            // Always store the marker
                            metroNorthMarkers.set(trainId, trainMarker);
                            
                            // Use centralized visibility function
                            const shouldShow = shouldShowMarker('metroNorth', routeName, 'show-metro-north-live');
                            
                            // Apply visibility
                            if (shouldShow) {
                                if (!map.hasLayer(trainMarker)) {
                                    trainMarker.addTo(map);
                                }
                            } else {
                                if (map.hasLayer(trainMarker)) {
                                    map.removeLayer(trainMarker);
                            }
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
        
        // Function to fetch live MTA Subway trains from GTFS-RT API
        async function fetchMtaSubwayTrains() {
            // MTA Subway GTFS-RT feed URLs (no API key needed!)
            // Note: MTA has separate feeds for different line groups
            // Note: Subway feeds use TripUpdate entities, not VehiclePosition (no lat/lon)
            const MTA_SUBWAY_GTFS_RT_URLS = [
                'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',      // 1, 2, 3, 4, 5, 6, 7, S
                'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',  // A, C, E
                'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm', // B, D, F, M
                'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',     // G
                'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',   // J, Z
                'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw', // N, Q, R, W
                'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l'     // L
            ];
            
            try {
                // Check if route data is loaded
                if (typeof mtaSubwayRoutesData === 'undefined' || !mtaSubwayRoutesData || !mtaSubwayRoutesData.routes) {
                    console.warn('⚠️ MTA Subway routes data not loaded yet. Waiting for data file...');
                    return;
                }
                
                const now = Date.now();
                
                // Rate limiting - don't update more than once every 5 seconds
                if (now - lastMtaSubwayUpdateTime < 5000) {
                    return;
                }
                
                lastMtaSubwayUpdateTime = now;
                
                // Load GTFS-RT proto definition (once, reused for all feeds)
                // Cache the protobuf root to avoid reloading
                if (!window.mtaSubwayProtobufRoot) {
                    try {
                        // Try to determine the correct path for the proto file
                        // On GitHub Pages, if repo is not username.github.io, base path includes repo name
                        let protoPath = './gtfs-realtime.proto';
                        const pathname = window.location.pathname;
                        // If pathname is like /reponame/ or /reponame/index.html, use that base
                        if (pathname !== '/' && pathname !== '/index.html') {
                            const pathParts = pathname.split('/').filter(p => p);
                            if (pathParts.length > 0 && pathParts[pathParts.length - 1] === 'index.html') {
                                pathParts.pop(); // Remove index.html
                            }
                            if (pathParts.length > 0) {
                                protoPath = '/' + pathParts.join('/') + '/gtfs-realtime.proto';
                            }
                        }
                        window.mtaSubwayProtobufRoot = await protobuf.load(protoPath);
                    } catch (error) {
                        console.error('❌ Error loading GTFS-RT proto file:', error);
                        console.error('Current pathname:', window.location.pathname);
                        console.error('Make sure gtfs-realtime.proto is accessible in the repository root');
                        throw error; // Re-throw to be caught by outer try-catch
                    }
                }
                const root = window.mtaSubwayProtobufRoot;
                const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
                
                // Fetch from all MTA subway feeds in parallel for better performance
                const feedPromises = MTA_SUBWAY_GTFS_RT_URLS.map(async (url) => {
                    try {
                        const response = await fetch(url);
                        if (!response.ok) {
                            console.warn(`⚠️ MTA Subway feed returned ${response.status}: ${url}`);
                            return [];
                        }
                        const buffer = await response.arrayBuffer();
                        const feed = FeedMessage.decode(new Uint8Array(buffer));
                        return feed.entity.filter(e => e.tripUpdate).map(e => e.tripUpdate);
                    } catch (error) {
                        console.error(`❌ Error fetching MTA Subway feed ${url}:`, error);
                        return []; // Return empty array on error, continue with other feeds
                    }
                });
                
                // Wait for all feeds to complete
                const feedResults = await Promise.all(feedPromises);
                const allTripUpdates = feedResults.flat();
                
                const tripUpdates = allTripUpdates;
                
                // Group trips by route
                // Note: MTA subway route_id might be in trip or we might need to match via tripToRoute
                const tripsByRoute = new Map();
                
                if (tripUpdates.length === 0) {
                    console.warn('⚠️ No MTA Subway trip updates received from any feed. This may be normal if no trains are running.');
                    return;
                }
                
                // Create reverse lookup map for faster trip matching (route pattern -> route)
                // This avoids O(n) searches through tripToRoute for each trip
                const routePatternToRoute = new Map();
                if (mtaSubwayRoutesData?.tripToRoute) {
                    for (const [staticTripId, staticRoute] of Object.entries(mtaSubwayRoutesData.tripToRoute)) {
                        const parts = staticTripId.split('_');
                        if (parts.length > 0) {
                            const routePattern = parts[parts.length - 1];
                            if (!routePatternToRoute.has(routePattern)) {
                                routePatternToRoute.set(routePattern, staticRoute);
                            }
                        }
                    }
                }
                
                tripUpdates.forEach(tripUpdate => {
                    const routeId = tripUpdate.trip?.routeId || tripUpdate.trip?.route_id;
                    const tripId = tripUpdate.trip?.tripId || tripUpdate.trip?.trip_id;
                    let matchedRoute = null;
                    
                    // PRIMARY METHOD: Use tripToRoute mapping (most reliable for letter routes)
                    // Letter routes often don't have route_id in GTFS-RT, so we must use trip_id mapping
                    if (tripId && mtaSubwayRoutesData?.tripToRoute) {
                        // Try exact match first
                        const mappedRoute = mtaSubwayRoutesData.tripToRoute[tripId];
                        if (mappedRoute && mtaSubwayRoutesData.routes?.[mappedRoute]) {
                            matchedRoute = mappedRoute;
                        } else {
                            // Fast lookup using route pattern map
                            const normalizedTripId = tripId.trim();
                            const rtParts = normalizedTripId.split('_');
                            const rtRoutePattern = rtParts.length > 0 ? rtParts[rtParts.length - 1] : normalizedTripId;
                            
                            // Try route pattern lookup first (O(1) instead of O(n))
                            if (routePatternToRoute.has(rtRoutePattern)) {
                                const routeFromPattern = routePatternToRoute.get(rtRoutePattern);
                                if (mtaSubwayRoutesData.routes?.[routeFromPattern]) {
                                    matchedRoute = routeFromPattern;
                                }
                            }
                            
                            // Fallback: check if any static trip ID ends with GTFS-RT trip ID
                            if (!matchedRoute) {
                                for (const [staticTripId, staticRoute] of Object.entries(mtaSubwayRoutesData.tripToRoute)) {
                                    if (staticTripId.endsWith(normalizedTripId) && mtaSubwayRoutesData.routes?.[staticRoute]) {
                                        matchedRoute = staticRoute;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    // FALLBACK: Try direct route_id match (works for numeric routes)
                    if (!matchedRoute && routeId) {
                        // Check if this route exists in our data
                        if (mtaSubwayRoutesData && mtaSubwayRoutesData.routes && mtaSubwayRoutesData.routes[routeId]) {
                            matchedRoute = routeId;
                        }
                    }
                    
                    if (matchedRoute) {
                        if (!tripsByRoute.has(matchedRoute)) {
                            tripsByRoute.set(matchedRoute, []);
                        }
                        tripsByRoute.get(matchedRoute).push(tripUpdate);
                    }
                });
                
                // Update markers for all routes
                updateMtaSubwayMarkers(tripsByRoute);
                
            } catch (error) {
                console.error('❌ Error fetching MTA Subway trains:', error);
                console.error('Error details:', error.message);
            }
        }
        
        // ============================================================================
        // CENTRALIZED HIGHLIGHT CHECK FUNCTIONS
        // ============================================================================
        // These functions centralize all highlight state checks to prevent bugs
        // when new systems are added. Use these instead of duplicating checks!
        
        // Check if any CTrail system is highlighted
        function isCTrailHighlighted() {
            return !!(highlightedShoreLineEastLine || highlightedAmtrakLine || highlightedHartfordLineLine);
        }
        
        // Check if any MTA system (LIRR, Metro North, MTA Subway) is highlighted
        function isMTAHighlighted() {
            return !!(highlightedLIRRLine || highlightedMetroNorthLine || highlightedSubwayLine);
        }
        
        // Check if any other transit system is highlighted (excluding MBTA)
        function isAnyOtherSystemHighlighted() {
            return isCTrailHighlighted() || isMTAHighlighted() || !!highlightedNJTransitLine || !!highlightedSEPTALine;
        }
        
        // Check if MBTA line is highlighted
        function isMBTALineHighlighted() {
            return !!highlightedLine;
        }
        
        // ============================================================================
        // END CENTRALIZED HIGHLIGHT CHECK FUNCTIONS
        // ============================================================================
        
        // Centralized function to determine if a marker should be visible
        // This ensures consistent visibility logic across all transit systems
        function shouldShowMarker(markerType, routeId, checkboxId) {
            // Check if checkbox is checked
            const checkbox = document.getElementById(checkboxId);
            if (!checkbox || !checkbox.checked) {
                return false;
            }
            
            // Map marker types to their highlight state variables
            const highlightMap = {
                'mbta': highlightedLine,
                'subway': highlightedSubwayLine,
                'lirr': highlightedLIRRLine,
                'metroNorth': highlightedMetroNorthLine,
                'njTransit': highlightedNJTransitLine,
                'septa': highlightedSEPTALine,
                'shoreLineEast': highlightedShoreLineEastLine,
                'amtrak': highlightedAmtrakLine,
                'hartfordLine': highlightedHartfordLineLine
            };

            // Check if ANY system is highlighted
            const anyHighlighted = highlightedLine || highlightedSubwayLine || highlightedLIRRLine ||
                                   highlightedMetroNorthLine || highlightedNJTransitLine || highlightedSEPTALine ||
                                   highlightedShoreLineEastLine || highlightedAmtrakLine ||
                                   highlightedHartfordLineLine || highlightedCombinedStation;
            
            if (!anyHighlighted) {
                // Nothing highlighted - show based on checkbox (already checked above)
                return true;
            }
            
            // Something is highlighted - check if THIS marker's system is the one highlighted
            const thisSystemHighlight = highlightMap[markerType];
            
            if (!thisSystemHighlight) {
                // This marker's system is NOT highlighted, but something else is - hide it
                return false;
            }
            
            // This marker's system IS highlighted
            // If the marker has no assigned route we cannot match it to a specific line - hide it when something is highlighted.
            // (Unassigned only makes sense for systems where "whole agency" highlight exists; subway is always line-specific.)
            if (!routeId || routeId === '' || routeId === 'undefined' || routeId === 'null') {
                return false; // Hide when we can't verify route (avoids showing e.g. A train when 1 train is highlighted)
            }
            
            // Check if this specific route matches
            const routeIdStr = String(routeId);
            
            // Handle route variants for subway (e.g., "7x", "7d" should match "7")
            if (markerType === 'subway') {
                const baseRouteId = routeIdStr.replace(/[a-z]$/i, '');
                const isExactMatch = thisSystemHighlight === routeIdStr || 
                                    (Array.isArray(thisSystemHighlight) && thisSystemHighlight.includes(routeIdStr));
                const isBaseMatch = baseRouteId !== routeIdStr && baseRouteId.length > 0 &&
                                   (thisSystemHighlight === baseRouteId ||
                                    (Array.isArray(thisSystemHighlight) && thisSystemHighlight.includes(baseRouteId)));
                return isExactMatch || isBaseMatch;
            }
            
            // Standard route matching for all other systems
            return thisSystemHighlight === routeIdStr || 
                   (Array.isArray(thisSystemHighlight) && thisSystemHighlight.includes(routeIdStr));
        }
        
        // Helper function to re-evaluate visibility of all markers when highlighting changes
        function updateAllMarkerVisibility() {
            // Update subway markers
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker) {
                    // CRITICAL: If marker doesn't have routeName, hide it (shouldn't happen, but safety check)
                    if (!marker.routeName) {
                        if (map.hasLayer(marker)) {
                            closeMarkerPopupAndTooltip(marker);
                            map.removeLayer(marker);
                        }
                        return;
                    }
                    
                    // Normalize routeId for comparison (handle variants like "7x", "7d" -> "7")
                    let routeId = marker.routeName;
                    // If routeId ends with a letter (variant), try base route for matching
                    const baseRouteId = routeId.replace(/[a-z]$/i, '');
                    
                    const shouldShow = shouldShowMarker('subway', routeId, 'show-mta-subway-live');
                    
                    // Also check if base route matches (for variants)
                    let shouldShowBase = false;
                    if (baseRouteId !== routeId && baseRouteId.length > 0) {
                        shouldShowBase = shouldShowMarker('subway', baseRouteId, 'show-mta-subway-live');
                    }
                    
                    if (shouldShow || shouldShowBase) {
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    } else {
                        if (map.hasLayer(marker)) {
                            closeMarkerPopupAndTooltip(marker);
                            map.removeLayer(marker);
                        }
                    }
                }
            });
            
            // Update LIRR markers
            lirrMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    const shouldShow = shouldShowMarker('lirr', marker.routeName, 'show-lirr-live');
                    if (shouldShow) {
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    } else {
                        if (map.hasLayer(marker)) {
                            closeMarkerPopupAndTooltip(marker);
                            map.removeLayer(marker);
                        }
                    }
                }
            });
            
            // Update Metro North markers
            metroNorthMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    const shouldShow = shouldShowMarker('metroNorth', marker.routeName, 'show-metro-north-live');
                    if (shouldShow) {
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    } else {
                        if (map.hasLayer(marker)) {
                            closeMarkerPopupAndTooltip(marker);
                            map.removeLayer(marker);
                        }
                    }
                }
            });
            
            // Update NJ Transit markers
            njTransitMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    const shouldShow = shouldShowMarker('njTransit', marker.routeName, 'show-nj-transit-live');
                    if (shouldShow) {
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    } else {
                        if (map.hasLayer(marker)) {
                            closeMarkerPopupAndTooltip(marker);
                            map.removeLayer(marker);
                        }
                    }
                }
            });
            
            // Update SEPTA markers
            septaMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    const shouldShow = shouldShowMarker('septa', marker.routeName, 'show-septa-live');
                    if (shouldShow) {
                        if (!map.hasLayer(marker)) {
                            marker.addTo(map);
                        }
                    } else {
                        if (map.hasLayer(marker)) {
                            closeMarkerPopupAndTooltip(marker);
                            map.removeLayer(marker);
                        }
                    }
                }
            });
            
            // Update MBTA train markers
            trainMarkers.forEach((marker, trainId) => {
                if (marker && marker.routeName) {
                    // Determine which checkbox to check based on route type
                    let checkboxId = null;
                    if (commuterLines.includes(marker.routeName) || (marker.routeId && marker.routeId.startsWith('CR-'))) {
                        checkboxId = 'show-commuter-live';
                    } else if (seasonalLines.includes(marker.routeName)) {
                        checkboxId = 'show-seasonal-live';
                    } else if (subwayLines.includes(marker.routeName)) {
                        checkboxId = 'show-subway-live';
                    }
                    
                    if (checkboxId) {
                        const checkbox = document.getElementById(checkboxId);
                        if (checkbox && checkbox.checked) {
                            // Check if other systems are highlighted (they take priority) - INCLUDING CTRAIL
                            if (isAnyOtherSystemHighlighted()) {
                                // Other systems are highlighted, hide MBTA trains
                                if (map.hasLayer(marker)) {
                                    closeMarkerPopupAndTooltip(marker);
                                    map.removeLayer(marker);
                                }
                            } else if (isMBTALineHighlighted()) {
                                // MBTA line is highlighted, only show if this train is on that line
                                const isHighlighted = Array.isArray(highlightedLine)
                                    ? highlightedLine.includes(marker.routeName)
                                    : highlightedLine === marker.routeName;
                                
                                if (isHighlighted) {
                                    if (!map.hasLayer(marker)) {
                                        marker.addTo(map);
                                    }
                                } else {
                                    if (map.hasLayer(marker)) {
                                        closeMarkerPopupAndTooltip(marker);
                                        map.removeLayer(marker);
                                    }
                                }
                            } else {
                                // No highlighting active, show all
                                if (!map.hasLayer(marker)) {
                                    marker.addTo(map);
                                }
                            }
                        } else {
                            // Checkbox unchecked, hide marker
                            if (map.hasLayer(marker)) {
                                closeMarkerPopupAndTooltip(marker);
                                map.removeLayer(marker);
                            }
                        }
                    }
                }
            });
        }
        
        // Function to update MTA Subway train markers on the map
        function updateMtaSubwayMarkers(tripsByRoute) {
            // Store currently open popups
            const currentSubwayPopups = new Map();
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker.isPopupOpen()) {
                    currentSubwayPopups.set(trainId, true);
                }
            });
            
            // Clear old markers
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            mtaSubwayMarkers.clear();
            
            // Check if subway data is available
            if (typeof mtaSubwayRoutesData === 'undefined' || !mtaSubwayRoutesData || !mtaSubwayRoutesData.routes) {
                return;
            }
            
            // Process each route
            tripsByRoute.forEach((tripUpdates, routeId) => {
                const routeData = mtaSubwayRoutesData.routes[routeId];
                if (!routeData) {
                    return; // Skip routes we don't have data for
                }
                
                // Get stop_times data for this route
                const routeStopTimes = mtaSubwayRoutesData.routeStopTimes?.[routeId] || {};
                const avgTravelTimes = routeStopTimes.avg_travel_times || {};
                let orderedStops = routeStopTimes.ordered_stops || [];
                
                // Validate that ordered stops actually belong to this route
                // If ordered stops don't match route stops, use route stops as fallback
                if (orderedStops.length > 0 && routeData.stops && routeData.stops.length > 0) {
                    const routeStopIds = new Set(routeData.stops.map(s => s.stop_id));
                    const matchingStops = orderedStops.filter(stopId => routeStopIds.has(stopId));
                    
                    // If less than 50% of ordered stops match route stops, the data is likely wrong
                    if (matchingStops.length < orderedStops.length * 0.5) {
                        console.warn(`⚠️ Route ${routeId}: Ordered stops don't match route stops (${matchingStops.length}/${orderedStops.length} match). Using route stops as fallback.`);
                        // Use route stops as ordered stops (sorted by stop_id for consistency)
                        orderedStops = routeData.stops.map(s => s.stop_id).sort();
                    } else if (matchingStops.length < orderedStops.length) {
                        // Some stops match, filter to only matching stops
                        orderedStops = matchingStops;
                    }
                }
                
                // CRITICAL: If orderedStops is empty, try to use route stops as fallback
                if (orderedStops.length === 0) {
                    if (routeData.stops && routeData.stops.length > 0) {
                        // Use route stops as ordered stops (sorted by stop_id)
                        orderedStops = routeData.stops.map(s => s.stop_id).sort();
                        console.warn(`⚠️ Route ${routeId}: No ordered stops in routeStopTimes, using route stops as fallback (${orderedStops.length} stops)`);
                    } else {
                        // Skip this route if we don't have any stop data
                        console.warn(`⚠️ Route ${routeId}: No stop data available, skipping`);
                        return;
                    }
                }
                
                // Track why trains are being filtered out for this route
                let skippedNoTripId = 0;
                let skippedNoStopUpdates = 0;
                let skippedNoFutureStops = 0;
                let skippedNoPreviousStop = 0;
                let skippedStopNotFound = 0;
                let skippedNoNextStopIdTime = 0;
                let successCount = 0;
                
                // Process each trip update for this route
                tripUpdates.forEach((tripUpdate, index) => {
                try {
                    const tripId = tripUpdate.trip?.tripId || tripUpdate.trip?.trip_id;
                    if (!tripId) {
                        skippedNoTripId++;
                        if (skippedNoTripId <= 3) { // Only log first few
                        }
                        return;
                    }
                
                // Get stop_time_updates (future stops with ETAs)
                const stopTimeUpdates = tripUpdate.stopTimeUpdate || tripUpdate.stop_time_update || [];
                if (stopTimeUpdates.length === 0) {
                    skippedNoStopUpdates++;
                    if (skippedNoStopUpdates <= 3) {
                    }
                    return;
                }
                
                
                // The API never stores past stops - find the first stop with valid arrival/departure time
                // Sometimes the first stop might not have arrival.time, so we need to find the first valid one
                const now = Math.floor(Date.now() / 1000); // Current time in seconds
                let nextStopUpdate = null;
                
                for (let i = 0; i < stopTimeUpdates.length; i++) {
                    const update = stopTimeUpdates[i];
                    const stopId = update.stopId || update.stop_id;
                    const arrivalTime = update.arrival?.time;
                    const departureTime = update.departure?.time;
                    
                    // Need at least a stopId and either arrival or departure time
                    if (stopId && (arrivalTime || departureTime)) {
                        nextStopUpdate = update;
                        break;
                    }
                }
                
                if (!nextStopUpdate) {
                    skippedNoNextStopIdTime++;
                    return;
                }
                
                let nextStopId = nextStopUpdate.stopId || nextStopUpdate.stop_id;
                const nextStopSequence = nextStopUpdate.stopSequence || nextStopUpdate.stop_sequence;
                // Prefer arrival time, but use departure time as fallback
                const nextArrivalTime = nextStopUpdate.arrival?.time || nextStopUpdate.departure?.time;
                
                if (!nextStopId || !nextArrivalTime) {
                    skippedNoNextStopIdTime++;
                    return;
                }
                
                // Calculate ETA in seconds
                const etaSeconds = nextArrivalTime - now;
                
                
                // Find previous stop using ordered stops list from static schedule data
                // The API doesn't include past stops, so we use the ordered stops list
                let previousStopId = null;
                let avgTravelTimeSeconds = 120; // Default 2 minutes
                
                // Find the next stop in the ordered stops list
                if (orderedStops.length > 0) {
                    // Try to find the next stop (with variations for N/S direction)
                    const stopVariations = [
                        nextStopId,
                        nextStopId.replace(/[NS]$/, '') + 'N',
                        nextStopId.replace(/[NS]$/, '') + 'S',
                        nextStopId.replace(/N$/, 'S'),
                        nextStopId.replace(/S$/, 'N')
                    ];
                    
                    let nextIndex = -1;
                    for (const variation of stopVariations) {
                        nextIndex = orderedStops.indexOf(variation);
                        if (nextIndex !== -1) {
                            // Found a match - use this variation
                            nextStopId = variation;
                            break;
                        }
                    }
                    
                    if (nextIndex > 0) {
                        // Found the next stop, get the previous one
                        previousStopId = orderedStops[nextIndex - 1];
                        const timeKeyStr = `${previousStopId},${nextStopId}`;
                        if (avgTravelTimes[timeKeyStr] !== undefined) {
                            avgTravelTimeSeconds = avgTravelTimes[timeKeyStr];
                        }
                    } else if (nextIndex === 0) {
                        // Train is at the first stop
                        previousStopId = nextStopId;
                    } else {
                        // nextIndex === -1, stop not found in ordered list
                        // This likely means the train is going in the opposite direction
                        // Check if the stop exists in routeData.stops
                        if (routeData && routeData.stops) {
                            const nextStopIndex = routeData.stops.findIndex(s => s.stop_id === nextStopId);
                            
                            if (nextStopIndex > 0) {
                                // Stop exists in routeData.stops - use the stop immediately before it
                                previousStopId = routeData.stops[nextStopIndex - 1].stop_id;
                                
                                // Try to get travel time - check both directions
                                const timeKeyStr = `${previousStopId},${nextStopId}`;
                                if (avgTravelTimes[timeKeyStr] !== undefined) {
                                    avgTravelTimeSeconds = avgTravelTimes[timeKeyStr];
                                } else {
                                    // Try reverse direction
                                    const reverseTimeKeyStr = `${nextStopId},${previousStopId}`;
                                    if (avgTravelTimes[reverseTimeKeyStr] !== undefined) {
                                        avgTravelTimeSeconds = avgTravelTimes[reverseTimeKeyStr];
                                    }
                                }
                            } else if (nextStopIndex === 0) {
                                // Stop is first in routeData.stops
                                previousStopId = nextStopId;
                            } else {
                                // Stop not found in routeData.stops - try stop ID variations
                                const baseStopId = nextStopId.replace(/[NS]$/, '');
                                const stopVariations2 = [
                                    baseStopId + 'N',
                                    baseStopId + 'S',
                                    nextStopId.replace(/N$/, 'S'),
                                    nextStopId.replace(/S$/, 'N'),
                                    baseStopId // Try without direction suffix
                                ];
                                
                                for (const variation of stopVariations2) {
                                    // Check ordered stops first
                                    const foundInOrdered = orderedStops.indexOf(variation);
                                    if (foundInOrdered > 0) {
                                        previousStopId = orderedStops[foundInOrdered - 1];
                                        const timeKeyStr = `${previousStopId},${variation}`;
                                        if (avgTravelTimes[timeKeyStr] !== undefined) {
                                            avgTravelTimeSeconds = avgTravelTimes[timeKeyStr];
                                        }
                                        nextStopId = variation; // Update to use the matched variation
                                        break;
                                    }
                                    
                                    // Also check routeData.stops
                                    const foundInRoute = routeData.stops.findIndex(s => s.stop_id === variation);
                                    if (foundInRoute > 0) {
                                        previousStopId = routeData.stops[foundInRoute - 1].stop_id;
                                        const timeKeyStr = `${previousStopId},${variation}`;
                                        if (avgTravelTimes[timeKeyStr] !== undefined) {
                                            avgTravelTimeSeconds = avgTravelTimes[timeKeyStr];
                                        }
                                        nextStopId = variation;
                                        break;
                                    }
                                    
                                    // Try partial match (stop ID contains variation or vice versa)
                                    const partialMatch = routeData.stops.find(s => 
                                        s.stop_id.includes(variation) || variation.includes(s.stop_id)
                                    );
                                    if (partialMatch && routeData.stops.indexOf(partialMatch) > 0) {
                                        const partialIndex = routeData.stops.indexOf(partialMatch);
                                        previousStopId = routeData.stops[partialIndex - 1].stop_id;
                                        nextStopId = partialMatch.stop_id;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        if (!previousStopId) {
                            // Still not found - use fallback (only log once per trip to reduce noise)
                            if (!window.mtaSubwayStopWarnings || !window.mtaSubwayStopWarnings.has(tripId)) {
                                if (!window.mtaSubwayStopWarnings) {
                                    window.mtaSubwayStopWarnings = new Set();
                                }
                                window.mtaSubwayStopWarnings.add(tripId);
                                console.warn(`⚠️ Trip ${tripId}: Could not determine previous stop for ${nextStopId} in route ${routeId}. Using fallback.`);
                            }
                            
                            // Fallback: use the next stop as both previous and next
                            // This shows the train at the station location
                            previousStopId = nextStopId;
                            avgTravelTimeSeconds = 60; // Use 1 minute as default
                        }
                    }
                }
                
                if (!previousStopId) {
                    // Final fallback: use the next stop as both previous and next
                    // (Error already logged above if we got here)
                    previousStopId = nextStopId;
                    avgTravelTimeSeconds = 60; // Use 1 minute as default
                }
                
                
                // Find stop coordinates - use the same stop objects as in the map markers
                // This ensures naming consistency between map markers and train tooltips
                let nextStop = routeData.stops.find(s => s.stop_id === nextStopId);
                let prevStop = routeData.stops.find(s => s.stop_id === previousStopId);
                
                // If stop not found in current route, search all routes (for shared stops)
                if (!nextStop && mtaSubwayRoutesData && mtaSubwayRoutesData.routes) {
                    for (const [otherRouteId, otherRouteData] of Object.entries(mtaSubwayRoutesData.routes)) {
                        const foundStop = otherRouteData.stops?.find(s => s.stop_id === nextStopId);
                        if (foundStop) {
                            nextStop = foundStop;
                            console.warn(`⚠️ Trip ${tripId}: Next stop ${nextStopId} found in route ${otherRouteId} (shared stop), not in route ${routeId}`);
                            break;
                        }
                    }
                }
                
                if (!prevStop && mtaSubwayRoutesData && mtaSubwayRoutesData.routes) {
                    for (const [otherRouteId, otherRouteData] of Object.entries(mtaSubwayRoutesData.routes)) {
                        const foundStop = otherRouteData.stops?.find(s => s.stop_id === previousStopId);
                        if (foundStop) {
                            prevStop = foundStop;
                            break;
                        }
                    }
                }
                
                if (!nextStop) {
                    // Still not found - use fallback coordinates
                    // Only log once per trip to reduce noise
                    if (!window.mtaSubwayStopWarnings || !window.mtaSubwayStopWarnings.has(`stop-${tripId}-${nextStopId}`)) {
                        if (!window.mtaSubwayStopWarnings) {
                            window.mtaSubwayStopWarnings = new Set();
                        }
                        window.mtaSubwayStopWarnings.add(`stop-${tripId}-${nextStopId}`);
                        console.warn(`⚠️ Trip ${tripId}: Stop ${nextStopId} not found in route ${routeId}, using fallback`);
                    }
                    // Use a default location (will show train but may be inaccurate)
                    // Try to find any stop with similar ID pattern
                    const baseStopId = nextStopId.replace(/[NS]$/, '');
                    const similarStop = routeData.stops.find(s => s.stop_id.startsWith(baseStopId));
                    if (similarStop) {
                        nextStop = similarStop;
                    } else {
                        // Last resort: use first stop in route
                        if (routeData.stops.length > 0) {
                            nextStop = routeData.stops[0];
                        }
                    }
                }
                
                if (!prevStop) {
                    // Use nextStop as fallback for prevStop
                    prevStop = nextStop;
                    // (Warning already logged above if we got here)
                }
                
                // Final check - if we still don't have stops, we can't display the train
                if (!nextStop || !prevStop) {
                    console.error(`❌ Trip ${tripId}: Cannot display train - missing stop data`);
                    console.error(`   Next stop found: ${!!nextStop}, Prev stop found: ${!!prevStop}`);
                    return; // Can't display without coordinates
                }
                
                // Handle case where previous and next stops are the same (train at station)
                if (previousStopId === nextStopId) {
                    // Train is at the next stop - show it there
                    // We'll show the train at the stop location (progress = 1.0)
                }
                
                // Ensure we're using the exact same name field as the map markers
                // Both use stop.name from routeData.stops, so they should match
                const nextStopName = nextStop.name || 'Unknown Stop';
                const prevStopName = prevStop.name || 'Unknown Stop';
                
                // Calculate position along route line
                // Algorithm:
                // 1. ETA = time until train arrives at next stop
                // 2. If ETA = 0, train is at next stop (progress = 1)
                // 3. If ETA = avgTravelTime, train just left previous stop (progress = 0)
                // 4. Progress = (avgTravelTime - ETA) / avgTravelTime
                //    This gives us how far along the segment the train is (0 = at prev stop, 1 = at next stop)
                // 
                // BUT: If ETA > avgTravelTime, the train hasn't left the previous stop yet (or is delayed)
                // In that case, we should show the train at or very close to the previous stop
                let progress;
                if (etaSeconds > avgTravelTimeSeconds) {
                    // Train hasn't left previous stop yet (or is significantly delayed)
                    // Show train very close to previous stop (progress near 0)
                    // Use a small progress value based on how much time has passed
                    const timeSincePrevStop = avgTravelTimeSeconds; // Assume train just left
                    progress = Math.max(0, Math.min(0.1, timeSincePrevStop / avgTravelTimeSeconds));
                } else {
                    // Normal case: train is between stops
                    progress = Math.max(0, Math.min(1, (avgTravelTimeSeconds - etaSeconds) / avgTravelTimeSeconds));
                }
                
                
                // Find the route shape that connects these stops
                let trainPosition = null;
                
                // Get route shapes
                const routeShapes = routeData.shapes || [];
                if (routeShapes.length > 0) {
                    // Find the shape segment between prev and next stops
                    // For now, use the first shape and interpolate along it
                    const shape = routeShapes[0];
                    if (shape && shape.coords && shape.coords.length > 0) {
                        // Find closest points to prev and next stops on the shape
                        let prevIndex = 0;
                        let nextIndex = shape.coords.length - 1;
                        let minPrevDist = Infinity;
                        let minNextDist = Infinity;
                        
                        shape.coords.forEach((coord, idx) => {
                            const distToPrev = Math.sqrt(
                                Math.pow(coord[0] - prevStop.lat, 2) + 
                                Math.pow(coord[1] - prevStop.lon, 2)
                            );
                            const distToNext = Math.sqrt(
                                Math.pow(coord[0] - nextStop.lat, 2) + 
                                Math.pow(coord[1] - nextStop.lon, 2)
                            );
                            
                            if (distToPrev < minPrevDist) {
                                minPrevDist = distToPrev;
                                prevIndex = idx;
                            }
                            if (distToNext < minNextDist) {
                                minNextDist = distToNext;
                                nextIndex = idx;
                            }
                        });
                        
                        // Ensure prevIndex < nextIndex
                        if (prevIndex > nextIndex) {
                            [prevIndex, nextIndex] = [nextIndex, prevIndex];
                        }
                        
                        // Interpolate position along the segment
                        const segmentLength = nextIndex - prevIndex;
                        const targetIndex = prevIndex + Math.floor(segmentLength * progress);
                        const clampedIndex = Math.max(prevIndex, Math.min(nextIndex, targetIndex));
                        
                        if (clampedIndex < shape.coords.length) {
                            trainPosition = shape.coords[clampedIndex];
                        }
                    }
                }
                
                // Fallback: simple linear interpolation between stops
                if (!trainPosition) {
                    // If previous and next stops are the same, use that stop's coordinates
                    if (previousStopId === nextStopId) {
                        trainPosition = [nextStop.lat, nextStop.lon];
                    } else {
                        trainPosition = [
                            prevStop.lat + (nextStop.lat - prevStop.lat) * progress,
                            prevStop.lon + (nextStop.lon - prevStop.lon) * progress
                        ];
                    }
                }
                
                // Create train marker
                const trainId = `${routeId}_${tripId}`;
                const baseIconSize = 20;
                const currentZoom = map.getZoom();
                const iconSize = getIconSize(baseIconSize, currentZoom);
                
                // Helper function to get icon URL with fallback logic
                function getRouteIconUrl(routeId) {
                    const iconName = routeId.toLowerCase();
                    // List of known icon files (from icons directory)
                    const knownIcons = ['1', '2', '3', '4', '5', '6', '6d', '7', '7d', 'a', 'b', 'c', 'd', 'e', 'f', 'fd', 'g', 'h', 'j', 'l', 'm', 'n', 'q', 'r', 's', 'sf', 'sir', 'sr', 't', 'w', 'z'];
                    
                    // Try exact match first
                    if (knownIcons.includes(iconName)) {
                        return `icons/${iconName}.png`;
                    }
                    
                    // Try base route for variants (e.g., "7x" -> "7", "7d" -> "7")
                    // Remove trailing letter if it's a variant indicator
                    if (iconName.length > 1) {
                        const baseRoute = iconName.replace(/[a-z]$/, ''); // Remove trailing letter
                        if (baseRoute && knownIcons.includes(baseRoute)) {
                            return `icons/${baseRoute}.png`;
                        }
                    }
                    
                    // Final fallback: use MTA circle icon
                    return 'icons/mtacirc.png';
                }
                
                const iconUrl = getRouteIconUrl(routeId);
                const color = routeData.color || '#EE352E';
                
                // Get headsign/destination from GTFS-RT feed
                // Try multiple possible locations in the TripUpdate structure
                let headsign = tripUpdate.trip?.tripProperties?.tripHeadsign ||
                              tripUpdate.trip?.trip_properties?.trip_headsign ||
                              tripUpdate.trip?.tripProperties?.trip_headsign ||
                              tripUpdate.trip?.tripHeadsign ||
                              tripUpdate.trip?.trip_headsign ||
                              tripUpdate.trip?.headsign ||
                              null;
                
                // If not in GTFS-RT trip descriptor, try to get from last stop in stop_time_updates
                // The last stop is usually the final destination
                if (!headsign && stopTimeUpdates.length > 0) {
                    // Get the last stop_time_update (should be the final destination)
                    const lastStopUpdate = stopTimeUpdates[stopTimeUpdates.length - 1];
                    const lastStopId = lastStopUpdate.stopId || lastStopUpdate.stop_id;
                    
                    // Find the stop name from route data
                    if (lastStopId && routeData.stops) {
                        const lastStop = routeData.stops.find(s => s.stop_id === lastStopId);
                        if (lastStop) {
                            headsign = lastStop.name;
                        }
                    }
                }
                
                // If still not found, try static data with trip_id matching
                if (!headsign && mtaSubwayRoutesData && mtaSubwayRoutesData.tripToHeadsign) {
                    // Try exact match first
                    headsign = mtaSubwayRoutesData.tripToHeadsign[tripId];
                    
                    // If no exact match, try partial matching (GTFS-RT trip_id might be shorter)
                    if (!headsign) {
                        for (const [staticTripId, staticHeadsign] of Object.entries(mtaSubwayRoutesData.tripToHeadsign)) {
                            if (staticTripId.endsWith(tripId) || tripId.endsWith(staticTripId.split('_').pop())) {
                                headsign = staticHeadsign;
                                break;
                            }
                        }
                    }
                }
                
                // Fallback: use "Unknown" if we can't determine destination
                if (!headsign) {
                    headsign = 'Unknown';
                }
                
                // Create tooltip
                let tooltipContent = `
                    <div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                        <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                            <img src="${iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                            Live ${routeId} Train
                        </div>
                        <b>Destination:</b> ${headsign}<br>
                        <b>Previous Stop:</b> ${prevStopName}<br>
                        <b>Next Stop:</b> ${nextStopName}<br>
                        <b>ETA:</b> ${Math.round(etaSeconds / 60)} min<br>
                        <b>Trip:</b> ${tripId.substring(0, 20)}...
                    </div>
                `;
                
                const tooltipDirection = trainPosition[0] < 40.76 ? 'bottom' : 'top';
                
                // Create marker
                const trainMarker = renderLiveVehicleMarker(trainPosition, {
                    iconUrl: iconUrl,
                    iconSize: [iconSize, iconSize],
                    baseIconSize: baseIconSize,
                    iconAnchor: [iconSize / 2, iconSize / 2],
                    tooltipContent: tooltipContent,
                    tooltipDirection: tooltipDirection,
                    routeName: routeId,
                    onClick: function(e) {
                        L.DomEvent.stopPropagation(e);
                        if (highlightedSubwayLine === routeId) {
                            resetSubwayHighlight();
                        } else {
                            highlightSubwayLine(routeId);
                        }
                    },
                    zIndexOffset: 200
                });
                
                if (trainMarker) {
                    trainMarker.tripId = tripId;
                    // Ensure routeName is always set (trainId is "routeId_tripId", so fallback keeps visibility logic correct)
                    if (trainMarker.routeName == null || trainMarker.routeName === '') {
                        trainMarker.routeName = trainId.split('_')[0] || routeId;
                    }
                    mtaSubwayMarkers.set(trainId, trainMarker);
                    successCount++;
                    
                    // Use centralized visibility function (use marker's routeName so fallback is consistent)
                    const shouldShow = shouldShowMarker('subway', trainMarker.routeName, 'show-mta-subway-live');
                    
                    // Apply visibility
                    if (shouldShow) {
                        if (!map.hasLayer(trainMarker)) {
                            trainMarker.addTo(map);
                        }
                    } else {
                        if (map.hasLayer(trainMarker)) {
                            map.removeLayer(trainMarker);
                        }
                    }
                    
                    // Restore popup if it was open
                    if (currentSubwayPopups.has(trainId)) {
                        trainMarker.openPopup();
                    }
                }
                } catch (error) {
                    // Log error but continue processing other trains
                    skippedNoPreviousStop++;
                    console.error(`❌ Error processing trip ${tripUpdate.trip?.tripId || tripUpdate.trip?.trip_id || 'unknown'}:`, error);
                }
                });
            }); // End of tripsByRoute.forEach
            
            // Log summary of processing results
        }
        
        // Function to start MTA Subway live tracking
        function startMtaSubwayTracking() {
            if (mtaSubwayTrackingInterval) {
                return; // Already tracking
            }
            
            // Initial fetch
            fetchMtaSubwayTrains();
            
            // Set up interval (update every 10 seconds for subway)
            mtaSubwayTrackingInterval = setInterval(fetchMtaSubwayTrains, 10000);
        }
        
        // Function to stop MTA Subway live tracking
        function stopMtaSubwayTracking() {
            if (mtaSubwayTrackingInterval) {
                clearInterval(mtaSubwayTrackingInterval);
                mtaSubwayTrackingInterval = null;
            }
            
            // Clear markers
            mtaSubwayMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) {
                    marker.remove();
                }
            });
            mtaSubwayMarkers.clear();
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
                        
                        // Try to get routeId directly from vehicle.trip (GTFS-RT TripDescriptor has route_id = field 5)
                        // MTA feed may or may not populate it; protobuf.js can expose it as routeId, route_id, [5], or _fields
                        let tripRouteId = null;
                        if (vehicle.trip) {
                            tripRouteId = vehicle.trip.routeId || vehicle.trip.route_id ||
                                (vehicle.trip.routeId !== undefined ? vehicle.trip.routeId : null) ||
                                (vehicle.trip.route_id !== undefined ? vehicle.trip.route_id : null);
                        }
                        if (!tripRouteId && vehicle.trip) {
                            try {
                                tripRouteId = vehicle.trip['routeId'] || vehicle.trip['route_id'];
                            } catch (e) { /* ignore */ }
                        }
                        if (!tripRouteId && vehicle.trip) {
                            try {
                                if (vehicle.trip._fields) {
                                    tripRouteId = vehicle.trip._fields.routeId || vehicle.trip._fields.route_id;
                                }
                                if (!tripRouteId && vehicle.trip[5]) tripRouteId = vehicle.trip[5];
                            } catch (e) { /* ignore */ }
                        }
                        
                        if (tripRouteId && lirrRoutesData && lirrRoutesData.routes) {
                            const tripRouteIdStr = String(tripRouteId);
                            for (const [name, route] of Object.entries(lirrRoutesData.routes)) {
                                if (route.route_id === tripRouteIdStr || route.route_id === tripRouteId) {
                                    routeName = name;
                                    routeId = tripRouteIdStr;
                                    color = lineColors[name] || color;
                                    break;
                                }
                            }
                        }
                        
                        // If we don't have routeId yet, try trip_short_name first (real-time feed often uses this)
                        if (!routeId && tripShortName && lirrRoutesData && lirrRoutesData.tripShortNameToRoute) {
                            routeId = lirrRoutesData.tripShortNameToRoute[tripShortName];
                            
                            if (routeId && lirrRoutesData.routes) {
                                const rid = String(routeId);
                                for (const [name, route] of Object.entries(lirrRoutesData.routes)) {
                                    if (route.route_id === rid || route.route_id === routeId) {
                                        routeName = name;
                                        routeId = rid;
                                        color = lineColors[name] || color;
                                        break;
                                    }
                                }
                            }
                        }
                        // Also try tripId as trip_short_name (feed sometimes puts short name in trip_id)
                        if (!routeId && tripId && lirrRoutesData && lirrRoutesData.tripShortNameToRoute) {
                            const mapped = lirrRoutesData.tripShortNameToRoute[tripId];
                            if (mapped && lirrRoutesData.routes) {
                                const rid = String(mapped);
                                for (const [name, route] of Object.entries(lirrRoutesData.routes)) {
                                    if (route.route_id === rid || route.route_id === mapped) {
                                        routeName = name;
                                        routeId = rid;
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
                                const rid = String(routeId);
                                for (const [name, route] of Object.entries(lirrRoutesData.routes)) {
                                    if (route.route_id === rid || route.route_id === routeId) {
                                        routeName = name;
                                        routeId = rid;
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
                        
                        // Create click handler for highlighting
                        let onClickHandler = null;
                        const hasNoLine = routeName === 'LIRR Train' || (typeof routeName === 'string' && routeName.startsWith('Trip '));
                        if (routeId && !hasNoLine) {
                            onClickHandler = function(e) {
                                L.DomEvent.stopPropagation(e);
                                if (highlightedLIRRLine === routeName) {
                                    resetLIRRHighlight();
                                } else {
                                    highlightLIRRLine(routeName);
                                }
                            };
                        } else if (hasNoLine) {
                            // No line attribute: clicking highlights entire LIRR system and all LIRR trains
                            onClickHandler = function(e) {
                                L.DomEvent.stopPropagation(e);
                                const showingAllLIRR = Array.isArray(highlightedLIRRLine) && highlightedLIRRLine.length === lirrLines.length;
                                if (showingAllLIRR) {
                                    resetLIRRHighlight();
                                } else {
                                    highlightMultipleLIRRLines(lirrLines.slice());
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
                        
                        // Always store the marker
                        lirrMarkers.set(trainId, trainMarker);
                        
                        // Use centralized visibility function
                        const shouldShow = shouldShowMarker('lirr', routeName, 'show-lirr-live');
                        
                        // Apply visibility
                        if (shouldShow) {
                            if (!map.hasLayer(trainMarker)) {
                                trainMarker.addTo(map);
                                }
                            } else {
                            if (map.hasLayer(trainMarker)) {
                                map.removeLayer(trainMarker);
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
        
        // NJ Transit Live Tracking (backend API: getVehicleData via server/; set NJ_TRANSIT_VEHICLES_URL to enable)
        async function fetchNJTransitTrains() {
            if (!NJ_TRANSIT_VEHICLES_URL || NJ_TRANSIT_VEHICLES_URL.trim() === '') {
                return;
            }
            try {
                const now = Date.now();
                if (now - lastNJTransitUpdateTime < 5000) return;
                lastNJTransitUpdateTime = now;
                
                const response = await fetch(NJ_TRANSIT_VEHICLES_URL);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const raw = await response.json();
                if (!Array.isArray(raw)) {
                    if (raw && raw.error) throw new Error(raw.error);
                    throw new Error('Unexpected response');
                }
                // Normalize NJ Transit API shape to vehicle-like objects for updateNJTransitMarkers
                const vehicles = raw
                    .filter(r => r.LATITUDE != null && r.LONGITUDE != null)
                    .map(r => ({
                        position: { latitude: parseFloat(r.LATITUDE), longitude: parseFloat(r.LONGITUDE) },
                        vehicle: {
                            id: String(r.ID || ''),
                            trainLine: r.TRAIN_LINE || null,
                            nextStop: r.NEXT_STOP || null,
                            secLate: r.SEC_LATE != null ? String(r.SEC_LATE) : null
                        },
                        trip: null
                    }));
                updateNJTransitMarkers(vehicles);
            } catch (err) {
                console.warn('NJ Transit live data unavailable:', err.message);
            }
        }
        
        function updateNJTransitMarkers(vehicles) {
            const currentPopups = new Map();
            njTransitMarkers.forEach((marker, trainId) => {
                if (marker && marker.isPopupOpen && marker.isPopupOpen()) {
                    currentPopups.set(trainId, true);
                }
            });
            njTransitMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) marker.remove();
            });
            njTransitMarkers.clear();
            
            if (!vehicles || !Array.isArray(vehicles)) return;
            if (typeof njTransitRoutesData === 'undefined' || !njTransitRoutesData || !njTransitRoutesData.routes) return;
            
            const rd = njTransitRoutesData;
            vehicles.forEach(vehicle => {
                if (!vehicle.position || vehicle.position.latitude == null || vehicle.position.longitude == null) return;
                const lat = vehicle.position.latitude;
                const lon = vehicle.position.longitude;
                const trainId = vehicle.vehicle?.id || 'unknown';
                const tripId = vehicle.trip?.tripId || vehicle.trip?.trip_id;
                const tripShortName = vehicle.trip?.tripShortName || vehicle.trip?.trip_short_name;
                const startDate = vehicle.trip?.startDate || vehicle.trip?.start_date;
                const currentStatus = vehicle.currentStatus || vehicle.current_status;
                
                let routeName = 'NJ Transit Train';
                let color = '#008C45';
                let routeId = null;
                
                const apiTrainLine = vehicle.vehicle?.trainLine;
                if (apiTrainLine && rd.routes) {
                    const line = String(apiTrainLine).trim();
                    for (const [name, route] of Object.entries(rd.routes)) {
                        const longName = (route.long_name || name || '').trim();
                        if (name === line || longName === line || longName.indexOf(line) !== -1 || line.indexOf(name) !== -1) {
                            routeName = name;
                            routeId = route.route_id ? String(route.route_id) : null;
                            color = (route.color && (route.color.startsWith('#') ? route.color : '#' + route.color)) || lineColors[name] || color;
                            break;
                        }
                    }
                    if (routeName === 'NJ Transit Train') routeName = apiTrainLine;
                }
                let tripRouteId = vehicle.trip?.routeId || vehicle.trip?.route_id || null;
                if (tripRouteId && rd.routes) {
                    const rid = String(tripRouteId);
                    for (const [name, route] of Object.entries(rd.routes)) {
                        if (route.route_id === rid || route.route_id === tripRouteId) {
                            routeName = name;
                            routeId = rid;
                            color = (route.color && (route.color.startsWith('#') ? route.color : '#' + route.color)) || lineColors[name] || color;
                            break;
                        }
                    }
                }
                if (!routeId && tripShortName && rd.tripShortNameToRoute) {
                    routeId = rd.tripShortNameToRoute[tripShortName];
                    if (routeId && rd.routes) {
                        const rid = String(routeId);
                        for (const [name, route] of Object.entries(rd.routes)) {
                            if (route.route_id === rid) {
                                routeName = name;
                                routeId = rid;
                                color = (route.color && (route.color.startsWith('#') ? route.color : '#' + route.color)) || lineColors[name] || color;
                                break;
                            }
                        }
                    }
                }
                if (!routeId && tripId && rd.tripShortNameToRoute) {
                    const mapped = rd.tripShortNameToRoute[tripId];
                    if (mapped && rd.routes) {
                        const rid = String(mapped);
                        for (const [name, route] of Object.entries(rd.routes)) {
                            if (route.route_id === rid) {
                                routeName = name;
                                routeId = rid;
                                color = (route.color && (route.color.startsWith('#') ? route.color : '#' + route.color)) || lineColors[name] || color;
                                break;
                            }
                        }
                    }
                }
                if (!routeId && tripId && rd.tripToRoute) {
                    routeId = rd.tripToRoute[tripId];
                    if (!routeId && tripId.includes('_')) {
                        routeId = rd.tripToRoute[tripId.split('_')[0]];
                    }
                    if (routeId && rd.routes) {
                        const rid = String(routeId);
                        for (const [name, route] of Object.entries(rd.routes)) {
                            if (route.route_id === rid) {
                                routeName = name;
                                routeId = rid;
                                color = (route.color && (route.color.startsWith('#') ? route.color : '#' + route.color)) || lineColors[name] || color;
                                break;
                            }
                        }
                    }
                }
                if (routeName === 'NJ Transit Train' && tripId) routeName = `Trip ${tripId}`;
                
                let headsign = vehicle.trip?.tripHeadsign || vehicle.trip?.trip_headsign || vehicle.trip?.headsign || (vehicle.vehicle?.nextStop ? `Next: ${vehicle.vehicle.nextStop}` : null) || null;
                if (!headsign && tripId && rd.tripToHeadsign) {
                    headsign = rd.tripToHeadsign[tripId] || (tripId.includes('_') ? rd.tripToHeadsign[tripId.split('_')[0]] : null);
                }
                
                const baseIconSize = 20;
                const iconSize = getIconSize(baseIconSize, map.getZoom());
                const iconUrl = 'icons/commuterrailcirc.png';
                const hasNoLine = routeName === 'NJ Transit Train' || (typeof routeName === 'string' && routeName.startsWith('Trip '));
                
                let onClickHandler = null;
                if (routeId && !hasNoLine) {
                    onClickHandler = function(e) {
                        L.DomEvent.stopPropagation(e);
                        if (highlightedNJTransitLine === routeName) resetNJTransitHighlight();
                        else highlightNJTransitLine(routeName);
                    };
                } else if (hasNoLine) {
                    onClickHandler = function(e) {
                        L.DomEvent.stopPropagation(e);
                        const showingAll = Array.isArray(highlightedNJTransitLine) && highlightedNJTransitLine.length === njTransitLines.length;
                        if (showingAll) resetNJTransitHighlight();
                        else highlightMultipleNJTransitLines(njTransitLines.slice());
                    };
                }
                
                let tooltipContent = `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                    <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                        <img src="${iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                        Live NJ Transit Train
                    </div>`;
                if (routeId && !routeName.startsWith('Trip ')) tooltipContent += `<b>Line:</b> ${routeName}<br>`;
                if (headsign) tooltipContent += `<b>Terminus:</b> ${headsign}<br>`;
                tooltipContent += `<b>Train ID:</b> ${trainId}<br>`;
                if (vehicle.vehicle?.nextStop) tooltipContent += `<b>Next stop:</b> ${vehicle.vehicle.nextStop}<br>`;
                if (vehicle.vehicle?.secLate != null && vehicle.vehicle.secLate !== '') tooltipContent += `<b>Delay:</b> ${Math.round(Number(vehicle.vehicle.secLate) / 60)} min<br>`;
                if (tripId) tooltipContent += `<b>Trip:</b> ${tripId}<br>`;
                if (currentStatus) {
                    let st = currentStatus;
                    if (currentStatus === 'STOPPED_AT' || currentStatus === 0) st = 'Stopped at Station';
                    else if (currentStatus === 'IN_TRANSIT_TO' || currentStatus === 1) st = 'In Transit';
                    else if (currentStatus === 'INCOMING_AT' || currentStatus === 2) st = 'Approaching Station';
                    tooltipContent += `<b>Status:</b> ${st}<br>`;
                }
                tooltipContent += `<b>Position:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}<br><b>Last Update:</b> ${new Date().toLocaleTimeString()}</div>`;
                
                const tooltipDirection = lat < 40.76 ? 'bottom' : 'top';
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
                if (trainMarker) {
                    trainMarker.trainId = trainId;
                    trainMarker.tripId = tripId;
                }
                njTransitMarkers.set(trainId, trainMarker);
                
                const shouldShow = shouldShowMarker('njTransit', routeName, 'show-nj-transit-live');
                if (shouldShow) {
                    if (!map.hasLayer(trainMarker)) trainMarker.addTo(map);
                } else {
                    if (map.hasLayer(trainMarker)) map.removeLayer(trainMarker);
                }
                if (currentPopups.has(trainId) && trainMarker && trainMarker.openPopup) trainMarker.openPopup();
            });
        }
        
        function startNJTransitTracking() {
            if (njTransitTrackingInterval) {
                clearInterval(njTransitTrackingInterval);
            }
            fetchNJTransitTrains();
            njTransitTrackingInterval = setInterval(fetchNJTransitTrains, 5000);
        }
        
        function stopNJTransitTracking() {
            if (njTransitTrackingInterval) {
                clearInterval(njTransitTrackingInterval);
                njTransitTrackingInterval = null;
            }
            njTransitMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) marker.remove();
            });
            njTransitMarkers.clear();
        }
        
        // SEPTA Live Tracking (GTFS-RT Regional Rail - public feed)
        const SEPTA_GTFS_RT_URL = 'https://www3.septa.org/gtfsrt/septarail-pa-us/Vehicle/Vehicle.pb';
        
        async function fetchSEPTATrains() {
            if (!SEPTA_GTFS_RT_URL || SEPTA_GTFS_RT_URL.trim() === '') return;
            try {
                const now = Date.now();
                if (now - lastSEPTAUpdateTime < 5000) return;
                lastSEPTAUpdateTime = now;
                const response = await fetch(SEPTA_GTFS_RT_URL);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const buffer = await response.arrayBuffer();
                const root = await protobuf.load('./gtfs-realtime.proto');
                const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
                const feed = FeedMessage.decode(new Uint8Array(buffer));
                const vehicles = [];
                feed.entity.forEach(entity => {
                    if (entity.vehicle && entity.vehicle.position) {
                        vehicles.push(entity.vehicle);
                    }
                });
                updateSEPTAMarkers(vehicles);
            } catch (err) {
                console.warn('SEPTA live data unavailable:', err.message);
            }
        }
        
        function updateSEPTAMarkers(vehicles) {
            const currentPopups = new Map();
            septaMarkers.forEach((marker, trainId) => {
                if (marker && marker.isPopupOpen && marker.isPopupOpen()) {
                    currentPopups.set(trainId, true);
                }
            });
            septaMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) marker.remove();
            });
            septaMarkers.clear();
            if (!vehicles || !Array.isArray(vehicles)) return;
            if (typeof septaRoutesData === 'undefined' || !septaRoutesData || !septaRoutesData.routes) return;
            const rd = septaRoutesData;
            vehicles.forEach(vehicle => {
                if (!vehicle.position || vehicle.position.latitude == null || vehicle.position.longitude == null) return;
                const lat = vehicle.position.latitude;
                const lon = vehicle.position.longitude;
                const trainId = vehicle.vehicle?.id || 'unknown';
                const tripId = vehicle.trip?.tripId || vehicle.trip?.trip_id;
                const tripShortName = vehicle.trip?.tripShortName || vehicle.trip?.trip_short_name;
                const currentStatus = vehicle.currentStatus || vehicle.current_status;
                let routeName = 'SEPTA Train';
                let color = '#1F4E79';
                let routeId = null;
                let tripRouteId = vehicle.trip?.routeId || vehicle.trip?.route_id || null;
                if (tripRouteId && rd.routes) {
                    const rid = String(tripRouteId);
                    for (const [name, route] of Object.entries(rd.routes)) {
                        if (route.route_id === rid || route.route_id === tripRouteId) {
                            routeName = name;
                            routeId = rid;
                            color = (route.color && (route.color.startsWith('#') ? route.color : '#' + route.color)) || lineColors[name] || color;
                            break;
                        }
                    }
                }
                if (!routeId && tripShortName && rd.tripShortNameToRoute) {
                    routeId = rd.tripShortNameToRoute[tripShortName];
                    if (routeId && rd.routes) {
                        const rid = String(routeId);
                        for (const [name, route] of Object.entries(rd.routes)) {
                            if (route.route_id === rid) {
                                routeName = name;
                                routeId = rid;
                                color = (route.color && (route.color.startsWith('#') ? route.color : '#' + route.color)) || lineColors[name] || color;
                                break;
                            }
                        }
                    }
                }
                if (!routeId && tripId && rd.tripShortNameToRoute) {
                    const mapped = rd.tripShortNameToRoute[tripId];
                    if (mapped && rd.routes) {
                        const rid = String(mapped);
                        for (const [name, route] of Object.entries(rd.routes)) {
                            if (route.route_id === rid) {
                                routeName = name;
                                routeId = rid;
                                color = (route.color && (route.color.startsWith('#') ? route.color : '#' + route.color)) || lineColors[name] || color;
                                break;
                            }
                        }
                    }
                }
                if (!routeId && tripId && rd.tripToRoute) {
                    routeId = rd.tripToRoute[tripId];
                    if (!routeId && tripId.includes('_')) {
                        routeId = rd.tripToRoute[tripId.split('_')[0]];
                    }
                    if (routeId && rd.routes) {
                        const rid = String(routeId);
                        for (const [name, route] of Object.entries(rd.routes)) {
                            if (route.route_id === rid) {
                                routeName = name;
                                routeId = rid;
                                color = (route.color && (route.color.startsWith('#') ? route.color : '#' + route.color)) || lineColors[name] || color;
                                break;
                            }
                        }
                    }
                }
                if (routeName === 'SEPTA Train' && tripId) routeName = `Trip ${tripId}`;
                let headsign = vehicle.trip?.tripHeadsign || vehicle.trip?.trip_headsign || vehicle.trip?.headsign || null;
                if (!headsign && tripId && rd.tripToHeadsign) {
                    headsign = rd.tripToHeadsign[tripId] || (tripId.includes('_') ? rd.tripToHeadsign[tripId.split('_')[0]] : null);
                }
                const baseIconSize = 20;
                const iconSize = getIconSize(baseIconSize, map.getZoom());
                const iconUrl = 'icons/mtacirc.png';
                const hasNoLine = routeName === 'SEPTA Train' || (typeof routeName === 'string' && routeName.startsWith('Trip '));
                let onClickHandler = null;
                if (routeId && !hasNoLine) {
                    onClickHandler = function(e) {
                        L.DomEvent.stopPropagation(e);
                        if (highlightedSEPTALine === routeName) resetSEPTAHighlight();
                        else highlightSEPTALine(routeName);
                    };
                } else if (hasNoLine) {
                    onClickHandler = function(e) {
                        L.DomEvent.stopPropagation(e);
                        const showingAll = Array.isArray(highlightedSEPTALine) && highlightedSEPTALine.length === septaLines.length;
                        if (showingAll) resetSEPTAHighlight();
                        else highlightMultipleSEPTALines(septaLines.slice());
                    };
                }
                let tooltipContent = `<div style="font-size: 11px; line-height: 1.3; margin: 0; padding: 0; overflow-wrap: break-word;">
                    <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                        <img src="${iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                        Live SEPTA Train
                    </div>`;
                if (routeId && !routeName.startsWith('Trip ')) tooltipContent += `<b>Line:</b> ${routeName}<br>`;
                if (headsign) tooltipContent += `<b>Terminus:</b> ${headsign}<br>`;
                tooltipContent += `<b>Train ID:</b> ${trainId}<br>`;
                if (tripId) tooltipContent += `<b>Trip:</b> ${tripId}<br>`;
                if (currentStatus) {
                    let st = currentStatus;
                    if (currentStatus === 'STOPPED_AT' || currentStatus === 0) st = 'Stopped at Station';
                    else if (currentStatus === 'IN_TRANSIT_TO' || currentStatus === 1) st = 'In Transit';
                    else if (currentStatus === 'INCOMING_AT' || currentStatus === 2) st = 'Approaching Station';
                    tooltipContent += `<b>Status:</b> ${st}<br>`;
                }
                tooltipContent += `<b>Position:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}<br><b>Last Update:</b> ${new Date().toLocaleTimeString()}</div>`;
                const tooltipDirection = lat < 40.76 ? 'bottom' : 'top';
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
                if (trainMarker) {
                    trainMarker.trainId = trainId;
                    trainMarker.tripId = tripId;
                }
                septaMarkers.set(trainId, trainMarker);
                const shouldShow = shouldShowMarker('septa', routeName, 'show-septa-live');
                if (shouldShow) {
                    if (!map.hasLayer(trainMarker)) trainMarker.addTo(map);
                } else {
                    if (map.hasLayer(trainMarker)) map.removeLayer(trainMarker);
                }
                if (currentPopups.has(trainId) && trainMarker && trainMarker.openPopup) trainMarker.openPopup();
            });
        }
        
        function startSEPTATracking() {
            if (septaTrackingInterval) {
                clearInterval(septaTrackingInterval);
            }
            fetchSEPTATrains();
            septaTrackingInterval = setInterval(fetchSEPTATrains, 5000);
        }
        
        function stopSEPTATracking() {
            if (septaTrackingInterval) {
                clearInterval(septaTrackingInterval);
                septaTrackingInterval = null;
            }
            septaMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) marker.remove();
            });
            septaMarkers.clear();
        }
        
        // Amtrak Live Tracking (AmTrack API: https://amtrak-api.marcmap.app/get-trains)
        function startAmtrakTracking() {
            if (amtrakTrackingInterval) {
                clearInterval(amtrakTrackingInterval);
            }
            fetchAmtrakTrains();
            amtrakTrackingInterval = setInterval(fetchAmtrakTrains, 5000);
        }
        
        function stopAmtrakTracking() {
            if (amtrakTrackingInterval) {
                clearInterval(amtrakTrackingInterval);
                amtrakTrackingInterval = null;
            }
            amtrakMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) marker.remove();
            });
            amtrakMarkers.clear();
        }
        
        // NJ Transit live: relative URL for Vercel (api/nj-transit-vehicles). For local Node server use 'http://localhost:3000/api/nj-transit-vehicles'. Leave empty to disable.
        const NJ_TRANSIT_VEHICLES_URL = '/api/nj-transit-vehicles';
        
        // Amtrak API via CORS proxy (AmTrack API does not send CORS headers). Switch proxy if needed.
        const AMTRAK_API_BASE = 'https://amtrak-api.marcmap.app/get-trains';
        const AMTRAK_API_URL = 'https://corsproxy.io/?url=' + encodeURIComponent(AMTRAK_API_BASE);
        
        async function fetchAmtrakTrains() {
            try {
                const now = Date.now();
                if (now - lastAmtrakUpdateTime < 5000) return;
                lastAmtrakUpdateTime = now;
                
                const response = await fetch(AMTRAK_API_URL);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const json = await response.json();
                if (json.status === 'worked' && Array.isArray(json.data)) {
                    updateAmtrakMarkers(json.data);
                } else {
                    console.warn('Amtrak API unexpected response:', json.status, json.data?.length);
                }
            } catch (err) {
                console.warn('Amtrak live data unavailable:', err.message);
            }
        }
        
        function updateAmtrakMarkers(trains) {
            const currentAmtrakPopups = new Map();
            amtrakMarkers.forEach((marker, trainId) => {
                if (marker && marker.isPopupOpen && marker.isPopupOpen()) {
                    currentAmtrakPopups.set(trainId, true);
                }
            });
            amtrakMarkers.forEach((marker, trainId) => {
                if (marker && marker.remove) marker.remove();
            });
            amtrakMarkers.clear();
            
            if (!trains || !Array.isArray(trains)) return;
            
            const iconUrl = 'icons/amtrakcirc.png';
            trains.forEach(train => {
                const lat = train.lat;
                const lon = train.lon;
                if (lat == null || lon == null || typeof lat !== 'number' || typeof lon !== 'number') return;
                
                const routeName = train.routeName || 'Amtrak';
                const trainNum = train.trainNum || train.trainID || '?';
                const trainId = String(train.trainID != null ? train.trainID : train.trainNum + '_' + lat + '_' + lon);
                const trainTimely = train.trainTimely || '';
                
                let color = '#003366';
                if (typeof amtrakRoutesData !== 'undefined' && amtrakRoutesData && amtrakRoutesData.routes && amtrakRoutesData.routes[routeName]) {
                    const c = amtrakRoutesData.routes[routeName].color;
                    color = (c && (c.startsWith('#') ? c : '#' + c)) || color;
                } else if (lineColors[routeName]) {
                    color = lineColors[routeName];
                }
                
                const baseIconSize = 26; // Slightly larger when zoomed out for visibility
                const iconSize = getIconSize(baseIconSize, map.getZoom());
                let tooltipContent = `<div style="font-size: 11px; line-height: 1.3;">
                    <div style="color: ${color}; font-weight: bold; margin-bottom: 3px;">
                        <img src="${iconUrl}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                        Live Amtrak Train
                    </div>
                    <b>Train:</b> ${trainNum}<br><b>Route:</b> ${routeName}<br>`;
                if (trainTimely) tooltipContent += `<b>Status:</b> ${trainTimely}<br>`;
                tooltipContent += `<b>Last update:</b> ${new Date().toLocaleTimeString()}</div>`;
                
                const tooltipDirection = lat < 40.76 ? 'bottom' : 'top';
                let onClickHandler = null;
                const hasNoLine = routeName === 'Amtrak';
                if (!hasNoLine && amtrakLines.includes(routeName)) {
                    onClickHandler = function(e) {
                        L.DomEvent.stopPropagation(e);
                        if (highlightedAmtrakLine === routeName) {
                            resetAmtrakHighlight();
                        } else {
                            highlightAmtrakLine(routeName);
                        }
                    };
                }
                
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
                if (!trainMarker) return;
                trainMarker.trainId = trainId;
                trainMarker.routeName = routeName;
                amtrakMarkers.set(trainId, trainMarker);
                
                const shouldShow = shouldShowMarker('amtrak', routeName, 'show-amtrak-live');
                if (shouldShow && !map.hasLayer(trainMarker)) {
                    trainMarker.addTo(map);
                } else if (!shouldShow && map.hasLayer(trainMarker)) {
                    map.removeLayer(trainMarker);
                }
                if (currentAmtrakPopups.has(trainId) && trainMarker.openPopup) {
                    trainMarker.openPopup();
                }
            });
        }
        
        // Initially show layers based on checkbox states
        if (mbtaStopsData && typeof mbtaStopsData === 'object') {
            Object.keys(mbtaStopsData).forEach(lineName => {
                if (layers[lineName]) {
                    // Check if this line should be shown based on checkbox states
                    let shouldShow = false;
                    
                    if (subwayLines.includes(lineName) && isChecked('show-subway-paths')) {
                        shouldShow = true;
                    } else if (commuterLines.includes(lineName) && isChecked('show-commuter-paths')) {
                        shouldShow = true;
                    } else if (seasonalLines.includes(lineName) && isChecked('show-seasonal-paths')) {
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
                    if (isChecked('show-ferry-paths')) {
                        map.addLayer(layers[lineName]);
                    }
                }
            });
        }
        
        // Load Silver Line data if checkbox is checked by default (no delay needed - proper z-ordering via panes)
        if (isChecked('show-silver-line-paths')) {
            loadSilverLineRoutes();
        }
        
        // Load combined stations data first (for multi-system stations with gold markers)
        fetch('data/combined-stations.json')
            .then(response => response.json())
            .then(data => {
                combinedStationsData = data;
                loadCombinedStations();
            })
            .catch(error => {
                console.warn('Could not load combined stations data:', error);
            });
        
        // Load routes sequentially to avoid conflicts
        // IMPORTANT: Amtrak must load BEFORE Shore Line East (SLE uses Amtrak track geometry)
        if (lirrLines.length > 0 && isChecked('show-lirr-paths')) {
            loadLIRRRoutes(true);
        }
        
        if (metroNorthLines.length > 0 && isChecked('show-metro-north-paths')) {
            loadMetroNorthRoutes(true);
        }
        
        if (mtaSubwayLines.length > 0 && isChecked('show-mta-subway-paths')) {
            loadMTASubwayRoutes(true);
        }
        
        if (njTransitLines.length > 0 && isChecked('show-nj-transit-paths')) {
            loadNJTransitRoutes(true);
        }
        
        // Load Amtrak BEFORE Shore Line East (SLE needs Amtrak track geometry)
        if (amtrakLines.length > 0 && isChecked('show-amtrak-paths')) {
            loadAmtrakRoutes(true);
        }
        
        if (shoreLineEastLines.length > 0 && isChecked('show-shore-line-east-paths')) {
            loadShoreLineEastRoutes(true);
        }
        
        if (hartfordLineLines.length > 0 && isChecked('show-hartford-line-paths')) {
            loadHartfordLineRoutes(true);
        }
        
        // Start live tracking after routes are loaded
        startLiveTracking();
        if (amtrakLines.length > 0 && isChecked('show-amtrak-live')) {
            setTimeout(() => startAmtrakTracking(), 1500);
        }
        
        // Initialize bus stops visibility based on current zoom level
        const currentZoom = map.getZoom();
        if (currentZoom >= BUS_STOPS_MIN_ZOOM && isChecked('show-bus-paths')) {
            busStopsVisible = true;
            toggleBusStopsVisibility(true);
        }
        
        // Make switchTab function accessible globally and handle CTrail route loading
        window.switchTab = function(tabName, eventObj) {
            // Update tab buttons
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            // Use provided event or global event
            const evt = eventObj || (typeof event !== 'undefined' ? event : null);
            if (evt && evt.target) {
                evt.target.classList.add('active');
            } else {
                // Fallback: find button by onclick attribute
                document.querySelectorAll('.tab-button').forEach(btn => {
                    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${tabName}'`)) {
                        btn.classList.add('active');
                    }
                });
            }
            
            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const tabElement = document.getElementById(tabName + '-tab');
            if (tabElement) {
                tabElement.classList.add('active');
            }
            
            // Update map view based on active transit system
            if (tabName === 'mbta') {
                // Center on Boston
                if (typeof map !== 'undefined' && map && typeof map.setView === 'function') {
                    map.setView([42.3601, -71.0589], 11);
                }
            } else if (tabName === 'mta') {
                // Center on New York City / Long Island
                if (typeof map !== 'undefined' && map && typeof map.setView === 'function') {
                    map.setView([40.7589, -73.7250], 10); // Penn Station area with view of Long Island
                }
            } else if (tabName === 'nj-transit') {
                // Center on New Jersey / NYC area (NJ Transit rail coverage)
                if (typeof map !== 'undefined' && map && typeof map.setView === 'function') {
                    map.setView([40.72, -74.25], 10); // NJ/NYC area
                }
                // Load NJ Transit routes if checkbox is checked
                if (typeof njTransitRoutesData !== 'undefined' && njTransitRoutesData && njTransitRoutesData.routes) {
                    const njTransitCheckbox = document.getElementById('show-nj-transit-paths');
                    if (njTransitCheckbox && njTransitCheckbox.checked) {
                        loadNJTransitRoutes(true);
                    }
                }
            } else if (tabName === 'septa') {
                // Center on Philadelphia (SEPTA coverage)
                if (typeof map !== 'undefined' && map && typeof map.setView === 'function') {
                    map.setView([39.95, -75.16], 10); // Philadelphia
                }
                // Load SEPTA routes if checkbox is checked
                if (typeof septaRoutesData !== 'undefined' && septaRoutesData && septaRoutesData.routes) {
                    const septaCheckbox = document.getElementById('show-septa-paths');
                    if (septaCheckbox && septaCheckbox.checked) {
                        loadSEPTARoutes(true);
                    }
                }
            } else if (tabName === 'ctrail') {
                // Center on Connecticut, one zoom level in so state fills the view
                if (typeof map !== 'undefined' && map && typeof map.setView === 'function') {
                    map.setView([41.5, -72.8], 9); // Connecticut
                }
                
                // Load CTrail routes if checkboxes are checked
                if (typeof shoreLineEastRoutesData !== 'undefined' && shoreLineEastRoutesData && shoreLineEastRoutesData.routes) {
                    const shoreLineEastCheckbox = document.getElementById('show-shore-line-east-paths');
                    if (shoreLineEastCheckbox && shoreLineEastCheckbox.checked) {
                        loadShoreLineEastRoutes(true);
                    }
                }
                
                if (typeof hartfordLineRoutesData !== 'undefined' && hartfordLineRoutesData && hartfordLineRoutesData.routes) {
                    const hartfordLineCheckbox = document.getElementById('show-hartford-line-paths');
                    if (hartfordLineCheckbox && hartfordLineCheckbox.checked) {
                        loadHartfordLineRoutes(true);
                    }
                }
            } else if (tabName === 'amtrak') {
                // Pan to view entire continental United States
                if (typeof map !== 'undefined' && map && typeof map.setView === 'function') {
                    map.setView([39.8283, -98.5795], 4); // Geographic center of continental US
                }
                
                // Load Amtrak routes if checkbox is checked
                if (typeof amtrakRoutesData !== 'undefined' && amtrakRoutesData && amtrakRoutesData.routes) {
                    const amtrakCheckbox = document.getElementById('show-amtrak-paths');
                    if (amtrakCheckbox && amtrakCheckbox.checked) {
                        loadAmtrakRoutes(true);
                    }
                }
            }
        };
        
        // Tab bar drag-to-pan functionality
        const tabsContainer = document.querySelector('.transit-tabs');
        if (tabsContainer) {
            let isDragging = false;
            let startX;
            let scrollLeft;
            
            tabsContainer.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('tab-button')) return;
                isDragging = true;
                tabsContainer.classList.add('dragging');
                startX = e.pageX - tabsContainer.offsetLeft;
                scrollLeft = tabsContainer.scrollLeft;
            });
            
            tabsContainer.addEventListener('mouseleave', () => {
                isDragging = false;
                tabsContainer.classList.remove('dragging');
            });
            
            tabsContainer.addEventListener('mouseup', () => {
                isDragging = false;
                tabsContainer.classList.remove('dragging');
            });
            
            tabsContainer.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const x = e.pageX - tabsContainer.offsetLeft;
                const walk = (x - startX) * 2;
                tabsContainer.scrollLeft = scrollLeft - walk;
            });
            
            // Touch support for mobile
            tabsContainer.addEventListener('touchstart', (e) => {
                startX = e.touches[0].pageX - tabsContainer.offsetLeft;
                scrollLeft = tabsContainer.scrollLeft;
            });
            
            tabsContainer.addEventListener('touchmove', (e) => {
                const x = e.touches[0].pageX - tabsContainer.offsetLeft;
                const walk = (x - startX) * 2;
                tabsContainer.scrollLeft = scrollLeft - walk;
            });
        }
}); // End DOMContentLoaded
