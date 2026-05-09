#!/usr/bin/env python3
"""
SEPTA Rail/Metro Data Parser - Generates route and station data from local GTFS
Parses SEPTA GTFS from septa_gtfs/ (downloaded via scripts/download-septa-gtfs.py).
Includes Regional Rail, Broad Street Line, Market-Frankford Line, Norristown High Speed Line, and trolleys.

Run scripts/download-septa-gtfs.py first to get the GTFS data.
"""

import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from simplify_polyline import simplify_shapes_dict


class SEPTARailDataParser:
    def __init__(self):
        self.gtfs_dir = Path("septa_gtfs")
        if not self.gtfs_dir.exists():
            raise FileNotFoundError(
                f"\n❌ GTFS directory not found: {self.gtfs_dir}\n"
                f"Please run 'python scripts/download-septa-gtfs.py' first to download the data."
            )
        self.gtfs_roots = self._find_gtfs_roots()
        self.gtfs_root = self.gtfs_roots[0]

    def _find_gtfs_roots(self):
        """Find all directories containing routes.txt (zip may have rail + bus/metro in separate folders)."""
        roots = []
        if (self.gtfs_dir / "routes.txt").exists():
            return [self.gtfs_dir]
        for sub in sorted(self.gtfs_dir.iterdir()):
            if sub.is_dir() and (sub / "routes.txt").exists():
                roots.append(sub)
        # Prefer rail feed (e.g. google_rail) over bus when both exist
        roots.sort(key=lambda p: (0 if "rail" in p.name.lower() else 1, p.name))
        if not roots:
            raise FileNotFoundError(
                f"routes.txt not found in {self.gtfs_dir} or its subdirectories."
            )
        return roots

    def read_csv(self, filename):
        path = self.gtfs_root / filename
        if not path.exists():
            return []
        try:
            with open(path, "r", encoding="utf-8-sig") as f:
                return list(csv.DictReader(f))
        except Exception as e:
            print(f"⚠️  Error reading {filename}: {e}")
            return []

    def parse_routes(self):
        print("\n🚂 Parsing SEPTA routes...")
        rows = self.read_csv("routes.txt")
        # Include rail (2), metro (1), tram/light rail (0). Optionally exclude bus (3) for rail-only.
        rail_types = {"0", "1", "2"}
        routes = []
        for row in rows:
            if row.get("route_type", "") in rail_types:
                routes.append({
                    "route_id": row.get("route_id", ""),
                    "route_short_name": row.get("route_short_name", ""),
                    "route_long_name": row.get("route_long_name", ""),
                    "route_type": row.get("route_type", ""),
                    "route_color": (row.get("route_color") or "1F4E79").strip(),
                    "route_text_color": (row.get("route_text_color") or "FFFFFF").strip(),
                })
        # If we got nothing (e.g. bus-only feed), include all routes
        if not routes:
            for row in rows:
                routes.append({
                    "route_id": row.get("route_id", ""),
                    "route_short_name": row.get("route_short_name", ""),
                    "route_long_name": row.get("route_long_name", ""),
                    "route_type": row.get("route_type", ""),
                    "route_color": (row.get("route_color") or "1F4E79").strip(),
                    "route_text_color": (row.get("route_text_color") or "FFFFFF").strip(),
                })
        for r in routes:
            if r["route_color"] and not r["route_color"].startswith("#"):
                r["route_color"] = r["route_color"].lstrip("#")[:6] or "1F4E79"
        print(f"✅ Found {len(routes)} SEPTA routes")
        return routes

    def parse_shapes(self):
        print("\n🗺️  Parsing track shapes...")
        rows = self.read_csv("shapes.txt")
        shapes_dict = defaultdict(list)
        for row in rows:
            shape_id = row.get("shape_id", "")
            if shape_id:
                shapes_dict[shape_id].append({
                    "lat": float(row.get("shape_pt_lat", 0)),
                    "lon": float(row.get("shape_pt_lon", 0)),
                    "sequence": int(row.get("shape_pt_sequence", 0)),
                })
        shapes = {}
        for shape_id, points in shapes_dict.items():
            sorted_points = sorted(points, key=lambda x: x["sequence"])
            shapes[shape_id] = [[p["lat"], p["lon"]] for p in sorted_points]
        print(f"✅ Found {len(shapes)} shapes")
        # Distance-bounded simplification: tracks won't move more than ~10 ft from their true location.
        shapes = simplify_shapes_dict(shapes, tolerance_meters=3.048)
        return shapes

    def parse_stops(self):
        print("\n🏢 Parsing stops...")
        rows = self.read_csv("stops.txt")
        stops = []
        for row in rows:
            try:
                lat, lon = float(row.get("stop_lat", 0)), float(row.get("stop_lon", 0))
            except (ValueError, TypeError):
                continue
            if lat == 0 and lon == 0:
                continue
            stops.append({
                "stop_id": row.get("stop_id", ""),
                "stop_name": row.get("stop_name", ""),
                "stop_lat": lat,
                "stop_lon": lon,
                "location_type": row.get("location_type", "0"),
                "parent_station": row.get("parent_station", ""),
            })
        print(f"✅ Found {len(stops)} stops")
        return stops

    def map_shapes_to_routes(self):
        print("\n🔗 Mapping shapes to routes...")
        rows = self.read_csv("trips.txt")
        route_shapes = defaultdict(set)
        for row in rows:
            rid, sid = row.get("route_id", ""), row.get("shape_id", "")
            if rid and sid:
                route_shapes[rid].add(sid)
        return {k: list(v) for k, v in route_shapes.items()}

    def map_stops_to_routes(self):
        print("\n🔗 Mapping stops to routes...")
        trips = self.read_csv("trips.txt")
        stop_times = self.read_csv("stop_times.txt")
        stop_names = {s["stop_id"]: s["stop_name"] for s in self.parse_stops()}
        trip_to_route = {t["trip_id"]: t["route_id"] for t in trips if t.get("trip_id") and t.get("route_id")}
        route_stops = defaultdict(set)
        for row in stop_times:
            tid, sid = row.get("trip_id", ""), row.get("stop_id", "")
            if tid in trip_to_route and sid and sid in stop_names:
                route_stops[trip_to_route[tid]].add(sid)
        return {k: list(v) for k, v in route_stops.items()}, stop_names

    def map_trips_to_routes(self):
        print("\n🔗 Mapping trips to routes and headsigns...")
        rows = self.read_csv("trips.txt")
        trip_to_route = {}
        trip_to_headsign = {}
        trip_short_name_to_route = {}
        trip_short_name_to_headsign = {}
        for row in rows:
            tid = row.get("trip_id", "")
            tshort = row.get("trip_short_name", "")
            rid = row.get("route_id", "")
            headsign = row.get("trip_headsign", "")
            if tid and rid:
                trip_to_route[tid] = rid
            if tid and headsign:
                trip_to_headsign[tid] = headsign
            if tshort and rid:
                trip_short_name_to_route[tshort] = rid
            if tshort and headsign:
                trip_short_name_to_headsign[tshort] = headsign
        print(f"✅ Mapped {len(trip_to_route)} trips to routes and headsigns")
        return trip_to_route, trip_to_headsign, trip_short_name_to_route, trip_short_name_to_headsign

    def generate_route_data(self):
        routes = self.parse_routes()
        shapes = self.parse_shapes()
        route_shapes_map = self.map_shapes_to_routes()
        route_stops_map, stop_names = self.map_stops_to_routes()
        stops_full = {s["stop_id"]: s for s in self.parse_stops()}
        trip_to_route_map, trip_to_headsign_map, trip_short_name_to_route_map, trip_short_name_to_headsign_map = self.map_trips_to_routes()

        route_data = {
            "timestamp": datetime.now().isoformat(),
            "source": "SEPTA GTFS",
            "agency": "SEPTA",
            "totalRoutes": len(routes),
            "tripToRoute": trip_to_route_map,
            "tripToHeadsign": trip_to_headsign_map,
            "tripShortNameToRoute": trip_short_name_to_route_map,
            "tripShortNameToHeadsign": trip_short_name_to_headsign_map,
            "routes": {},
        }

        for route in routes:
            route_id = route["route_id"]
            shape_ids = route_shapes_map.get(route_id, [])
            stop_ids = route_stops_map.get(route_id, [])

            route_shapes_list = []
            for shape_id in shape_ids:
                if shape_id in shapes:
                    route_shapes_list.append({"shape_id": shape_id, "coords": shapes[shape_id]})

            route_stops_list = []
            for stop_id in stop_ids:
                s = stops_full.get(stop_id)
                if s:
                    route_stops_list.append({
                        "stop_id": stop_id,
                        "name": s["stop_name"],
                        "lat": s["stop_lat"],
                        "lon": s["stop_lon"],
                    })

            name_key = route["route_long_name"] or route["route_short_name"] or route_id
            color = route["route_color"]
            if color and not color.startswith("#"):
                color = "#" + color

            route_data["routes"][name_key] = {
                "route_id": route_id,
                "short_name": route["route_short_name"],
                "long_name": route["route_long_name"],
                "color": color or "#1F4E79",
                "text_color": "#" + (route["route_text_color"] or "FFFFFF").lstrip("#")[:6],
                "shapes": route_shapes_list,
                "stops": route_stops_list,
                "type": "rail" if route["route_type"] == "2" else "metro",
            }

        return route_data

    def save_js(self, data, filename, var_name):
        data_dir = Path(filename).parent
        data_dir.mkdir(parents=True, exist_ok=True)
        with open(filename, "w", encoding="utf-8") as f:
            f.write("// SEPTA Rail/Metro Data - Generated from GTFS\n")
            f.write(f"{var_name} = ")
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write(";\n\n")
            f.write("if (typeof module !== 'undefined' && module.exports) {\n")
            f.write(f"    module.exports = {{ {var_name} }};\n")
            f.write("}\n")
        print(f"✅ Saved {filename}")

    def run(self):
        print("=" * 60)
        print("🚂 SEPTA RAIL/METRO DATA PARSER")
        print("=" * 60)
        print(f"📁 Reading from: {self.gtfs_root.absolute()}")

        route_data = self.generate_route_data()
        self.save_js(route_data, "data/septa-routes-data.js", "septaRoutesData")

        print("\n" + "=" * 60)
        print("✅ SEPTA PARSING COMPLETE!")
        print("=" * 60)
        print(f"\n✨ Processed {route_data['totalRoutes']} routes")
        return True


def main():
    try:
        parser = SEPTARailDataParser()
        parser.run()
    except FileNotFoundError as e:
        print(str(e))
        print("\n💡 To download SEPTA GTFS, run:")
        print("   python scripts/download-septa-gtfs.py")
        return 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1
    return 0


if __name__ == "__main__":
    exit(main())
