#!/usr/bin/env python3
"""
Generate MBTA shuttle data from GTFS files.
This script extracts shuttle routes (route_type 3 with 'shuttle' in name or Shuttle- prefix).
"""

import pandas as pd
import json
from pathlib import Path
from tqdm import tqdm

def load_gtfs_data():
    """Load GTFS data from files."""
    print("Loading GTFS data...")
    
    gtfs_dir = Path("mbta_gtfs")
    if not gtfs_dir.exists():
        print("Error: GTFS directory not found.")
        return None
    
    routes_df = pd.read_csv(gtfs_dir / "routes.txt")
    print(f"Loaded {len(routes_df)} routes from GTFS")
    
    stops_df = pd.read_csv(gtfs_dir / "stops.txt")
    print(f"Loaded {len(stops_df)} stops from GTFS")
    
    stop_times_df = pd.read_csv(gtfs_dir / "stop_times.txt")
    print(f"Loaded {len(stop_times_df)} stop times from GTFS")
    
    trips_df = pd.read_csv(gtfs_dir / "trips.txt")
    print(f"Loaded {len(trips_df)} trips from GTFS")
    
    shapes_file = gtfs_dir / "shapes.txt"
    shapes_df = None
    if shapes_file.exists():
        shapes_df = pd.read_csv(shapes_file)
        print(f"Loaded {len(shapes_df)} shape points from GTFS")
        
        # Normalize shape_id column (remove leading zeros)
        def normalize_shape_id(val):
            try:
                if pd.isna(val):
                    return str(val)
                if isinstance(val, float):
                    return str(int(val))
                s = str(val)
                try:
                    return str(int(s))
                except:
                    return s
            except:
                return str(val)
        
        shapes_df['shape_id'] = shapes_df['shape_id'].apply(normalize_shape_id)
    
    # Normalize shape_id in trips.txt to match
    if 'shape_id' in trips_df.columns:
        def normalize_shape_id(val):
            try:
                if pd.isna(val):
                    return val
                if isinstance(val, float):
                    return str(int(val))
                s = str(val)
                try:
                    return str(int(s))
                except:
                    return s
            except:
                return str(val)
        
        trips_df['shape_id'] = trips_df['shape_id'].apply(normalize_shape_id)
    
    return routes_df, stops_df, stop_times_df, trips_df, shapes_df

def get_shuttle_routes(routes_df):
    """Get ONLY shuttle routes (route_type 3 with shuttle in name or Shuttle- prefix)."""
    print("Available columns in routes.txt:", list(routes_df.columns))
    
    # Filter for bus routes (route_type 3)
    bus_routes = routes_df[routes_df['route_type'] == 3].copy()
    
    # Filter for shuttles
    shuttle_routes = bus_routes[
        bus_routes['route_id'].astype(str).str.startswith('Shuttle-') |
        bus_routes['route_long_name'].str.contains('shuttle', case=False, na=False)
    ]
    
    print(f"Found {len(shuttle_routes)} shuttle routes")
    return shuttle_routes

def get_route_shapes(route_id, trips_df, shapes_df):
    """Get shape data for a route if available."""
    if shapes_df is None:
        return []
    
    route_id_str = str(route_id)
    route_trips = trips_df[trips_df['route_id'].astype(str) == route_id_str]
    
    if route_trips.empty:
        return []
    
    shape_ids = route_trips['shape_id'].dropna().astype(str).unique()
    if len(shape_ids) == 0:
        return []
    
    shapes = []
    for shape_id in shape_ids:
        shape_data = shapes_df[shapes_df['shape_id'] == str(shape_id)]
        if not shape_data.empty:
            shape_data = shape_data.sort_values('shape_pt_sequence')
            
            coords = []
            for _, point in shape_data.iterrows():
                coords.append([float(point['shape_pt_lat']), float(point['shape_pt_lon'])])
            
            if len(coords) > 1:
                shapes.append({
                    'shape_id': str(shape_id),
                    'coords': coords
                })
    
    return shapes

def generate_shuttle_data():
    """Generate complete shuttle data."""
    print("Starting shuttle data generation...")
    
    gtfs_data = load_gtfs_data()
    if gtfs_data[0] is None:
        return
    
    routes_df, stops_df, stop_times_df, trips_df, shapes_df = gtfs_data
    
    all_routes = get_shuttle_routes(routes_df)
    
    # Build route-trips mapping with reverse lookup
    print("Building route-trips mapping...")
    route_trips_dict = {}
    trip_to_route_map = {}
    
    for _, route in all_routes.iterrows():
        route_id = str(route['route_id'])
        route_trips_dict[route_id] = []
    
    for _, trip in trips_df.iterrows():
        route_id = str(trip['route_id'])
        trip_id = str(trip['trip_id'])
        if route_id in route_trips_dict:
            route_trips_dict[route_id].append(trip_id)
            trip_to_route_map[trip_id] = route_id
    
    print(f"Built mapping for {len(route_trips_dict)} routes and {len(trip_to_route_map)} trips")
    
    # Process stop_times using vectorized operations
    print("Processing stop_times.txt to get route stops...")
    route_stops_dict = {}
    for _, route in all_routes.iterrows():
        route_id = str(route['route_id'])
        route_stops_dict[route_id] = set()
    
    # Convert to strings and map to routes
    stop_times_df['trip_id_str'] = stop_times_df['trip_id'].astype(str)
    stop_times_df['stop_id_str'] = stop_times_df['stop_id'].astype(str)
    stop_times_df['route_id'] = stop_times_df['trip_id_str'].map(trip_to_route_map)
    
    # Filter to only shuttle routes
    shuttle_stop_times = stop_times_df[stop_times_df['route_id'].notna()]
    
    # Group by route and collect unique stops
    print("Grouping stops by route...")
    for route_id, group in tqdm(shuttle_stop_times.groupby('route_id'), desc="Processing routes", unit="routes"):
        route_stops_dict[route_id] = set(group['stop_id_str'].unique())
    
    print("Finished processing stop_times.txt")
    
    # Generate shuttle data
    mbta_shuttle_data = {}
    shuttle_route_shapes = {}
    
    print("Processing routes...")
    for _, route in tqdm(all_routes.iterrows(), total=len(all_routes), desc="Processing routes", unit="routes"):
        route_id = str(route['route_id'])
        route_name = route['route_long_name']
        
        stop_ids = route_stops_dict.get(route_id, set())
        stops = []
        
        for stop_id in stop_ids:
            stop_details = stops_df[stops_df['stop_id'] == stop_id]
            if not stop_details.empty:
                stop = stop_details.iloc[0]
                stop_obj = {
                    'name': stop['stop_name'],
                    'coords': [float(stop['stop_lat']), float(stop['stop_lon'])],
                    'type': 'Shuttle',
                    'stopId': str(stop['stop_id'])
                }
                stops.append(stop_obj)
        
        # Get shapes
        shapes = get_route_shapes(route_id, trips_df, shapes_df)
        
        if stops or shapes:
            if stops:
                mbta_shuttle_data[route_id] = stops
            else:
                mbta_shuttle_data[route_id] = []
        
        if shapes:
            shuttle_route_shapes[route_id] = shapes
    
    print(f"Generated data for {len(mbta_shuttle_data)} routes")
    print(f"Generated shapes for {len(shuttle_route_shapes)} routes")
    
    # Save to files
    output_dir = Path(".")
    
    js_file = output_dir / "mbta-shuttle-data.js"
    with open(js_file, 'w', encoding='utf-8') as f:
        f.write("const mbtaShuttleData = ")
        json.dump(mbta_shuttle_data, f, indent=2, ensure_ascii=False)
        f.write(";\n\n")
        
        f.write("const shuttleRouteShapes = ")
        json.dump(shuttle_route_shapes, f, indent=2, ensure_ascii=False)
        f.write(";\n\n")
    
    print(f"Saved shuttle data to {js_file}")
    
    # Print summary
    print("\n" + "="*50)
    print("SHUTTLE DATA GENERATION COMPLETE")
    print("="*50)
    print(f"Total routes processed: {len(mbta_shuttle_data)}")
    print(f"Routes with shapes: {len(shuttle_route_shapes)}")
    
    # Calculate routes with stops only
    routes_with_stops_only = set(mbta_shuttle_data.keys()) - set(shuttle_route_shapes.keys())
    print(f"Routes with stops only: {len(routes_with_stops_only)}")
    
    if routes_with_stops_only:
        print("\nRoutes with stops but NO shapes:")
        for route_id in sorted(routes_with_stops_only):
            print(f"  - Route {route_id}")

if __name__ == "__main__":
    generate_shuttle_data()

