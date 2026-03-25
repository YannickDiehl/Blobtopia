#!/usr/bin/env python3
"""Remove buildings from blobtopia-city.json that no Blob uses.

Reads the timeline DB to find all building IDs referenced by any Blob
(home, workplace, lunch, leisure) and removes all other functional
buildings from the city JSON. Roads, deco, and water are kept.

Usage:
    python scripts/filter_unused_buildings.py
"""

import json
import sqlite3
import sys

CITY_PATH = "public/blobtopia-city.json"
DB_PATH = "data/blobtopia_timeline.db"
OUTPUT_PATH = "public/blobtopia-city.json"
DATA_OUTPUT = "data/blobtopia-city.json"

NON_FUNCTIONAL_TYPES = {"road", "deco", "water"}
NON_FUNCTIONAL_FT = {"road", "decoration", "water"}


def main():
    # 1. Get used building IDs from timeline DB
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT id FROM (
            SELECT home_building_id as id FROM blobs WHERE home_building_id IS NOT NULL
            UNION SELECT workplace_id FROM blobs WHERE workplace_id IS NOT NULL
            UNION SELECT lunch_spot_id FROM blobs WHERE lunch_spot_id IS NOT NULL
            UNION SELECT leisure_spot_id FROM blobs WHERE leisure_spot_id IS NOT NULL
        )
    """)
    used_ids = {row[0] for row in cur.fetchall()}
    conn.close()
    print(f"Used building IDs from DB: {len(used_ids)}")

    # 2. Load city JSON
    with open(CITY_PATH) as f:
        city = json.load(f)

    placements = city["placements"]
    print(f"\nBefore filtering:")
    print(f"  Total placements: {len(placements)}")

    # Categorize
    roads = [p for p in placements if p.get("type") in NON_FUNCTIONAL_TYPES or p.get("functional_type") in NON_FUNCTIONAL_FT]
    functional = [p for p in placements if p.get("type") not in NON_FUNCTIONAL_TYPES and p.get("functional_type") not in NON_FUNCTIONAL_FT]
    print(f"  Non-functional (roads/deco/water): {len(roads)}")
    print(f"  Functional buildings: {len(functional)}")

    # 3. Filter: keep only used functional buildings
    kept = [p for p in functional if p["id"] in used_ids]
    removed = [p for p in functional if p["id"] not in used_ids]
    print(f"\n  Kept buildings: {len(kept)}")
    print(f"  Removed buildings: {len(removed)}")

    # 4. Update walkable grid: remove 'B' for deleted buildings
    removed_positions = set()
    wg = city.get("walkableGrid", {})
    cell_size = wg.get("cellSize", 32)
    cells = wg.get("cells", 62)
    tile_map = list(wg.get("map", ""))

    for p in removed:
        gx = int(p["x"] / cell_size)
        gz = int(p["z"] / cell_size)
        if 0 <= gx < cells and 0 <= gz < cells:
            idx = gz * cells + gx
            if idx < len(tile_map) and tile_map[idx] == 'B':
                tile_map[idx] = 'D'  # Make it walkable deco/sidewalk
                removed_positions.add((gx, gz))

    print(f"  Grid cells freed: {len(removed_positions)}")

    # 5. Reassemble
    new_placements = roads + kept
    city["placements"] = new_placements
    if "buildings" in city:
        del city["buildings"]
    if tile_map:
        city["walkableGrid"]["map"] = "".join(tile_map)

    print(f"\nAfter filtering:")
    print(f"  Total placements: {len(new_placements)}")

    # Stats by type
    by_type = {}
    for p in new_placements:
        ft = p.get("functional_type", p.get("type", "unknown"))
        by_type[ft] = by_type.get(ft, 0) + 1
    for ft, count in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f"    {ft:20s}: {count}")

    # 6. Save
    with open(OUTPUT_PATH, "w") as f:
        json.dump(city, f)
    print(f"\n  Saved: {OUTPUT_PATH}")

    with open(DATA_OUTPUT, "w") as f:
        json.dump(city, f)
    print(f"  Saved: {DATA_OUTPUT}")

    size_mb = len(json.dumps(city)) / 1024 / 1024
    print(f"  Size: {size_mb:.1f} MB")
    print("  Done!")


if __name__ == "__main__":
    main()
