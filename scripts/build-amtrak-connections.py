#!/usr/bin/env python3
"""
Pre-compute Amtrak station ↔ other-agency connections.

For every Amtrak station, scan every other agency's stop list and find proximity-
or-name matches (≤1 km away, with name similarity OR ≤500 m proximity-only).
Writes the result to `data/amtrak-connections.js` so the runtime can simply
look up `amtrakConnectionsData[stop_id]` instead of doing this O(N×M) Haversine
sweep on every page load.

This used to run in `loadAmtrakStations` in app.js — it's the dominant cost of
the "Adding Amtrak stations" phase. Pre-computing it shaves several seconds off
cold-load time and lets the runtime show real per-marker progress.

Run AFTER all the per-agency parser scripts (parse-mbta-stops.py,
parse-amtrak-data.py, parse-lirr-data.py, ...). Idempotent.

Usage:
    python scripts/build-amtrak-connections.py
"""

import json
import math
import re
import sys
from pathlib import Path

DATA_DIR = Path("data")

# Match the runtime constants in app.js (findAllConnections).
PROXIMITY_THRESHOLD_KM = 0.5      # accept on proximity alone if within this
MAX_CONNECTION_DISTANCE_KM = 1.0  # reject anything farther than this regardless of name


# ─── Helpers ──────────────────────────────────────────────────────────────────

def normalize_station_name(name: str) -> str:
    """Mirror of normalizeStationName() in app.js."""
    if not name:
        return ""
    s = name.lower()
    s = re.sub(r"\s*station\s*", " ", s)
    s = re.sub(r"\s*amtrak\s*", " ", s)
    s = re.sub(r"\s*stop\s*", " ", s)
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance in kilometers."""
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


# ─── Data loaders ─────────────────────────────────────────────────────────────
# Each loader returns a flat list of { system, lineName, stopName, stopId, lat, lon }.
# `system` matches the tags emitted by findAllConnections in app.js so the runtime
# can keep using the existing CONNECTION_SYSTEM_TO_AGENCY map.

def _load_json(path: Path):
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def stops_from_routes_file(path: Path, system_tag: str):
    """For LIRR / Metro-North / MTA Subway / NJT / SEPTA / SLE / Hartford / Amtrak:
    routes JSON has shape { routes: { lineName: { stops: [{stop_id, name, lat, lon}, ...] } } }."""
    data = _load_json(path)
    if not data or "routes" not in data:
        return []
    out = []
    for line_name, route in data["routes"].items():
        for stop in (route.get("stops") or []):
            try:
                lat = float(stop["lat"])
                lon = float(stop["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            out.append({
                "system": system_tag,
                "lineName": line_name,
                "stopName": stop.get("name", ""),
                "stopId": stop.get("stop_id", ""),
                "lat": lat,
                "lon": lon,
            })
    return out


def stops_from_mbta_stops(path: Path):
    """mbta-stops.json shape: { "Blue Line": [{name, coords:[lat,lon], type, stopId}, ...] }
    `type` is 'Subway' / 'Commuter Rail' / etc; we use it to pick the system tag."""
    data = _load_json(path)
    if not data:
        print(f"⚠️  {path} not found — skipping MBTA subway/commuter stops. "
              f"Re-run scripts/parse-mbta-stops.py to generate it.", file=sys.stderr)
        return []
    out = []
    for line_name, stops in data.items():
        for stop in stops:
            coords = stop.get("coords")
            if not coords or len(coords) != 2:
                continue
            stype = (stop.get("type") or "").strip()
            tag = "mbta_commuter" if stype == "Commuter Rail" else "mbta_subway"
            out.append({
                "system": tag,
                "lineName": line_name,
                "stopName": stop.get("name", ""),
                "stopId": stop.get("stopId", ""),
                "lat": float(coords[0]),
                "lon": float(coords[1]),
            })
    return out


def stops_from_mbta_bus(path: Path):
    """mbta-bus-data.json: { lineName: [{name, coords, type, stopId}, ...] }"""
    data = _load_json(path)
    if not data:
        return []
    out = []
    for line_name, stops in data.items():
        if not isinstance(stops, list):
            continue
        for stop in stops:
            coords = stop.get("coords")
            if not coords or len(coords) != 2:
                continue
            out.append({
                "system": "mbta_bus",
                "lineName": line_name,
                "stopName": stop.get("name", ""),
                "stopId": stop.get("stopId", ""),
                "lat": float(coords[0]),
                "lon": float(coords[1]),
            })
    return out


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("🔎 Loading agency stop data…")

    amtrak_stops = stops_from_routes_file(DATA_DIR / "amtrak-routes-data.json", "amtrak")
    if not amtrak_stops:
        print("❌ data/amtrak-routes-data.json missing or empty. Run "
              "scripts/parse-amtrak-data.py first.", file=sys.stderr)
        sys.exit(1)
    print(f"   amtrak           : {len(amtrak_stops):>5} stop-route entries")

    other_systems = []
    other_systems += stops_from_mbta_stops(DATA_DIR / "mbta-stops.json")
    other_systems += stops_from_mbta_bus(DATA_DIR / "mbta-bus-data.json")
    other_systems += stops_from_routes_file(DATA_DIR / "lirr-routes-data.json", "lirr")
    other_systems += stops_from_routes_file(DATA_DIR / "metro-north-routes-data.json", "metro_north")
    other_systems += stops_from_routes_file(DATA_DIR / "mta-subway-routes-data.json", "mta_subway")
    other_systems += stops_from_routes_file(DATA_DIR / "nj-transit-routes-data.json", "nj_transit")
    other_systems += stops_from_routes_file(DATA_DIR / "septa-routes-data.json", "septa")
    other_systems += stops_from_routes_file(DATA_DIR / "shore-line-east-routes-data.json", "shore_line_east")
    other_systems += stops_from_routes_file(DATA_DIR / "hartford-line-routes-data.json", "hartford_line")
    print(f"   other agencies   : {len(other_systems):>5} stop-route entries")

    # De-dupe Amtrak stops by stop_id (each station can serve multiple Amtrak routes —
    # we only need one connections list per unique station).
    seen = set()
    unique_amtrak = []
    for s in amtrak_stops:
        if s["stopId"] in seen:
            continue
        seen.add(s["stopId"])
        unique_amtrak.append(s)
    print(f"   unique Amtrak    : {len(unique_amtrak):>5} stations")

    # For each Amtrak station, scan every other-system stop. Hot loop — keep tight.
    print("\n🧮 Computing connections…")
    connections_by_stop = {}
    total_connections = 0

    for amtrak in unique_amtrak:
        a_norm = normalize_station_name(amtrak["stopName"])
        a_lat, a_lon = amtrak["lat"], amtrak["lon"]
        # De-dupe within this station: a single (system, lineName, stopId) should appear once.
        local_seen = set()
        local_conns = []

        for other in other_systems:
            # Cheap filter first: bbox check (~1 km in lat ≈ 0.01 deg, in lon ≈ 0.013 at lat 40).
            # Skips ~99% of pairs without a sqrt.
            if abs(other["lat"] - a_lat) > 0.012 or abs(other["lon"] - a_lon) > 0.016:
                continue
            d = haversine_km(a_lat, a_lon, other["lat"], other["lon"])
            if d > MAX_CONNECTION_DISTANCE_KM:
                continue
            o_norm = normalize_station_name(other["stopName"])
            name_match = (
                a_norm == o_norm
                or (len(a_norm) > 5 and len(o_norm) > 5
                    and (a_norm in o_norm or o_norm in a_norm))
            )
            if not (name_match or d <= PROXIMITY_THRESHOLD_KM):
                continue

            key = (other["system"], other["lineName"], other["stopId"])
            if key in local_seen:
                continue
            local_seen.add(key)
            local_conns.append({
                "system": other["system"],
                "lineName": other["lineName"],
                "stationName": other["stopName"],
                "stopId": other["stopId"],
                "coords": [round(other["lat"], 6), round(other["lon"], 6)],
                "matchMethod": "name" if name_match else "proximity",
                "distance": round(d, 4),
            })

        if local_conns:
            connections_by_stop[amtrak["stopId"]] = local_conns
            total_connections += len(local_conns)

    print(f"   stations with ≥1 connection: {len(connections_by_stop):>5}")
    print(f"   total connections          : {total_connections:>5}")

    # Write JS file in the same shape the other data files use, so it loads via
    # <script defer src="data/amtrak-connections.js"> alongside everything else.
    out_path = DATA_DIR / "amtrak-connections.js"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("// Amtrak Connections - Pre-computed by scripts/build-amtrak-connections.py\n")
        f.write("// Map: amtrak stop_id -> array of connections to other transit systems.\n")
        f.write("amtrakConnectionsData = ")
        json.dump(connections_by_stop, f, indent=2, ensure_ascii=False)
        f.write(";\n\n")
        f.write("// Export for use in other files\n")
        f.write("if (typeof module !== 'undefined' && module.exports) {\n")
        f.write("    module.exports = { amtrakConnectionsData };\n")
        f.write("}\n")
    size_kb = out_path.stat().st_size / 1024
    print(f"\n✅ Wrote {out_path} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
