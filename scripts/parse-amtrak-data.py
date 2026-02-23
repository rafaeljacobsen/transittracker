#!/usr/bin/env python3
"""
Amtrak Data Parser - Generates route and station JSON files from local GTFS
Parses Amtrak GTFS data from the shore_line_east_gtfs/ directory (downloaded separately)
Note: This directory contains the full Amtrak GTFS feed, which includes all Amtrak routes.

Run scripts/download-ctrail-shore-line-east-gtfs.py first to get the GTFS data.
This parser filters for Amtrak routes (agency_id 51 and other Amtrak agencies, excluding Shore Line East agency_id 1230).

This parser automatically fetches official station names from Amtrak's website for all stations,
fixing issues where multiple stations share the same name (e.g., all Boston stations labeled "Boston").
Names are cached in scripts/.amtrak_station_names_cache.json for faster future runs.

Requirements: pip install requests beautifulsoup4
"""

import csv
import json
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_WEB_SCRAPING = True
except ImportError:
    HAS_WEB_SCRAPING = False
    print("⚠️  Warning: requests and beautifulsoup4 not installed. Install with: pip install requests beautifulsoup4")
    print("   Station names will use GTFS names (may have duplicates like 'Boston' for multiple stations)")

class AmtrakDataParser:
    def __init__(self):
        self.gtfs_dir = Path("shore_line_east_gtfs")
        
        # Check if GTFS directory exists
        if not self.gtfs_dir.exists():
            raise FileNotFoundError(
                f"\n❌ GTFS directory not found: {self.gtfs_dir}\n"
                f"Please run 'python scripts/download-ctrail-shore-line-east-gtfs.py' first to download the data."
            )
        
        # Cache for fetched station names (stop_id -> official_name)
        self.station_name_cache = {}
        self.name_cache_file = Path("scripts/.amtrak_station_names_cache.json")
        self._load_name_cache()
    
    def _load_name_cache(self):
        """Load cached station names from previous runs"""
        # Known correct mappings that ALWAYS override cache (stations with wrong names in GTFS)
        known_correct_mappings = {
            'BBY': 'Back Bay',
            'BON': 'North Station',
            'BOS': 'South Station',
        }
        
        if self.name_cache_file.exists():
            try:
                with open(self.name_cache_file, 'r', encoding='utf-8') as f:
                    self.station_name_cache = json.load(f)
                    # CRITICAL: Override cache with known correct mappings
                    self.station_name_cache.update(known_correct_mappings)
                    print(f"✅ Loaded {len(self.station_name_cache)} cached station names")
                    print(f"   (Applied {len(known_correct_mappings)} known corrections)")
            except Exception as e:
                print(f"⚠️  Warning: Could not load name cache: {e}")
                self.station_name_cache = known_correct_mappings.copy()
        else:
            # Start with known mappings
            self.station_name_cache = known_correct_mappings.copy()
    
    def _save_name_cache(self):
        """Save station name cache for future runs"""
        try:
            with open(self.name_cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.station_name_cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"⚠️  Warning: Could not save name cache: {e}")
    
    def _fetch_station_list_from_amtrak(self):
        """Fetch the complete station list from Amtrak's website for reliable mapping"""
        if not HAS_WEB_SCRAPING:
            return {}
        
        try:
            # Try to fetch from Amtrak's station list or API
            # This is a one-time fetch that gives us all stations
            station_list_url = "https://www.amtrak.com/stations"
            
            response = requests.get(station_list_url, timeout=15, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            station_map = {}
            
            # Look for station links - they typically follow pattern /stations/{code}
            import re
            for link in soup.find_all('a', href=re.compile(r'/stations/[a-z]+')):
                href = link.get('href', '')
                station_code = href.split('/')[-1].upper()
                station_name = link.get_text(strip=True)
                if station_code and station_name and len(station_name) > 2:
                    station_map[station_code] = station_name
            
            return station_map
        except Exception:
            return {}
    
    def _fetch_official_station_name(self, stop_url, stop_id):
        """Fetch the official station name from Amtrak's website"""
        # ALWAYS check known mappings first (most reliable, works even without web scraping)
        known_mappings = {
            'BBY': 'Back Bay',
            'BON': 'North Station',
            'BOS': 'South Station',
            # Add more as discovered - these are stations where GTFS has wrong/duplicate names
        }
        if stop_id in known_mappings:
            name = known_mappings[stop_id]
            self.station_name_cache[stop_id] = name
            return name
        
        # Check cache second
        if stop_id in self.station_name_cache:
            return self.station_name_cache[stop_id]
        
        if not HAS_WEB_SCRAPING:
            return None
        
        if not stop_url or not stop_url.startswith('http'):
            return None
        
        # Try to extract station code from URL as backup
        # URL format: https://www.amtrak.com/stations/bos
        import re
        url_match = re.search(r'/stations/([a-z]+)', stop_url.lower())
        if url_match:
            url_code = url_match.group(1).upper()
            if url_code in known_mappings:
                name = known_mappings[url_code]
                self.station_name_cache[stop_id] = name
                return name
        
        try:
            # Add a small delay to be respectful
            time.sleep(0.3)
            
            response = requests.get(stop_url, timeout=10, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            })
            response.raise_for_status()
            
            # Parse HTML to find station name
            soup = BeautifulSoup(response.content, 'html.parser')
            name = None
            
            # Strategy: Look for the specific station name, not the city name
            # Amtrak pages often have the station name in specific elements
            
            # First, try JSON-LD structured data (most reliable)
            json_ld_scripts = soup.find_all('script', type='application/ld+json')
            for script in json_ld_scripts:
                try:
                    data = json.loads(script.string)
                    # Look for name in structured data
                    if isinstance(data, dict):
                        # Try common JSON-LD properties
                        for prop in ['name', 'alternateName', 'headline']:
                            if prop in data:
                                potential_name = str(data[prop]).strip()
                                if potential_name and ',' not in potential_name and len(potential_name) > 2:
                                    name = potential_name.replace(' Amtrak Station', '').replace(' Station', '').strip()
                                    if name:
                                        self.station_name_cache[stop_id] = name
                                        return name
                        # Check if it's a list/array
                        if '@graph' in data:
                            for item in data['@graph']:
                                if isinstance(item, dict) and 'name' in item:
                                    potential_name = str(item['name']).strip()
                                    if potential_name and ',' not in potential_name and len(potential_name) > 2:
                                        name = potential_name.replace(' Amtrak Station', '').replace(' Station', '').strip()
                                        if name:
                                            self.station_name_cache[stop_id] = name
                                            return name
                except (json.JSONDecodeError, AttributeError):
                    continue
            
            # Try to find elements with class/id containing "station-name" or similar
            station_name_selectors = [
                {'class': lambda x: x and ('station-name' in x.lower() or 'station-title' in x.lower())},
                {'id': lambda x: x and ('station-name' in x.lower() or 'station-title' in x.lower())},
                {'data-station-name': True},
                {'class': 'hero-title'},
                {'class': 'page-title'},
            ]
            
            for selector in station_name_selectors:
                elem = soup.find(attrs=selector)
                if elem:
                    name = elem.get_text(strip=True)
                    if name and len(name) > 2:
                        name = name.replace(' Amtrak Station', '').replace(' Station', '').strip()
                        if name and ',' not in name:  # Avoid "Boston, Massachusetts" type names
                            self.station_name_cache[stop_id] = name
                            return name
            
            # Try h1 but filter out city names
            h1 = soup.find('h1')
            if h1:
                name = h1.get_text(strip=True)
                # If it contains a comma, it's likely "City, State" - skip it
                if ',' not in name:
                    name = name.replace(' Amtrak Station', '').replace(' Station', '').strip()
                    if name and len(name) > 2:
                        self.station_name_cache[stop_id] = name
                        return name
            
            # Try to find breadcrumbs or navigation that might have the station name
            breadcrumb = soup.find('nav', class_=lambda x: x and 'breadcrumb' in x.lower())
            if breadcrumb:
                links = breadcrumb.find_all('a')
                # Usually the last link before "Station" is the station name
                for link in reversed(links):
                    text = link.get_text(strip=True)
                    if text and text.lower() != 'stations' and ',' not in text:
                        name = text.replace(' Amtrak Station', '').replace(' Station', '').strip()
                        if name and len(name) > 2:
                            self.station_name_cache[stop_id] = name
                            return name
            
            # Try meta description - sometimes has better info than title
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            if meta_desc:
                desc = meta_desc.get('content', '')
                # Look for patterns like "South Station in Boston" or "Back Bay Station"
                import re
                # Match patterns like "Station Name Station" or "Station Name in City"
                match = re.search(r'^([^,]+?)\s+(?:Station|in)', desc, re.IGNORECASE)
                if match:
                    name = match.group(1).strip()
                    if name and len(name) > 2 and ',' not in name:
                        self.station_name_cache[stop_id] = name
                        return name
            
            # Try title tag but extract station name if it's in format "Station Name | Amtrak"
            title = soup.find('title')
            if title:
                title_text = title.get_text(strip=True)
                # Remove common suffixes
                name = title_text.replace(' | Amtrak', '').replace(' Amtrak Station', '').replace(' Station', '').strip()
                # If it doesn't contain a comma, it might be the station name
                if name and len(name) > 2 and ',' not in name:
                    self.station_name_cache[stop_id] = name
                    return name
            
            # Fallback: Use known mappings for common problematic stations
            known_mappings = {
                'BBY': 'Back Bay',
                'BON': 'North Station',
                'BOS': 'South Station',
            }
            if stop_id in known_mappings:
                name = known_mappings[stop_id]
                self.station_name_cache[stop_id] = name
                return name
            
            return None
            
        except Exception as e:
            # Silently fail - we'll use GTFS name as fallback
            return None
    
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
        """Parse routes.txt to get Amtrak route information (excluding Shore Line East agency_id 1230)"""
        print("\n🚂 Parsing Amtrak routes...")
        routes_data = self.read_csv_from_file('routes.txt')
        
        routes = []
        for row in routes_data:
            # Exclude Shore Line East (agency_id 1230) and MARC (agency_id 1238)
            # Include Amtrak (agency_id 51) and other Amtrak-related agencies
            agency_id = row.get('agency_id', '')
            if agency_id == '1230' or agency_id == '1238':
                continue
                
            route = {
                'route_id': row.get('route_id', ''),
                'route_short_name': row.get('route_short_name', ''),
                'route_long_name': row.get('route_long_name', ''),
                'route_type': row.get('route_type', ''),  # 2 = Rail
                'route_color': row.get('route_color', 'CAE4F1'),  # Amtrak default
                'route_text_color': row.get('route_text_color', '000000'),
                'agency_id': agency_id
            }
            routes.append(route)
        
        print(f"✅ Found {len(routes)} Amtrak routes (excluding Shore Line East and MARC)")
        
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
    
    def parse_stops(self, fetch_official_names=True):
        """Parse stops.txt to get station information and fetch official names"""
        print("\n🏢 Parsing Amtrak stations...")
        stops_data = self.read_csv_from_file('stops.txt')
        
        stations = []
        stops_with_urls = []
        
        # First pass: collect all stops
        for row in stops_data:
            location_type = row.get('location_type', '0')
            stop_id = row.get('stop_id', '')
            stop_name = row.get('stop_name', '')
            stop_url = row.get('stop_url', '')
            
            station = {
                'stop_id': stop_id,
                'stop_name': stop_name,
                'stop_url': stop_url,
                'stop_lat': float(row.get('stop_lat', 0)),
                'stop_lon': float(row.get('stop_lon', 0)),
                'location_type': location_type,
                'parent_station': row.get('parent_station', ''),
                'wheelchair_boarding': row.get('wheelchair_boarding', '0')
            }
            
            # Only include if it has valid coordinates
            if station['stop_lat'] != 0 and station['stop_lon'] != 0:
                stations.append(station)
                if stop_url and fetch_official_names:
                    stops_with_urls.append(station)
        
        # Second pass: fetch official names for all stations
        if fetch_official_names and stops_with_urls and HAS_WEB_SCRAPING:
            print(f"🌐 Fetching official station names from Amtrak website...")
            print(f"   (This may take a few minutes for {len(stops_with_urls)} stations)")
            print(f"   Progress will be saved to cache for faster future runs")
            print()
            
            # Try to fetch station list first (more efficient)
            print("   Attempting to fetch station list from Amtrak...")
            station_list = self._fetch_station_list_from_amtrak()
            if station_list:
                print(f"   ✅ Found {len(station_list)} stations in list, using for mapping")
                # Apply station list mappings
                for stop_id in [s['stop_id'] for s in stops_with_urls]:
                    if stop_id in station_list:
                        self.station_name_cache[stop_id] = station_list[stop_id]
                print()
            else:
                print("   ⚠️  Could not fetch station list, will fetch individual pages")
                print()
            
            fetched = 0
            cached = 0
            failed = 0
            
            for i, station in enumerate(stops_with_urls, 1):
                stop_id = station['stop_id']
                stop_url = station['stop_url']
                gtfs_name = station['stop_name']
                
                # Check cache first
                if stop_id in self.station_name_cache:
                    cached += 1
                    if i % 50 == 0:  # Show progress every 50 stations
                        print(f"   [{i}/{len(stops_with_urls)}] Using cached names... ({cached} cached, {fetched} fetched)")
                    continue
                
                # Fetch from website
                official_name = self._fetch_official_station_name(stop_url, stop_id)
                
                if official_name:
                    fetched += 1
                    if fetched % 10 == 0:  # Show progress every 10 fetches
                        print(f"   [{i}/{len(stops_with_urls)}] Fetched {fetched} names...")
                else:
                    failed += 1
                    # Use GTFS name as fallback
                    self.station_name_cache[stop_id] = gtfs_name
            
            print()
            print(f"✅ Fetched {fetched} new names, used {cached} cached names")
            if failed > 0:
                print(f"⚠️  {failed} stations failed to fetch (using GTFS names)")
            
            # Save cache
            self._save_name_cache()
            print()
        
        # Third pass: apply official names to stations
        for station in stations:
            stop_id = station['stop_id']
            if stop_id in self.station_name_cache:
                station['stop_name'] = self.station_name_cache[stop_id]
        
        print(f"✅ Found {len(stations)} Amtrak stops/stations")
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
            
            # Also map trip_short_name (this is what the real-time feed often uses!)
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
        
        # Get list of Amtrak route_ids for filtering
        amtrak_route_ids = {route['route_id'] for route in routes}
        
        # Filter trip mappings to only include Amtrak routes
        filtered_trip_to_route = {trip_id: route_id for trip_id, route_id in trip_to_route_map.items() 
                                   if route_id in amtrak_route_ids}
        filtered_trip_to_headsign = {trip_id: headsign for trip_id, headsign in trip_to_headsign_map.items() 
                                     if trip_id in filtered_trip_to_route}
        filtered_trip_short_name_to_route = {trip_short_name: route_id for trip_short_name, route_id in trip_short_name_to_route_map.items() 
                                            if route_id in amtrak_route_ids}
        filtered_trip_short_name_to_headsign = {trip_short_name: headsign for trip_short_name, headsign in trip_short_name_to_headsign_map.items() 
                                                if trip_short_name in filtered_trip_short_name_to_route}
        
        # Create stop_id -> full stop details mapping
        stop_details = {}
        for stop in stops_full:
            stop_details[stop['stop_id']] = stop
        
        # Combine data
        route_data = {
            'timestamp': datetime.now().isoformat(),
            'source': 'Amtrak GTFS',
            'agency': 'Amtrak',
            'totalRoutes': len(routes),
            'tripToRoute': filtered_trip_to_route,
            'tripToHeadsign': filtered_trip_to_headsign,
            'tripShortNameToRoute': filtered_trip_short_name_to_route,
            'tripShortNameToHeadsign': filtered_trip_short_name_to_headsign,
            'routes': {}
        }
        
        for route in routes:
            route_id = route['route_id']
            # Only get shapes and stops for Amtrak routes
            shape_ids = route_shapes_map.get(route_id, []) if route_id in amtrak_route_ids else []
            stop_ids = route_stops_map.get(route_id, []) if route_id in amtrak_route_ids else []
            
            # Get coordinates for all shapes of this route
            route_shapes = []
            for shape_id in shape_ids:
                if shape_id in shapes:
                    route_shapes.append({
                        'shape_id': shape_id,
                        'coords': shapes[shape_id]
                    })
            
            # Get stop information for this route
            route_stops_list = []
            for stop_id in stop_ids:
                if stop_id in stop_details:
                    stop = stop_details[stop_id]
                    # Use official name (already applied in parse_stops)
                    route_stops_list.append({
                        'stop_id': stop_id,
                        'name': stop['stop_name'],  # Already has official name applied
                        'lat': stop['stop_lat'],
                        'lon': stop['stop_lon']
                    })
            
            # Use route_long_name as key, or route_short_name if long_name is empty
            route_name = route['route_long_name'] or route['route_short_name'] or route_id
            
            route_data['routes'][route_name] = {
                'route_id': route_id,
                'short_name': route['route_short_name'],
                'long_name': route['route_long_name'],
                'color': f"#{route['route_color']}",
                'text_color': f"#{route['route_text_color']}",
                'shapes': route_shapes,
                'stops': route_stops_list,
                'type': 'commuter_rail',
                'agency_id': route.get('agency_id', '51')
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
                f.write(f"// Amtrak Data - Generated from GTFS\n")
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
        print("🚂 AMTRAK DATA PARSER")
        print("=" * 60)
        print(f"📁 Reading from: {self.gtfs_dir.absolute()}")
        
        # Generate route data
        print("\n" + "=" * 60)
        print("GENERATING DATA")
        print("=" * 60)
        route_data = self.generate_route_data()
        
        # Ensure data directory exists
        data_dir = Path("data")
        data_dir.mkdir(exist_ok=True)
        
        # Save full JSON for reference
        self.save_json(route_data, 'data/amtrak-routes-data.json')
        
        # Save JS file
        self.save_js(route_data, 'data/amtrak-routes-data.js', 'amtrakRoutesData')
        
        print("\n" + "=" * 60)
        print("✅ AMTRAK DATA PARSING COMPLETE!")
        print("=" * 60)
        print("\nGenerated files:")
        print("  📄 amtrak-routes-data.json (reference)")
        print("  📄 amtrak-routes-data.js (for website)")
        print(f"\n✨ Processed {route_data['totalRoutes']} Amtrak routes")
        print(f"✨ Mapped {len(route_data['tripToRoute'])} trips for live tracking")
        
        return True

def main():
    try:
        parser = AmtrakDataParser()
        parser.run()
    except FileNotFoundError as e:
        print(str(e))
        print("\n💡 To download Amtrak GTFS data, run:")
        print("   python scripts/download-ctrail-shore-line-east-gtfs.py")
        return 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())

