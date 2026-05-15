#!/usr/bin/env python3
"""
Quick external verification of MTA's LIRR GTFS-RT feed.

Doesn't use any of our app's code — just pulls the raw bytes, walks the
top-level FeedMessage, and reports for each entity whether it's a TripUpdate,
VehiclePosition, or Alert. If the count of VehiclePositions is 0, the feed
genuinely has no live train positions and it's not a bug in our code.

Usage:
    python scripts/check-lirr-feed.py
"""
import urllib.request

URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr"

# Wire tags from gtfs-realtime.proto:
#   FeedEntity:
#     field 1 = id              (tag 0x0a, length-delimited)
#     field 3 = trip_update     (tag 0x1a, length-delimited)
#     field 4 = vehicle         (tag 0x22, length-delimited)
#     field 5 = alert           (tag 0x2a, length-delimited)
#   FeedMessage:
#     field 2 = entity          (tag 0x12, length-delimited)

def read_varint(buf, pos):
    val = 0
    shift = 0
    while True:
        b = buf[pos]; pos += 1
        val |= (b & 0x7f) << shift
        if (b & 0x80) == 0:
            return val, pos
        shift += 7

def main():
    print(f"Fetching {URL} ...")
    raw = urllib.request.urlopen(URL, timeout=15).read()
    print(f"Got {len(raw)} bytes\n")

    pos = 0
    n_total = 0
    n_vehicle = 0
    n_trip_update = 0
    n_alert = 0
    n_other = 0
    first_vehicle_id = None
    first_trip_update_id = None

    while pos < len(raw):
        tag = raw[pos]; pos += 1
        if tag != 0x12:                       # only walk top-level field 2 (entity)
            # skip top-level header (field 1) once
            length, pos = read_varint(raw, pos)
            pos += length
            continue
        ent_len, pos = read_varint(raw, pos)
        ent_end = pos + ent_len
        n_total += 1

        has_vehicle = False
        has_trip_update = False
        has_alert = False
        ent_id = None

        ep = pos
        while ep < ent_end:
            ftag = raw[ep]; ep += 1
            flen, ep = read_varint(raw, ep)
            if ftag == 0x0a:                  # field 1: id (string)
                ent_id = raw[ep:ep+flen].decode("utf-8", errors="replace")
            elif ftag == 0x1a:                # field 3: trip_update
                has_trip_update = True
            elif ftag == 0x22:                # field 4: vehicle
                has_vehicle = True
            elif ftag == 0x2a:                # field 5: alert
                has_alert = True
            ep += flen

        if has_vehicle:
            n_vehicle += 1
            if first_vehicle_id is None: first_vehicle_id = ent_id
        if has_trip_update:
            n_trip_update += 1
            if first_trip_update_id is None: first_trip_update_id = ent_id
        if has_alert:
            n_alert += 1
        if not (has_vehicle or has_trip_update or has_alert):
            n_other += 1
        pos = ent_end

    print(f"Entities: {n_total}")
    print(f"  with VehiclePosition: {n_vehicle}")
    print(f"  with TripUpdate:      {n_trip_update}")
    print(f"  with Alert:           {n_alert}")
    print(f"  other:                {n_other}")
    if first_trip_update_id:
        print(f"\nSample TripUpdate entity id: {first_trip_update_id}")
    if first_vehicle_id:
        print(f"Sample VehiclePosition entity id: {first_vehicle_id}")
    else:
        print("\n>>> No vehicle positions in the feed right now.")
        print(">>> MTA's LIRR vehicle reporting is currently down; this is upstream.")

if __name__ == "__main__":
    main()
