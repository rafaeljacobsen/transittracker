// Transit Tracker — MapLibre GL build
//
// In-progress port from Leaflet/SVG to MapLibre GL JS. The original `app.js` +
// `index.html` continue to work unchanged; open `index-maplibre.html` to test
// this version.
//
// Stage 5a: all RAIL agencies (MBTA subway/commuter, LIRR, Metro-North, MTA
// Subway, NJ Transit, SEPTA, Amtrak, CTrail Hartford Line, CTrail Shore Line
// East). Bus / Silver Line / shuttle / ferry come in 5b. Cross-agency transfer
// stations (Penn Station etc.) merge in stage 7 — for now each agency's stop
// is independent, so Penn Station appears as several overlapping circles.
//
// Architecture: one `transit-routes` GeoJSON source for every line shape, one
// `transit-stops` source for every stop. Visual layers split by mode so e.g.
// subway draws thicker than Amtrak. Each feature carries `agency`, `mode`,
// `line`, `lineKey`, `color`. lineKey = `${agency}::${line}` is the unique
// disambiguator (matters when bus joins — MTA "1" subway vs MBTA "1" bus).

(function () {
    'use strict';

    // ─── Agency registry ────────────────────────────────────────────────────────
    // MBTA subway/commuter is loaded from the legacy split files (mbtaStopsData +
    // routeShapes). All other rail agencies use the standard rail shape:
    //   { routes: { lineName: { color, shapes:[{coords:[[lat,lon],…]}], stops:[…] } } }
    // dataVar names are picked up off the global scope at runtime.
    // Default colors mirror the per-agency fallbacks in app.js exactly. They
    // only fire when an individual route is missing `color` in its data file
    // (most routes have one), but matching them keeps off-by-one visual
    // regressions impossible if any feed comes through with a stripped color.
    const RAIL_AGENCIES = [
        { key: 'mta_subway',      label: 'MTA Subway',      mode: 'subway',   dataVar: 'mtaSubwayRoutesData',     defaultColor: '#808183' },
        { key: 'lirr',            label: 'LIRR',            mode: 'commuter', dataVar: 'lirrRoutesData',          defaultColor: '#00305E' },
        { key: 'metro_north',     label: 'Metro-North',     mode: 'commuter', dataVar: 'metroNorthRoutesData',    defaultColor: '#003A70' },
        { key: 'nj_transit',      label: 'NJ Transit',      mode: 'commuter', dataVar: 'njTransitRoutesData',     defaultColor: '#008C45' },
        { key: 'septa',           label: 'SEPTA',           mode: 'commuter', dataVar: 'septaRoutesData',         defaultColor: '#1F4E79' },
        { key: 'amtrak',          label: 'Amtrak',          mode: 'amtrak',   dataVar: 'amtrakRoutesData',        defaultColor: '#CAE4F1' },
        { key: 'hartford_line',   label: 'Hartford Line',   mode: 'commuter', dataVar: 'hartfordLineRoutesData',  defaultColor: '#003366' },
        { key: 'shore_line_east', label: 'Shore Line East', mode: 'commuter', dataVar: 'shoreLineEastRoutesData', defaultColor: '#0066CC' }
    ];
    const AGENCY_LABEL_BY_KEY = { mbta: 'MBTA' };
    for (const a of RAIL_AGENCIES) AGENCY_LABEL_BY_KEY[a.key] = a.label;

    const MODE_LABEL = {
        subway:      'Subway / Light Rail',
        commuter:    'Commuter Rail',
        amtrak:      'Intercity Rail (Amtrak)',
        bus:         'Bus',
        silver_line: 'Silver Line (BRT)',
        shuttle:     'Shuttle',
        ferry:       'Ferry'
    };

    // MBTA surface modes. The data files use `const mbtaBusData = …` (lexical
    // binding, NOT a window property) so we can't dynamically resolve them
    // through `window[name]` — we have to reference each by its declared name.
    // Wrapper functions defer the lookup so a missing file produces null
    // instead of a ReferenceError. (Rail agencies escape this because their
    // files use bare assignment `lirrRoutesData = …`, which IS on window.)
    const SURFACE_MODES = [
        { mode: 'bus',
          getStops:  () => typeof mbtaBusData     !== 'undefined' ? mbtaBusData     : null,
          getShapes: () => typeof busRouteShapes  !== 'undefined' ? busRouteShapes  : null,
          defaultColor: '#FFD700' },
        { mode: 'silver_line',
          getStops:  () => typeof silverLineData  !== 'undefined' ? silverLineData  : null,
          getShapes: () => typeof silverLineShapes !== 'undefined' ? silverLineShapes : null,
          defaultColor: '#7C878E' },
        { mode: 'shuttle',
          getStops:  () => typeof mbtaShuttleData   !== 'undefined' ? mbtaShuttleData   : null,
          getShapes: () => typeof shuttleRouteShapes !== 'undefined' ? shuttleRouteShapes : null,
          defaultColor: '#FF6B6B' },
        { mode: 'ferry',
          getStops:  () => typeof mbtaFerryData    !== 'undefined' ? mbtaFerryData    : null,
          getShapes: () => typeof ferryRouteShapes !== 'undefined' ? ferryRouteShapes : null,
          defaultColor: '#008EAA' }
    ];

    // MBTA-specific subway color lookup (legacy data file has no per-line color
    // field; we pin the official MBTA colors here exactly as the Leaflet app does).
    const MBTA_LINE_COLORS = {
        'Red Line':         '#DA291C',
        'Orange Line':      '#FF6600',
        'Blue Line':        '#003DA5',
        'Green Line B':     '#00843D',
        'Green Line C':     '#00843D',
        'Green Line D':     '#00843D',
        'Green Line E':     '#00843D',
        'Mattapan Trolley': '#DA291C'
    };
    const MBTA_COMMUTER_COLOR = '#80276C';

    // ─── Style ──────────────────────────────────────────────────────────────────
    const style = {
        version: 8,
        sources: {
            osm: {
                type: 'raster',
                tiles: [
                    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                ],
                tileSize: 256,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxzoom: 19
            }
        },
        layers: [
            { id: 'osm-tiles', type: 'raster', source: 'osm' }
        ]
    };

    // Per-tab view targets — same coords + zooms as switchTab in app.js, with
    // [lng, lat] order for MapLibre. Used by the initial view + window.switchTab.
    const TAB_REGIONS = {
        'mbta':       { center: [-71.0589, 42.3601], zoom: 11 },
        'mta':        { center: [-73.7250, 40.7589], zoom: 10 },
        'nj-transit': { center: [-74.25,   40.72  ], zoom: 10 },
        'septa':      { center: [-75.16,   39.95  ], zoom: 10 },
        'ctrail':     { center: [-72.8,    41.5   ], zoom: 9  },
        'amtrak':     { center: [-98.5795, 39.8283], zoom: 4  }
    };

    const map = new maplibregl.Map({
        container: 'map',
        style: style,
        // MTA tab is active by default in the HTML; start centered there to
        // match what the user expects when the page first paints.
        center: TAB_REGIONS.mta.center,
        zoom: TAB_REGIONS.mta.zoom,
        minZoom: 4,
        maxZoom: 18,
        antialias: false,
        validateStyle: false
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
    window.__map = map;

    // ─── Helpers ────────────────────────────────────────────────────────────────

    function normalizeColor(c, fallback) {
        if (!c) return fallback;
        return c.startsWith('#') ? c : '#' + c;
    }

    // MBTA legacy converter — `routeShapes` (per-line shape arrays) +
    // `mbtaStopsData` (per-line stop arrays) + `stopToRoutes` (transfer info).
    function appendMbta(lineFeatures, stopFeatures, seenStops) {
        if (typeof routeShapes === 'object' && routeShapes) {
            for (const lineName of Object.keys(routeShapes)) {
                const shapes = routeShapes[lineName];
                if (!Array.isArray(shapes)) continue;
                const isSubway = lineName in MBTA_LINE_COLORS;
                const color = MBTA_LINE_COLORS[lineName] || MBTA_COMMUTER_COLOR;
                const mode = isSubway ? 'subway' : 'commuter';
                const lineKey = `mbta::${lineName}`;
                for (const shape of shapes) {
                    if (!shape || !Array.isArray(shape.coords) || shape.coords.length < 2) continue;
                    const coords = new Array(shape.coords.length);
                    for (let i = 0; i < shape.coords.length; i++) {
                        coords[i] = [shape.coords[i][1], shape.coords[i][0]];
                    }
                    lineFeatures.push({
                        type: 'Feature',
                        properties: {
                            agency: 'mbta', mode, line: lineName, lineKey, color
                        },
                        geometry: { type: 'LineString', coordinates: coords }
                    });
                }
            }
        }
        if (typeof mbtaStopsData === 'object' && mbtaStopsData) {
            for (const lineName of Object.keys(mbtaStopsData)) {
                const stops = mbtaStopsData[lineName];
                if (!Array.isArray(stops)) continue;
                for (const stop of stops) {
                    if (!stop || !Array.isArray(stop.coords) || stop.coords.length !== 2) continue;
                    const sid = stop.stopId || `${stop.name}|${stop.coords[0]},${stop.coords[1]}`;
                    const fullKey = `mbta::${sid}`;
                    if (seenStops.has(fullKey)) continue;
                    // Use stopToRoutes for the full route list at transfer stations
                    const routes = (typeof stopToRoutes !== 'undefined' && stopToRoutes && stopToRoutes[sid])
                        ? stopToRoutes[sid].slice()
                        : [lineName];
                    const hasSubway = routes.some(r => r in MBTA_LINE_COLORS);
                    const lineKeys = routes.map(r => `mbta::${r}`);
                    const routeColors = routes.map(r => MBTA_LINE_COLORS[r] || MBTA_COMMUTER_COLOR);
                    // multiColored = stop serves multiple lines whose colors actually
                    // differ. Park Street (Red + Green) → multi. Govt Center (Blue +
                    // Green) → multi. JFK/UMass (Red + Mattapan, both red) → NOT multi
                    // since they share #DA291C. Drives the grey-fill logic on stops.
                    const multiColored = (new Set(routeColors)).size > 1;
                    // Header color in the popup uses a real line color even at multi
                    // stops. Prefer subway over commuter so e.g. South Station shows
                    // Red Line red rather than commuter purple.
                    const firstSubwayIdx = routes.findIndex(r => r in MBTA_LINE_COLORS);
                    const firstColor = firstSubwayIdx >= 0 ? routeColors[firstSubwayIdx] : routeColors[0];
                    const feature = {
                        type: 'Feature',
                        properties: {
                            agency: 'mbta',
                            mode: hasSubway ? 'subway' : 'commuter',
                            stopId: sid,
                            name: stop.name || '',
                            color: firstColor,
                            multiColored,
                            routes,
                            lineKeys
                        },
                        geometry: { type: 'Point', coordinates: [stop.coords[1], stop.coords[0]] }
                    };
                    seenStops.set(fullKey, feature);
                    stopFeatures.push(feature);
                }
            }
        }
    }

    // Amtrak has multiple distinct stations sharing a station NAME but with
    // different stop_ids and locations (e.g. NWK = Newark Penn, EWR = Newark
    // Liberty Airport — both labelled "Newark, New Jersey" in the feed). Mapping
    // these to disambiguated display names so the popup doesn't lie about which
    // station you're looking at.
    const AMTRAK_STOP_NAME_OVERRIDES = {
        'NWK': 'Newark Penn Station',
        'EWR': 'Newark Liberty Airport',
        'NRK': 'Newark, Delaware'
    };

    // Generic rail agency converter. Takes the standard shape:
    //   data.routes[lineName] = { color, shapes:[{coords}], stops:[{stop_id,name,lat,lon}] }
    function appendRailAgency(agency, lineFeatures, stopFeatures, seenStops) {
        const data = window[agency.dataVar];
        if (!data || !data.routes) return 0;
        let lineCount = 0, stopCount = 0;
        for (const lineName of Object.keys(data.routes)) {
            const route = data.routes[lineName];
            if (!route) continue;
            let color = normalizeColor(route.color, agency.defaultColor);
            // Amtrak's GTFS feed marks every route with the brand light blue
            // (#CAE4F1) which is essentially invisible on a light raster
            // basemap. SLE uses the same wash-out color in its feed. Force
            // legible blues (Amtrak: mid-corporate; SLE: brighter, distinct).
            if (agency.key === 'amtrak')          color = '#1F6BB5';
            // SLE: lighter blue so it visually distinguishes from Amtrak NEC
            // (which it shares track with for most of CT — same geometry).
            if (agency.key === 'shore_line_east') color = '#5DADE2';
            const lineKey = `${agency.key}::${lineName}`;

            // MTA Subway B-train fallback: the GTFS feed sometimes ships B with 0
            // shapes; the existing app borrows from the D, F, or M trunk so the
            // line still draws. Same priority order.
            let shapesToRender = route.shapes;
            if (agency.key === 'mta_subway' && lineName === 'B' &&
                (!Array.isArray(shapesToRender) || shapesToRender.length === 0)) {
                const fallback = data.routes['D'] || data.routes['F'] || data.routes['M'];
                if (fallback && Array.isArray(fallback.shapes) && fallback.shapes.length > 0) {
                    shapesToRender = fallback.shapes;
                }
            }

            if (Array.isArray(shapesToRender)) {
                for (const shape of shapesToRender) {
                    if (!shape || !Array.isArray(shape.coords) || shape.coords.length < 2) continue;
                    const coords = new Array(shape.coords.length);
                    for (let i = 0; i < shape.coords.length; i++) {
                        coords[i] = [shape.coords[i][1], shape.coords[i][0]];
                    }
                    lineFeatures.push({
                        type: 'Feature',
                        properties: {
                            agency: agency.key, mode: agency.mode, line: lineName, lineKey, color
                        },
                        geometry: { type: 'LineString', coordinates: coords }
                    });
                    lineCount++;
                }
            }

            if (Array.isArray(route.stops)) {
                for (const stop of route.stops) {
                    if (!stop || typeof stop.lat !== 'number' || typeof stop.lon !== 'number') continue;
                    // SLE corridor filter: the SLE GTFS feed mistakenly lists
                    // Stamford and Bridgeport (Metro-North territory). Same
                    // bbox as the Leaflet app's loadShoreLineEastStations.
                    if (agency.key === 'shore_line_east') {
                        if (stop.lat < 41.25 || stop.lat > 41.40 ||
                            stop.lon < -72.95 || stop.lon > -72.05) continue;
                    }
                    const sid = stop.stop_id || stop.stopId || `${stop.name}|${stop.lat},${stop.lon}`;
                    const fullKey = `${agency.key}::${sid}`;
                    const existing = seenStops.get(fullKey);
                    if (existing) {
                        // Same stop, different route — merge.
                        if (!existing.properties.routes.includes(lineName)) {
                            existing.properties.routes.push(lineName);
                            existing.properties.lineKeys.push(lineKey);
                            // Flip multiColored only when the new route brings a
                            // *different* color. Branches that share a color
                            // (e.g. several Amtrak NEC services in the same blue)
                            // keep the line color instead of falling back to grey.
                            if (color !== existing.properties.color) {
                                existing.properties.multiColored = true;
                            }
                        }
                        continue;
                    }
                    let displayName = stop.name || '';
                    if (agency.key === 'amtrak' && AMTRAK_STOP_NAME_OVERRIDES[sid]) {
                        displayName = AMTRAK_STOP_NAME_OVERRIDES[sid];
                    }
                    const feature = {
                        type: 'Feature',
                        properties: {
                            agency: agency.key,
                            mode: agency.mode,
                            stopId: sid,
                            name: displayName,
                            color,
                            multiColored: false,
                            routes: [lineName],
                            lineKeys: [lineKey]
                        },
                        geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] }
                    };
                    seenStops.set(fullKey, feature);
                    stopFeatures.push(feature);
                    stopCount++;
                }
            }
        }
        return { lines: lineCount, stops: stopCount };
    }

    // Shore Line East's GTFS feed publishes stops but not track shapes — the
    // service runs on Amtrak's NEC tracks. Mirror the Leaflet app's workaround:
    // extract Amtrak Northeast Regional / Acela coords inside the CT coastline
    // bbox (New Haven → New London) and use those as the SLE line geometry.
    function maybeExtractShoreLineEastFromAmtrak(lineFeatures) {
        // Skip if the data file ever gets updated to include real shapes.
        if (lineFeatures.some(f => f.properties.agency === 'shore_line_east')) return;
        if (typeof amtrakRoutesData === 'undefined' || !amtrakRoutesData || !amtrakRoutesData.routes) return;
        const sleData = (typeof shoreLineEastRoutesData !== 'undefined') ? shoreLineEastRoutesData : null;
        if (!sleData || !sleData.routes) return;
        const lineName = Object.keys(sleData.routes)[0];
        const route = sleData.routes[lineName];
        if (!route) return;
        // Force the override here too — the SLE data file's #CAE4F1 washes out
        // and would mismatch the stop color (which appendRailAgency sets to
        // the same SLE blue). Both must use the same value.
        const color = '#5DADE2';
        const lineKey = `shore_line_east::${lineName}`;

        // CT coast bbox — same numbers as app.js.
        const LAT_MIN = 41.25, LAT_MAX = 41.40, LON_MIN = -72.95, LON_MAX = -72.05;
        for (const amtrakRouteName of ['Northeast Regional', 'Acela']) {
            const amtrakRoute = amtrakRoutesData.routes[amtrakRouteName];
            if (!amtrakRoute || !Array.isArray(amtrakRoute.shapes)) continue;
            for (const shape of amtrakRoute.shapes) {
                if (!shape || !Array.isArray(shape.coords)) continue;
                const filtered = [];
                for (const c of shape.coords) {
                    const lat = c[0], lon = c[1];
                    if (lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX) {
                        filtered.push([lon, lat]);
                    }
                }
                if (filtered.length > 10) {
                    lineFeatures.push({
                        type: 'Feature',
                        properties: {
                            agency: 'shore_line_east', mode: 'commuter', line: lineName, lineKey, color
                        },
                        geometry: { type: 'LineString', coordinates: filtered }
                    });
                    return;
                }
            }
        }
    }

    // MBTA surface modes (bus, Silver Line, shuttle, ferry). All four follow the
    // same shape — `dataVar` is keyed by route name with stop arrays, `shapesVar`
    // is keyed by route name with shape arrays — but they each have their own
    // visual treatment (line width / dash / color). One generic appender; the
    // per-mode style differences happen at the layer level.
    //
    // Bus routes whose name happens to collide with an MBTA subway line in
    // `mbtaStopsData` (an artifact of GTFS sometimes emitting duplicate IDs)
    // are skipped — same guard as the Leaflet app.
    function appendMbtaSurfaceMode(opts, lineFeatures, stopFeatures, seenStops) {
        const stopsData  = opts.getStops ? opts.getStops() : null;
        const shapesData = opts.getShapes ? opts.getShapes() : null;
        if (!stopsData) return { lines: 0, stops: 0 };
        let lineCount = 0, stopCount = 0;

        // First pass: build stop_id → routes-serving-it map for multi-route stops.
        const stopToLines = new Map();
        for (const lineName of Object.keys(stopsData)) {
            if (typeof mbtaStopsData !== 'undefined' && mbtaStopsData &&
                (mbtaStopsData[lineName] || mbtaStopsData[Number(lineName)])) continue;
            const stops = stopsData[lineName];
            if (!Array.isArray(stops)) continue;
            for (const stop of stops) {
                if (!stop || !Array.isArray(stop.coords)) continue;
                const sid = stop.stopId || `${stop.name}|${stop.coords[0]},${stop.coords[1]}`;
                if (!stopToLines.has(sid)) stopToLines.set(sid, []);
                const arr = stopToLines.get(sid);
                if (!arr.includes(lineName)) arr.push(lineName);
            }
        }

        // Second pass: emit features.
        for (const lineName of Object.keys(stopsData)) {
            if (typeof mbtaStopsData !== 'undefined' && mbtaStopsData &&
                (mbtaStopsData[lineName] || mbtaStopsData[Number(lineName)])) continue;

            const color = opts.defaultColor;
            const lineKey = `mbta-${opts.mode}::${lineName}`;

            // Lines via shapes (if present).
            if (shapesData && Array.isArray(shapesData[lineName])) {
                for (const shape of shapesData[lineName]) {
                    if (!shape || !Array.isArray(shape.coords) || shape.coords.length < 2) continue;
                    const coords = new Array(shape.coords.length);
                    for (let i = 0; i < shape.coords.length; i++) {
                        coords[i] = [shape.coords[i][1], shape.coords[i][0]];
                    }
                    lineFeatures.push({
                        type: 'Feature',
                        properties: {
                            agency: 'mbta', mode: opts.mode, line: lineName, lineKey, color
                        },
                        geometry: { type: 'LineString', coordinates: coords }
                    });
                    lineCount++;
                }
            }

            // Stops, deduped by stop_id within this mode.
            const stops = stopsData[lineName];
            if (!Array.isArray(stops)) continue;
            for (const stop of stops) {
                if (!stop || !Array.isArray(stop.coords)) continue;
                const sid = stop.stopId || `${stop.name}|${stop.coords[0]},${stop.coords[1]}`;
                const fullKey = `mbta-${opts.mode}::${sid}`;
                if (seenStops.has(fullKey)) continue;
                const routes = (stopToLines.get(sid) || [lineName]).slice();
                const lineKeys = routes.map(r => `mbta-${opts.mode}::${r}`);
                const feature = {
                    type: 'Feature',
                    properties: {
                        agency: 'mbta',
                        mode: opts.mode,
                        stopId: sid,
                        name: stop.name || '',
                        color,
                        // Single-color mode (all bus yellow, all silver grey, etc.)
                        // → never multi-colored at a transfer.
                        multiColored: false,
                        routes,
                        lineKeys
                    },
                    geometry: { type: 'Point', coordinates: [stop.coords[1], stop.coords[0]] }
                };
                seenStops.set(fullKey, feature);
                stopFeatures.push(feature);
                stopCount++;
            }
        }
        return { lines: lineCount, stops: stopCount };
    }

    function buildAllRailGeoJSON() {
        const lineFeatures = [];
        const stopFeatures = [];
        const seenStops = new Map();
        appendMbta(lineFeatures, stopFeatures, seenStops);
        const stats = { mbta: { lines: lineFeatures.length, stops: stopFeatures.length } };
        for (const agency of RAIL_AGENCIES) {
            const before = { lines: lineFeatures.length, stops: stopFeatures.length };
            appendRailAgency(agency, lineFeatures, stopFeatures, seenStops);
            stats[agency.key] = {
                lines: lineFeatures.length - before.lines,
                stops: stopFeatures.length - before.stops
            };
        }
        // SLE has no shapes in its own feed — borrow from Amtrak NEC. Run after
        // the main loop so we can detect the empty case.
        const sleBefore = lineFeatures.length;
        maybeExtractShoreLineEastFromAmtrak(lineFeatures);
        if (lineFeatures.length > sleBefore) {
            stats.shore_line_east = {
                lines: (stats.shore_line_east?.lines || 0) + (lineFeatures.length - sleBefore),
                stops: stats.shore_line_east?.stops || 0
            };
        }

        // MBTA surface modes (bus, Silver Line, shuttle, ferry). Tagged with
        // `mbta-{mode}` keys so they don't collide with subway/commuter MBTA
        // entries already loaded above.
        for (const opts of SURFACE_MODES) {
            const counts = appendMbtaSurfaceMode(opts, lineFeatures, stopFeatures, seenStops);
            stats[`mbta_${opts.mode}`] = counts;
        }

        return {
            lines: { type: 'FeatureCollection', features: lineFeatures },
            stops: { type: 'FeatureCollection', features: stopFeatures },
            stats
        };
    }

    // ─── Wire-up ────────────────────────────────────────────────────────────────

    map.on('load', () => {
        const t0 = performance.now();
        const data = buildAllRailGeoJSON();
        const tBuilt = performance.now();

        map.addSource('transit-routes', { type: 'geojson', data: data.lines, tolerance: 0.5 });
        map.addSource('transit-stops',  { type: 'geojson', data: data.stops });

        // Line layers, bottom→top by mode. Amtrak (intercity, runs the whole
        // corridor) sits beneath commuter rail; commuter beneath subway, so
        // dense urban subway lines paint over the bigger structures. Surface
        // modes (bus, ferry, …) sit beneath rail entirely.
        map.addLayer({
            id: 'mbta-bus-line',
            type: 'line',
            source: 'transit-routes',
            filter: ['==', ['get', 'mode'], 'bus'],
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.0, 12, 4.0, 16, 6.0],
                'line-opacity': 0.7
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
        map.addLayer({
            id: 'mbta-silver-line',
            type: 'line',
            source: 'transit-routes',
            filter: ['==', ['get', 'mode'], 'silver_line'],
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.0, 12, 2.2, 16, 3.5],
                'line-opacity': 0.85
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
        map.addLayer({
            id: 'mbta-shuttle-line',
            type: 'line',
            source: 'transit-routes',
            filter: ['==', ['get', 'mode'], 'shuttle'],
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.0, 12, 2.0, 16, 3.0],
                'line-opacity': 0.85
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
        map.addLayer({
            id: 'mbta-ferry-line',
            type: 'line',
            source: 'transit-routes',
            filter: ['==', ['get', 'mode'], 'ferry'],
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 12, 2.5, 16, 3.5],
                'line-opacity': 0.85,
                'line-dasharray': [3, 2]
            },
            layout: { 'line-cap': 'butt', 'line-join': 'round' }
        });
        map.addLayer({
            id: 'rail-amtrak-line',
            type: 'line',
            source: 'transit-routes',
            filter: ['==', ['get', 'mode'], 'amtrak'],
            paint: {
                'line-color': ['get', 'color'],
                // Amtrak runs the whole NEC corridor and beyond — needs to be
                // legible at low zoom too, where the user is panning across
                // states. Bump width and full opacity for stronger presence.
                'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.5, 12, 3, 16, 4.5],
                'line-opacity': 1
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
        map.addLayer({
            id: 'rail-commuter-line',
            type: 'line',
            source: 'transit-routes',
            // Excludes SLE — it gets its own layer below with thicker line
            // width. Without that, SLE's single borrowed shape disappears
            // among denser overlapping commuter shapes elsewhere.
            filter: ['all',
                ['==', ['get', 'mode'], 'commuter'],
                ['!', ['==', ['get', 'agency'], 'shore_line_east']]
            ],
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 12, 2.5, 16, 4],
                'line-opacity': 0.85
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
        map.addLayer({
            id: 'rail-sle-line',
            type: 'line',
            source: 'transit-routes',
            filter: ['all',
                ['==', ['get', 'mode'], 'commuter'],
                ['==', ['get', 'agency'], 'shore_line_east']
            ],
            paint: {
                'line-color': ['get', 'color'],
                // Thicker than the shared commuter layer so SLE's solo borrowed
                // shape reads with proper presence on the map.
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 12, 4, 16, 5],
                'line-opacity': 1
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
        map.addLayer({
            id: 'rail-subway-line',
            type: 'line',
            source: 'transit-routes',
            filter: ['==', ['get', 'mode'], 'subway'],
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 12, 3, 16, 5]
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
        // MTA Subway dual-layer: a thin black "inner" line drawn on top of the
        // colored line, the same trick the Leaflet app uses to visually separate
        // NYC subway from commuter rail. Filtered to mode=subway AND agency=
        // mta_subway so MBTA subway lines stay single-layer.
        map.addLayer({
            id: 'rail-subway-mta-center',
            type: 'line',
            source: 'transit-routes',
            filter: ['all', ['==', ['get', 'mode'], 'subway'], ['==', ['get', 'agency'], 'mta_subway']],
            paint: {
                'line-color': '#000000',
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.3, 12, 0.6, 16, 1.0],
                'line-opacity': 0.6
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });

        // Single stop layer for all rail. Stops whose routes have *differing*
        // colors fill grey; stops where every serving line is the same color
        // (e.g. JFK/UMass on Red Line + Mattapan, both red) keep the color.
        const stopRadiusExpr = [
            'interpolate', ['linear'], ['zoom'],
            6,  1.5,
            8,  2.5,
            12, 4.5,
            16, 6.5
        ];
        const stopFillExpr = [
            'case',
            ['get', 'multiColored'], '#D3D3D3',
            ['get', 'color']
        ];
        // Thinner white outline overall and noticeably thinner at high zoom,
        // where the stop circles get big and a heavy ring starts to crowd out
        // the fill color. Single source of truth so the highlight system can
        // re-apply it if needed.
        const stopStrokeWidthExpr = [
            'interpolate', ['linear'], ['zoom'],
            8,  0.6,
            12, 0.5,
            16, 0.4
        ];
        // rail-stops is filtered to rail modes only — surface stops use
        // separate layers below with their own (smaller) radius and zoom gates.
        const RAIL_MODES = ['subway', 'commuter', 'amtrak'];
        map.addLayer({
            id: 'rail-stops',
            type: 'circle',
            source: 'transit-stops',
            filter: ['in', ['get', 'mode'], ['literal', RAIL_MODES]],
            paint: {
                'circle-radius': stopRadiusExpr,
                'circle-color': stopFillExpr,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': stopStrokeWidthExpr,
                'circle-opacity': 0.9
            }
        });

        // Zero-out the default 300 ms transition on every opacity property the
        // highlight system touches. MapLibre's default 300 ms transition behaves
        // inconsistently when the property toggles between a constant and a
        // data-driven case-expression — some features transition, others snap
        // immediately, so highlight click feels instant one moment and laggy
        // the next. Setting duration: 0 makes every paint update apply on the
        // next frame, uniformly.
        const NO_TRANSITION = { duration: 0, delay: 0 };
        const HIGHLIGHT_LINE_LAYERS = [
            'rail-subway-line', 'rail-subway-mta-center',
            'rail-commuter-line', 'rail-sle-line', 'rail-amtrak-line',
            'mbta-bus-line', 'mbta-silver-line', 'mbta-shuttle-line', 'mbta-ferry-line'
        ];
        const HIGHLIGHT_CIRCLE_LAYERS = [
            'rail-stops',
            'mbta-bus-stops', 'mbta-silver-line-stops', 'mbta-shuttle-stops', 'mbta-ferry-stops'
        ];
        for (const id of HIGHLIGHT_LINE_LAYERS) {
            if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity-transition', NO_TRANSITION);
        }
        for (const id of HIGHLIGHT_CIRCLE_LAYERS) {
            if (map.getLayer(id)) {
                map.setPaintProperty(id, 'circle-opacity-transition', NO_TRANSITION);
                map.setPaintProperty(id, 'circle-stroke-opacity-transition', NO_TRANSITION);
            }
        }

        // ─── Stage 7: combined cross-agency stations ─────────────────────────
        // Penn Station / Newark Penn / South Station / etc. — stations served
        // by multiple agencies. Pre-computed combined-stations.json (built by
        // scripts/build-amtrak-connections.py + amtrak-connections.js) lists
        // each multi-system station with its `lat,lon,name,systems[]` where
        // each system carries the agency name and the routes it serves.
        //
        // Mapping from the JSON's `system` strings to my agency keys, so
        // routes like "Red Line" (system="MBTA") get the right lineKey
        // ("mbta::Red Line") for the highlight filter.
        const COMBINED_SYSTEM_TO_AGENCY = {
            'MBTA':                  'mbta',
            'MTA Subway':            'mta_subway',
            'LIRR':                  'lirr',
            'Long Island Rail Road': 'lirr',
            'Metro-North':           'metro_north',
            'Metro North':           'metro_north',
            'NJ Transit':            'nj_transit',
            'SEPTA':                 'septa',
            'Amtrak':                'amtrak',
            'CTrail Shore Line East':'shore_line_east',
            'Shore Line East':       'shore_line_east',
            'CTrail Hartford Line':  'hartford_line',
            'Hartford Line':         'hartford_line'
        };
        // Build the GeoJSON for combined stations from the loaded JSON. Each
        // feature stores both `systems` (for the popup body) and a flat
        // `lineKeys` array combining every (agency, route) pair (for the
        // highlight filter — same shape as the per-agency stop `lineKeys`,
        // so the existing `stopMatch` expression also dims/shows these).
        function buildCombinedStationsGeoJSON(jsonData) {
            const features = [];
            for (const [stationName, station] of Object.entries(jsonData || {})) {
                if (typeof station.lat !== 'number' || typeof station.lon !== 'number') continue;
                if (!Array.isArray(station.systems) || station.systems.length < 2) continue;
                const lineKeys = [];
                for (const sys of station.systems) {
                    const agencyKey = COMBINED_SYSTEM_TO_AGENCY[sys.system];
                    if (!agencyKey || !Array.isArray(sys.routes)) continue;
                    for (const r of sys.routes) lineKeys.push(`${agencyKey}::${r}`);
                }
                if (lineKeys.length === 0) continue;
                features.push({
                    type: 'Feature',
                    properties: {
                        name:    station.name || stationName,
                        systems: station.systems,    // for popup
                        lineKeys                      // for filter / highlight
                    },
                    geometry: { type: 'Point', coordinates: [station.lon, station.lat] }
                });
            }
            return { type: 'FeatureCollection', features };
        }
        map.addSource('combined-stations', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        // Gold markers (#FFD700) with white border, slightly larger than rail
        // stops, drawn on top of everything else so transfer hubs are obvious.
        map.addLayer({
            id: 'combined-stations',
            type: 'circle',
            source: 'combined-stations',
            paint: {
                'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    6, 2.5, 8, 4, 12, 6, 16, 8
                ],
                'circle-color': '#FFD700',
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': stopStrokeWidthExpr,
                'circle-opacity': 1,
                'circle-opacity-transition': NO_TRANSITION,
                'circle-stroke-opacity-transition': NO_TRANSITION
            }
        });
        // Fetch the data (async). Same path the legacy app uses.
        fetch('data/combined-stations.json')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                const src = map.getSource('combined-stations');
                if (src) src.setData(buildCombinedStationsGeoJSON(data));
            })
            .catch(e => console.warn('[maplibre] combined-stations load failed:', e && e.message));

        // Surface-mode stops. Bus stops are tens of thousands strong and would
        // turn the map into yellow noise at low zoom — gate them to zoom ≥ 13.
        // Silver Line and shuttle similarly. Ferry has only a handful of
        // terminals; keep them visible at all zooms, slightly larger than bus.
        map.addLayer({
            id: 'mbta-bus-stops',
            type: 'circle',
            source: 'transit-stops',
            filter: ['==', ['get', 'mode'], 'bus'],
            minzoom: 13,
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 16, 2.5, 18, 3.5],
                'circle-color': ['get', 'color'],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 0.4,
                'circle-opacity': 0.85
            }
        });
        map.addLayer({
            id: 'mbta-silver-line-stops',
            type: 'circle',
            source: 'transit-stops',
            filter: ['==', ['get', 'mode'], 'silver_line'],
            minzoom: 12,
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 3.5],
                'circle-color': ['get', 'color'],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 0.5,
                'circle-opacity': 0.9
            }
        });
        map.addLayer({
            id: 'mbta-shuttle-stops',
            type: 'circle',
            source: 'transit-stops',
            filter: ['==', ['get', 'mode'], 'shuttle'],
            minzoom: 12,
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 3.5],
                'circle-color': ['get', 'color'],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 0.5,
                'circle-opacity': 0.9
            }
        });
        map.addLayer({
            id: 'mbta-ferry-stops',
            type: 'circle',
            source: 'transit-stops',
            filter: ['==', ['get', 'mode'], 'ferry'],
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 12, 4.5, 16, 6.5],
                'circle-color': ['get', 'color'],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': stopStrokeWidthExpr,
                'circle-opacity': 0.9
            }
        });

        // ─── Hover popup ────────────────────────────────────────────────────────
        const lineLayers = [
            'rail-subway-line', 'rail-commuter-line', 'rail-sle-line', 'rail-amtrak-line',
            'mbta-bus-line', 'mbta-silver-line', 'mbta-shuttle-line', 'mbta-ferry-line'
        ];
        const stopLayers = [
            'rail-stops',
            'mbta-bus-stops', 'mbta-silver-line-stops', 'mbta-shuttle-stops', 'mbta-ferry-stops'
        ];
        let hoverPopup = null;

        function showHoverPopup(feature) {
            const p = feature.properties || {};
            const routesList = parseRoutes(p.routes);
            const agencyLabel = AGENCY_LABEL_BY_KEY[p.agency] || p.agency || '';
            // For MBTA (only agency that mixes modes per stop), determine the
            // mode-mix dynamically from the routes; for everyone else the agency
            // mode is the truth.
            let modeLabel;
            if (p.agency === 'mbta') {
                const hasSubway   = routesList.some(r => r in MBTA_LINE_COLORS);
                const hasCommuter = routesList.some(r => !(r in MBTA_LINE_COLORS));
                modeLabel = (hasSubway && hasCommuter) ? 'Subway + Commuter Rail'
                          : hasSubway ? 'Subway / Light Rail'
                          : 'Commuter Rail';
            } else {
                modeLabel = MODE_LABEL[p.mode] || 'Rail';
            }
            const lineLabel = routesList.length === 1 ? 'Line' : 'Lines';
            const html = `
                <div style="font-size:12px;line-height:1.4">
                    <div style="font-weight:600;color:${p.color};margin-bottom:2px">${escapeHtml(p.name || 'Stop')}</div>
                    <div style="color:#64748b;font-size:11px;margin-bottom:4px">${escapeHtml(agencyLabel)} &bull; ${escapeHtml(modeLabel)}</div>
                    <div><b>${lineLabel}:</b> ${escapeHtml(routesList.join(', '))}</div>
                </div>`;
            if (!hoverPopup) {
                hoverPopup = new maplibregl.Popup({
                    closeButton: false, closeOnClick: false, maxWidth: '260px', offset: 8
                });
            }
            hoverPopup.setLngLat(feature.geometry.coordinates).setHTML(html).addTo(map);
            const popupEl = hoverPopup.getElement();
            if (popupEl) popupEl.style.pointerEvents = 'none';
        }
        function hideHoverPopup() { if (hoverPopup) hoverPopup.remove(); }

        // Track the stop feature currently under the cursor. Click handler
        // prefers this over queryRenderedFeatures' first result, so the stop
        // shown in the tooltip is always the one selected on click — they
        // can't drift apart when stops overlap inside the 6 px click bbox.
        let hoveredStopFeature = null;
        let hoveredVehicleFeature = null;
        // Same for combined-station gold markers — these draw on top of
        // regular stops and need their own popup + click semantics.
        let hoveredCombinedFeature = null;

        // Build the vehicle hover popup HTML. Extracted from the inline mouseenter
        // so the priority-based refreshHoverPopup() can re-show it when a stop
        // mouseenter fires AFTER a vehicle mouseenter (which would otherwise
        // clobber the vehicle popup with the stop popup).
        function showVehicleHoverPopup(feature) {
            const p = feature.properties || {};
            const statusLabel = (p.status === 'STOPPED_AT') ? 'Stopped at station'
                              : (p.status === 'INCOMING_AT') ? 'Approaching station'
                              : (p.status === 'IN_TRANSIT_TO') ? 'In transit'
                              : (p.status || '');
            const html = `
                <div style="font-size:12px;line-height:1.4">
                    <div style="font-weight:600;color:${p.color};margin-bottom:2px">${escapeHtml(p.line || 'Live vehicle')}</div>
                    <div style="color:#64748b;font-size:11px;margin-bottom:4px">Live &bull; Vehicle ${escapeHtml(p.label || p.id || '')}</div>
                    ${p.headsign ? `<div><b>Heading:</b> ${escapeHtml(p.headsign)}</div>` : ''}
                    ${statusLabel ? `<div><b>Status:</b> ${escapeHtml(statusLabel)}</div>` : ''}
                </div>`;
            if (!hoverPopup) {
                hoverPopup = new maplibregl.Popup({
                    closeButton: false, closeOnClick: false, maxWidth: '260px', offset: 10
                });
            }
            hoverPopup.setLngLat(feature.geometry.coordinates).setHTML(html).addTo(map);
            const popupEl = hoverPopup.getElement();
            if (popupEl) popupEl.style.pointerEvents = 'none';
        }

        // Single point of popup truth. Whenever any mouseenter/leave fires, it
        // updates the relevant `hoveredXFeature` and then calls this — so the
        // popup always reflects the HIGHEST-priority hover regardless of what
        // order MapLibre dispatches the layer events in. Without this, a stop
        // mouseenter firing after a vehicle mouseenter would replace the
        // vehicle popup with a stop popup even though the cursor is still on
        // the vehicle visually.
        // Priority: vehicle > combined-station > stop.
        function refreshHoverPopup() {
            if (hoveredVehicleFeature) {
                showVehicleHoverPopup(hoveredVehicleFeature);
            } else if (hoveredCombinedFeature) {
                showCombinedHoverPopup(hoveredCombinedFeature);
            } else if (hoveredStopFeature) {
                showHoverPopup(hoveredStopFeature);
            } else {
                hideHoverPopup();
            }
        }

        function showCombinedHoverPopup(feature) {
            const p = feature.properties || {};
            const name = p.name || 'Station';
            // systems comes back as a JSON-stringified array via the property
            // serialization, just like the routes property on stops.
            let systems = p.systems;
            if (typeof systems === 'string') {
                try { systems = JSON.parse(systems); } catch (_) { systems = []; }
            }
            if (!Array.isArray(systems)) systems = [];
            const systemRows = systems.map(s => {
                const routes = Array.isArray(s.routes) ? s.routes : [];
                const shown = routes.slice(0, 3).join(', ');
                const more = routes.length > 3 ? ` <span style="color:#94a3b8">(+${routes.length - 3} more)</span>` : '';
                return `<div><b>${escapeHtml(s.system)}:</b> ${escapeHtml(shown)}${more}</div>`;
            }).join('');
            const html = `
                <div style="font-size:12px;line-height:1.4">
                    <div style="font-weight:600;color:#DAA520;margin-bottom:2px">${escapeHtml(name)}</div>
                    <div style="color:#64748b;font-size:11px;margin-bottom:4px">Multi-System Station</div>
                    ${systemRows}
                </div>`;
            if (!hoverPopup) {
                hoverPopup = new maplibregl.Popup({
                    closeButton: false, closeOnClick: false, maxWidth: '280px', offset: 8
                });
            }
            hoverPopup.setLngLat(feature.geometry.coordinates).setHTML(html).addTo(map);
            const el = hoverPopup.getElement();
            if (el) el.style.pointerEvents = 'none';
        }
        function updateStopHover(e) {
            const f = pickClosestFeature(e.features, e.point);
            if (!f || !isStopVisibleNow(f.properties)) return;
            map.getCanvas().style.cursor = 'pointer';
            if (hoveredStopFeature === f) return;
            hoveredStopFeature = f;
            refreshHoverPopup();
        }
        for (const layerId of stopLayers) {
            map.on('mouseenter', layerId, updateStopHover);
            map.on('mousemove',  layerId, updateStopHover);
            map.on('mouseleave', layerId, () => {
                map.getCanvas().style.cursor = '';
                hoveredStopFeature = null;
                refreshHoverPopup();
            });
        }
        function updateCombinedHover(e) {
            const f = pickClosestFeature(e.features, e.point);
            if (!f) return;
            map.getCanvas().style.cursor = 'pointer';
            if (hoveredCombinedFeature === f) return;
            hoveredCombinedFeature = f;
            refreshHoverPopup();
        }
        map.on('mouseenter', 'combined-stations', updateCombinedHover);
        map.on('mousemove',  'combined-stations', updateCombinedHover);
        map.on('mouseleave', 'combined-stations', () => {
            map.getCanvas().style.cursor = '';
            hoveredCombinedFeature = null;
            refreshHoverPopup();
        });
        for (const layerId of lineLayers) {
            map.on('mouseenter', layerId, (e) => {
                const f = e.features && e.features[0];
                if (!f || !isLineVisibleNow(f.properties)) return;
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
        }

        // ─── Highlight system ───────────────────────────────────────────────────
        // Keyed by `lineKey` (agency::line) — disambiguates MTA Subway "1" from
        // any other agency that happens to use the same line label. Visual
        // dimming uses paint-opacity expressions (not setFilter) so MapLibre's
        // built-in 300 ms paint-property transition gives a smooth fade in/out
        // — the "loading in/out" feel from before. Hit-testing on dimmed
        // features is suppressed in JS (see isStopVisibleNow / isLineVisibleNow)
        // so tooltips and clicks still don't reach hidden stops.
        let highlightedLineKeys = [];
        const DEFAULT_LINE_OPACITY = {
            'rail-subway-line':       1,
            'rail-subway-mta-center': 0.6,
            'rail-commuter-line':     0.85,
            'rail-sle-line':          1,
            'rail-amtrak-line':       1,
            'mbta-bus-line':          0.7,
            'mbta-silver-line':       0.85,
            'mbta-shuttle-line':      0.85,
            'mbta-ferry-line':        0.85
        };
        const DEFAULT_STOP_OPACITY = {
            'rail-stops':             { circle: 0.9,  stroke: 1 },
            'mbta-bus-stops':         { circle: 0.85, stroke: 1 },
            'mbta-silver-line-stops': { circle: 0.9,  stroke: 1 },
            'mbta-shuttle-stops':     { circle: 0.9,  stroke: 1 },
            'mbta-ferry-stops':       { circle: 0.9,  stroke: 1 }
        };
        const HIGHLIGHTED_CENTER_OPACITY = 0.6;

        function applyHighlight(lineKeys) {
            highlightedLineKeys = Array.isArray(lineKeys) ? lineKeys.slice() : [];
            if (highlightedLineKeys.length === 0) {
                for (const id of Object.keys(DEFAULT_LINE_OPACITY)) {
                    map.setPaintProperty(id, 'line-opacity', DEFAULT_LINE_OPACITY[id]);
                }
                for (const id of Object.keys(DEFAULT_STOP_OPACITY)) {
                    map.setPaintProperty(id, 'circle-opacity',        DEFAULT_STOP_OPACITY[id].circle);
                    map.setPaintProperty(id, 'circle-stroke-opacity', DEFAULT_STOP_OPACITY[id].stroke);
                }
                if (map.getLayer('live-vehicles')) {
                    map.setPaintProperty('live-vehicles', 'icon-opacity', 1);
                }
                if (map.getLayer('combined-stations')) {
                    map.setPaintProperty('combined-stations', 'circle-opacity', 1);
                    map.setPaintProperty('combined-stations', 'circle-stroke-opacity', 1);
                }
                return;
            }
            const lineMatch = ['in', ['get', 'lineKey'], ['literal', highlightedLineKeys]];
            const stopMatch = highlightedLineKeys.length === 1
                ? ['in', highlightedLineKeys[0], ['get', 'lineKeys']]
                : ['any', ...highlightedLineKeys.map(k => ['in', k, ['get', 'lineKeys']])];

            // Lines
            for (const id of Object.keys(DEFAULT_LINE_OPACITY)) {
                const onValue = (id === 'rail-subway-mta-center') ? HIGHLIGHTED_CENTER_OPACITY : DEFAULT_LINE_OPACITY[id];
                map.setPaintProperty(id, 'line-opacity', ['case', lineMatch, onValue, 0]);
            }
            // Stops
            for (const id of Object.keys(DEFAULT_STOP_OPACITY)) {
                const d = DEFAULT_STOP_OPACITY[id];
                map.setPaintProperty(id, 'circle-opacity',        ['case', stopMatch, d.circle, 0]);
                map.setPaintProperty(id, 'circle-stroke-opacity', ['case', stopMatch, d.stroke, 0]);
            }
            // Live vehicles use single-lineKey match (like the line layers,
            // not the stops which carry a routes array).
            if (map.getLayer('live-vehicles')) {
                map.setPaintProperty('live-vehicles', 'icon-opacity', ['case', lineMatch, 1, 0]);
            }
            // Combined stations: keep the gold marker visible if ANY of its
            // serving (agency, route) lineKeys overlaps the highlight set;
            // otherwise fade. Same shape as stopMatch (lineKeys is an array).
            if (map.getLayer('combined-stations')) {
                map.setPaintProperty('combined-stations', 'circle-opacity',        ['case', stopMatch, 1, 0.08]);
                map.setPaintProperty('combined-stations', 'circle-stroke-opacity', ['case', stopMatch, 1, 0.08]);
            }
        }

        // Hit-test guards: when a highlight is active, treat features whose
        // lineKey isn't in the highlighted set as if they don't exist. Stops
        // pass if any of their lineKeys matches; lines pass if their lineKey
        // matches. Cheap to check and avoids tooltips on faded stops.
        function isStopVisibleNow(props) {
            if (highlightedLineKeys.length === 0) return true;
            const lineKeys = parseRoutes(props.lineKeys);
            for (const k of lineKeys) if (highlightedLineKeys.includes(k)) return true;
            return false;
        }
        function isLineVisibleNow(props) {
            if (highlightedLineKeys.length === 0) return true;
            return highlightedLineKeys.includes(props.lineKey);
        }

        function arraysEqualAsSets(a, b) {
            if (a.length !== b.length) return false;
            const sb = new Set(b);
            for (const x of a) if (!sb.has(x)) return false;
            return true;
        }

        // When icons overlap (e.g. E/C/A trains stacked at the same station),
        // MapLibre's `e.features[0]` and `queryRenderedFeatures(...)[0]` don't
        // always match the icon visually under the cursor — the order is by
        // source insertion, not rendered z-order or pixel distance. Pick the
        // feature whose projected center is closest to the cursor point so the
        // popup/highlight matches what the user actually sees.
        function pickClosestFeature(features, point) {
            if (!features || features.length === 0) return null;
            if (features.length === 1) return features[0];
            let best = features[0];
            let bestDist = Infinity;
            for (const f of features) {
                const c = f.geometry && f.geometry.coordinates;
                if (!c) continue;
                const pt = map.project(c);
                const dx = pt.x - point.x;
                const dy = pt.y - point.y;
                const dist = dx * dx + dy * dy;
                if (dist < bestDist) { bestDist = dist; best = f; }
            }
            return best;
        }

        // Compute the rendered icon size in pixels at the current zoom — same
        // interpolation as the `icon-size` paint property above. Used as the
        // click hit-test pad so the entire visible icon counts as clickable,
        // matching the icon's actual rendered footprint exactly.
        function currentIconRadiusPx() {
            const z = map.getZoom();
            const stops = [[7, 0.12], [8, 0.15], [10, 0.20], [11, 0.26], [12, 0.30], [14, 0.34]];
            let s;
            if (z <= stops[0][0]) s = stops[0][1];
            else if (z >= stops[stops.length - 1][0]) s = stops[stops.length - 1][1];
            else {
                for (let i = 0; i < stops.length - 1; i++) {
                    if (z >= stops[i][0] && z <= stops[i+1][0]) {
                        const t = (z - stops[i][0]) / (stops[i+1][0] - stops[i][0]);
                        s = stops[i][1] + t * (stops[i+1][1] - stops[i][1]);
                        break;
                    }
                }
            }
            return 48 * s / 2;    // 48 = normalized icon dim; /2 for radius
        }
        map.on('click', (e) => {
            hideHoverPopup();

            // INVARIANT: the popup and the click must select the same feature.
            // The hover state is the source of truth — whatever the popup is
            // showing IS what the click targets. No bbox queries can override
            // this. Falling back to queryRenderedFeatures only happens when
            // there's no active hover (touch devices, programmatic clicks).
            if (hoveredCombinedFeature) {
                const lineKeys = parseRoutes(hoveredCombinedFeature.properties.lineKeys);
                if (lineKeys.length === 0) { applyHighlight([]); return; }
                if (arraysEqualAsSets(highlightedLineKeys, lineKeys)) applyHighlight([]);
                else applyHighlight(lineKeys);
                return;
            }
            if (hoveredVehicleFeature && isLineVisibleNow(hoveredVehicleFeature.properties)) {
                const lk = hoveredVehicleFeature.properties.lineKey;
                if (!lk) { applyHighlight([]); return; }
                if (highlightedLineKeys.length === 1 && highlightedLineKeys[0] === lk) applyHighlight([]);
                else applyHighlight([lk]);
                return;
            }
            if (hoveredStopFeature && isStopVisibleNow(hoveredStopFeature.properties)) {
                const lineKeys = parseRoutes(hoveredStopFeature.properties.lineKeys);
                if (arraysEqualAsSets(highlightedLineKeys, lineKeys)) applyHighlight([]);
                else applyHighlight(lineKeys);
                return;
            }

            // No hover state — use bbox queries to figure out what got clicked.
            const TIGHT_PAD = 6;
            const VEHICLE_PAD = Math.max(10, Math.ceil(currentIconRadiusPx()));
            const tightBbox = [
                [e.point.x - TIGHT_PAD, e.point.y - TIGHT_PAD],
                [e.point.x + TIGHT_PAD, e.point.y + TIGHT_PAD]
            ];
            const vehicleBbox = [
                [e.point.x - VEHICLE_PAD, e.point.y - VEHICLE_PAD],
                [e.point.x + VEHICLE_PAD, e.point.y + VEHICLE_PAD]
            ];
            const tightFeatures = map.queryRenderedFeatures(tightBbox, {
                layers: [...stopLayers, ...lineLayers]
            });
            const vehicleFeatures = map.queryRenderedFeatures(vehicleBbox, {
                layers: ['live-vehicles']
            });
            const features = [...vehicleFeatures, ...tightFeatures];
            if (!features.length) {
                applyHighlight([]);
                return;
            }
            // Priority for the fallback path: vehicle > stop > line.
            const vehicleCandidates = features.filter(f => f.layer.id === 'live-vehicles' && isLineVisibleNow(f.properties));
            const vehicleHit = pickClosestFeature(vehicleCandidates, e.point);
            const stopHit = !vehicleHit
                ? features.find(f => stopLayers.includes(f.layer.id) && isStopVisibleNow(f.properties))
                : null;
            const lineHit = features.find(f => lineLayers.includes(f.layer.id) && isLineVisibleNow(f.properties));
            if (!vehicleHit && !stopHit && !lineHit) {
                applyHighlight([]);
                return;
            }
            if (vehicleHit) {
                const lk = vehicleHit.properties.lineKey;
                if (!lk) { applyHighlight([]); return; }
                if (highlightedLineKeys.length === 1 && highlightedLineKeys[0] === lk) applyHighlight([]);
                else applyHighlight([lk]);
            } else if (stopHit) {
                const lineKeys = parseRoutes(stopHit.properties.lineKeys);
                if (arraysEqualAsSets(highlightedLineKeys, lineKeys)) applyHighlight([]);
                else applyHighlight(lineKeys);
            } else if (lineHit) {
                const lk = lineHit.properties.lineKey;
                if (highlightedLineKeys.length === 1 && highlightedLineKeys[0] === lk) applyHighlight([]);
                else applyHighlight([lk]);
            }
        });

        const tDone = performance.now();
        const lineCount = data.lines.features.length;
        const stopCount = data.stops.features.length;
        console.log(`[maplibre] stage 5b: ${lineCount} lines, ${stopCount} stops ` +
                    `(build ${(tBuilt - t0).toFixed(0)}ms, render ${(tDone - tBuilt).toFixed(0)}ms)`);
        console.log('[maplibre] per-agency:', data.stats);

        // ─── Stage 6a: Live MBTA subway + commuter rail vehicles ──────────────
        // Public REST API, no auth, no protobuf — pull every 5 s and dump into a
        // GeoJSON source rendered by a symbol layer using the existing agency
        // icons (icons/readlinecirc.png, icons/orangelinecirc.png, …). Page-
        // visibility gate keeps polling out of background tabs.

        // Icon registry — one entry per visual sprite we'll need. Loaded into
        // the map's image cache once on stage-6 init; symbol layers reference
        // entries by name via `icon-image`. Note `readlinecirc` (sic — that's
        // the actual filename in the repo).
        const ICON_REGISTRY = {
            'mbta-red':          'icons/readlinecirc.png',
            'mbta-orange':       'icons/orangelinecirc.png',
            'mbta-blue':         'icons/bluelinecirc.png',
            'mbta-green':        'icons/greenlinecirc.png',
            'mbta-commuter':     'icons/commuterrailcirc.png',
            'mbta-bus':          'icons/buscirc.png',
            'mbta-silver-line':  'icons/silverlinecirc.png',
            'mta':               'icons/mtacirc.png',   // generic MTA (LIRR / Metro-North / MTA Subway)
            'amtrak':            'icons/amtrakcirc.png',
            // MTA subway letter/number icons. Files live in icons/<letter>.png.
            'mta-1': 'icons/1.png', 'mta-2': 'icons/2.png', 'mta-3': 'icons/3.png',
            'mta-4': 'icons/4.png', 'mta-5': 'icons/5.png', 'mta-6': 'icons/6.png',
            'mta-6d': 'icons/6d.png', 'mta-7': 'icons/7.png', 'mta-7d': 'icons/7d.png',
            'mta-a': 'icons/a.png', 'mta-b': 'icons/b.png', 'mta-c': 'icons/c.png',
            'mta-d': 'icons/d.png', 'mta-e': 'icons/e.png', 'mta-f': 'icons/f.png',
            'mta-fd': 'icons/fd.png', 'mta-g': 'icons/g.png', 'mta-h': 'icons/h.png',
            'mta-j': 'icons/j.png', 'mta-l': 'icons/l.png', 'mta-m': 'icons/m.png',
            'mta-n': 'icons/n.png', 'mta-q': 'icons/q.png', 'mta-r': 'icons/r.png',
            'mta-s': 'icons/s.png', 'mta-sf': 'icons/sf.png', 'mta-sir': 'icons/sir.png',
            'mta-sr': 'icons/sr.png', 'mta-t': 'icons/t.png', 'mta-w': 'icons/w.png',
            'mta-z': 'icons/z.png',
            // NJ Transit per-line icons (icons/njtransit/*). Names match the
            // NJ_TRANSIT_LINE_ICONS table in app.js so the same mapping logic
            // applies at fetch time.
            'njt-AC':   'icons/njtransit/AC_icon.png',
            'njt-BC':   'icons/njtransit/BC_icon.png',
            'njt-GS':   'icons/njtransit/GS_icon.png',
            'njt-HBLR': 'icons/njtransit/HBLR_icon.png',
            'njt-ML':   'icons/njtransit/ML_icon.png',
            'njt-MC':   'icons/njtransit/MC_icon.png',
            'njt-ME':   'icons/njtransit/ME_icon.png',
            'njt-NLR':  'icons/njtransit/NLR_icon.png',
            'njt-NC':   'icons/njtransit/NC_icon.png',
            'njt-NE':   'icons/njtransit/NE_icon.png',
            'njt-PV':   'icons/njtransit/PV_icon.png',
            'njt-PJ':   'icons/njtransit/MBPJ_MNBNP.png',
            'njt-PR':   'icons/njtransit/PR_icon.png',
            'njt-RV':   'icons/njtransit/RV_icon.png',
            'njt-RL':   'icons/njtransit/RL_icon.png'
        };

        // Source PNGs vary wildly in dimension (250–800 px), so a flat `icon-size`
        // factor would render the Red icon 3× larger than the commuter icon. To
        // get consistent on-screen pixel sizes the Leaflet app's getIconSize()
        // produces (10–26 px depending on zoom), normalize every loaded image
        // to a uniform 48 × 48 canvas before handing it to MapLibre. Then
        // `icon-size` is a uniform scale across all icons.
        const ICON_NORMALIZED_SIZE = 48;
        async function loadIconNormalized(name, url) {
            try {
                const result = await map.loadImage(url);
                if (!result || !result.data) return;
                const src = result.data;
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = ICON_NORMALIZED_SIZE;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                const scale = Math.min(ICON_NORMALIZED_SIZE / src.width, ICON_NORMALIZED_SIZE / src.height);
                const dw = src.width * scale, dh = src.height * scale;
                ctx.drawImage(src, (ICON_NORMALIZED_SIZE - dw) / 2, (ICON_NORMALIZED_SIZE - dh) / 2, dw, dh);
                if (!map.hasImage(name)) {
                    map.addImage(name, ctx.getImageData(0, 0, ICON_NORMALIZED_SIZE, ICON_NORMALIZED_SIZE));
                }
            } catch (e) {
                console.warn(`[maplibre] icon load failed: ${name} ${url}`, e);
            }
        }
        for (const [name, url] of Object.entries(ICON_REGISTRY)) {
            loadIconNormalized(name, url);
        }

        map.addSource('live-vehicles', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: 'live-vehicles',
            type: 'symbol',
            source: 'live-vehicles',
            layout: {
                'icon-image': ['get', 'icon'],
                // Smaller than the legacy getIconSize(26) — at high zoom the
                // bigger icons overwhelmed nearby stops/labels. ~14–16 px on
                // screen at street zoom feels right. Normalized 48×48 icons.
                'icon-size': [
                    'interpolate', ['linear'], ['zoom'],
                    7,  0.12,
                    8,  0.15,
                    10, 0.20,
                    11, 0.26,
                    12, 0.30,
                    14, 0.34
                ],
                'icon-allow-overlap': true,
                'icon-ignore-placement': true
            },
            paint: {
                'icon-opacity': 1,
                // No transition — keep highlight/un-highlight uniformly instant
                // for live vehicles too. (The NO_TRANSITION const is defined a
                // few hundred lines below, but icon-opacity-transition can be
                // a literal object here.)
                'icon-opacity-transition': { duration: 0, delay: 0 }
            }
        });

        // MBTA route_id → icon (the API returns ids like "Red", "Orange",
        // "Green-B", "CR-Providence" — map back to the agency icons).
        function mbtaRouteIdToIcon(routeId) {
            if (!routeId) return '';
            if (routeId === 'Red' || routeId === 'Mattapan') return 'mbta-red';
            if (routeId === 'Orange') return 'mbta-orange';
            if (routeId === 'Blue')   return 'mbta-blue';
            if (routeId.startsWith('Green-')) return 'mbta-green';
            if (routeId.startsWith('CR-'))    return 'mbta-commuter';
            return '';
        }
        function mbtaRouteIdToColor(routeId) {
            if (!routeId) return '#666';
            if (routeId === 'Red' || routeId === 'Mattapan') return '#DA291C';
            if (routeId === 'Orange') return '#FF6600';
            if (routeId === 'Blue')   return '#003DA5';
            if (routeId.startsWith('Green-')) return '#00843D';
            if (routeId.startsWith('CR-'))    return '#80276C';
            return '#666';
        }
        function mbtaRouteIdToLineName(routeId) {
            if (!routeId) return '';
            if (routeId === 'Red')      return 'Red Line';
            if (routeId === 'Orange')   return 'Orange Line';
            if (routeId === 'Blue')     return 'Blue Line';
            if (routeId === 'Mattapan') return 'Mattapan Trolley';
            if (routeId.startsWith('Green-')) return 'Green Line ' + routeId.slice(6);
            if (routeId.startsWith('CR-'))    return routeId.slice(3).replace(/_/g, '/') + ' Line';
            return routeId;
        }
        function mbtaRouteIdToMode(routeId) {
            if (!routeId) return '';
            return routeId.startsWith('CR-') ? 'commuter' : 'subway';
        }

        // Shared vehicle store across every agency fetcher. Keys are namespaced
        // per source (e.g. 'mbta-rail:y1234', 'mbta-bus:y1234') so each fetcher
        // updates only its own slice without clobbering the others. After every
        // update, push the merged feature collection into the GeoJSON source.
        const vehiclesById = new Map();
        function setVehicleSubset(prefix, features) {
            for (const k of [...vehiclesById.keys()]) {
                if (k.startsWith(prefix)) vehiclesById.delete(k);
            }
            for (const f of features) {
                vehiclesById.set(prefix + (f.properties.id || Math.random()), f);
            }
            const src = map.getSource('live-vehicles');
            if (src) src.setData({
                type: 'FeatureCollection',
                features: Array.from(vehiclesById.values())
            });
        }

        // ── Rail (subway + commuter, route_type 0/1/2) ────────────────────────
        let _lastMbtaRailFetch = 0;
        async function fetchMbtaRail() {
            if (document.hidden) return;
            const now = Date.now();
            if (now - _lastMbtaRailFetch < 4500) return;
            _lastMbtaRailFetch = now;
            try {
                const res = await fetch('https://api-v3.mbta.com/vehicles?filter[route_type]=0,1,2&include=route,trip');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const json = await res.json();
                const tripHeadsign = new Map();
                // The MBTA API splits commuter rail by branch (CR-Newburyport,
                // CR-Worcester) but the static GTFS data uses combined names
                // (Newburyport/Rockport Line, Framingham/Worcester Line). Pull
                // the canonical `long_name` from the API's `included` route
                // data so the vehicle's lineKey actually matches a static line.
                const routeIdToLongName = new Map();
                if (Array.isArray(json.included)) {
                    for (const item of json.included) {
                        if (item.type === 'trip' && item.attributes && item.attributes.headsign) {
                            tripHeadsign.set(item.id, item.attributes.headsign);
                        }
                        if (item.type === 'route' && item.attributes && item.attributes.long_name) {
                            routeIdToLongName.set(item.id, item.attributes.long_name);
                        }
                    }
                }
                const features = [];
                for (const v of (json.data || [])) {
                    const a = v.attributes || {};
                    if (a.latitude == null || a.longitude == null) continue;
                    // String coercion: MBTA's V3 API normally returns string IDs
                    // but other transit feeds emit numeric IDs that break lookups.
                    // Cheap guard against the same bug regressing here.
                    const routeId = String(v.relationships?.route?.data?.id || '');
                    const tripId  = String(v.relationships?.trip?.data?.id || '');
                    const lineName = routeIdToLongName.get(routeId) || mbtaRouteIdToLineName(routeId);
                    // Headsign fallback chain mirrors updateTrainMarkers in
                    // app.js — if the API didn't include a trip headsign, derive
                    // a sensible terminus from direction_id + line name. North
                    // Station serves Fitchburg/Lowell/Rockport/Newburyport/
                    // Haverhill; everything else terminates at South Station.
                    let headsign = tripHeadsign.get(tripId) || '';
                    if (!headsign && routeId.startsWith('CR-')) {
                        const branchName = routeId.slice(3);
                        const NORTH_STATION_BRANCHES = ['Fitchburg','Lowell','Rockport','Newburyport','Haverhill'];
                        const inboundTerminus = NORTH_STATION_BRANCHES.includes(branchName) ? 'North Station' : 'South Station';
                        headsign = (a.direction_id === 0) ? branchName : inboundTerminus;
                    }
                    features.push({
                        type: 'Feature',
                        properties: {
                            agency:    'mbta',
                            mode:      mbtaRouteIdToMode(routeId),
                            id:        v.id,
                            label:     a.label || '',
                            routeId,
                            line:      lineName,
                            lineKey:   lineName ? `mbta::${lineName}` : '',
                            color:     mbtaRouteIdToColor(routeId),
                            icon:      mbtaRouteIdToIcon(routeId),
                            headsign,
                            status:    a.current_status || '',
                            bearing:   a.bearing != null ? a.bearing : 0
                        },
                        geometry: { type: 'Point', coordinates: [a.longitude, a.latitude] }
                    });
                }
                setVehicleSubset('mbta-rail:', features);
            } catch (e) {
                console.warn('[maplibre] MBTA rail vehicles fetch failed:', e.message);
            }
        }

        // ── Bus + Silver Line (route_type 3) ──────────────────────────────────
        // Silver Line route IDs are SL1, SL2, SL3, SL4, SL5, SLW. Everything
        // else under route_type=3 is a regular bus (numeric ids like '1', '57').
        // Numeric → SL fallback ports the legacy app.js mapping, in case the
        // feed ever surfaces 74x trip-derived ids in the route slot.
        const SL_ROUTE_IDS = new Set(['SL1', 'SL2', 'SL3', 'SL4', 'SL5', 'SLW']);
        const SL_NUMERIC_TO_TEXT = {
            '741': 'SL1', '742': 'SL2', '743': 'SL3',
            '751': 'SL4', '749': 'SL5', '746': 'SLW'
        };
        let _lastMbtaBusFetch = 0;
        async function fetchMbtaBuses() {
            if (document.hidden) return;
            const now = Date.now();
            if (now - _lastMbtaBusFetch < 4500) return;
            _lastMbtaBusFetch = now;
            try {
                const res = await fetch('https://api-v3.mbta.com/vehicles?filter[route_type]=3&include=route,trip');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const json = await res.json();
                const tripHeadsign = new Map();
                if (Array.isArray(json.included)) {
                    for (const item of json.included) {
                        if (item.type === 'trip' && item.attributes && item.attributes.headsign) {
                            tripHeadsign.set(item.id, item.attributes.headsign);
                        }
                    }
                }
                const features = [];
                for (const v of (json.data || [])) {
                    const a = v.attributes || {};
                    if (a.latitude == null || a.longitude == null) continue;
                    let routeId = String(v.relationships?.route?.data?.id || '');
                    const tripId = String(v.relationships?.trip?.data?.id || '');
                    // If the API surfaces a numeric Silver Line id, normalize to
                    // the textual SL form so the lineKey matches the static layer.
                    if (SL_NUMERIC_TO_TEXT[routeId]) routeId = SL_NUMERIC_TO_TEXT[routeId];
                    const isSL = SL_ROUTE_IDS.has(routeId);
                    const mode = isSL ? 'silver_line' : 'bus';
                    features.push({
                        type: 'Feature',
                        properties: {
                            agency:    'mbta',
                            mode,
                            id:        v.id,
                            label:     a.label || '',
                            routeId,
                            line:      routeId,
                            // Static stops/lines for bus use lineKey 'mbta-bus::<id>',
                            // silver line uses 'mbta-silver_line::<id>'. Keep the
                            // same format so highlight matches the static layer.
                            lineKey:   `mbta-${mode}::${routeId}`,
                            color:     isSL ? '#7C878E' : '#FFD700',
                            icon:      isSL ? 'mbta-silver-line' : 'mbta-bus',
                            headsign:  tripHeadsign.get(tripId) || '',
                            status:    a.current_status || '',
                            bearing:   a.bearing != null ? a.bearing : 0
                        },
                        geometry: { type: 'Point', coordinates: [a.longitude, a.latitude] }
                    });
                }
                setVehicleSubset('mbta-bus:', features);
            } catch (e) {
                console.warn('[maplibre] MBTA bus vehicles fetch failed:', e.message);
            }
        }

        function pollAllMbta() { fetchMbtaRail(); fetchMbtaBuses(); }
        pollAllMbta();
        setInterval(pollAllMbta, 5000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) pollAllMbta();
        });

        // ── GTFS-RT proto loader (cached across all agencies) ─────────────────
        // Same pattern as getGtfsRealtimeProto in app.js — protobufjs.load is
        // promised once and reused for LIRR / Metro-North / MTA Subway / etc.
        let _gtfsRealtimeProtoPromise = null;
        function getGtfsRealtimeProto() {
            if (_gtfsRealtimeProtoPromise) return _gtfsRealtimeProtoPromise;
            _gtfsRealtimeProtoPromise = protobuf.load('./gtfs-realtime.proto').catch(err => {
                _gtfsRealtimeProtoPromise = null;
                throw err;
            });
            return _gtfsRealtimeProtoPromise;
        }

        // ── LIRR live trains (MTA GTFS-RT) ────────────────────────────────────
        // Ported from fetchLIRRTrains + updateLIRRMarkers in app.js. Key
        // quirks preserved:
        //  * The feed splits each train across TWO entities — TripUpdate (has
        //    route_id, stable trip_id) and VehiclePosition (has lat/lon, route_id
        //    usually missing). Build tripIdToRouteId from the TripUpdates first
        //    so the vehicle pass can fill in missing route_ids.
        //  * Cascade for resolving route: vehicle.trip.routeId → trip-update map
        //    → tripShortNameToRoute (also try tripId-as-shortname) → tripToRoute
        //    with date-suffix stripping → fuzzy substring matching.
        //  * Headsign cascade: vehicle.trip.tripProperties.tripHeadsign →
        //    trip.tripHeadsign → tripToHeadsign with the same fuzzy lookups.
        //  * `currentStatus` may be string ('STOPPED_AT') or numeric (0/1/2).
        const STATUS_LABELS = ['Stopped at station', 'In transit', 'Approaching station'];
        function normalizeStatus(s) {
            if (typeof s === 'number') return STATUS_LABELS[s] || '';
            if (s === 'STOPPED_AT')   return 'Stopped at station';
            if (s === 'IN_TRANSIT_TO') return 'In transit';
            if (s === 'INCOMING_AT')  return 'Approaching station';
            return s || '';
        }
        function lirrColorFromRoute(route) {
            if (route && route.color) {
                return route.color.startsWith('#') ? route.color : '#' + route.color;
            }
            return '#00305E';
        }
        // Resolve vehicle → (routeName, routeId, color) walking the same cascade
        // the legacy app uses. Returns nulls if nothing matches.
        function resolveLirrRoute(vehicle, tripIdToRouteId) {
            if (typeof lirrRoutesData === 'undefined' || !lirrRoutesData || !lirrRoutesData.routes) {
                return { routeName: 'LIRR Train', routeId: null, color: '#00305E' };
            }
            const routes = lirrRoutesData.routes;
            const tripId        = vehicle.trip?.tripId        || vehicle.trip?.trip_id        || '';
            const tripShortName = vehicle.trip?.tripShortName  || vehicle.trip?.trip_short_name || '';
            const startDate     = vehicle.trip?.startDate      || vehicle.trip?.start_date     || '';
            // 1) Direct route_id on the VehiclePosition trip descriptor
            let tripRouteId = vehicle.trip?.routeId || vehicle.trip?.route_id || null;
            // 2) Fallback to TripUpdate map (this is what resolves most LIRR trains)
            if (!tripRouteId && tripId && tripIdToRouteId) {
                tripRouteId = tripIdToRouteId.get(String(tripId));
            }
            const matchByRouteId = (rid) => {
                const ridStr = String(rid);
                for (const [name, route] of Object.entries(routes)) {
                    if (route.route_id === ridStr || route.route_id === rid) {
                        return { routeName: name, routeId: ridStr, color: lirrColorFromRoute(route) };
                    }
                }
                return null;
            };
            if (tripRouteId) {
                const m = matchByRouteId(tripRouteId);
                if (m) return m;
            }
            // 3) tripShortNameToRoute via tripShortName
            if (tripShortName && lirrRoutesData.tripShortNameToRoute) {
                const r = lirrRoutesData.tripShortNameToRoute[tripShortName];
                if (r) { const m = matchByRouteId(r); if (m) return m; }
            }
            // 4) tripShortNameToRoute via tripId (feed sometimes puts short name in trip_id)
            if (tripId && lirrRoutesData.tripShortNameToRoute) {
                const r = lirrRoutesData.tripShortNameToRoute[tripId];
                if (r) { const m = matchByRouteId(r); if (m) return m; }
            }
            // 5) tripToRoute with date-suffix stripping + fuzzy matching
            if (tripId && lirrRoutesData.tripToRoute) {
                let r = lirrRoutesData.tripToRoute[tripId];
                if (!r && tripId.includes('_')) r = lirrRoutesData.tripToRoute[tripId.split('_')[0]];
                if (!r && startDate) r = lirrRoutesData.tripToRoute[`${tripId}_${startDate}`];
                if (!r) {
                    if (/^\d+$/.test(tripId)) {
                        for (const [tk, rk] of Object.entries(lirrRoutesData.tripToRoute)) {
                            if (tk.startsWith(tripId + '_') || tk === tripId ||
                                tk.endsWith('_' + tripId) || tk.includes('_' + tripId + '_')) {
                                r = rk; break;
                            }
                        }
                    } else {
                        for (const [tk, rk] of Object.entries(lirrRoutesData.tripToRoute)) {
                            if (tk.includes(tripId) || tripId.includes(tk.split('_')[0])) {
                                r = rk; break;
                            }
                        }
                    }
                }
                if (r) { const m = matchByRouteId(r); if (m) return m; }
            }
            return { routeName: 'LIRR Train', routeId: null, color: '#00305E' };
        }
        function resolveLirrHeadsign(vehicle) {
            const tripId    = vehicle.trip?.tripId    || vehicle.trip?.trip_id    || '';
            const startDate = vehicle.trip?.startDate || vehicle.trip?.start_date || '';
            let headsign = vehicle.trip?.tripProperties?.tripHeadsign ||
                           vehicle.trip?.trip_properties?.trip_headsign ||
                           vehicle.trip?.tripProperties?.trip_headsign ||
                           vehicle.trip?.tripHeadsign ||
                           vehicle.trip?.trip_headsign ||
                           vehicle.trip?.headsign || '';
            if (!headsign && tripId && lirrRoutesData?.tripToHeadsign) {
                headsign = lirrRoutesData.tripToHeadsign[tripId] || '';
                if (!headsign && tripId.includes('_')) {
                    headsign = lirrRoutesData.tripToHeadsign[tripId.split('_')[0]] || '';
                }
                if (!headsign && startDate) {
                    headsign = lirrRoutesData.tripToHeadsign[`${tripId}_${startDate}`] || '';
                }
            }
            return headsign;
        }
        let _lastLirrFetch = 0;
        async function fetchLirrTrains() {
            if (document.hidden) return;
            const now = Date.now();
            if (now - _lastLirrFetch < 4500) return;
            _lastLirrFetch = now;
            try {
                const res = await fetch('https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const buf = await res.arrayBuffer();
                const root = await getGtfsRealtimeProto();
                const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
                const feed = FeedMessage.decode(new Uint8Array(buf));

                const tripIdToRouteId = new Map();
                for (const e of feed.entity) {
                    const tu = e.tripUpdate || e.trip_update;
                    if (!tu || !tu.trip) continue;
                    const tid = tu.trip.tripId || tu.trip.trip_id;
                    const rid = tu.trip.routeId || tu.trip.route_id;
                    if (tid && rid) tripIdToRouteId.set(String(tid), String(rid));
                }

                const features = [];
                for (const e of feed.entity) {
                    const v = e.vehicle;
                    if (!v || !v.position) continue;
                    const lat = v.position.latitude;
                    const lon = v.position.longitude;
                    if (lat == null || lon == null) continue;
                    const trainId = v.vehicle?.id || ('lirr_' + features.length);
                    const tripId  = String(v.trip?.tripId || v.trip?.trip_id || '');
                    const { routeName, routeId, color } = resolveLirrRoute(v, tripIdToRouteId);
                    const headsign = resolveLirrHeadsign(v);
                    features.push({
                        type: 'Feature',
                        properties: {
                            agency:    'lirr',
                            mode:      'commuter',
                            id:        String(trainId),
                            label:     '',
                            routeId:   routeId || '',
                            line:      routeName,
                            lineKey:   routeId ? `lirr::${routeName}` : '',
                            color,
                            icon:      'mta',
                            headsign,
                            status:    normalizeStatus(v.currentStatus || v.current_status),
                            tripId
                        },
                        geometry: { type: 'Point', coordinates: [lon, lat] }
                    });
                }
                setVehicleSubset('lirr:', features);
            } catch (e) {
                console.warn('[maplibre] LIRR fetch failed:', e && e.message, e);
            }
        }
        fetchLirrTrains();
        setInterval(fetchLirrTrains, 5000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) fetchLirrTrains();
        });

        // ── Metro-North live trains (MTA GTFS-RT) ─────────────────────────────
        // Ported from fetchMetroNorthTrains + updateMetroNorthMarkers in app.js.
        // Metro-North has distinct resolution quirks vs LIRR:
        //  * Real-time feed uses trip_short_name in the trip_id slot, so
        //    tripShortNameToRoute[tripId] is the FIRST mapping to try.
        //  * Route IDs are simple numbers (1–6). If the tripId itself is
        //    numeric, try matching it directly against route_id.
        //  * vehicle id can ALSO be a route id in some encodings — try it too.
        //  * Same trip-id fuzzy matching against tripToRoute as LIRR.
        //  * No TripUpdate cross-reference needed: MN's vehicle entities
        //    usually have enough info on their own.
        function mnrColorFromRoute(name, route) {
            // The original chain is `lineColors[name] || route.color || '#003A70'`.
            // We don't have lineColors (that's built from data file inside
            // app.js); reading the data file's route.color produces the same
            // canonical color the existing app shows.
            if (route && route.color) {
                return route.color.startsWith('#') ? route.color : '#' + route.color;
            }
            return '#003A70';
        }
        function resolveMnrRoute(vehicle) {
            const empty = { routeName: 'Metro North Train', routeId: null, color: '#003A70' };
            if (typeof metroNorthRoutesData === 'undefined' || !metroNorthRoutesData || !metroNorthRoutesData.routes) {
                return empty;
            }
            const routes = metroNorthRoutesData.routes;
            const tripId    = String(vehicle.trip?.tripId    || vehicle.trip?.trip_id    || '');
            const trainId   = String(vehicle.vehicle?.id     || '');
            const startDate = vehicle.trip?.startDate || vehicle.trip?.start_date || '';

            // protobuf.js sometimes exposes route_id by name, sometimes by
            // numeric index. Walk the same fallback chain as the legacy code.
            let tripRouteId = vehicle.trip?.routeId || vehicle.trip?.route_id || null;
            if (!tripRouteId && vehicle.trip) {
                try {
                    if (vehicle.trip._fields) {
                        tripRouteId = vehicle.trip._fields.routeId || vehicle.trip._fields.route_id;
                    }
                    if (!tripRouteId && vehicle.trip[5]) tripRouteId = vehicle.trip[5];
                } catch (_) {}
            }

            const matchByRouteId = (rid) => {
                const ridStr = String(rid);
                for (const [name, route] of Object.entries(routes)) {
                    if (route.route_id === ridStr || route.route_id === rid) {
                        return { routeName: name, routeId: ridStr, color: mnrColorFromRoute(name, route) };
                    }
                }
                return null;
            };

            // 1) Direct route_id from trip descriptor
            if (tripRouteId) { const m = matchByRouteId(tripRouteId); if (m) return m; }

            // 2) tripShortNameToRoute via tripId — MN's feed puts the
            //    short_name in the trip_id slot (e.g. "1838").
            if (tripId && metroNorthRoutesData.tripShortNameToRoute) {
                const r = metroNorthRoutesData.tripShortNameToRoute[tripId];
                if (r) { const m = matchByRouteId(r); if (m) return m; }
            }

            // 3) Numeric tripId === route_id (MN routes are 1–6).
            if (/^\d+$/.test(tripId)) {
                const m = matchByRouteId(tripId);
                if (m) return m;
            }

            // 4) Numeric trainId === route_id (some encodings).
            if (/^\d+$/.test(trainId)) {
                const m = matchByRouteId(trainId);
                if (m) return m;
            }

            // 5) tripToRoute with date stripping and fuzzy matching.
            if (tripId && metroNorthRoutesData.tripToRoute) {
                let r = metroNorthRoutesData.tripToRoute[tripId];
                if (!r && tripId.includes('_')) r = metroNorthRoutesData.tripToRoute[tripId.split('_')[0]];
                if (!r && startDate) r = metroNorthRoutesData.tripToRoute[`${tripId}_${startDate}`];
                if (!r) {
                    if (/^\d+$/.test(tripId)) {
                        for (const [tk, rk] of Object.entries(metroNorthRoutesData.tripToRoute)) {
                            if (tk.startsWith(tripId + '_') || tk === tripId ||
                                tk.endsWith('_' + tripId) || tk.includes('_' + tripId + '_')) {
                                r = rk; break;
                            }
                        }
                    } else {
                        for (const [tk, rk] of Object.entries(metroNorthRoutesData.tripToRoute)) {
                            if (tk.includes(tripId) || tripId.includes(tk.split('_')[0])) {
                                r = rk; break;
                            }
                        }
                    }
                }
                if (r) { const m = matchByRouteId(r); if (m) return m; }
            }
            return empty;
        }
        function resolveMnrHeadsign(vehicle) {
            const tripId    = String(vehicle.trip?.tripId    || vehicle.trip?.trip_id    || '');
            const startDate = vehicle.trip?.startDate || vehicle.trip?.start_date || '';
            let headsign = vehicle.trip?.tripProperties?.tripHeadsign ||
                           vehicle.trip?.trip_properties?.trip_headsign ||
                           vehicle.trip?.tripProperties?.trip_headsign ||
                           vehicle.trip?.tripHeadsign ||
                           vehicle.trip?.trip_headsign ||
                           vehicle.trip?.headsign || '';
            if (!headsign && tripId && metroNorthRoutesData?.tripToHeadsign) {
                headsign = metroNorthRoutesData.tripToHeadsign[tripId] || '';
                if (!headsign && tripId.includes('_')) {
                    headsign = metroNorthRoutesData.tripToHeadsign[tripId.split('_')[0]] || '';
                }
                if (!headsign && startDate) {
                    headsign = metroNorthRoutesData.tripToHeadsign[`${tripId}_${startDate}`] || '';
                }
            }
            return headsign;
        }
        let _lastMnrFetch = 0;
        async function fetchMnrTrains() {
            if (document.hidden) return;
            const now = Date.now();
            if (now - _lastMnrFetch < 4500) return;
            _lastMnrFetch = now;
            try {
                const res = await fetch('https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const buf = await res.arrayBuffer();
                const root = await getGtfsRealtimeProto();
                const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
                const feed = FeedMessage.decode(new Uint8Array(buf));

                const features = [];
                for (const e of feed.entity) {
                    const v = e.vehicle;
                    if (!v || !v.position) continue;
                    const lat = v.position.latitude;
                    const lon = v.position.longitude;
                    if (lat == null || lon == null) continue;
                    const trainId = v.vehicle?.id || ('mnr_' + features.length);
                    const tripId  = String(v.trip?.tripId || v.trip?.trip_id || '');
                    const { routeName, routeId, color } = resolveMnrRoute(v);
                    const headsign = resolveMnrHeadsign(v);
                    features.push({
                        type: 'Feature',
                        properties: {
                            agency:    'metro_north',
                            mode:      'commuter',
                            id:        String(trainId),
                            label:     '',
                            routeId:   routeId || '',
                            line:      routeName,
                            lineKey:   routeId ? `metro_north::${routeName}` : '',
                            color,
                            icon:      'mta',
                            headsign,
                            status:    normalizeStatus(v.currentStatus || v.current_status),
                            tripId
                        },
                        geometry: { type: 'Point', coordinates: [lon, lat] }
                    });
                }
                setVehicleSubset('mnr:', features);
            } catch (e) {
                console.warn('[maplibre] Metro-North fetch failed:', e && e.message);
            }
        }
        fetchMnrTrains();
        setInterval(fetchMnrTrains, 5000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) fetchMnrTrains();
        });

        // ── SEPTA live trains (GTFS-RT) ────────────────────────────────────────
        // Same shape as LIRR/MN: protobuf VehiclePosition + trip resolution
        // cascade through tripShortNameToRoute → tripToRoute with date stripping.
        function septaColorFromRoute(route) {
            if (route && route.color) return route.color.startsWith('#') ? route.color : '#' + route.color;
            return '#1F4E79';
        }
        function resolveSeptaRoute(vehicle) {
            const empty = { routeName: 'SEPTA Train', routeId: null, color: '#1F4E79' };
            if (typeof septaRoutesData === 'undefined' || !septaRoutesData || !septaRoutesData.routes) return empty;
            const rd = septaRoutesData;
            const tripId        = String(vehicle.trip?.tripId        || vehicle.trip?.trip_id        || '');
            const tripShortName = String(vehicle.trip?.tripShortName || vehicle.trip?.trip_short_name || '');
            const matchByRouteId = (rid) => {
                const ridStr = String(rid);
                for (const [name, route] of Object.entries(rd.routes)) {
                    if (route.route_id === ridStr || route.route_id === rid) {
                        return { routeName: name, routeId: ridStr, color: septaColorFromRoute(route) };
                    }
                }
                return null;
            };
            // 1) Direct route_id on trip descriptor.
            const tripRouteId = vehicle.trip?.routeId || vehicle.trip?.route_id || null;
            if (tripRouteId) { const m = matchByRouteId(tripRouteId); if (m) return m; }
            // 2) tripShortNameToRoute via tripShortName, then via tripId.
            if (tripShortName && rd.tripShortNameToRoute) {
                const r = rd.tripShortNameToRoute[tripShortName];
                if (r) { const m = matchByRouteId(r); if (m) return m; }
            }
            if (tripId && rd.tripShortNameToRoute) {
                const r = rd.tripShortNameToRoute[tripId];
                if (r) { const m = matchByRouteId(r); if (m) return m; }
            }
            // 3) tripToRoute with date-suffix stripping.
            if (tripId && rd.tripToRoute) {
                let r = rd.tripToRoute[tripId];
                if (!r && tripId.includes('_')) r = rd.tripToRoute[tripId.split('_')[0]];
                if (r) { const m = matchByRouteId(r); if (m) return m; }
            }
            return empty;
        }
        let _lastSeptaFetch = 0;
        async function fetchSeptaTrains() {
            if (document.hidden) return;
            const now = Date.now();
            if (now - _lastSeptaFetch < 4500) return;
            _lastSeptaFetch = now;
            try {
                const res = await fetch('https://www3.septa.org/gtfsrt/septarail-pa-us/Vehicle/Vehicle.pb');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const buf = await res.arrayBuffer();
                const root = await getGtfsRealtimeProto();
                const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
                const feed = FeedMessage.decode(new Uint8Array(buf));
                const features = [];
                for (const e of feed.entity) {
                    const v = e.vehicle;
                    if (!v || !v.position) continue;
                    const lat = v.position.latitude;
                    const lon = v.position.longitude;
                    if (lat == null || lon == null) continue;
                    const trainId = v.vehicle?.id || ('septa_' + features.length);
                    const tripId  = String(v.trip?.tripId || v.trip?.trip_id || '');
                    const { routeName, routeId, color } = resolveSeptaRoute(v);
                    let headsign = v.trip?.tripHeadsign || v.trip?.trip_headsign || v.trip?.headsign || '';
                    if (!headsign && tripId && septaRoutesData?.tripToHeadsign) {
                        headsign = septaRoutesData.tripToHeadsign[tripId] ||
                                   (tripId.includes('_') ? septaRoutesData.tripToHeadsign[tripId.split('_')[0]] : '') || '';
                    }
                    features.push({
                        type: 'Feature',
                        properties: {
                            agency:    'septa',
                            mode:      'commuter',
                            id:        String(trainId),
                            label:     '',
                            routeId:   routeId || '',
                            line:      routeName,
                            lineKey:   routeId ? `septa::${routeName}` : '',
                            color,
                            icon:      'mta',     // SEPTA uses the generic MTA-circ icon in the legacy app
                            headsign,
                            status:    normalizeStatus(v.currentStatus || v.current_status),
                            tripId
                        },
                        geometry: { type: 'Point', coordinates: [lon, lat] }
                    });
                }
                setVehicleSubset('septa:', features);
            } catch (e) {
                console.warn('[maplibre] SEPTA fetch failed:', e && e.message);
            }
        }
        fetchSeptaTrains();
        setInterval(fetchSeptaTrains, 5000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) fetchSeptaTrains();
        });

        // ── Amtrak live trains (JSON via corsproxy.io) ─────────────────────────
        // Plain JSON, no protobuf. Uses train.routeName directly — no mapping
        // needed because the API already returns canonical names matching the
        // static amtrakRoutesData. Trip id construction mirrors the legacy
        // fallback (trainNum_lat_lon when trainID missing).
        let _lastAmtrakFetch = 0;
        async function fetchAmtrakTrains() {
            if (document.hidden) return;
            const now = Date.now();
            if (now - _lastAmtrakFetch < 4500) return;
            _lastAmtrakFetch = now;
            try {
                const baseUrl = 'https://amtrak-api.marcmap.app/get-trains';
                const url = 'https://corsproxy.io/?url=' + encodeURIComponent(baseUrl);
                const res = await fetch(url);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const json = await res.json();
                if (json.status !== 'worked' || !Array.isArray(json.data)) return;
                const features = [];
                // Build a normalization map from the static data so the API's
                // route names (which sometimes differ — e.g. "Keystone" vs
                // "Keystone Service") still resolve to a real static line.
                const amtrakStaticNames = (typeof amtrakRoutesData !== 'undefined' && amtrakRoutesData?.routes)
                    ? Object.keys(amtrakRoutesData.routes) : [];
                function resolveAmtrakStaticName(apiName) {
                    if (!apiName) return null;
                    if (amtrakStaticNames.length === 0) return null;
                    // 1. Exact match.
                    if (amtrakRoutesData.routes[apiName]) return apiName;
                    // 2. Case-insensitive exact match.
                    const lc = apiName.toLowerCase();
                    for (const n of amtrakStaticNames) {
                        if (n.toLowerCase() === lc) return n;
                    }
                    // 3. Substring match either direction (handles "Keystone"
                    //    ↔ "Keystone Service", "Acela" ↔ "Acela Express", etc.)
                    for (const n of amtrakStaticNames) {
                        const nl = n.toLowerCase();
                        if (nl.includes(lc) || lc.includes(nl)) return n;
                    }
                    return null;
                }
                for (const train of json.data) {
                    const lat = train.lat, lon = train.lon;
                    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
                    const apiRouteName = train.routeName || '';
                    const staticName = resolveAmtrakStaticName(apiRouteName);
                    const displayName = staticName || apiRouteName || 'Amtrak';
                    const trainNum = train.trainNum || train.trainID || '?';
                    const id = String(train.trainID != null ? train.trainID : `${trainNum}_${lat}_${lon}`);
                    const color = '#1F6BB5';
                    const route = staticName ? amtrakRoutesData.routes[staticName] : null;
                    features.push({
                        type: 'Feature',
                        properties: {
                            agency:    'amtrak',
                            mode:      'amtrak',
                            id,
                            label:     String(trainNum),
                            routeId:   route ? String(route.route_id || '') : '',
                            line:      displayName,
                            // Only emit a lineKey when we resolved to an actual
                            // static line. Otherwise click → no-op (clears
                            // highlight) instead of dimming every track.
                            lineKey:   staticName ? `amtrak::${staticName}` : '',
                            color,
                            icon:      'amtrak',
                            headsign:  '',
                            status:    train.trainTimely || ''
                        },
                        geometry: { type: 'Point', coordinates: [lon, lat] }
                    });
                }
                setVehicleSubset('amtrak:', features);
            } catch (e) {
                console.warn('[maplibre] Amtrak fetch failed:', e && e.message);
            }
        }
        fetchAmtrakTrains();
        setInterval(fetchAmtrakTrains, 5000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) fetchAmtrakTrains();
        });

        // ── NJ Transit live trains (JSON via Vercel proxy) ─────────────────────
        // Backend lives at /api/nj-transit-vehicles on the Vercel deployment.
        // Includes the Port Jervis disambiguation: the live API mis-reports
        // Port Jervis trains as "Main Line" / "Bergen County Line" because
        // they share track south of Suffern. If NEXT_STOP is in the set of
        // stops exclusive to Port Jervis Line, reclassify the train.
        const NJT_VEHICLES_URL = 'https://transittracker.vercel.app/api/nj-transit-vehicles';
        // NJT's API uses display-friendly names that don't always match the
        // static GTFS route names. Explicit mapping handles every observed
        // mismatch (verified by hitting the live endpoint). Anything not in
        // this table falls through to the substring-match logic below.
        const NJT_API_TO_STATIC = {
            'Atlantic City Line':       'Atlantic City Rail Line',
            'Bergen County Line':       'Main/Bergen County Line',
            'Main Line':                'Main/Bergen County Line',
            'Northeast Corridor Line':  'Northeast Corridor',
            'Princeton Branch':         'Princeton Shuttle'
        };
        const NJT_LINE_TO_ICON = {
            'Atlantic City Rail Line': 'njt-AC',
            'Bergen County Line':      'njt-BC',
            'Gladstone Branch':        'njt-GS',
            'Hudson-Bergen Light Rail':'njt-HBLR',
            'Main Line':               'njt-ML',
            'Main/Bergen County Line': 'njt-ML',
            'Montclair-Boonton Line':  'njt-MC',
            'Morris & Essex Line':     'njt-ME',
            'Newark Light Rail':       'njt-NLR',
            'North Jersey Coast Line': 'njt-NC',
            'Northeast Corridor':      'njt-NE',
            'Pascack Valley Line':     'njt-PV',
            'Port Jervis Line':        'njt-PJ',
            'Princeton Shuttle':       'njt-PR',
            'Raritan Valley Line':     'njt-RV',
            'Riverline Light Rail':    'njt-RL'
        };
        // Build Port-Jervis-exclusive stop set once. Same logic as
        // getPortJervisOnlyStops in app.js.
        let _portJervisOnlyStops = null;
        function getPortJervisOnlyStops() {
            if (_portJervisOnlyStops !== null) return _portJervisOnlyStops;
            if (typeof njTransitRoutesData === 'undefined' || !njTransitRoutesData?.routes) {
                _portJervisOnlyStops = new Set();
                return _portJervisOnlyStops;
            }
            const rd = njTransitRoutesData;
            const norm = (s) => String(s || '').trim().toUpperCase();
            const pj = rd.routes['Port Jervis Line'];
            if (!pj || !Array.isArray(pj.stops)) {
                _portJervisOnlyStops = new Set();
                return _portJervisOnlyStops;
            }
            const sharedNames = new Set();
            for (const [name, route] of Object.entries(rd.routes)) {
                if (name === 'Port Jervis Line') continue;
                if (name !== 'Main/Bergen County Line' && name !== 'Bergen County Line' && name !== 'Main Line') continue;
                for (const stop of (route.stops || [])) sharedNames.add(norm(stop.name));
            }
            const exclusive = new Set();
            for (const stop of pj.stops) {
                const n = norm(stop.name);
                if (n && !sharedNames.has(n)) exclusive.add(n);
            }
            _portJervisOnlyStops = exclusive;
            return _portJervisOnlyStops;
        }
        function njtColorForRoute(routeName) {
            if (typeof njTransitRoutesData !== 'undefined' && njTransitRoutesData?.routes?.[routeName]) {
                const r = njTransitRoutesData.routes[routeName];
                if (r.color) return r.color.startsWith('#') ? r.color : '#' + r.color;
            }
            return '#008C45';
        }
        let _lastNjtFetch = 0;
        async function fetchNjtTrains() {
            if (document.hidden) return;
            const now = Date.now();
            if (now - _lastNjtFetch < 4500) return;
            _lastNjtFetch = now;
            try {
                const res = await fetch(NJT_VEHICLES_URL);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const raw = await res.json();
                if (!Array.isArray(raw)) return;
                const pjOnlyStops = getPortJervisOnlyStops();
                const features = [];
                for (const r of raw) {
                    const lat = parseFloat(r.LATITUDE);
                    const lon = parseFloat(r.LONGITUDE);
                    if (!isFinite(lat) || !isFinite(lon)) continue;
                    let routeName = String(r.TRAIN_LINE || '').trim();
                    // 1) Explicit API → static name mapping for known mismatches.
                    if (NJT_API_TO_STATIC[routeName]) {
                        routeName = NJT_API_TO_STATIC[routeName];
                    } else if (typeof njTransitRoutesData !== 'undefined' && njTransitRoutesData?.routes) {
                        // 2) Fall back to substring match for anything new.
                        let best = null;
                        for (const name of Object.keys(njTransitRoutesData.routes)) {
                            if (name === routeName || name.indexOf(routeName) !== -1 || routeName.indexOf(name) !== -1) {
                                best = name; break;
                            }
                        }
                        if (best) routeName = best;
                    }
                    // Port Jervis override: if NEXT_STOP is on the exclusive
                    // Port Jervis stop list, reclassify regardless of TRAIN_LINE.
                    const nextStop = String(r.NEXT_STOP || '').trim().toUpperCase();
                    if (nextStop && pjOnlyStops.has(nextStop)) {
                        routeName = 'Port Jervis Line';
                    }
                    const trainId = String(r.ID || ('njt_' + features.length));
                    const color = njtColorForRoute(routeName);
                    const icon = NJT_LINE_TO_ICON[routeName] || 'mta';
                    const secLate = r.SEC_LATE != null && String(r.SEC_LATE) !== '' ? Number(r.SEC_LATE) : null;
                    const statusBits = [];
                    if (r.NEXT_STOP) statusBits.push('Next: ' + r.NEXT_STOP);
                    if (secLate != null && !isNaN(secLate) && secLate !== 0) {
                        statusBits.push(`Delay: ${Math.round(secLate / 60)} min`);
                    }
                    features.push({
                        type: 'Feature',
                        properties: {
                            agency:    'nj_transit',
                            mode:      'commuter',
                            id:        trainId,
                            label:     trainId,
                            routeId:   '',
                            line:      routeName,
                            lineKey:   routeName ? `nj_transit::${routeName}` : '',
                            color,
                            icon,
                            headsign:  r.NEXT_STOP ? ('Next: ' + r.NEXT_STOP) : '',
                            status:    statusBits.join(' • ')
                        },
                        geometry: { type: 'Point', coordinates: [lon, lat] }
                    });
                }
                setVehicleSubset('njt:', features);
            } catch (e) {
                console.warn('[maplibre] NJ Transit fetch failed:', e && e.message);
            }
        }
        fetchNjtTrains();
        setInterval(fetchNjtTrains, 5000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) fetchNjtTrains();
        });

        // ── MTA Subway live (GTFS-RT TripUpdates → interpolated positions) ────
        // The MTA subway feeds only publish TripUpdate entities (no GPS), so
        // marker positions are estimated by finding the next stop's predicted
        // arrival, computing how far the train should be between the previous
        // stop and the next one, and linearly interpolating between their
        // coordinates. Algorithm ported from updateMtaSubwayMarkers in app.js.
        //
        // Seven feeds — one per line group — fetched in parallel each cycle.
        const MTA_SUBWAY_GTFS_RT_URLS = [
            'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',       // 1, 2, 3, 4, 5, 6, 7, S
            'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',   // A, C, E
            'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',  // B, D, F, M
            'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',     // G
            'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',    // J, Z
            'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',  // N, Q, R, W
            'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l'      // L
        ];
        const MTA_KNOWN_ICONS = new Set(['1','2','3','4','5','6','6d','7','7d','a','b','c','d','e','f','fd','g','h','j','l','m','n','q','r','s','sf','sir','sr','t','w','z']);
        function mtaSubwayIconFor(routeId) {
            const lc = String(routeId || '').toLowerCase();
            if (MTA_KNOWN_ICONS.has(lc)) return 'mta-' + lc;
            // Variant routes (e.g. "7x") fall back to the base route's icon.
            if (lc.length > 1) {
                const base = lc.replace(/[a-z]$/, '');
                if (base && MTA_KNOWN_ICONS.has(base)) return 'mta-' + base;
            }
            return 'mta';
        }
        function mtaSubwayColorFor(routeId) {
            if (typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData?.routes?.[routeId]) {
                const c = mtaSubwayRoutesData.routes[routeId].color;
                if (c) return c.startsWith('#') ? c : '#' + c;
            }
            return '#808183';
        }

        // Build a routePattern → routeId map ONCE so per-trip lookups are O(1)
        // instead of O(n). MTA's static tripToRoute keys look like
        // "AFA22GEN-1037-Weekday-00_062150_1..N03R" — last underscore-separated
        // segment is the unique trip pattern. Real-time tripIds are typically
        // just the pattern, so we match by pattern.
        let _mtaRoutePatternMap = null;
        function getMtaRoutePatternMap() {
            if (_mtaRoutePatternMap) return _mtaRoutePatternMap;
            const m = new Map();
            if (typeof mtaSubwayRoutesData !== 'undefined' && mtaSubwayRoutesData?.tripToRoute) {
                for (const [staticTripId, staticRoute] of Object.entries(mtaSubwayRoutesData.tripToRoute)) {
                    const parts = staticTripId.split('_');
                    const pattern = parts[parts.length - 1];
                    if (pattern && !m.has(pattern)) m.set(pattern, staticRoute);
                }
            }
            _mtaRoutePatternMap = m;
            return m;
        }

        // Resolve a TripUpdate to a routeId, using the same cascade as the
        // legacy app: tripToRoute exact → routePattern lookup → endswith match
        // → trip.routeId direct match. Returns null if nothing resolves.
        function resolveMtaSubwayRoute(tripUpdate) {
            if (typeof mtaSubwayRoutesData === 'undefined' || !mtaSubwayRoutesData?.routes) return null;
            const tripId  = tripUpdate.trip?.tripId  || tripUpdate.trip?.trip_id  || '';
            const routeId = tripUpdate.trip?.routeId || tripUpdate.trip?.route_id || '';
            if (tripId && mtaSubwayRoutesData.tripToRoute) {
                const exact = mtaSubwayRoutesData.tripToRoute[tripId];
                if (exact && mtaSubwayRoutesData.routes[exact]) return exact;
                const normalized = tripId.trim();
                const parts = normalized.split('_');
                const pattern = parts[parts.length - 1];
                const patternMap = getMtaRoutePatternMap();
                if (patternMap.has(pattern)) {
                    const r = patternMap.get(pattern);
                    if (mtaSubwayRoutesData.routes[r]) return r;
                }
                for (const [staticTripId, staticRoute] of Object.entries(mtaSubwayRoutesData.tripToRoute)) {
                    if (staticTripId.endsWith(normalized) && mtaSubwayRoutesData.routes[staticRoute]) return staticRoute;
                }
            }
            if (routeId && mtaSubwayRoutesData.routes[routeId]) return routeId;
            return null;
        }

        // Estimate the [lon, lat] position of a subway train given its next
        // scheduled stop + arrival time. Linear interpolation between the
        // previous stop's coords and the next stop's coords, weighted by how
        // much of the travel-time-budget has elapsed.
        function estimateMtaTrainPosition(tripUpdate, routeId) {
            const routeData = mtaSubwayRoutesData.routes[routeId];
            if (!routeData || !routeData.stops || !routeData.stops.length) return null;

            // Pick the first stopTimeUpdate that has a stopId + (arrival OR
            // departure) time. That's our "next stop" for this trip.
            const stopTimeUpdates = tripUpdate.stopTimeUpdate || tripUpdate.stop_time_update || [];
            let nextStopUpdate = null;
            for (const u of stopTimeUpdates) {
                const sid = u.stopId || u.stop_id;
                const at  = u.arrival?.time || u.departure?.time;
                if (sid && at) { nextStopUpdate = u; break; }
            }
            if (!nextStopUpdate) return null;
            let nextStopId = nextStopUpdate.stopId || nextStopUpdate.stop_id;
            const nextArrivalRaw = nextStopUpdate.arrival?.time || nextStopUpdate.departure?.time;
            // protobuf times can decode as Long instances — normalize to Number.
            const nextArrival = typeof nextArrivalRaw === 'number' ? nextArrivalRaw : Number(nextArrivalRaw);
            const nowSec = Math.floor(Date.now() / 1000);
            const etaSeconds = nextArrival - nowSec;

            // Find the previous stop by walking the route's ordered stop list,
            // with N/S suffix variations as fallbacks.
            const routeStopTimes = mtaSubwayRoutesData.routeStopTimes?.[routeId] || {};
            const avgTravelTimes = routeStopTimes.avg_travel_times || {};
            let orderedStops = routeStopTimes.ordered_stops || [];
            if (orderedStops.length === 0) {
                orderedStops = routeData.stops.map(s => s.stop_id).slice().sort();
            }
            let previousStopId = null;
            let avgTravelSec = 120;
            const variants = [
                nextStopId,
                nextStopId.replace(/[NS]$/, '') + 'N',
                nextStopId.replace(/[NS]$/, '') + 'S',
                nextStopId.replace(/N$/, 'S'),
                nextStopId.replace(/S$/, 'N')
            ];
            for (const v of variants) {
                const idx = orderedStops.indexOf(v);
                if (idx > 0) {
                    previousStopId = orderedStops[idx - 1];
                    nextStopId = v;
                    const key = `${previousStopId},${nextStopId}`;
                    if (avgTravelTimes[key] !== undefined) avgTravelSec = avgTravelTimes[key];
                    break;
                } else if (idx === 0) {
                    previousStopId = v;
                    nextStopId = v;
                    break;
                }
            }
            if (!previousStopId) {
                previousStopId = nextStopId;    // fall back: place at the stop
                avgTravelSec = 60;
            }

            // Look up stop coordinates from routeData.stops (the lat/lon
            // pairs that the static layer uses).
            const findStop = (sid) => {
                let s = routeData.stops.find(st => st.stop_id === sid);
                if (s) return s;
                // fall back across all routes for shared stops
                if (mtaSubwayRoutesData.routes) {
                    for (const od of Object.values(mtaSubwayRoutesData.routes)) {
                        s = od.stops?.find(st => st.stop_id === sid);
                        if (s) return s;
                    }
                }
                return null;
            };
            const nextStop = findStop(nextStopId);
            const prevStop = findStop(previousStopId) || nextStop;
            if (!nextStop) return null;

            // Progress: 0 = just left prev stop, 1 = arrived at next stop.
            // If eta > avgTravel, the train hasn't departed prev yet — pin
            // it near prev (small progress) instead of going negative.
            let progress;
            if (etaSeconds > avgTravelSec) {
                progress = 0.05;
            } else {
                progress = Math.max(0, Math.min(1, (avgTravelSec - etaSeconds) / avgTravelSec));
            }
            if (previousStopId === nextStopId) progress = 1;

            // Shape-following interpolation: find the shape coords closest to
            // prev/next stops, then walk along the shape between those indices.
            // Without this, a train between two non-adjacent (curve-separated)
            // stops would render as a straight line through buildings instead
            // of following the actual subway tunnel — the F train in midtown
            // is the worst example of this. shape.coords is [[lat, lon], …].
            const routeShapes = routeData.shapes || [];
            if (routeShapes.length > 0) {
                const shape = routeShapes[0];
                if (shape && Array.isArray(shape.coords) && shape.coords.length > 1) {
                    let prevIdx = 0, nextIdx = shape.coords.length - 1;
                    let minPrev = Infinity, minNext = Infinity;
                    for (let i = 0; i < shape.coords.length; i++) {
                        const c = shape.coords[i];
                        const dlatP = c[0] - prevStop.lat, dlonP = c[1] - prevStop.lon;
                        const dlatN = c[0] - nextStop.lat, dlonN = c[1] - nextStop.lon;
                        const dp = dlatP * dlatP + dlonP * dlonP;
                        const dn = dlatN * dlatN + dlonN * dlonN;
                        if (dp < minPrev) { minPrev = dp; prevIdx = i; }
                        if (dn < minNext) { minNext = dn; nextIdx = i; }
                    }
                    // The shape's coordinate order can go either direction along
                    // the line; ensure prev comes first so the segment walk is
                    // forward.
                    if (prevIdx > nextIdx) {
                        const t = prevIdx; prevIdx = nextIdx; nextIdx = t;
                    }
                    const segmentLength = nextIdx - prevIdx;
                    if (segmentLength >= 0) {
                        const targetIdx = prevIdx + Math.floor(segmentLength * progress);
                        const clampedIdx = Math.max(prevIdx, Math.min(nextIdx, targetIdx));
                        const c = shape.coords[clampedIdx];
                        if (c && typeof c[0] === 'number' && typeof c[1] === 'number') {
                            return { coord: [c[1], c[0]], nextStop, prevStop, progress };
                        }
                    }
                }
            }

            // Fallback: straight-line interpolation between stop coords.
            const lat = prevStop.lat + (nextStop.lat - prevStop.lat) * progress;
            const lon = prevStop.lon + (nextStop.lon - prevStop.lon) * progress;
            return { coord: [lon, lat], nextStop, prevStop, progress };
        }

        let _lastMtaSubwayFetch = 0;
        // Yield to the event loop so a queued user click can interleave. A
        // setTimeout(0) lets the browser process input, render frames, etc.
        // before the next chunk of work runs. Used between protobuf decodes
        // and feature-build batches so the MTA Subway poll never freezes the
        // UI for more than a couple of ms at a time.
        const yieldToBrowser = () => new Promise(r => setTimeout(r, 0));

        async function fetchMtaSubwayTrains() {
            if (document.hidden) return;
            if (typeof mtaSubwayRoutesData === 'undefined' || !mtaSubwayRoutesData?.routes) return;
            const now = Date.now();
            if (now - _lastMtaSubwayFetch < 4500) return;
            _lastMtaSubwayFetch = now;
            try {
                const root = await getGtfsRealtimeProto();
                const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
                // Fetch all 7 feeds in parallel — IO-bound, no main-thread cost.
                const buffers = await Promise.all(MTA_SUBWAY_GTFS_RT_URLS.map(async (url) => {
                    try {
                        const r = await fetch(url);
                        if (!r.ok) return null;
                        return await r.arrayBuffer();
                    } catch (_) { return null; }
                }));

                // Decode is CPU-bound — ~20–80 ms per feed × 7 feeds was the
                // freeze source. Yield between each so a click landing during
                // a poll cycle can run between decodes instead of waiting for
                // the whole batch.
                const tripUpdates = [];
                for (const buf of buffers) {
                    if (!buf) continue;
                    await yieldToBrowser();
                    try {
                        const feed = FeedMessage.decode(new Uint8Array(buf));
                        for (const e of feed.entity) {
                            const tu = e.tripUpdate || e.trip_update;
                            if (tu) tripUpdates.push(tu);
                        }
                    } catch (_) { /* one bad feed shouldn't kill the batch */ }
                }

                // Build features in chunks, yielding between. resolveMtaSubwayRoute
                // walks tripToRoute and estimateMtaTrainPosition walks shape
                // coords; per-trip cost is small but ~500 trips compounds.
                const features = [];
                const CHUNK = 60;
                for (let i = 0; i < tripUpdates.length; i += CHUNK) {
                    if (i > 0) await yieldToBrowser();
                    const end = Math.min(i + CHUNK, tripUpdates.length);
                    for (let j = i; j < end; j++) {
                        const tu = tripUpdates[j];
                        const route = resolveMtaSubwayRoute(tu);
                        if (!route) continue;
                        const tripId = tu.trip?.tripId || tu.trip?.trip_id || '';
                        if (!tripId) continue;
                        const pos = estimateMtaTrainPosition(tu, route);
                        if (!pos) continue;
                        let headsign = tu.trip?.tripProperties?.tripHeadsign ||
                                       tu.trip?.trip_properties?.trip_headsign ||
                                       tu.trip?.tripHeadsign ||
                                       tu.trip?.trip_headsign ||
                                       tu.trip?.headsign || '';
                        if (!headsign) {
                            const sts = tu.stopTimeUpdate || tu.stop_time_update || [];
                            if (sts.length) {
                                const lastSid = sts[sts.length - 1].stopId || sts[sts.length - 1].stop_id;
                                if (lastSid && mtaSubwayRoutesData.routes[route]?.stops) {
                                    const s = mtaSubwayRoutesData.routes[route].stops.find(x => x.stop_id === lastSid);
                                    if (s) headsign = s.name || '';
                                }
                            }
                        }
                        features.push({
                            type: 'Feature',
                            properties: {
                                agency:    'mta_subway',
                                mode:      'subway',
                                id:        `${route}_${tripId}`,
                                label:     '',
                                routeId:   route,
                                line:      route,
                                lineKey:   `mta_subway::${route}`,
                                color:     mtaSubwayColorFor(route),
                                icon:      mtaSubwayIconFor(route),
                                headsign,
                                status:    '',
                                tripId
                            },
                            geometry: { type: 'Point', coordinates: pos.coord }
                        });
                    }
                }
                setVehicleSubset('mta_subway:', features);
            } catch (e) {
                console.warn('[maplibre] MTA Subway fetch failed:', e && e.message);
            }
        }
        fetchMtaSubwayTrains();
        setInterval(fetchMtaSubwayTrains, 5000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) fetchMtaSubwayTrains();
        });

        // Hover popup for live vehicles. Same look + behavior as the stop popup
        // but shows route, label, headsign, current status. Reuses the shared
        // hoverPopup instance so cursor moves between layers don't stack popups.
        // Use `mousemove` (not just `mouseenter`) for live vehicles. mouseenter
        // fires once when the cursor enters the layer; moving between two
        // train icons WITHIN the layer doesn't refire it, so the popup would
        // stick on the first icon hovered. mousemove re-picks the closest
        // feature on every cursor movement, keeping the popup always in sync
        // with the icon visually under the cursor.
        function updateVehicleHover(e) {
            const f = pickClosestFeature(e.features, e.point);
            if (!f) return;
            if (highlightedLineKeys.length > 0 && !highlightedLineKeys.includes(f.properties.lineKey)) return;
            map.getCanvas().style.cursor = 'pointer';
            if (hoveredVehicleFeature !== f && hoveredVehicleFeature?.properties?.id === f.properties.id) {
                // Same train, but the feature object refreshed (new poll cycle) —
                // update the reference but no popup re-render needed.
                hoveredVehicleFeature = f;
                return;
            }
            hoveredVehicleFeature = f;
            refreshHoverPopup();
        }
        map.on('mouseenter', 'live-vehicles', updateVehicleHover);
        map.on('mousemove',  'live-vehicles', updateVehicleHover);
        map.on('mouseleave', 'live-vehicles', () => {
            map.getCanvas().style.cursor = '';
            hoveredVehicleFeature = null;
            refreshHoverPopup();
        });

        // ─── Info-panel checkbox wiring ────────────────────────────────────────
        // Each `paths` checkbox controls one (agency, mode) combination — its
        // static line + stop layers. Each `live` checkbox controls live vehicle
        // visibility for that (agency, mode). When a checkbox flips, recompute
        // filters on every relevant layer based on the union of all enabled
        // combos. This is the architectural answer to "buses still showed up
        // when unchecked" — live and paths are independent, and bus live is
        // its own toggle separate from bus paths.
        const PATHS_CHECKBOX_MAP = {
            'show-subway-paths':         { agency: 'mbta',             mode: 'subway' },
            'show-commuter-paths':       { agency: 'mbta',             mode: 'commuter' },
            'show-bus-paths':            { agency: 'mbta',             mode: 'bus' },
            'show-silver-line-paths':    { agency: 'mbta',             mode: 'silver_line' },
            'show-shuttle-paths':        { agency: 'mbta',             mode: 'shuttle' },
            'show-ferry-paths':          { agency: 'mbta',             mode: 'ferry' },
            'show-lirr-paths':           { agency: 'lirr',             mode: 'commuter' },
            'show-metro-north-paths':    { agency: 'metro_north',      mode: 'commuter' },
            'show-mta-subway-paths':     { agency: 'mta_subway',       mode: 'subway' },
            'show-nj-transit-paths':     { agency: 'nj_transit',       mode: 'commuter' },
            'show-septa-paths':          { agency: 'septa',            mode: 'commuter' },
            'show-shore-line-east-paths':{ agency: 'shore_line_east',  mode: 'commuter' },
            'show-hartford-line-paths':  { agency: 'hartford_line',    mode: 'commuter' },
            'show-amtrak-paths':         { agency: 'amtrak',           mode: 'amtrak' }
        };
        const LIVE_CHECKBOX_MAP = {
            'show-subway-live':       { agency: 'mbta', mode: 'subway' },
            'show-commuter-live':     { agency: 'mbta', mode: 'commuter' },
            'show-bus-live':          { agency: 'mbta', mode: 'bus' },
            'show-silver-line-live':  { agency: 'mbta', mode: 'silver_line' },
            'show-lirr-live':         { agency: 'lirr',        mode: 'commuter' },
            'show-metro-north-live':  { agency: 'metro_north', mode: 'commuter' },
            'show-nj-transit-live':   { agency: 'nj_transit',  mode: 'commuter' },
            'show-septa-live':        { agency: 'septa',       mode: 'commuter' },
            'show-amtrak-live':       { agency: 'amtrak',      mode: 'amtrak' },
            'show-mta-subway-live':   { agency: 'mta_subway',  mode: 'subway' }
            // Hartford Line live tracking has no upstream feed in the original
            // app either; its checkbox stays disabled.
        };

        // Per-mode line/stop layers. Each layer's filter gets rebuilt as
        // (mode-base) AND (agency in enabled list).
        const LINE_LAYER_MODE = {
            'rail-subway-line':       { mode: 'subway',    base: ['==', ['get', 'mode'], 'subway'] },
            'rail-subway-mta-center': { mode: 'subway',    base: ['all', ['==', ['get', 'mode'], 'subway'], ['==', ['get', 'agency'], 'mta_subway']], agencyLocked: 'mta_subway' },
            'rail-commuter-line':     { mode: 'commuter',  base: ['==', ['get', 'mode'], 'commuter'], excludeAgencies: ['shore_line_east'] },
            'rail-sle-line':          { mode: 'commuter',  base: ['all', ['==', ['get', 'mode'], 'commuter'], ['==', ['get', 'agency'], 'shore_line_east']], agencyLocked: 'shore_line_east' },
            'rail-amtrak-line':       { mode: 'amtrak',    base: ['==', ['get', 'mode'], 'amtrak'] },
            'mbta-bus-line':          { mode: 'bus',       base: ['==', ['get', 'mode'], 'bus'] },
            'mbta-silver-line':       { mode: 'silver_line', base: ['==', ['get', 'mode'], 'silver_line'] },
            'mbta-shuttle-line':      { mode: 'shuttle',   base: ['==', ['get', 'mode'], 'shuttle'] },
            'mbta-ferry-line':        { mode: 'ferry',     base: ['==', ['get', 'mode'], 'ferry'] }
        };
        const SURFACE_STOP_LAYER_MODE = {
            'mbta-bus-stops':         { mode: 'bus' },
            'mbta-silver-line-stops': { mode: 'silver_line' },
            'mbta-shuttle-stops':     { mode: 'shuttle' },
            'mbta-ferry-stops':       { mode: 'ferry' }
        };

        function refreshAllCheckboxes() {
            // 1) Build per-mode enabled-agency sets.
            const pathsByMode = {};
            for (const [id, info] of Object.entries(PATHS_CHECKBOX_MAP)) {
                const cb = document.getElementById(id);
                if (!cb || !cb.checked) continue;
                if (!pathsByMode[info.mode]) pathsByMode[info.mode] = new Set();
                pathsByMode[info.mode].add(info.agency);
            }
            const liveByMode = {};
            for (const [id, info] of Object.entries(LIVE_CHECKBOX_MAP)) {
                const cb = document.getElementById(id);
                if (!cb || !cb.checked || cb.disabled) continue;
                if (!liveByMode[info.mode]) liveByMode[info.mode] = new Set();
                liveByMode[info.mode].add(info.agency);
            }

            // 2) Apply to line layers.
            for (const [layerId, info] of Object.entries(LINE_LAYER_MODE)) {
                const enabled = pathsByMode[info.mode] || new Set();
                if (info.agencyLocked) {
                    // rail-subway-mta-center / rail-sle-line: locked to a
                    // specific agency; visibility purely depends on whether
                    // that agency is enabled.
                    map.setLayoutProperty(layerId, 'visibility',
                        enabled.has(info.agencyLocked) ? 'visible' : 'none');
                    continue;
                }
                let agencies = Array.from(enabled);
                if (info.excludeAgencies) {
                    agencies = agencies.filter(a => !info.excludeAgencies.includes(a));
                }
                if (agencies.length === 0) {
                    map.setLayoutProperty(layerId, 'visibility', 'none');
                } else {
                    map.setLayoutProperty(layerId, 'visibility', 'visible');
                    map.setFilter(layerId, ['all',
                        ['==', ['get', 'mode'], info.mode],
                        ['in', ['get', 'agency'], ['literal', agencies]]
                    ]);
                }
            }

            // 3) Surface-mode stop layers.
            for (const [layerId, info] of Object.entries(SURFACE_STOP_LAYER_MODE)) {
                const enabled = pathsByMode[info.mode] || new Set();
                const agencies = Array.from(enabled);
                if (agencies.length === 0) {
                    map.setLayoutProperty(layerId, 'visibility', 'none');
                } else {
                    map.setLayoutProperty(layerId, 'visibility', 'visible');
                    map.setFilter(layerId, ['all',
                        ['==', ['get', 'mode'], info.mode],
                        ['in', ['get', 'agency'], ['literal', agencies]]
                    ]);
                }
            }

            // 4) rail-stops — cross-mode, filter by enabled (agency, rail-mode) combos.
            const railCombos = [];
            for (const m of RAIL_MODES) {
                const enabled = pathsByMode[m];
                if (!enabled) continue;
                for (const a of enabled) railCombos.push([a, m]);
            }
            if (railCombos.length === 0) {
                map.setLayoutProperty('rail-stops', 'visibility', 'none');
            } else {
                map.setLayoutProperty('rail-stops', 'visibility', 'visible');
                map.setFilter('rail-stops', ['any', ...railCombos.map(([a, m]) =>
                    ['all', ['==', ['get', 'agency'], a], ['==', ['get', 'mode'], m]]
                )]);
            }

            // 5) live-vehicles — driven by the LIVE checkboxes only, completely
            // independent of paths. This is what fixes "bus showing when bus
            // path is unchecked but bus live is checked" and vice versa.
            const liveCombos = [];
            for (const [m, agencies] of Object.entries(liveByMode)) {
                for (const a of agencies) liveCombos.push([a, m]);
            }
            if (liveCombos.length === 0) {
                map.setLayoutProperty('live-vehicles', 'visibility', 'none');
            } else {
                map.setLayoutProperty('live-vehicles', 'visibility', 'visible');
                map.setFilter('live-vehicles', ['any', ...liveCombos.map(([a, m]) =>
                    ['all', ['==', ['get', 'agency'], a], ['==', ['get', 'mode'], m]]
                )]);
            }
        }

        // Wire all checkboxes (both paths and live).
        const allCbIds = [...Object.keys(PATHS_CHECKBOX_MAP), ...Object.keys(LIVE_CHECKBOX_MAP)];
        for (const id of allCbIds) {
            const cb = document.getElementById(id);
            if (cb) cb.addEventListener('change', refreshAllCheckboxes);
        }
        refreshAllCheckboxes();
    });

    // ─── Tab + panel JS (used by inline onclick attrs in the HTML) ─────────────
    // Mirrors switchTab in app.js: pick the tab AND fly the map to that
    // agency's region. Smooth flyTo animation rather than instant jumpTo so
    // it's clear something happened.
    window.switchTab = function (tabName) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        const tab = document.getElementById(tabName + '-tab');
        if (tab) tab.classList.add('active');
        document.querySelectorAll('.tab-button').forEach(b => {
            if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${tabName}'`)) {
                b.classList.add('active');
            }
        });
        const region = TAB_REGIONS[tabName];
        if (region && window.__map) {
            window.__map.flyTo({ center: region.center, zoom: region.zoom, duration: 900 });
        }
    };
    window.togglePanel = function (id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('collapsed');
    };
    // Collapse / expand the show/hide table inside a tab via the `.collapsed`
    // class — styles.css animates max-height + opacity. Also rotate the
    // matching button 180° so it visually flips between "hide" / "show".
    window.toggleLinesSection = function (prefix) {
        const id = prefix ? `${prefix}-lines-section` : 'lines-section';
        const section = document.getElementById(id);
        if (!section) return;
        section.classList.toggle('collapsed');
        const isCollapsed = section.classList.contains('collapsed');
        const tab = section.closest('.tab-content');
        if (tab) {
            const btn = tab.querySelector('.lines-toggle');
            if (btn) btn.classList.toggle('collapsed', isCollapsed);
        }
    };

    map.on('error', (e) => {
        if (e && e.error) console.warn('[maplibre]', e.error.message || e.error);
    });

    // ─── Utilities ──────────────────────────────────────────────────────────────

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // MapLibre serializes array-valued properties to JSON strings when handing
    // features back to JS event callbacks (the same value stays an array
    // internally for expression evaluation). Accept both forms.
    function parseRoutes(raw) {
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed.startsWith('[')) {
                try { return JSON.parse(trimmed); } catch (_) { /* fall through */ }
            }
            return trimmed.split(',').map(s => s.trim()).filter(Boolean);
        }
        return [];
    }
})();
