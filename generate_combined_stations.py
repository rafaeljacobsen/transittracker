"""
Generate Combined Stations JSON

This script scans all transit data files and finds stations that are served
by multiple transit systems. It outputs combined stations to a JSON file.

Run: python generate_combined_stations.py

TODO: When adding a new transit agency, re-run this script to update combined-stations.json
"""

import os
import re
import json
import math

# Haversine distance calculation
def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371  # Earth's radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# Normalize station name for matching
def normalize_station_name(name):
    if not name:
        return ''
    name = name.lower()
    name = re.sub(r'\s+', ' ', name)
    name = re.sub(r'station', '', name, flags=re.IGNORECASE)
    name = re.sub(r'stop', '', name, flags=re.IGNORECASE)
    name = re.sub(r'amtrak', '', name, flags=re.IGNORECASE)
    name = name.replace('-', ' ')
    name = re.sub(r'[()]', '', name)
    name = re.sub(r',.*$', '', name)  # Remove ", State" suffix
    return name.strip()

# Priority for station names (lower = higher priority, prefer local names)
SYSTEM_NAME_PRIORITY = {
    'MBTA': 1,
    'CTrail Hartford Line': 2,
    'CTrail Shore Line East': 3,
    'Metro North': 4,
    'LIRR': 5,
    'MTA Subway': 6,
    'Amtrak': 7  # Lowest priority - use local names over Amtrak names
}

PROXIMITY_THRESHOLD = 0.5  # km

def load_js_data_file(file_path):
    """Load a JS data file by parsing it as JSON-like structure."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find the first variable assignment and extract the object
        match = re.search(r'(?:const\s+)?(\w+)\s*=\s*(\{)', content)
        if match:
            var_name = match.group(1)
            start_idx = match.start(2)
            
            # Find matching closing brace by counting braces
            brace_count = 0
            end_idx = start_idx
            for i, char in enumerate(content[start_idx:], start_idx):
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
            
            json_str = content[start_idx:end_idx]
            
            # Convert JS object syntax to valid JSON
            # 1. Convert single-quoted keys to double-quoted: 'Blue Line': -> "Blue Line":
            json_str = re.sub(r"'([^']+)'\s*:", r'"\1":', json_str)
            # 2. Add quotes around unquoted keys: {name: -> {"name":
            json_str = re.sub(r'(\{|,)\s*([a-zA-Z_]\w*)\s*:', r'\1"\2":', json_str)
            # 3. Convert single-quoted string values to double quotes
            json_str = re.sub(r":\s*'([^']*)'", r': "\1"', json_str)
            # 4. Remove trailing commas before } or ]
            json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
            
            try:
                data = json.loads(json_str)
                return {'name': var_name, 'data': data}
            except Exception as e:
                print(f"  Error parsing {file_path}: {e}")
                return None
        return None
    except Exception as e:
        print(f"  Error loading {file_path}: {e}")
        return None

def extract_mbta_stations(data):
    """Extract stations from MBTA stops data."""
    stations = []
    for line_name, stops in data.items():
        if isinstance(stops, list):
            seen_stops = set()
            for stop in stops:
                if 'name' in stop and 'coords' in stop:
                    key = f"{stop['name']}-{stop['coords'][0]:.4f}-{stop['coords'][1]:.4f}"
                    if key not in seen_stops:
                        seen_stops.add(key)
                        stations.append({
                            'name': stop['name'],
                            'lat': stop['coords'][0],
                            'lon': stop['coords'][1],
                            'system': 'MBTA',
                            'route': line_name,
                            'type': stop.get('type', 'Unknown')
                        })
    return stations

def extract_route_stations(data, system_name):
    """Extract stations from route-based data (Amtrak, CTrail, MTA)."""
    stations = []
    if 'routes' in data:
        for route_name, route in data['routes'].items():
            if route and 'stops' in route:
                seen_stops = set()
                for stop in route['stops']:
                    if 'lat' in stop and 'lon' in stop and stop['lat'] and stop['lon']:
                        key = f"{stop.get('name', '')}-{stop['lat']:.4f}-{stop['lon']:.4f}"
                        if key not in seen_stops:
                            seen_stops.add(key)
                            stations.append({
                                'name': stop.get('name', ''),
                                'lat': stop['lat'],
                                'lon': stop['lon'],
                                'system': system_name,
                                'route': route_name,
                                'stop_id': stop.get('stop_id', '')
                            })
    return stations

def main():
    print('=== Generate Combined Stations ===\n')
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, 'data')
    all_stations = []
    
    # Load MBTA stops
    print('Loading MBTA data...')
    mbta_file = load_js_data_file(os.path.join(data_dir, 'mbta-stops.js'))
    if mbta_file:
        mbta_stations = extract_mbta_stations(mbta_file['data'])
        all_stations.extend(mbta_stations)
        print(f'  Found {len(mbta_stations)} MBTA stations')
    
    # Load Amtrak
    print('Loading Amtrak data...')
    amtrak_file = load_js_data_file(os.path.join(data_dir, 'amtrak-routes-data.js'))
    if amtrak_file:
        amtrak_stations = extract_route_stations(amtrak_file['data'], 'Amtrak')
        all_stations.extend(amtrak_stations)
        print(f'  Found {len(amtrak_stations)} Amtrak stations')
    
    # Load Hartford Line
    print('Loading Hartford Line data...')
    hartford_file = load_js_data_file(os.path.join(data_dir, 'hartford-line-routes-data.js'))
    if hartford_file:
        hartford_stations = extract_route_stations(hartford_file['data'], 'CTrail Hartford Line')
        all_stations.extend(hartford_stations)
        print(f'  Found {len(hartford_stations)} Hartford Line stations')
    
    # Load Shore Line East
    print('Loading Shore Line East data...')
    sle_file = load_js_data_file(os.path.join(data_dir, 'shore-line-east-routes-data.js'))
    if sle_file:
        sle_stations = extract_route_stations(sle_file['data'], 'CTrail Shore Line East')
        all_stations.extend(sle_stations)
        print(f'  Found {len(sle_stations)} Shore Line East stations')
    
    # Load LIRR
    print('Loading LIRR data...')
    lirr_file = load_js_data_file(os.path.join(data_dir, 'lirr-routes-data.js'))
    if lirr_file:
        lirr_stations = extract_route_stations(lirr_file['data'], 'LIRR')
        all_stations.extend(lirr_stations)
        print(f'  Found {len(lirr_stations)} LIRR stations')
    
    # Load Metro North
    print('Loading Metro North data...')
    mn_file = load_js_data_file(os.path.join(data_dir, 'metro-north-routes-data.js'))
    if mn_file:
        mn_stations = extract_route_stations(mn_file['data'], 'Metro North')
        all_stations.extend(mn_stations)
        print(f'  Found {len(mn_stations)} Metro North stations')
    
    # Load MTA Subway
    print('Loading MTA Subway data...')
    subway_file = load_js_data_file(os.path.join(data_dir, 'mta-subway-routes-data.js'))
    if subway_file:
        subway_stations = extract_route_stations(subway_file['data'], 'MTA Subway')
        all_stations.extend(subway_stations)
        print(f'  Found {len(subway_stations)} MTA Subway stations')
    
    print(f'\nTotal stations loaded: {len(all_stations)}')
    
    # Now find combined stations
    print('\n=== Finding Combined Stations ===\n')
    
    combined_stations = {}  # coord_key -> { name, lat, lon, systems: [...] }
    
    # Sort by system priority so local names are preferred
    all_stations.sort(key=lambda s: SYSTEM_NAME_PRIORITY.get(s['system'], 99))
    
    for station in all_stations:
        coord_key = f"{station['lat']:.3f},{station['lon']:.3f}"
        
        # Check if we've already processed a station at these coordinates
        found_existing = None
        for key, existing in combined_stations.items():
            distance = calculate_distance(station['lat'], station['lon'], existing['lat'], existing['lon'])
            normalized_new = normalize_station_name(station['name'])
            normalized_existing = normalize_station_name(existing['name'])
            
            name_match = (normalized_new == normalized_existing or
                         (len(normalized_new) > 3 and len(normalized_existing) > 3 and
                          (normalized_new in normalized_existing or normalized_existing in normalized_new)))
            proximity_match = distance <= PROXIMITY_THRESHOLD
            
            if name_match or proximity_match:
                found_existing = {'key': key, 'data': existing}
                break
        
        if found_existing:
            # Add this system/route to existing station
            existing_system = None
            for sys in found_existing['data']['systems']:
                if sys['system'] == station['system']:
                    existing_system = sys
                    break
            
            if existing_system:
                if station['route'] not in existing_system['routes']:
                    existing_system['routes'].append(station['route'])
            else:
                found_existing['data']['systems'].append({
                    'system': station['system'],
                    'routes': [station['route']]
                })
        else:
            # Create new entry
            combined_stations[coord_key] = {
                'name': station['name'],
                'lat': station['lat'],
                'lon': station['lon'],
                'systems': [{
                    'system': station['system'],
                    'routes': [station['route']]
                }]
            }
    
    # Filter to only multi-system stations
    multi_system_stations = {}
    single_system_count = 0
    
    for key, station in combined_stations.items():
        if len(station['systems']) > 1:
            multi_system_stations[station['name']] = station
        else:
            single_system_count += 1
    
    print(f'Single-system stations: {single_system_count}')
    print(f'Multi-system stations: {len(multi_system_stations)}')
    
    # Print combined stations
    print('\n=== Combined Stations ===\n')
    
    sorted_stations = sorted(multi_system_stations.items(), key=lambda x: x[0])
    
    for name, station in sorted_stations:
        print(f'{name}:')
        print(f'  Location: {station["lat"]:.6f}, {station["lon"]:.6f}')
        for sys in station['systems']:
            routes_display = sys['routes'][:3]
            if len(sys['routes']) > 3:
                routes_display.append(f'... +{len(sys["routes"]) - 3} more')
            print(f'  {sys["system"]}: {", ".join(routes_display)}')
        print()
    
    # Save to JSON
    output_path = os.path.join(data_dir, 'combined-stations.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(multi_system_stations, f, indent=2)
    
    print(f'\nSaved to: {output_path}')
    print(f'Total combined stations: {len(multi_system_stations)}')

if __name__ == '__main__':
    main()
