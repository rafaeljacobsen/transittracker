#!/usr/bin/env python3
"""
Metro North Data Parser - Generates route and station JSON files from local GTFS
Parses Metro North GTFS data from the metro_north_gtfs/ directory (downloaded separately)

Run download-metro-north-gtfs.py first to get the GTFS data.
"""

import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

class MetroNorthDataParser:
    def __init__(self):
        self.gtfs_dir = Path("metro_north_gtfs")
        
        # Check if GTFS directory exists
        if not self.gtfs_dir.exists():
            raise FileNotFoundError(
                f"\n❌ GTFS directory not found: {self.gtfs_dir}\n"
                f"Please run 'python download-metro-north-gtfs.py' first to download the data."
            )
    
    def read_csv_from_file(self, filename):
        """Read a CSV file from the GTFS directory"""
        file_path = self.gtfs_dir / filename
        
        if not file_path.exists():
            print(f"⚠️  File {filename} not found in GTFS directory")
            return []
        
        try:
            with open(file_path, 'r', encoding='utf-8-sig') as f:
                return list(csv.DictReader(f))
        except Exception as e:
            print(f"❌ Error reading {filename}: {e}")
            return []
    
    def parse_routes(self):
        """Parse routes.txt to get Metro North branch information"""
        print("\n🚂 Parsing Metro North routes/branches...")
        routes_data = self.read_csv_from_file('routes.txt')
        
        # Filter out administrative/special routes that aren't actual branches
        EXCLUDED_ROUTES = []
        
        routes = []
        for row in routes_data:
            route_long_name = row.get('route_long_name', '')
            
            # Skip administrative routes
            if route_long_name in EXCLUDED_ROUTES:
                print(f"  ⚠️  Skipping administrative route: {route_long_name}")
                continue
            
            # Metro North routes in GTFS
            route = {
                'route_id': row.get('route_id', ''),
                'route_short_name': row.get('route_short_name', ''),
                'route_long_name': route_long_name,
                'route_type': row.get('route_type', ''),  # 2 = Rail
                'route_color': row.get('route_color', '003A70'),  # Metro North blue default
                'route_text_color': row.get('route_text_color', 'FFFFFF')
            }
            routes.append(route)
        
        print(f"✅ Found {len(routes)} Metro North routes/branches")
        
        return routes
    
    def parse_shapes(self):
        """Parse shapes.txt to get track geometry"""
        print("\n🗺️  Parsing track shapes...")
        shapes_data = self.read_csv_from_file('shapes.txt')
        
        # Group by shape_id
        shapes_dict = defaultdict(list)
        for row in shapes_data:
            shape_id = row.get('shape_id', '')
            if shape_id:
                shapes_dict[shape_id].append({
                    'lat': float(row.get('shape_pt_lat', 0)),
                    'lon': float(row.get('shape_pt_lon', 0)),
                    'sequence': int(row.get('shape_pt_sequence', 0))
                })
        
        # Sort each shape by sequence
        shapes = {}
        for shape_id, points in shapes_dict.items():
            sorted_points = sorted(points, key=lambda x: x['sequence'])
            # Convert to [lat, lon] pairs
            shapes[shape_id] = [[p['lat'], p['lon']] for p in sorted_points]
        
        print(f"✅ Found {len(shapes)} track shapes")
        return shapes
    
    def parse_stops(self):
        """Parse stops.txt to get station information"""
        print("\n🏢 Parsing Metro North stations...")
        stops_data = self.read_csv_from_file('stops.txt')
        
        stations = []
        for row in stops_data:
            # Filter out platform/track-level stops, keep only parent stations
            location_type = row.get('location_type', '0')
            
            station = {
                'stop_id': row.get('stop_id', ''),
                'stop_name': row.get('stop_name', ''),
                'stop_lat': float(row.get('stop_lat', 0)),
                'stop_lon': float(row.get('stop_lon', 0)),
                'location_type': location_type,
                'parent_station': row.get('parent_station', ''),
                'wheelchair_boarding': row.get('wheelchair_boarding', '0')
            }
            
            # Only include if it has valid coordinates
            if station['stop_lat'] != 0 and station['stop_lon'] != 0:
                stations.append(station)
        
        print(f"✅ Found {len(stations)} Metro North stops/stations")
        return stations
    
    def map_shapes_to_routes(self):
        """Parse trips.txt to map shape_ids to route_ids"""
        print("\n🔗 Mapping shapes to routes...")
        trips_data = self.read_csv_from_file('trips.txt')
        
        # Map route_id -> list of shape_ids
        route_shapes = defaultdict(set)
        for row in trips_data:
            route_id = row.get('route_id', '')
            shape_id = row.get('shape_id', '')
            if route_id and shape_id:
                route_shapes[route_id].add(shape_id)
        
        # Convert sets to lists
        route_shapes = {k: list(v) for k, v in route_shapes.items()}
        
        print(f"✅ Mapped {len(route_shapes)} routes to shapes")
        return route_shapes
    
    def map_stops_to_routes(self):
        """Parse trips.txt and stop_times.txt to map stops to routes"""
        print("\n🔗 Mapping stops to routes...")
        
        # Read data
        trips_data = self.read_csv_from_file('trips.txt')
        stop_times_data = self.read_csv_from_file('stop_times.txt')
        stops_data = self.read_csv_from_file('stops.txt')
        
        # Create stop_id -> stop_name mapping
        stop_names = {}
        for row in stops_data:
            stop_names[row.get('stop_id', '')] = row.get('stop_name', '')
        
        # Map trip_id -> route_id
        trip_to_route = {}
        for row in trips_data:
            trip_id = row.get('trip_id', '')
            route_id = row.get('route_id', '')
            if trip_id and route_id:
                trip_to_route[trip_id] = route_id
        
        # Map route_id -> set of stop_ids
        route_stops = defaultdict(set)
        for row in stop_times_data:
            trip_id = row.get('trip_id', '')
            stop_id = row.get('stop_id', '')
            
            if trip_id in trip_to_route and stop_id:
                route_id = trip_to_route[trip_id]
                # Only add if we have a stop name for this stop_id
                if stop_id in stop_names:
                    route_stops[route_id].add(stop_id)
        
        # Convert sets to lists
        route_stops = {k: list(v) for k, v in route_stops.items()}
        
        print(f"✅ Mapped {len(route_stops)} routes to their stops")
        return route_stops, stop_names
    
    def map_trips_to_routes(self):
        """Parse trips.txt to map trip_id to route_id and headsign for live tracking"""
        print("\n🔗 Mapping trips to routes and destinations...")
        trips_data = self.read_csv_from_file('trips.txt')
        
        # Map trip_id -> route_id
        trip_to_route = {}
        # Map trip_id -> headsign (destination)
        trip_to_headsign = {}
        # Map trip_short_name -> route_id (for real-time feed matching)
        trip_short_name_to_route = {}
        # Map trip_short_name -> headsign (for real-time feed matching)
        trip_short_name_to_headsign = {}
        
        for row in trips_data:
            trip_id = row.get('trip_id', '')
            trip_short_name = row.get('trip_short_name', '')
            route_id = row.get('route_id', '')
            headsign = row.get('trip_headsign', '')
            
            if trip_id and route_id:
                trip_to_route[trip_id] = route_id
            
            if trip_id and headsign:
                trip_to_headsign[trip_id] = headsign
            
            # Also map trip_short_name (this is what the real-time feed uses!)
            if trip_short_name and route_id:
                trip_short_name_to_route[trip_short_name] = route_id
            
            if trip_short_name and headsign:
                trip_short_name_to_headsign[trip_short_name] = headsign
        
        print(f"✅ Mapped {len(trip_to_route)} trips to routes")
        print(f"✅ Mapped {len(trip_to_headsign)} trips to destinations")
        print(f"✅ Mapped {len(trip_short_name_to_route)} trip short names to routes (for real-time feed)")
        print(f"✅ Mapped {len(trip_short_name_to_headsign)} trip short names to destinations (for real-time feed)")
        return trip_to_route, trip_to_headsign, trip_short_name_to_route, trip_short_name_to_headsign
    
    def generate_route_data(self):
        """Generate complete route data file"""
        routes = self.parse_routes()
        shapes = self.parse_shapes()
        route_shapes_map = self.map_shapes_to_routes()
        route_stops_map, stop_names = self.map_stops_to_routes()
        stops_full = self.parse_stops()
        trip_to_route_map, trip_to_headsign_map, trip_short_name_to_route_map, trip_short_name_to_headsign_map = self.map_trips_to_routes()
        
        # Create stop_id -> full stop details mapping
        stop_details = {}
        for stop in stops_full:
            stop_details[stop['stop_id']] = stop
        
        # Combine data
        route_data = {
            'timestamp': datetime.now().isoformat(),
            'source': 'MTA Metro North GTFS',
            'agency': 'Metro-North Railroad',
            'totalRoutes': len(routes),
            'tripToRoute': trip_to_route_map,  # Add trip mapping for live tracking
            'tripToHeadsign': trip_to_headsign_map,  # Add headsign mapping for destinations
            'tripShortNameToRoute': trip_short_name_to_route_map,  # Map trip_short_name to route_id (real-time feed uses this!)
            'tripShortNameToHeadsign': trip_short_name_to_headsign_map,  # Map trip_short_name to headsign (real-time feed uses this!)
            'routes': {}
        }
        
        for route in routes:
            route_id = route['route_id']
            shape_ids = route_shapes_map.get(route_id, [])
            stop_ids = route_stops_map.get(route_id, [])
            
            # Get coordinates for all shapes of this route
            # Filter out shapes that are too short or have too few points (likely straight-line connections)
            # The GTFS data includes short connecting segments that create straight lines - we need to exclude them
            route_shapes = []
            shape_candidates = []
            
            for shape_id in shape_ids:
                if shape_id in shapes:
                    coords = shapes[shape_id]
                    
                    # Skip shapes with too few points (likely straight lines or very short segments)
                    # Main route shapes typically have hundreds or thousands of points
                    if len(coords) < 100:
                        print(f"  ⚠️  Skipping short shape {shape_id} for route {route['route_long_name']} "
                              f"({len(coords)} points - too few for main route)")
                        continue
                    
                    # Calculate path length to identify main route vs connecting segments
                    if len(coords) >= 2:
                        path_length = 0.0
                        for i in range(1, len(coords)):
                            dx = coords[i][0] - coords[i-1][0]
                            dy = coords[i][1] - coords[i-1][1]
                            path_length += (dx**2 + dy**2)**0.5
                        
                        # Store candidate with its length for sorting
                        shape_candidates.append({
                            'shape_id': shape_id,
                            'coords': coords,
                            'point_count': len(coords),
                            'path_length': path_length
                        })
            
            # Sort by path length (longest first) and point count
            # This ensures we prefer the main route shape over short connecting segments
            shape_candidates.sort(key=lambda x: (x['path_length'], x['point_count']), reverse=True)
            
            # Only keep the longest shapes (main route)
            # If we have multiple long shapes, keep the top ones (likely main route in different directions)
            # But filter out any that are much shorter than the longest
            if shape_candidates:
                max_length = shape_candidates[0]['path_length']
                # Keep shapes that are at least 50% of the longest shape's length
                # This filters out short connecting segments (like the 20-point shapes) while keeping main route shapes
                min_length_threshold = max_length * 0.50
                
                for candidate in shape_candidates:
                    if candidate['path_length'] >= min_length_threshold:
                        route_shapes.append({
                            'shape_id': candidate['shape_id'],
                            'coords': candidate['coords']
                        })
                    else:
                        print(f"  ⚠️  Skipping short segment shape {candidate['shape_id']} for route {route['route_long_name']} "
                              f"({candidate['point_count']} points, length: {candidate['path_length']:.6f}, "
                              f"threshold: {min_length_threshold:.6f})")
            
            # Get stop information for this route
            route_stops_list = []
            for stop_id in stop_ids:
                if stop_id in stop_details:
                    stop = stop_details[stop_id]
                    route_stops_list.append({
                        'stop_id': stop_id,
                        'name': stop['stop_name'],
                        'lat': stop['stop_lat'],
                        'lon': stop['stop_lon']
                    })
            
            route_data['routes'][route['route_long_name']] = {
                'route_id': route_id,
                'short_name': route['route_short_name'],
                'long_name': route['route_long_name'],
                'color': f"#{route['route_color']}",
                'text_color': f"#{route['route_text_color']}",
                'shapes': route_shapes,
                'stops': route_stops_list,
                'type': 'commuter_rail'
            }
        
        return route_data
    
    def generate_station_data(self):
        """Generate complete station data file"""
        stations = self.parse_stops()
        
        station_data = {
            'timestamp': datetime.now().isoformat(),
            'source': 'MTA Metro North GTFS',
            'agency': 'Metro-North Railroad',
            'totalStations': len(stations),
            'stations': {}
        }
        
        for station in stations:
            # Use stop_name as key (similar to MBTA structure)
            station_name = station['stop_name']
            
            # Only add parent stations or stations without parents to avoid duplicates
            if station['location_type'] == '1' or not station['parent_station']:
                if station_name not in station_data['stations']:
                    station_data['stations'][station_name] = []
                
                station_data['stations'][station_name].append({
                    'stop_id': station['stop_id'],
                    'name': station_name,
                    'lat': station['stop_lat'],
                    'lon': station['stop_lon'],
                    'type': 'Commuter Rail',
                    'wheelchair_boarding': station['wheelchair_boarding'] == '1'
                })
        
        return station_data
    
    def save_json(self, data, filename):
        """Save data to JSON file"""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"✅ Saved {filename}")
        except Exception as e:
            print(f"❌ Error saving {filename}: {e}")
    
    def save_js(self, data, filename, var_name):
        """Save data as JavaScript file with variable assignment (no const)"""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(f"// Metro North Data - Generated from GTFS\n")
                f.write(f"{var_name} = ")
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write(";\n\n")
                f.write("// Export for use in other files\n")
                f.write("if (typeof module !== 'undefined' && module.exports) {\n")
                f.write(f"    module.exports = {{ {var_name} }};\n")
                f.write("}\n")
            print(f"✅ Saved {filename}")
        except Exception as e:
            print(f"❌ Error saving {filename}: {e}")
    
    def run(self):
        """Main execution function"""
        print("=" * 60)
        print("🚂 METRO NORTH DATA PARSER")
        print("=" * 60)
        print(f"📁 Reading from: {self.gtfs_dir.absolute()}")
        
        # Generate route data (keeping full data for JSON reference)
        print("\n" + "=" * 60)
        print("GENERATING DATA")
        print("=" * 60)
        route_data = self.generate_route_data()
        
        # Save full JSON for reference
        self.save_json(route_data, 'metro-north-routes-data.json')
        
        # Save JS file with same structure (includes tripToRoute and tripToHeadsign)
        self.save_js(route_data, 'metro-north-routes-data.js', 'metroNorthRoutesData')
        
        # Station data is no longer needed as a separate file
        # (stations are now part of route data)
        
        print("\n" + "=" * 60)
        print("✅ METRO NORTH DATA PARSING COMPLETE!")
        print("=" * 60)
        print("\nGenerated files:")
        print("  📄 metro-north-routes-data.json (reference)")
        print("  📄 metro-north-routes-data.js (for website)")
        print(f"\n✨ Processed {route_data['totalRoutes']} Metro North routes")
        print(f"✨ Mapped {len(route_data['tripToRoute'])} trips for live tracking")
        print(f"✨ Mapped {len(route_data['tripShortNameToRoute'])} trip short names for real-time feed matching")
        
        return True

def main():
    try:
        parser = MetroNorthDataParser()
        parser.run()
    except FileNotFoundError as e:
        print(str(e))
        print("\n💡 To download Metro North GTFS data, run:")
        print("   python download-metro-north-gtfs.py")
        return 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())

