#!/usr/bin/env python3
"""
MTA NYC Subway Data Parser - Generates route and station JSON files from local GTFS
Parses MTA Subway GTFS data from the mta_subway_gtfs/ directory (downloaded separately)

Run scripts/download-mta-subway-gtfs.py first to get the GTFS data.
"""

import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# MTA Subway Line Colors (official MTA colors)
# Format: route_short_name -> hex color
MTA_LINE_COLORS = {
    '1': '#EE352E',  # Red
    '2': '#EE352E',  # Red
    '3': '#EE352E',  # Red
    '4': '#00933C',  # Green
    '5': '#00933C',  # Green
    '6': '#00933C',  # Green
    '7': '#B933AD',  # Purple
    'A': '#0039A6',  # Blue
    'B': '#FF6319',  # Orange
    'C': '#0039A6',  # Blue
    'D': '#FF6319',  # Orange
    'E': '#0039A6',  # Blue
    'F': '#FF6319',  # Orange
    'G': '#6CBE45',  # Light Green
    'J': '#996633',  # Brown
    'L': '#A7A9AC',  # Light Gray
    'M': '#FF6319',  # Orange
    'N': '#FCCC0A',  # Yellow
    'Q': '#FCCC0A',  # Yellow
    'R': '#FCCC0A',  # Yellow
    'S': '#808183',  # Dark Gray (Shuttle)
    'W': '#FCCC0A',  # Yellow
    'Z': '#996633',  # Brown
}

class MTASubwayDataParser:
    def __init__(self):
        self.gtfs_dir = Path("mta_subway_gtfs")
        
        # Check if GTFS directory exists
        if not self.gtfs_dir.exists():
            raise FileNotFoundError(
                f"\n❌ GTFS directory not found: {self.gtfs_dir}\n"
                f"Please run 'python scripts/download-mta-subway-gtfs.py' first to download the data."
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
        """Parse routes.txt to get subway line information"""
        print("\n🚇 Parsing MTA Subway routes/lines...")
        routes_data = self.read_csv_from_file('routes.txt')
        
        routes = []
        for row in routes_data:
            route_short_name = row.get('route_short_name', '').strip()
            route_long_name = row.get('route_long_name', '').strip()
            route_type = row.get('route_type', '')
            
            # MTA Subway routes are type 1 (Subway/Metro)
            # Filter to only include subway routes (type 1)
            if route_type != '1':
                continue
            
            # Use route_short_name as the primary identifier (1, 2, 3, A, B, C, etc.)
            # If no short name, try to extract from long name or use route_id
            if not route_short_name:
                # Try to extract line identifier from route_id or long_name
                route_id = row.get('route_id', '')
                if route_id:
                    route_short_name = route_id
                elif route_long_name:
                    # Try to extract first word/letter
                    parts = route_long_name.split()
                    if parts:
                        route_short_name = parts[0]
            
            # Get color from GTFS or use our color map
            route_color = row.get('route_color', '')
            if not route_color and route_short_name in MTA_LINE_COLORS:
                route_color = MTA_LINE_COLORS[route_short_name].lstrip('#')
            elif not route_color:
                route_color = '808183'  # Default gray
            
            route = {
                'route_id': row.get('route_id', ''),
                'route_short_name': route_short_name,
                'route_long_name': route_long_name or f"{route_short_name} Line",
                'route_type': route_type,
                'route_color': route_color,
                'route_text_color': row.get('route_text_color', 'FFFFFF')
            }
            routes.append(route)
        
        print(f"✅ Found {len(routes)} MTA Subway routes/lines")
        
        # Show which lines were found
        line_names = sorted([r['route_short_name'] for r in routes])
        print(f"   Lines: {', '.join(line_names)}")
        
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
                try:
                    shapes_dict[shape_id].append({
                        'lat': float(row.get('shape_pt_lat', 0)),
                        'lon': float(row.get('shape_pt_lon', 0)),
                        'sequence': int(row.get('shape_pt_sequence', 0))
                    })
                except (ValueError, TypeError):
                    continue
        
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
        print("\n🏢 Parsing MTA Subway stations...")
        stops_data = self.read_csv_from_file('stops.txt')
        
        stations = []
        for row in stops_data:
            location_type = row.get('location_type', '0')
            
            try:
                stop_lat = float(row.get('stop_lat', 0))
                stop_lon = float(row.get('stop_lon', 0))
            except (ValueError, TypeError):
                continue
            
            station = {
                'stop_id': row.get('stop_id', ''),
                'stop_name': row.get('stop_name', ''),
                'stop_lat': stop_lat,
                'stop_lon': stop_lon,
                'location_type': location_type,
                'parent_station': row.get('parent_station', ''),
                'wheelchair_boarding': row.get('wheelchair_boarding', '0')
            }
            
            # Only include if it has valid coordinates
            if station['stop_lat'] != 0 and station['stop_lon'] != 0:
                stations.append(station)
        
        print(f"✅ Found {len(stations)} MTA Subway stops/stations")
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
        
        for row in trips_data:
            trip_id = row.get('trip_id', '')
            route_id = row.get('route_id', '')
            headsign = row.get('trip_headsign', '')
            
            if trip_id and route_id:
                trip_to_route[trip_id] = route_id
            
            if trip_id and headsign:
                trip_to_headsign[trip_id] = headsign
        
        print(f"✅ Mapped {len(trip_to_route)} trips to routes")
        print(f"✅ Mapped {len(trip_to_headsign)} trips to destinations")
        return trip_to_route, trip_to_headsign
    
    def parse_stop_times_for_route(self, route_short_name):
        """Parse stop_times.txt to get ordered stops and travel times for a specific route"""
        print(f"\n⏱️  Parsing stop times for route {route_short_name}...")
        
        # First, get route_id from routes
        routes_data = self.read_csv_from_file('routes.txt')
        route_id = None
        for row in routes_data:
            if row.get('route_short_name', '').strip() == route_short_name:
                route_id = row.get('route_id', '')
                break
        
        if not route_id:
            print(f"⚠️  Route {route_short_name} not found")
            return {}
        
        # Get trip_ids for this route
        trips_data = self.read_csv_from_file('trips.txt')
        trip_ids = set()
        for row in trips_data:
            if row.get('route_id', '') == route_id:
                trip_ids.add(row.get('trip_id', ''))
        
        # Parse stop_times for these trips
        stop_times_data = self.read_csv_from_file('stop_times.txt')
        
        # Map: trip_id -> list of {stop_sequence, stop_id, arrival_time, departure_time}
        trip_stop_times = defaultdict(list)
        
        for row in stop_times_data:
            trip_id = row.get('trip_id', '')
            if trip_id in trip_ids:
                try:
                    stop_sequence = int(row.get('stop_sequence', 0))
                    stop_id = row.get('stop_id', '')
                    arrival_time = row.get('arrival_time', '')
                    departure_time = row.get('departure_time', '')
                    
                    trip_stop_times[trip_id].append({
                        'stop_sequence': stop_sequence,
                        'stop_id': stop_id,
                        'arrival_time': arrival_time,
                        'departure_time': departure_time
                    })
                except (ValueError, TypeError):
                    continue
        
        # Sort by stop_sequence for each trip
        for trip_id in trip_stop_times:
            trip_stop_times[trip_id].sort(key=lambda x: x['stop_sequence'])
        
        # Calculate average travel times between consecutive stops
        # Map: (prev_stop_id, next_stop_id) -> average_time_seconds
        stop_pair_times = defaultdict(list)
        
        for trip_id, stops in trip_stop_times.items():
            for i in range(len(stops) - 1):
                prev_stop = stops[i]
                next_stop = stops[i + 1]
                
                # Calculate time difference
                try:
                    prev_time = self.parse_gtfs_time(prev_stop['departure_time'] or prev_stop['arrival_time'])
                    next_time = self.parse_gtfs_time(next_stop['arrival_time'] or next_stop['departure_time'])
                    
                    if prev_time and next_time:
                        time_diff = (next_time - prev_time) % (24 * 3600)  # Handle day rollover
                        if time_diff > 0 and time_diff < 3600:  # Reasonable time (less than 1 hour)
                            stop_pair_times[(prev_stop['stop_id'], next_stop['stop_id'])].append(time_diff)
                except:
                    continue
        
        # Average the times (use string keys for JavaScript compatibility)
        avg_stop_times = {}
        for (prev_id, next_id), times in stop_pair_times.items():
            if times:
                # Use comma-separated string as key for JavaScript compatibility
                key = f"{prev_id},{next_id}"
                avg_stop_times[key] = sum(times) / len(times)
        
        # Also create ordered stop list for the route (using most common trip pattern)
        # Find the trip with most stops (likely the full route)
        longest_trip = None
        if trip_stop_times:
            longest_trip = max(trip_stop_times.items(), key=lambda x: len(x[1]))
            ordered_stops = [stop['stop_id'] for stop in longest_trip[1]]
        else:
            ordered_stops = []
        
        # OPTIMIZATION: Only keep the longest trip per route (most complete route pattern)
        # This dramatically reduces file size - we only need ONE trip per route to get the stop order
        # The JavaScript can use ordered_stops and avg_travel_times for most cases
        # trip_stop_times is only used as a fallback for trip matching
        optimized_trip_stop_times = {}
        
        if trip_stop_times and longest_trip:
            # Only keep the longest trip (most complete route) - this is enough for trip matching
            longest_trip_id, longest_trip_stops = longest_trip
            optimized_trip_stop_times[longest_trip_id] = longest_trip_stops
        
        result = {
            'trip_stop_times': optimized_trip_stop_times,  # Only representative trips (much smaller!)
            'avg_travel_times': avg_stop_times,  # (prev_stop_id, next_stop_id) -> seconds
            'ordered_stops': ordered_stops  # Most common stop order
        }
        
        print(f"✅ Parsed {len(trip_stop_times)} trips total")
        print(f"   Keeping {len(optimized_trip_stop_times)} representative trips (optimized for file size)")
        print(f"   Calculated {len(avg_stop_times)} average travel times between stop pairs")
        return result
    
    def parse_gtfs_time(self, time_str):
        """Parse GTFS time string (HH:MM:SS) to seconds since midnight"""
        if not time_str:
            return None
        try:
            parts = time_str.split(':')
            if len(parts) >= 3:
                hours = int(parts[0])
                minutes = int(parts[1])
                seconds = int(parts[2])
                return hours * 3600 + minutes * 60 + seconds
        except:
            pass
        return None
    
    def generate_route_data(self):
        """Generate complete route data file"""
        routes = self.parse_routes()
        shapes = self.parse_shapes()
        route_shapes_map = self.map_shapes_to_routes()
        route_stops_map, stop_names = self.map_stops_to_routes()
        stops_full = self.parse_stops()
        trip_to_route_map, trip_to_headsign_map = self.map_trips_to_routes()
        
        # Parse stop_times for all routes (for live tracking)
        print("\n⏱️  Parsing stop times for all routes...")
        route_stop_times = {}
        for route in routes:
            route_short_name = route.get('route_short_name', '').strip()
            if route_short_name:
                print(f"   Parsing stop times for route {route_short_name}...")
                stop_times = self.parse_stop_times_for_route(route_short_name)
                if stop_times and (stop_times.get('ordered_stops') or stop_times.get('trip_stop_times')):
                    route_stop_times[route_short_name] = stop_times
        
        # Create stop_id -> full stop details mapping
        stop_details = {}
        for stop in stops_full:
            stop_details[stop['stop_id']] = stop
        
        # Combine data
        route_data = {
            'timestamp': datetime.now().isoformat(),
            'source': 'MTA NYC Subway GTFS',
            'agency': 'Metropolitan Transportation Authority',
            'totalRoutes': len(routes),
            'tripToRoute': trip_to_route_map,  # Add trip mapping for live tracking
            'tripToHeadsign': trip_to_headsign_map,  # Add headsign mapping for destinations
            'routeStopTimes': route_stop_times,  # Add stop times for all routes live tracking
            'routes': {}
        }
        
        for route in routes:
            route_id = route['route_id']
            route_short_name = route['route_short_name']
            shape_ids = route_shapes_map.get(route_id, [])
            stop_ids = route_stops_map.get(route_id, [])
            
            # Get coordinates for all shapes of this route
            route_shapes = []
            for shape_id in shape_ids:
                if shape_id in shapes:
                    coords = shapes[shape_id]
                    # Filter out very short shapes (likely connecting segments)
                    if len(coords) >= 10:  # Minimum points for a valid route segment
                        route_shapes.append({
                            'shape_id': shape_id,
                            'coords': coords
                        })
            
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
            
            # Use route_short_name as the key (1, 2, 3, A, B, C, etc.)
            # This matches how subway lines are typically identified
            route_color = route['route_color']
            if not route_color.startswith('#'):
                route_color = f"#{route_color}"
            
            # If color not in GTFS, use our color map
            if route_color == '#' and route_short_name in MTA_LINE_COLORS:
                route_color = MTA_LINE_COLORS[route_short_name]
            
            route_data['routes'][route_short_name] = {
                'route_id': route_id,
                'short_name': route_short_name,
                'long_name': route['route_long_name'],
                'color': route_color,
                'text_color': f"#{route['route_text_color']}",
                'shapes': route_shapes,
                'stops': route_stops_list,
                'type': 'subway'
            }
        
        return route_data
    
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
                f.write(f"// MTA Subway Data - Generated from GTFS\n")
                f.write(f"{var_name} = ")
                # Use compact JSON (no indentation) to reduce file size
                json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
                f.write(";\n\n")
                f.write("// Export for use in other files\n")
                f.write("if (typeof module !== 'undefined' && module.exports) {\n")
                f.write(f"    module.exports = {{ {var_name} }};\n")
                f.write("}\n")
            file_size_mb = Path(filename).stat().st_size / (1024 * 1024)
            print(f"✅ Saved {filename} ({file_size_mb:.2f} MB)")
        except Exception as e:
            print(f"❌ Error saving {filename}: {e}")
    
    def run(self):
        """Main execution function"""
        print("=" * 60)
        print("🚇 MTA SUBWAY DATA PARSER")
        print("=" * 60)
        print(f"📁 Reading from: {self.gtfs_dir.absolute()}")
        
        # Generate route data (keeping full data for JSON reference)
        print("\n" + "=" * 60)
        print("GENERATING DATA")
        print("=" * 60)
        route_data = self.generate_route_data()
        
        # Ensure data directory exists
        from pathlib import Path
        data_dir = Path("data")
        data_dir.mkdir(exist_ok=True)
        
        # Save full JSON for reference
        self.save_json(route_data, 'data/mta-subway-routes-data.json')
        
        # Save JS file with same structure (includes tripToRoute and tripToHeadsign)
        self.save_js(route_data, 'data/mta-subway-routes-data.js', 'mtaSubwayRoutesData')
        
        print("\n" + "=" * 60)
        print("✅ MTA SUBWAY DATA PARSING COMPLETE!")
        print("=" * 60)
        print("\nGenerated files:")
        print("  📄 mta-subway-routes-data.json (reference)")
        print("  📄 mta-subway-routes-data.js (for website)")
        print(f"\n✨ Processed {route_data['totalRoutes']} MTA Subway routes")
        print(f"✨ Mapped {len(route_data['tripToRoute'])} trips for live tracking")
        
        # Show summary of lines
        line_names = sorted(route_data['routes'].keys())
        print(f"\n📊 Subway Lines: {', '.join(line_names)}")
        
        return True

def main():
    try:
        parser = MTASubwayDataParser()
        parser.run()
    except FileNotFoundError as e:
        print(str(e))
        print("\n💡 To download MTA Subway GTFS data, run:")
        print("   python scripts/download-mta-subway-gtfs.py")
        return 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())

