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

def names_match_exact(a, b):
    """Minimal normalization for same-agency name match: strip and case-insensitive."""
    if not a or not b:
        return False
    return a.strip().lower() == b.strip().lower()


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
    'NJ Transit': 5,
    'SEPTA': 6,
    'LIRR': 7,
    'MTA Subway': 8,
    'Amtrak': 9  # Lowest priority - use local names over Amtrak names
}

# Cluster stations within this distance (transitive). 0.3 km = same area, not whole corridor.
PROXIMITY_THRESHOLD = 0.3  # km


def parse_subset_indices(s, max_index):
    """Parse a string like '1-10,15,16,80-100' into a set of 1-based indices in range [1, max_index].
    Returns None if any part is invalid; otherwise returns set of ints (1-based)."""
    if not s or not s.strip():
        return None
    out = set()
    for part in s.split(','):
        part = part.strip()
        if '-' in part:
            a, b = part.split('-', 1)
            try:
                low, high = int(a.strip()), int(b.strip())
            except ValueError:
                return None
            if low < 1 or high > max_index or low > high:
                return None
            out.update(range(low, high + 1))
        else:
            try:
                i = int(part)
            except ValueError:
                return None
            if i < 1 or i > max_index:
                return None
            out.add(i)
    return out if out else None


def union_find_parent(parents, i):
    """Union-find with path compression."""
    if parents[i] != i:
        parents[i] = union_find_parent(parents, parents[i])
    return parents[i]


def build_spatial_clusters(stations):
    """Group stations into clusters by proximity (transitive). Returns list of clusters (each cluster = list of station dicts)."""
    n = len(stations)
    parents = list(range(n))
    for i in range(n):
        for j in range(i + 1, n):
            if calculate_distance(
                stations[i]['lat'], stations[i]['lon'],
                stations[j]['lat'], stations[j]['lon']
            ) <= PROXIMITY_THRESHOLD:
                pi = union_find_parent(parents, i)
                pj = union_find_parent(parents, j)
                parents[pi] = pj
    groups = {}
    for i in range(n):
        root = union_find_parent(parents, i)
        if root not in groups:
            groups[root] = []
        groups[root].append(stations[i])
    return list(groups.values())


def cluster_to_combined_station(cluster, chosen_name=None):
    """Aggregate a cluster into one combined station: merge routes by system, pick name and coords."""
    # Aggregate by system -> routes
    systems_map = {}  # system -> list of routes
    names_by_system = {}  # system -> one name (first seen)
    lats, lons = [], []
    for s in cluster:
        sys_name = s['system']
        if sys_name not in systems_map:
            systems_map[sys_name] = []
            names_by_system[sys_name] = s['name']
        if s['route'] not in systems_map[sys_name]:
            systems_map[sys_name].append(s['route'])
        lats.append(s['lat'])
        lons.append(s['lon'])
    systems_list = [{'system': sys_name, 'routes': routes} for sys_name, routes in systems_map.items()]
    # Name: chosen_name, or by system priority (lowest = first)
    if chosen_name:
        name = chosen_name
    else:
        best_system = min(systems_map.keys(), key=lambda s: SYSTEM_NAME_PRIORITY.get(s, 99))
        name = names_by_system[best_system]
    # Coords: centroid of cluster
    lat = sum(lats) / len(lats)
    lon = sum(lons) / len(lons)
    return {
        'name': name,
        'lat': lat,
        'lon': lon,
        'systems': systems_list
    }


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
    
    # Load NJ Transit rail
    print('Loading NJ Transit data...')
    njtransit_file = load_js_data_file(os.path.join(data_dir, 'nj-transit-routes-data.js'))
    if njtransit_file:
        njtransit_stations = extract_route_stations(njtransit_file['data'], 'NJ Transit')
        all_stations.extend(njtransit_stations)
        print(f'  Found {len(njtransit_stations)} NJ Transit stations')
    
    # Load SEPTA rail/metro
    print('Loading SEPTA data...')
    septa_file = load_js_data_file(os.path.join(data_dir, 'septa-routes-data.js'))
    if septa_file:
        septa_stations = extract_route_stations(septa_file['data'], 'SEPTA')
        all_stations.extend(septa_stations)
        print(f'  Found {len(septa_stations)} SEPTA stations')
    
    print(f'\nTotal stations loaded: {len(all_stations)}')
    
    # Build spatial clusters (stations within PROXIMITY_THRESHOLD of each other)
    print('\n=== Building spatial clusters ===\n')
    clusters = build_spatial_clusters(all_stations)
    # Only consider clusters that have more than one station (potential multi-system)
    multi_candidate_clusters = [c for c in clusters if len(c) >= 2]
    # Require at least 2 distinct agencies for a combined station
    multi_system_clusters = []
    for c in multi_candidate_clusters:
        agencies = set(s['system'] for s in c)
        if len(agencies) >= 2:
            multi_system_clusters.append(c)
    
    print(f'Clusters with 2+ stations: {len(multi_candidate_clusters)}')
    print(f'Clusters with 2+ agencies (will combine): {len(multi_system_clusters)}')
    
    # Simple = exactly 2 agencies → auto-combine. Complicated = 3+ agencies → ask user (y/n/subset).
    multi_system_stations = {}
    auto_count = 0
    manual_count = 0
    remaining_stations = []  # Uncombined stations go back into the pool for re-clustering
    
    def process_clusters(cluster_list):
        nonlocal remaining_stations, auto_count, manual_count
        for cluster in cluster_list:
            n = len(cluster)
            agencies = set(s['system'] for s in cluster)
            num_agencies = len(agencies)
            is_simple = (num_agencies == 2)
            
            if is_simple:
                combined = cluster_to_combined_station(cluster)
                name = combined['name']
                key = name
                idx = 0
                while key in multi_system_stations:
                    idx += 1
                    key = f'{name} ({idx})'
                multi_system_stations[key] = combined
                auto_count += 1
                print(f'[AUTO] {combined["name"]} ({combined["lat"]:.6f}, {combined["lon"]:.6f}) — {", ".join(agencies)}')
            else:
                print(f'\n--- Complicated cluster ({n} stations, {num_agencies} agencies) ---')
                print(f'  Location (approx): {cluster[0]["lat"]:.6f}, {cluster[0]["lon"]:.6f}')
                for i, s in enumerate(cluster, 1):
                    print(f'  {i}. "{s["name"]}" — {s["system"]} ({s["route"]})')
                while True:
                    choice = input('  Combine? (y=all / n=skip / or subset e.g. 1-25,28,31,34): ').strip().lower()
                    if choice in ('y', 'yes'):
                        name_choice = input('  Use which name? (number 1–{} or custom name): '.format(n)).strip()
                        if name_choice.isdigit() and 1 <= int(name_choice) <= n:
                            chosen_name = cluster[int(name_choice) - 1]['name']
                        else:
                            chosen_name = name_choice if name_choice else None
                        combined = cluster_to_combined_station(cluster, chosen_name=chosen_name)
                        name = combined['name']
                        if name in multi_system_stations:
                            name = name + ' (' + str(combined['lat'])[:10] + ')'
                        multi_system_stations[name] = combined
                        manual_count += 1
                        print(f'  Added: {name}')
                        break
                    elif choice in ('n', 'no'):
                        remaining_stations.extend(cluster)
                        print('  Skipped; stations put back into pool.')
                        break
                    else:
                        # Try parsing as subset (e.g. 1-10,15,16,80-100)
                        indices = parse_subset_indices(choice, n)
                        if indices is None or len(indices) < 2:
                            print('  Invalid. Use y, n, or subset like 1-25,28,31 (need at least 2 numbers).')
                            continue
                        sub_cluster = [cluster[i - 1] for i in sorted(indices)]
                        sub_agencies = set(s['system'] for s in sub_cluster)
                        if len(sub_agencies) < 2:
                            print('  Subset must include at least 2 agencies.')
                            continue
                        name_choice = input('  Use which name? (number 1–{} or custom name): '.format(len(sub_cluster))).strip()
                        if name_choice.isdigit() and 1 <= int(name_choice) <= len(sub_cluster):
                            chosen_name = sub_cluster[int(name_choice) - 1]['name']
                        else:
                            chosen_name = name_choice if name_choice else None
                        combined = cluster_to_combined_station(sub_cluster, chosen_name=chosen_name)
                        name = combined['name']
                        if name in multi_system_stations:
                            name = name + ' (' + str(combined['lat'])[:10] + ')'
                        multi_system_stations[name] = combined
                        manual_count += 1
                        # Put unselected stations back into the pool
                        unselected = [cluster[i - 1] for i in range(1, n + 1) if i not in indices]
                        remaining_stations.extend(unselected)
                        print(f'  Added: {name} ({len(unselected)} stations put back into pool)')
                        break
    
    process_clusters(multi_system_clusters)
    
    # Re-cluster stations that were put back and process once more
    if remaining_stations:
        print(f'\n=== Re-clustering {len(remaining_stations)} stations put back ===\n')
        again_clusters = build_spatial_clusters(remaining_stations)
        again_multi = [c for c in again_clusters if len(c) >= 2 and len(set(s['system'] for s in c)) >= 2]
        process_clusters(again_multi)
    
    print(f'\nAuto-combined (simple): {auto_count}')
    print(f'Manually combined: {manual_count}')
    print(f'Total multi-system stations: {len(multi_system_stations)}')
    
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
