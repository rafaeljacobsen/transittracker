#!/usr/bin/env python3
"""
Parse MBTA bus data from GTFS files.
This script processes ALL bus routes, not just a subset.
"""

import pandas as pd
import json
from pathlib import Path
import os
from tqdm import tqdm

def load_gtfs_data():
    """Load GTFS data from files."""
    gtfs_dir = Path("mbta_gtfs")
    if not gtfs_dir.exists():
        print("Error: GTFS directory not found.")
        return None, None, None
    
    routes_file = gtfs_dir / "routes.txt"
    if not routes_file.exists():
        print("Error: routes.txt not found")
        return None, None, None
    
    routes_df = pd.read_csv(routes_file)
    
    stops_file = gtfs_dir / "stops.txt"
    if not stops_file.exists():
        print("Error: stops.txt not found")
        return None, None, None
    
    stops_df = pd.read_csv(stops_file)
    
    stop_times_file = gtfs_dir / "stop_times.txt"
    if not stop_times_file.exists():
        print("Error: stop_times.txt not found")
        return None, None, None
    
    stop_times_df = pd.read_csv(stop_times_file, low_memory=False)
    
    trips_file = gtfs_dir / "trips.txt"
    if not trips_file.exists():
        print("Error: trips.txt not found")
        return None, None, None
    
    trips_df = pd.read_csv(trips_file)
    
    shapes_file = gtfs_dir / "shapes.txt"
    shapes_df = None
    if shapes_file.exists():
        shapes_df = pd.read_csv(shapes_file, low_memory=False)
        
        # Normalize shape_id column (convert float 1160130.0 -> string '1160130', and remove leading zeros)
        def normalize_shape_id(val):
            try:
                if pd.isna(val):
                    return str(val)
                if isinstance(val, float):
                    return str(int(val))
                # For strings, try to convert to int and back to remove leading zeros
                s = str(val)
                try:
                    return str(int(s))
                except:
                    return s
            except:
                return str(val)
        
        shapes_df['shape_id'] = shapes_df['shape_id'].apply(normalize_shape_id)
    
    # Also normalize shape_id in trips.txt to match
    if 'shape_id' in trips_df.columns:
        def normalize_shape_id(val):
            try:
                if pd.isna(val):
                    return val
                if isinstance(val, float):
                    return str(int(val))
                # For strings, try to convert to int and back to remove leading zeros
                s = str(val)
                try:
                    return str(int(s))
                except:
                    return s
            except:
                return str(val)
        
        trips_df['shape_id'] = trips_df['shape_id'].apply(normalize_shape_id)
    
    return routes_df, stops_df, stop_times_df, trips_df, shapes_df

def get_bus_routes(routes_df):
    """Get ONLY bus routes (route_type 3), excluding shuttles."""
    bus_routes = routes_df[routes_df['route_type'] == 3].copy()
    return bus_routes

def get_route_stops(route_id, trips_df, stop_times_df, stops_df, route_trips_dict):
    """Get all stops for a specific route using the working approach from the train script."""
    # Use the same approach as the working train script
    # Check if this route has any trips
    if route_id not in route_trips_dict or not route_trips_dict[route_id]:
        return []
    
    # Get trip IDs for this route
    trip_ids = route_trips_dict[route_id]
    
    # Find stop times for these trips
    route_stop_times = stop_times_df[stop_times_df['trip_id'].isin(trip_ids)]
    
    if route_stop_times.empty:
        return []
    
    # Get unique stops in order
    route_stops = route_stop_times.sort_values(['trip_id', 'stop_sequence']).drop_duplicates(subset=['stop_id'])
    
    # Get stop details
    stop_ids = route_stops['stop_id'].unique()
    route_stop_details = stops_df[stops_df['stop_id'].isin(stop_ids)]
    
    # Create stop objects
    stops = []
    for _, stop in route_stop_details.iterrows():
        stop_obj = {
            'name': stop['stop_name'],
            'coords': [float(stop['stop_lat']), float(stop['stop_lon'])],
            'type': 'Bus',
            'stopId': str(stop['stop_id'])
        }
        stops.append(stop_obj)
    
    return stops

def get_route_shapes(route_id, trips_df, shapes_df):
    """Get shape data for a route if available."""
    if shapes_df is None:
        return []
    
    # Convert route_id to string for consistent comparison
    route_id_str = str(route_id)
    
    # Get trips for this route - convert route_id column to string for comparison
    route_trips = trips_df[trips_df['route_id'].astype(str) == route_id_str]
    if route_trips.empty:
        return []
    
    # Get shape IDs and convert to strings
    shape_ids = route_trips['shape_id'].dropna().astype(str).unique()
    if len(shape_ids) == 0:
        return []
    
    # Get shape data (shape_id is already normalized to string at load time)
    shapes = []
    for shape_id in shape_ids:
        shape_data = shapes_df[shapes_df['shape_id'] == str(shape_id)]
        if not shape_data.empty:
            # Sort by shape_pt_sequence
            shape_data = shape_data.sort_values('shape_pt_sequence')
            
            # Create coordinate array - Leaflet expects [lat, lng] format
            coords = []
            for _, point in shape_data.iterrows():
                coords.append([float(point['shape_pt_lat']), float(point['shape_pt_lon'])])
            
            if len(coords) > 1:  # Need at least 2 points for a line
                shapes.append({
                    'shape_id': str(shape_id),
                    'coords': coords
                })
    
    return shapes

def parse_bus_data():
    """Parse complete bus data."""
    print("Parsing bus data...")
    
    # Load GTFS data
    gtfs_data = load_gtfs_data()
    if gtfs_data[0] is None:
        return
    
    routes_df, stops_df, stop_times_df, trips_df, shapes_df = gtfs_data
    
    all_routes = get_bus_routes(routes_df)
    
    route_trips_dict = {}
    for _, route in all_routes.iterrows():
        route_id = str(route['route_id'])
        route_trips_dict[route_id] = []
    
    trip_to_route_map = {}
    for _, trip in tqdm(trips_df.iterrows(), total=len(trips_df), desc="Building trip mapping", unit="trips"):
        route_id = str(trip['route_id'])
        trip_id = str(trip['trip_id'])
        if route_id in route_trips_dict:
            route_trips_dict[route_id].append(trip_id)
            trip_to_route_map[trip_id] = route_id
    
    route_stops_dict = {}
    for _, route in all_routes.iterrows():
        route_id = str(route['route_id'])
        route_stops_dict[route_id] = set()
    
    stop_times_df['trip_id_str'] = stop_times_df['trip_id'].astype(str)
    stop_times_df['stop_id_str'] = stop_times_df['stop_id'].astype(str)
    stop_times_df['route_id'] = stop_times_df['trip_id_str'].map(trip_to_route_map)
    
    bus_stop_times = stop_times_df[stop_times_df['route_id'].notna()]
    
    for route_id, group in bus_stop_times.groupby('route_id'):
        route_stops_dict[route_id] = set(group['stop_id_str'].unique())
    
    mbta_bus_data = {}
    bus_route_shapes = {}
    for _, route in tqdm(all_routes.iterrows(), total=len(all_routes), desc="Processing routes", unit="routes"):
        route_id = str(route['route_id'])
        route_name = route['route_long_name']
        
        # Skip shuttle routes
        if pd.isna(route_name) or 'shuttle' in str(route_name).lower() or 'Shuttle-' in str(route_id):
            continue
        
        # Get stops for this route from the processed data
        stop_ids = route_stops_dict.get(route_id, set())
        stops = []
        
        for stop_id in stop_ids:
            stop_details = stops_df[stops_df['stop_id'] == stop_id]
            if not stop_details.empty:
                stop = stop_details.iloc[0]
                stop_obj = {
                    'name': stop['stop_name'],
                    'coords': [float(stop['stop_lat']), float(stop['stop_lon'])],
                    'type': 'Bus',
                    'stopId': str(stop['stop_id'])
                }
                stops.append(stop_obj)
        
        # Get shapes for this route
        shapes = get_route_shapes(route_id, trips_df, shapes_df)
        
        # Create route data in the format HTML expects
        # Include routes that have either stops OR shapes OR both
        if stops or shapes:
            if stops:
                mbta_bus_data[route_id] = stops
            else:
                # If no stops but has shapes, create empty stops array
                mbta_bus_data[route_id] = []
        
        if shapes:
            bus_route_shapes[route_id] = shapes
    
    # Save to files
    output_dir = Path("data")
    output_dir.mkdir(exist_ok=True)
    
    # Save as JavaScript file
    js_file = output_dir / "mbta-bus-data.js"
    with open(js_file, 'w', encoding='utf-8') as f:
        f.write("const mbtaBusData = ")
        json.dump(mbta_bus_data, f, indent=2, ensure_ascii=False)
        f.write(";\n\n")
        
        f.write("const busRouteShapes = ")
        json.dump(bus_route_shapes, f, indent=2, ensure_ascii=False)
        f.write(";\n\n")
    
    # Save as JSON file for reference
    json_file = output_dir / "mbta-bus-data.json"
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump({
            'mbtaBusData': mbta_bus_data,
            'busRouteShapes': bus_route_shapes
        }, f, indent=2, ensure_ascii=False)
    
    # Print summary
    print("\n" + "="*50)
    print("BUS DATA PARSING COMPLETE")
    print("="*50)
    print(f"Total routes processed: {len(mbta_bus_data)}")
    print(f"Routes with shapes: {len(bus_route_shapes)}")
    
    # Calculate routes that have both stops and shapes
    routes_with_both = set(mbta_bus_data.keys()) & set(bus_route_shapes.keys())
    routes_with_stops_only = set(mbta_bus_data.keys()) - set(bus_route_shapes.keys())
    
    print(f"Routes with both stops and shapes: {len(routes_with_both)}")
    print(f"Routes with stops only: {len(routes_with_stops_only)}")
    
    # Print routes with stops only (missing shapes)
    if routes_with_stops_only:
        print("\nRoutes with stops but NO shapes:")
        for route_id in sorted(routes_with_stops_only):
            print(f"  - Route {route_id}")

if __name__ == "__main__":
    parse_bus_data()
