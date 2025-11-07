#!/usr/bin/env python3
"""
Extract Silver Line routes from MBTA GTFS data
"""

import csv
from collections import defaultdict
from tqdm import tqdm

print("Extracting Silver Line data from MBTA GTFS...")

# Silver Line route IDs
SILVER_LINE_ROUTES = {
    '741': 'SL1',
    '742': 'SL2',
    '743': 'SL3',
    '751': 'SL4',
    '749': 'SL5',
    '746': 'SLW'
}

print(f"Target routes: {list(SILVER_LINE_ROUTES.values())}")

# Step 1: Load stops
print("Step 1: Loading stops...")
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

print(f"Loaded {len(stops)} stops")

# Step 2: Get trips for Silver Line routes
print("Step 2: Loading trips...")
route_trips = defaultdict(set)

with open("mbta_gtfs/trips.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip header
    for fields in reader:
        if len(fields) >= 3:
            route_id = fields[0]
            trip_id = fields[2]
            if route_id in SILVER_LINE_ROUTES:
                route_trips[route_id].add(trip_id)

print(f"Found trips for {len(route_trips)} Silver Line routes")

# Step 3: Build trip-to-route mapping
trip_to_route = {}
for route_id, trips in route_trips.items():
    for trip_id in trips:
        trip_to_route[trip_id] = route_id

# Step 4: Get stops for each route
print("Step 3: Processing stop times...")
route_stops = defaultdict(dict)

with open("mbta_gtfs/stop_times.txt", "r", encoding="utf-8") as f:
    total_lines = sum(1 for _ in f) - 1

with open("mbta_gtfs/stop_times.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    
    for fields in tqdm(reader, total=total_lines, desc="Processing stop times", unit="records"):
        if len(fields) >= 4:
            trip_id = fields[0]
            stop_id = fields[3]
            
            if trip_id in trip_to_route:
                route_id = trip_to_route[trip_id]
                route_stops[route_id][stop_id] = True

# Step 5: Get shapes for each route
print("Step 4: Loading shapes...")
route_shapes = defaultdict(set)

def normalize_shape_id(shape_id):
    """Normalize shape ID by removing leading zeros"""
    if not shape_id:
        return shape_id
    try:
        return str(int(shape_id))
    except:
        return shape_id

with open("mbta_gtfs/trips.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    for fields in reader:
        if len(fields) >= 8:
            route_id = fields[0]
            shape_id = fields[7]
            if route_id in SILVER_LINE_ROUTES and shape_id:
                route_shapes[route_id].add(normalize_shape_id(shape_id))

print(f"Found {sum(len(shapes) for shapes in route_shapes.values())} shape IDs")

# Step 6: Load shape coordinates
print("Step 5: Loading shape coordinates...")
shapes = defaultdict(list)

needed_shapes = set()
for route_id in SILVER_LINE_ROUTES.keys():
    needed_shapes.update(route_shapes[route_id])

with open("mbta_gtfs/shapes.txt", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    
    for fields in reader:
        if len(fields) >= 5:
            shape_id = normalize_shape_id(fields[0])
            if shape_id in needed_shapes:
                try:
                    lat = float(fields[1])
                    lon = float(fields[2])
                    sequence = int(fields[3])
                    distance = float(fields[4]) if fields[4] else 0.0
                    
                    shapes[shape_id].append({
                        'lat': lat,
                        'lon': lon,
                        'sequence': sequence,
                        'distance': distance
                    })
                except ValueError:
                    pass

print(f"Loaded {len(shapes)} shapes with coordinates")

# Step 7: Build final data structure
print("Step 6: Building JavaScript output...")
js_content = "// Silver Line Data - Extracted from MBTA GTFS\n"
js_content += "// Silver Line is Boston's bus rapid transit system\n\n"

js_content += "const silverLineData = {\n"

for route_id in sorted(SILVER_LINE_ROUTES.keys()):
    route_name = SILVER_LINE_ROUTES[route_id]
    js_content += f"    '{route_name}': [\n"
    
    stops_list = []
    for stop_id in route_stops[route_id].keys():
        if stop_id in stops:
            stop = stops[stop_id]
            stops_list.append({
                'name': stop['name'],
                'coords': [stop['lat'], stop['lon']],
                'stopId': stop_id
            })
    
    # Sort by name
    stops_list = sorted(stops_list, key=lambda x: x['name'])
    
    for stop in stops_list:
        js_content += f'        {{name: "{stop["name"]}", coords: [{stop["coords"][0]}, {stop["coords"][1]}], stopId: "{stop["stopId"]}"}},\n'
    
    js_content += "    ],\n\n"

js_content += "};\n\n"

# Add shapes
js_content += "// Silver Line route shapes\n"
js_content += "const silverLineShapes = {\n"

for route_id in sorted(SILVER_LINE_ROUTES.keys()):
    route_name = SILVER_LINE_ROUTES[route_id]
    js_content += f"    '{route_name}': [\n"
    
    for shape_id in sorted(route_shapes[route_id]):
        if shape_id in shapes:
            js_content += "        {\n"
            js_content += f"            shapeId: '{shape_id}',\n"
            js_content += "            coords: [\n"
            
            shape_points = sorted(shapes[shape_id], key=lambda x: x['sequence'])
            
            for point in shape_points:
                js_content += f"                [{point['lat']}, {point['lon']}],\n"
            
            js_content += "            ]\n"
            js_content += "        },\n"
    
    js_content += "    ],\n\n"

js_content += "};\n\n"

# Add line colors
js_content += "// Silver Line colors\n"
js_content += "const silverLineColors = {\n"
for route_name in SILVER_LINE_ROUTES.values():
    js_content += f"    '{route_name}': '#7C878E',  // Official MBTA Silver Line color\n"
js_content += "};\n"

# Save to file
with open("mbta-silver-line-data.js", "w", encoding="utf-8") as f:
    f.write(js_content)

print("\n" + "="*50)
print("SILVER LINE DATA GENERATION COMPLETE")
print("="*50)
print(f"Total routes processed: {len(SILVER_LINE_ROUTES)}")

routes_with_shapes = sum(1 for route_id in SILVER_LINE_ROUTES.keys() if len(route_shapes[route_id]) > 0)
routes_with_stops_only = []

for route_id in sorted(SILVER_LINE_ROUTES.keys()):
    route_name = SILVER_LINE_ROUTES[route_id]
    stop_count = len(route_stops[route_id])
    shape_count = len(route_shapes[route_id])
    if stop_count > 0 and shape_count == 0:
        routes_with_stops_only.append(route_name)

print(f"Routes with shapes: {routes_with_shapes}")
print(f"Routes with stops only: {len(routes_with_stops_only)}")

if routes_with_stops_only:
    print("\nRoutes with stops but NO shapes:")
    for route_name in routes_with_stops_only:
        print(f"  - Route {route_name}")

