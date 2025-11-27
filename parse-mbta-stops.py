#!/usr/bin/env python3
"""
Parse MBTA stops with accurate locations
"""

import csv
from collections import defaultdict
from tqdm import tqdm

# Step 1: Get target routes
target_routes = {}

with open("mbta_gtfs/routes.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    for fields in reader:
        if len(fields) >= 6:
            route_id = fields[0]
            try:
                route_type = int(fields[5])
                if route_type in [0, 1, 2]:  # Subway (0,1) or Commuter Rail (2)
                    target_routes[route_id] = {
                        'name': fields[3],
                        'type': route_type
                    }
            except ValueError:
                pass

# Step 2: Get actual trips and shapes for each route
route_trips = defaultdict(list)
route_shapes = defaultdict(list)

with open("mbta_gtfs/trips.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    for fields in reader:
        if len(fields) >= 8:
            route_id = fields[0]
            trip_id = fields[2]
            shape_id = fields[7]
            
            if route_id in target_routes and shape_id:
                route_trips[route_id].append(trip_id)
                if shape_id not in route_shapes[route_id]:
                    route_shapes[route_id].append(shape_id)

# Step 3: Get stop coordinates and parent station mapping
stops = {}
stop_to_parent = {}  # Maps stop_id to parent_station (or stop_id itself if no parent)

with open("mbta_gtfs/stops.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    for fields in reader:
        if len(fields) >= 14:
            stop_id = fields[0]
            stop_name = fields[2]
            parent_station = fields[13] if len(fields) > 13 and fields[13] else None
            try:
                stop_lat = float(fields[6])
                stop_lon = float(fields[7])
                stops[stop_id] = {
                    'name': stop_name,
                    'lat': stop_lat,
                    'lon': stop_lon
                }
                # Map stop to its parent station (or itself if no parent)
                stop_to_parent[stop_id] = parent_station if parent_station else stop_id
            except ValueError:
                pass

# Step 4: Build trip-to-route mapping for efficient lookup
trip_to_route = {}
for route_id, trips in route_trips.items():
    for trip_id in trips:
        trip_to_route[trip_id] = route_id

# Step 5: Get stops for each route
route_stops = defaultdict(dict)

with open("mbta_gtfs/stop_times.txt", "r", encoding="utf-8") as f:
    total_lines = sum(1 for _ in f) - 1

with open("mbta_gtfs/stop_times.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    
    for fields in tqdm(reader, total=total_lines, desc="Processing stop times", unit="stops"):
        if len(fields) >= 4:
            trip_id = fields[0]
            stop_id = fields[3]
            
            # Find which route this trip belongs to
            if trip_id in trip_to_route:
                route_id = trip_to_route[trip_id]
                route_stops[route_id][stop_id] = True

# Step 6: Load shapes efficiently
shapes = defaultdict(list)

# Only load shapes we actually need
needed_shapes = set()
for route_id in target_routes.keys():
    needed_shapes.update(route_shapes[route_id])

needed_shapes = sorted(needed_shapes)

if needed_shapes:
    # Read all shape data
    with open("mbta_gtfs/shapes.txt", "r", encoding="utf-8") as f:
        total_lines = sum(1 for _ in f) - 1
    
    with open("mbta_gtfs/shapes.txt", "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # Skip header
        
        for fields in tqdm(reader, total=total_lines, desc="Loading shapes", unit="points"):
            if len(fields) >= 4:
                shape_id = fields[0]
                if shape_id in needed_shapes:
                    try:
                        shape_lat = float(fields[1])
                        shape_lon = float(fields[2])
                        shape_sequence = int(fields[3])
                        distance = float(fields[4]) if len(fields) >= 5 and fields[4] else 0
                        
                        shapes[shape_id].append({
                            'lat': shape_lat,
                            'lon': shape_lon,
                            'sequence': shape_sequence,
                            'distance': distance
                        })
                    except ValueError:
                        pass

# Step 7: Build final data structure
final_data = {}
stop_to_routes = defaultdict(set)  # Use set to avoid duplicates

for route_id, route_stop_dict in route_stops.items():
    route_name = target_routes[route_id]['name']
    route_type = target_routes[route_id]['type']
    route_stops_list = []
    
    for stop_id in route_stop_dict.keys():
        if stop_id in stops:
            stop = stops[stop_id]
            stop_type = "Commuter Rail" if route_type == 2 else "Subway"
            
            route_stops_list.append({
                'name': stop['name'],
                'coords': [stop['lat'], stop['lon']],
                'type': stop_type,
                'stopId': stop_id
            })
            
            # Track which routes serve each stop
            stop_to_routes[stop_id].add(route_name)
    
    if route_stops_list:
        final_data[route_name] = route_stops_list

# Step 7.5: Merge routes for stops that share the same parent station
# Build parent station to child stops mapping
parent_to_stops = defaultdict(list)
for stop_id, parent_id in stop_to_parent.items():
    parent_to_stops[parent_id].append(stop_id)

# For each parent station, merge all routes from all child stops
for parent_id, child_stops in parent_to_stops.items():
    if len(child_stops) > 1:  # Only process if there are multiple child stops
        # Collect all routes from all child stops
        all_routes = set()
        for child_stop_id in child_stops:
            all_routes.update(stop_to_routes[child_stop_id])
        
        # Assign all routes to each child stop
        for child_stop_id in child_stops:
            stop_to_routes[child_stop_id] = all_routes.copy()

# Convert sets to sorted lists for consistent output
stop_to_routes = {k: sorted(list(v)) for k, v in stop_to_routes.items()}

# Step 8: Generate JavaScript
js_content = "// MBTA Stops Data - Extracted from GTFS Static Data with Shapes\n"
js_content += "const mbtaStopsData = {\n"

for route_name in tqdm(sorted(final_data.keys()), desc="Building stop data", unit="routes"):
    js_content += f"    '{route_name}': [\n"
    stops_list = sorted(final_data[route_name], key=lambda x: x['name'])
    for stop in stops_list:
        js_content += f'        {{name: "{stop["name"]}", coords: [{stop["coords"][0]}, {stop["coords"][1]}], type: \'{stop["type"]}\', stopId: \'{stop["stopId"]}\'}},\n'
    js_content += "    ],\n\n"

js_content += "};\n\n"

# Add shapes data
js_content += "// Track shapes for each route\n"
js_content += "const routeShapes = {\n"

for route_id in tqdm(target_routes.keys(), desc="Building shape data", unit="routes"):
    route_name = target_routes[route_id]['name']
    js_content += f"    '{route_name}': [\n"
    
    for shape_id in route_shapes[route_id]:
        if shape_id in shapes:
            js_content += "        {\n"
            js_content += f"            shapeId: '{shape_id}',\n"
            js_content += "            coords: [\n"
            
            shape_points = sorted(shapes[shape_id], key=lambda x: x['sequence'])
            
            for point in shape_points:
                js_content += f"                [{point['lat']}, {point['lon']}],\n"
            
            js_content += "            ],\n"
            js_content += "            distances: [\n"
            
            for point in shape_points:
                js_content += f"                {point['distance']},\n"
            
            js_content += "            ]\n"
            js_content += "        },\n"
    
    js_content += "    ],\n\n"

js_content += "};\n\n"

# Add stop-to-routes mapping for multi-line stops
js_content += "// Stop to routes mapping for multi-line stops\n"
js_content += "const stopToRoutes = {\n"
for stop_id in sorted(stop_to_routes.keys()):
    routes = sorted(stop_to_routes[stop_id])
    routes_str = "', '".join(routes)
    js_content += f"    '{stop_id}': ['{routes_str}'],\n"
js_content += "};\n\n"

js_content += "// Export for use in other files\n"
js_content += "if (typeof module !== 'undefined' && module.exports) {\n"
js_content += "    module.exports = { mbtaStopsData, stopToRoutes, routeShapes };\n"
js_content += "}\n"

# Save to file
with open("mbta-stops.js", "w", encoding="utf-8") as f:
    f.write(js_content)

print("\n" + "="*50)
print("MBTA STOPS PARSING COMPLETE")
print("="*50)
print(f"Routes processed: {len(final_data.keys())}")

# Count multi-line stops
multi_line_stops = sum(1 for routes in stop_to_routes.values() if len(routes) > 1)
print(f"Multi-line stops found: {multi_line_stops}")

