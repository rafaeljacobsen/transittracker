"""
Distance-bounded polyline simplification.

`simplify_polyline(coords, tolerance_meters)` returns a reduced list of [lat, lon] points
that approximates the original line within a guaranteed maximum deviation of `tolerance_meters`.
Default tolerance is 3.048 m ≈ 10 feet — matches the rule "tracks may not move more than ~10 ft
from their true location."

Algorithm: Douglas-Peucker, iterative (no Python recursion-limit issues on long Amtrak shapes).
Distance is computed on the Earth's surface using a local equirectangular projection centered
at each evaluated segment's start point. Error vs. true geodesic distance is well under 1% for
transit-scale segments at moderate latitudes — far below the 10-foot tolerance.

Idempotent: simplify(simplify(x)) == simplify(x). Endpoints are always preserved.
"""

import math
from typing import List, Sequence

EARTH_RADIUS_M = 6371000.0  # mean radius — fine for our tolerance budget

LatLon = Sequence[float]  # [lat, lon]


def _to_local_xy(lat: float, lon: float, lat0: float, lon0: float, cos_lat0: float) -> tuple:
    """Local equirectangular projection centered at (lat0, lon0). Returns meters east/north."""
    dx = math.radians(lon - lon0) * EARTH_RADIUS_M * cos_lat0
    dy = math.radians(lat - lat0) * EARTH_RADIUS_M
    return dx, dy


def _perpendicular_distance_m(point: LatLon, seg_start: LatLon, seg_end: LatLon) -> float:
    """Perpendicular distance from `point` to the segment seg_start–seg_end, in meters.

    Computed via local equirectangular projection at seg_start. The point is projected onto the
    segment (clamped to the endpoints), then the planar distance is returned."""
    lat0, lon0 = seg_start[0], seg_start[1]
    cos_lat0 = math.cos(math.radians(lat0))

    px, py = _to_local_xy(point[0], point[1], lat0, lon0, cos_lat0)
    bx, by = _to_local_xy(seg_end[0], seg_end[1], lat0, lon0, cos_lat0)

    seg_len_sq = bx * bx + by * by
    if seg_len_sq == 0.0:
        # Degenerate segment (start == end) — distance is just point-to-start.
        return math.hypot(px, py)

    # Project p onto segment a–b, clamped to [0,1].
    t = (px * bx + py * by) / seg_len_sq
    if t < 0.0:
        t = 0.0
    elif t > 1.0:
        t = 1.0

    closest_x = t * bx
    closest_y = t * by
    return math.hypot(px - closest_x, py - closest_y)


def simplify_polyline(coords: List[LatLon], tolerance_meters: float = 3.048) -> List[list]:
    """Reduce a polyline to fewer points, never deviating from the original by more than `tolerance_meters`.

    Args:
        coords: list of [lat, lon] pairs (or any 2-element sequences).
        tolerance_meters: maximum allowed perpendicular deviation, in meters.
            Default 3.048 m = 10 feet. At this tolerance you can typically expect ~10–100×
            fewer points on smooth long-distance routes (Amtrak NEC, Empire Service, etc.) and
            ~2–5× fewer on tight urban routes (subway).

    Returns:
        A new list of [lat, lon] pairs. Always preserves the first and last points.
    """
    n = len(coords)
    if n < 3:
        return [list(c[:2]) for c in coords]

    keep = [False] * n
    keep[0] = True
    keep[n - 1] = True

    # Iterative DP using an explicit stack of (start, end) index ranges to simplify.
    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        if end - start < 2:
            continue

        max_dist = 0.0
        max_idx = -1
        seg_start = coords[start]
        seg_end = coords[end]
        for i in range(start + 1, end):
            d = _perpendicular_distance_m(coords[i], seg_start, seg_end)
            if d > max_dist:
                max_dist = d
                max_idx = i

        if max_dist > tolerance_meters and max_idx != -1:
            keep[max_idx] = True
            # Recurse on both halves (LIFO order doesn't matter — order of `keep` flips is fixed).
            stack.append((start, max_idx))
            stack.append((max_idx, end))

    return [list(coords[i][:2]) for i in range(n) if keep[i]]


def simplify_shapes_dict(shapes: dict, tolerance_meters: float = 3.048,
                         verbose: bool = True) -> dict:
    """Convenience: apply simplify_polyline to every value in a {shape_id: [[lat,lon],...]} dict.

    Returns a new dict. Logs aggregate point-count reduction when `verbose=True`."""
    out = {}
    points_before = 0
    points_after = 0
    for shape_id, pts in shapes.items():
        if not pts:
            out[shape_id] = pts
            continue
        simplified = simplify_polyline(pts, tolerance_meters=tolerance_meters)
        points_before += len(pts)
        points_after += len(simplified)
        out[shape_id] = simplified

    if verbose and points_before > 0:
        ratio = points_after / points_before
        print(f"   📐 Simplified {len(shapes)} shapes: {points_before:,} → {points_after:,} pts "
              f"({ratio*100:.1f}% retained, tolerance={tolerance_meters:.2f} m "
              f"≈ {tolerance_meters * 3.281:.1f} ft)")
    return out


if __name__ == "__main__":
    # Sanity check: an L-shape with a noisy hypotenuse should simplify to its endpoints
    # (since the noise is below the tolerance), but a sharp bend should be retained.
    smooth = [[40.0, -74.0], [40.0001, -74.0001], [40.0002, -74.0002], [40.0003, -74.0003]]
    bent = [[40.0, -74.0], [40.05, -74.0], [40.05, -74.05], [40.10, -74.05]]
    print("smooth:", simplify_polyline(smooth, tolerance_meters=3.048))
    print("bent:  ", simplify_polyline(bent, tolerance_meters=3.048))
