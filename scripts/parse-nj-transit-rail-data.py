#!/usr/bin/env python3
"""
NJ Transit Rail Data Parser - Generates route and station data from local GTFS
Parses NJ Transit rail GTFS from the nj_transit_gtfs/ directory (downloaded separately)

Run scripts/download-nj-transit-rail-gtfs.py first to get the GTFS data.
"""

import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

class NJTransitRailDataParser:
    def __init__(self):
        self.gtfs_dir = Path("nj_transit_gtfs")
        
        # Check if GTFS directory exists
        if not self.gtfs_dir.exists():
            raise FileNotFoundError(
                f"\n❌ GTFS directory not found: {self.gtfs_dir}\n"
                f"Please run 'python scripts/download-nj-transit-rail-gtfs.py' first to download the data."
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
        """Parse routes.txt to get NJ Transit rail line information"""
        print("\n🚂 Parsing NJ Transit rail routes...")
        routes_data = self.read_csv_from_file('routes.txt')
        
        routes = []
        for row in routes_data:
            route = {
                'route_id': row.get('route_id', ''),
                'route_short_name': row.get('route_short_name', ''),
                'route_long_name': row.get('route_long_name', ''),
                'route_type': row.get('route_type', ''),
                'route_color': (row.get('route_color') or '008C45').strip(),  # NJT green default
                'route_text_color': (row.get('route_text_color') or 'FFFFFF').strip()
            }
            # Ensure color has 6 hex chars
            if route['route_color'] and not route['route_color'].startswith('#'):
                route['route_color'] = route['route_color'].lstrip('#')[:6] or '008C45'
            routes.append(route)
        
        print(f"✅ Found {len(routes)} NJ Transit rail routes")
        return routes
    
    def parse_shapes(self):
        """Parse shapes.txt to get track geometry"""
        print("\n🗺️  Parsing track shapes...")
        shapes_data = self.read_csv_from_file('shapes.txt')
        
        shapes_dict = defaultdict(list)
        for row in shapes_data:
            shape_id = row.get('shape_id', '')
            if shape_id:
                shapes_dict[shape_id].append({
                    'lat': float(row.get('shape_pt_lat', 0)),
                    'lon': float(row.get('shape_pt_lon', 0)),
                    'sequence': int(row.get('shape_pt_sequence', 0))
                })
        
        shapes = {}
        for shape_id, points in shapes_dict.items():
            sorted_points = sorted(points, key=lambda x: x['sequence'])
            shapes[shape_id] = [[p['lat'], p['lon']] for p in sorted_points]
        
        print(f"✅ Found {len(shapes)} track shapes")
        return shapes
    
    def parse_stops(self):
        """Parse stops.txt to get station information"""
        print("\n🏢 Parsing NJ Transit rail stations...")
        stops_data = self.read_csv_from_file('stops.txt')
        
        stations = []
        for row in stops_data:
            station = {
                'stop_id': row.get('stop_id', ''),
                'stop_name': row.get('stop_name', ''),
                'stop_lat': float(row.get('stop_lat', 0)),
                'stop_lon': float(row.get('stop_lon', 0)),
                'location_type': row.get('location_type', '0'),
                'parent_station': row.get('parent_station', ''),
                'wheelchair_boarding': row.get('wheelchair_boarding', '0')
            }
            if station['stop_lat'] != 0 and station['stop_lon'] != 0:
                stations.append(station)
        
        print(f"✅ Found {len(stations)} NJ Transit rail stops/stations")
        return stations
    
    def map_shapes_to_routes(self):
        """Parse trips.txt to map shape_ids to route_ids"""
        print("\n🔗 Mapping shapes to routes...")
        trips_data = self.read_csv_from_file('trips.txt')
        route_shapes = defaultdict(set)
        for row in trips_data:
            route_id = row.get('route_id', '')
            shape_id = row.get('shape_id', '')
            if route_id and shape_id:
                route_shapes[route_id].add(shape_id)
        route_shapes = {k: list(v) for k, v in route_shapes.items()}
        print(f"✅ Mapped {len(route_shapes)} routes to shapes")
        return route_shapes
    
    def map_stops_to_routes(self):
        """Map stops to routes via trips and stop_times"""
        print("\n🔗 Mapping stops to routes...")
        trips_data = self.read_csv_from_file('trips.txt')
        stop_times_data = self.read_csv_from_file('stop_times.txt')
        stops_data = self.read_csv_from_file('stops.txt')
        
        stop_names = {row.get('stop_id', ''): row.get('stop_name', '') for row in stops_data}
        trip_to_route = {row.get('trip_id', ''): row.get('route_id', '') for row in trips_data if row.get('trip_id') and row.get('route_id')}
        
        route_stops = defaultdict(set)
        for row in stop_times_data:
            trip_id = row.get('trip_id', '')
            stop_id = row.get('stop_id', '')
            if trip_id in trip_to_route and stop_id and stop_id in stop_names:
                route_stops[trip_to_route[trip_id]].add(stop_id)
        
        route_stops = {k: list(v) for k, v in route_stops.items()}
        print(f"✅ Mapped {len(route_stops)} routes to their stops")
        return route_stops, stop_names
    
    def map_trips_to_routes(self):
        """Map trip_id / trip_short_name to route_id and headsign for live tracking"""
        print("\n🔗 Mapping trips to routes and destinations...")
        trips_data = self.read_csv_from_file('trips.txt')
        trip_to_route = {}
        trip_to_headsign = {}
        trip_short_name_to_route = {}
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
            if trip_short_name and route_id:
                trip_short_name_to_route[trip_short_name] = route_id
            if trip_short_name and headsign:
                trip_short_name_to_headsign[trip_short_name] = headsign
        
        print(f"✅ Mapped {len(trip_to_route)} trips to routes and headsigns")
        return trip_to_route, trip_to_headsign, trip_short_name_to_route, trip_short_name_to_headsign
    
    def generate_route_data(self):
        """Generate complete route data for the web app"""
        routes = self.parse_routes()
        shapes = self.parse_shapes()
        route_shapes_map = self.map_shapes_to_routes()
        route_stops_map, stop_names = self.map_stops_to_routes()
        stops_full = self.parse_stops()
        trip_to_route_map, trip_to_headsign_map, trip_short_name_to_route_map, trip_short_name_to_headsign_map = self.map_trips_to_routes()
        
        stop_details = {stop['stop_id']: stop for stop in stops_full}
        
        route_data = {
            'timestamp': datetime.now().isoformat(),
            'source': 'NJ Transit Rail GTFS',
            'agency': 'NJ Transit',
            'totalRoutes': len(routes),
            'tripToRoute': trip_to_route_map,
            'tripToHeadsign': trip_to_headsign_map,
            'tripShortNameToRoute': trip_short_name_to_route_map,
            'tripShortNameToHeadsign': trip_short_name_to_headsign_map,
            'routes': {}
        }
        
        for route in routes:
            route_id = route['route_id']
            shape_ids = route_shapes_map.get(route_id, [])
            stop_ids = route_stops_map.get(route_id, [])
            
            route_shapes_list = []
            for shape_id in shape_ids:
                if shape_id in shapes:
                    route_shapes_list.append({'shape_id': shape_id, 'coords': shapes[shape_id]})
            
            route_stops_list = []
            for stop_id in stop_ids:
                if stop_id in stop_details:
                    s = stop_details[stop_id]
                    route_stops_list.append({
                        'stop_id': stop_id,
                        'name': s['stop_name'],
                        'lat': s['stop_lat'],
                        'lon': s['stop_lon']
                    })
            
            # Use long name as key (display name); fallback to short name
            name_key = route['route_long_name'] or route['route_short_name'] or route_id
            color = route['route_color']
            if color and not color.startswith('#'):
                color = '#' + color
            
            route_data['routes'][name_key] = {
                'route_id': route_id,
                'short_name': route['route_short_name'],
                'long_name': route['route_long_name'],
                'color': color or '#008C45',
                'text_color': '#' + (route['route_text_color'] or 'FFFFFF').lstrip('#')[:6],
                'shapes': route_shapes_list,
                'stops': route_stops_list,
                'type': 'commuter_rail'
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
        """Save data as JavaScript file with variable assignment"""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(f"// NJ Transit Rail Data - Generated from GTFS\n")
                f.write(f"{var_name} = ")
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write(";\n\n")
                f.write("if (typeof module !== 'undefined' && module.exports) {\n")
                f.write(f"    module.exports = {{ {var_name} }};\n")
                f.write("}\n")
            print(f"✅ Saved {filename}")
        except Exception as e:
            print(f"❌ Error saving {filename}: {e}")
    
    def run(self):
        """Main execution"""
        print("=" * 60)
        print("🚂 NJ TRANSIT RAIL DATA PARSER")
        print("=" * 60)
        print(f"📁 Reading from: {self.gtfs_dir.absolute()}")
        
        print("\n" + "=" * 60)
        print("GENERATING DATA")
        print("=" * 60)
        route_data = self.generate_route_data()
        
        data_dir = Path("data")
        data_dir.mkdir(exist_ok=True)
        
        self.save_json(route_data, 'data/nj-transit-routes-data.json')
        self.save_js(route_data, 'data/nj-transit-routes-data.js', 'njTransitRoutesData')
        
        print("\n" + "=" * 60)
        print("✅ NJ TRANSIT RAIL PARSING COMPLETE!")
        print("=" * 60)
        print("\nGenerated files:")
        print("  📄 data/nj-transit-routes-data.json (reference)")
        print("  📄 data/nj-transit-routes-data.js (for website)")
        print(f"\n✨ Processed {route_data['totalRoutes']} NJ Transit rail routes")
        return True

def main():
    try:
        parser = NJTransitRailDataParser()
        parser.run()
    except FileNotFoundError as e:
        print(str(e))
        print("\n💡 To download NJ Transit rail GTFS, run:")
        print("   python scripts/download-nj-transit-rail-gtfs.py")
        return 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1
    return 0

if __name__ == "__main__":
    exit(main())
