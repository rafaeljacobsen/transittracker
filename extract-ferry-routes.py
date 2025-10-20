#!/usr/bin/env python3
"""
Extract MBTA Ferry Routes from GTFS Data
This script extracts all ferry routes from routes.txt, stops.txt, and shapes.txt
Converted from PowerShell to Python with tqdm progress bars
"""

import csv
from collections import defaultdict
from tqdm import tqdm

print("Extracting MBTA Ferry Routes...")

# Step 1: Get ferry routes from routes.txt
print("Step 1: Loading ferry routes...")
target_routes = {}

with open("mbta_gtfs/routes.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    for fields in reader:
        if len(fields) >= 6:
            route_id = fields[0]
            try:
                route_type = int(fields[5])
                if route_type == 4:  # 4 = Ferry
                    target_routes[route_id] = {
                        'name': fields[3],
                        'type': route_type
                    }
            except ValueError:
                pass

print(f"Found {len(target_routes)} ferry routes")

# Step 2: Get trips and shapes for each route
print("Step 2: Loading trips and shapes...")
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

print("Found trips and shapes for each route:")
for route_id in target_routes.keys():
    print(f"  {route_id}: {len(route_trips[route_id])} trips, {len(route_shapes[route_id])} shapes")

# Step 3: Get stop coordinates
print("Step 3: Loading stops...")
stops = {}

with open("mbta_gtfs/stops.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    for fields in reader:
        if len(fields) >= 8:
            stop_id = fields[0]
            stop_name = fields[2]
            try:
                stop_lat = float(fields[6])
                stop_lon = float(fields[7])
                stops[stop_id] = {
                    'name': stop_name,
                    'lat': stop_lat,
                    'lon': stop_lon
                }
            except ValueError:
                pass

print(f"Loaded {len(stops)} stops with coordinates")

# Step 4: Get stops for each route
print("Step 4: Processing stop times...")
route_stops = defaultdict(dict)

# Count total lines for progress bar
with open("mbta_gtfs/stop_times.txt", "r", encoding="utf-8") as f:
    total_lines = sum(1 for _ in f) - 1  # Subtract header

print(f"Processing {total_lines} stop-time records...")

with open("mbta_gtfs/stop_times.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    
    for fields in tqdm(reader, total=total_lines, desc="Processing stop times", unit="records"):
        if len(fields) >= 4:
            trip_id = fields[0]
            stop_id = fields[3]
            
            # Find which route this trip belongs to
            for route_id in target_routes.keys():
                if trip_id in route_trips[route_id]:
                    route_stops[route_id][stop_id] = True
                    break

# Step 5: Load shapes efficiently
print("Step 5: Loading shapes...")
shapes = defaultdict(list)

# Only load shapes we actually need
needed_shapes = set()
for route_id in target_routes.keys():
    needed_shapes.update(route_shapes[route_id])

needed_shapes = sorted(needed_shapes)
print(f"Loading {len(needed_shapes)} unique shapes...")

if needed_shapes:
    # Read all shape data
    with open("mbta_gtfs/shapes.txt", "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # Skip header
        
        for fields in tqdm(reader, desc="Loading shapes", unit="points"):
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

shape_count = sum(len(points) for points in shapes.values())
print(f"Loaded {shape_count} shape points for {len(needed_shapes)} shapes")

# Step 6: Build final data structure
print("Step 6: Building final data structure...")
final_data = {}

for route_id, route_stop_dict in route_stops.items():
    route_name = target_routes[route_id]['name']
    route_stops_list = []
    
    for stop_id in route_stop_dict.keys():
        if stop_id in stops:
            stop = stops[stop_id]
            
            route_stops_list.append({
                'name': stop['name'],
                'coords': [stop['lat'], stop['lon']],
                'type': 'Ferry',
                'stopId': stop_id
            })
    
    if route_stops_list:
        final_data[route_id] = route_stops_list

# Step 7: Generate JavaScript
print("Step 7: Generating JavaScript...")
js_content = "// MBTA Ferry Routes Data - Extracted from GTFS Static Data\n"
js_content += "const mbtaFerryData = {\n"

for route_id in sorted(final_data.keys()):
    route_name = target_routes[route_id]['name']
    js_content += f"    '{route_id}': [\n"
    stops_list = sorted(final_data[route_id], key=lambda x: x['name'])
    for stop in stops_list:
        js_content += f'        {{name: "{stop["name"]}", coords: [{stop["coords"][0]}, {stop["coords"][1]}], type: \'{stop["type"]}\', stopId: \'{stop["stopId"]}\'}},\n'
    js_content += "    ],\n\n"

js_content += "};\n\n"

# Add shapes data
js_content += "// Ferry route shapes for each route\n"
js_content += "const ferryRouteShapes = {\n"

for route_id in target_routes.keys():
    js_content += f"    '{route_id}': [\n"
    
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

js_content += "};\n"

# Save to file
with open("mbta-ferry-data.js", "w", encoding="utf-8") as f:
    f.write(js_content)

print("Generated mbta-ferry-data.js with ferry route data")
print(f"Routes found: {len(final_data.keys())}")
for route_id in sorted(final_data.keys()):
    stop_count = len(final_data[route_id])
    print(f"  Route {route_id}: {stop_count} stops")

