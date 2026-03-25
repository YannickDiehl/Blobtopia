#!/usr/bin/env python3
"""Generate a compact German small-town layout for 500 Blobs.

Creates ~280 buildings on an 800×800 grid with organic street layout,
5 districts, and minimal vacancy. Every building has a purpose.

Usage:
    python scripts/generate_compact_city.py
    # Output: data/blobtopia-city.json
"""

import json
import math
import random

GRID_SIZE = 800
CELL_SIZE = 16
GRID_CELLS = 50  # 800 / 16
CENTER = GRID_SIZE / 2  # 400
SEED = 42

# ═══════════════════════════════════════════════
# District Definitions
# ═══════════════════════════════════════════════

DISTRICTS = {
    0: {  # Grüntal (NW — rural, older, conservative)
        "name": "Grüntal",
        "bounds": (20, 440, 340, 780),  # x0, y0, x1, y1
        "building_type": "villa",
        "density": 0.6,
    },
    1: {  # Sonnenberg (N-Center — academic, affluent)
        "name": "Sonnenberg",
        "bounds": (200, 500, 600, 780),
        "building_type": "rowhouse",
        "density": 0.8,
    },
    2: {  # Hafenviertel (SW — diverse, dense)
        "name": "Hafenviertel",
        "bounds": (20, 20, 340, 400),
        "building_type": "apartment",
        "density": 0.9,
    },
    3: {  # Mittelfeld (Center-S — mixed, suburban)
        "name": "Mittelfeld",
        "bounds": (340, 20, 620, 440),
        "building_type": "rowhouse",
        "density": 0.75,
    },
    4: {  # Industriezone (E — factories, working class)
        "name": "Industriezone",
        "bounds": (620, 20, 780, 780),
        "building_type": "factory",
        "density": 0.7,
    },
}

# ═══════════════════════════════════════════════
# Building Stock (dimensioned for 500 Blobs)
# ═══════════════════════════════════════════════

BUILDING_STOCK = {
    # Residential (150 buildings for ~170 households)
    "villa": {"count": 30, "capacity": 2, "functional": "Villa", "districts": [0, 1]},
    "rowhouse": {"count": 80, "capacity": 3, "functional": "Rowhouse", "districts": [1, 3, 0]},
    "apartment": {"count": 40, "capacity": 5, "functional": "Apartment", "districts": [2, 3, 4]},
    # Workplaces
    "office": {"count": 12, "capacity": 5, "functional": "Office", "districts": [1, 3]},
    "shop": {"count": 15, "capacity": 3, "functional": "Shop", "districts": [2, 3, 1]},
    "factory": {"count": 8, "capacity": 10, "functional": "Factory", "districts": [4]},
    "warehouse": {"count": 4, "capacity": 8, "functional": "Warehouse", "districts": [4]},
    "cafe": {"count": 6, "capacity": 3, "functional": "Cafe", "districts": [1, 2, 3]},
    "restaurant": {"count": 5, "capacity": 4, "functional": "Restaurant", "districts": [2, 3, 1]},
    "bar": {"count": 4, "capacity": 3, "functional": "Bar", "districts": [2, 4, 3]},
    "university": {"count": 3, "capacity": 10, "functional": "University", "districts": [1]},
    "library": {"count": 2, "capacity": 5, "functional": "Library", "districts": [1, 3]},
    # Civic
    "parliament": {"count": 1, "capacity": 0, "functional": "Parliament", "districts": [3]},
    "media_center": {"count": 1, "capacity": 3, "functional": "MediaCenter", "districts": [3]},
    # Leisure
    "park": {"count": 5, "capacity": 0, "functional": "Park", "districts": [0, 1, 2, 3, 4]},
    "sports": {"count": 2, "capacity": 0, "functional": "SportsFacility", "districts": [3, 4]},
    "marketplace": {"count": 2, "capacity": 0, "functional": "Marketplace", "districts": [3, 2]},
    "central_square": {"count": 2, "capacity": 0, "functional": "CentralSquare", "districts": [3]},
}

# Kenney model mappings per building type
MODEL_MAP = {
    "villa": ["suburban-building-type-a", "suburban-building-type-b", "suburban-building-type-c",
              "suburban-building-type-d", "suburban-building-type-e", "suburban-building-type-f"],
    "rowhouse": ["suburban-building-type-g", "suburban-building-type-h", "suburban-building-type-i",
                 "suburban-building-type-j", "building-small-a", "building-small-b"],
    "apartment": ["commercial-building-a", "commercial-building-b", "commercial-building-c",
                  "commercial-building-d", "commercial-building-e"],
    "office": ["commercial-building-f", "commercial-building-g", "commercial-building-h"],
    "shop": ["building-small-c", "building-small-d", "suburban-building-type-k"],
    "factory": ["industrial-building-a", "industrial-building-b", "industrial-building-c",
                "industrial-building-d"],
    "warehouse": ["industrial-building-e", "industrial-building-f"],
    "cafe": ["building-small-a", "building-small-b"],
    "restaurant": ["building-small-c", "building-small-d"],
    "bar": ["building-small-a", "building-small-b"],
    "university": ["commercial-building-i", "commercial-building-j"],
    "library": ["commercial-building-k"],
    "parliament": ["civic-townhall"],
    "media_center": ["commercial-building-l"],
    "park": ["grass"],
    "sports": ["grass"],
    "marketplace": ["grass"],
    "central_square": ["grass"],
}

SCALE_MAP = {
    "villa": 12, "rowhouse": 14, "apartment": 16, "office": 14,
    "shop": 10, "factory": 16, "warehouse": 14, "cafe": 10,
    "restaurant": 10, "bar": 10, "university": 16, "library": 14,
    "parliament": 18, "media_center": 14, "park": 20, "sports": 24,
    "marketplace": 16, "central_square": 16,
}


# ═══════════════════════════════════════════════
# Street Generation
# ═══════════════════════════════════════════════

def generate_streets(rng):
    """Generate organic street network: radial + ring + side streets."""
    streets = []

    # Central Marktplatz (clear zone)
    # Already handled by building placement exclusion

    # Radial streets from center to edges
    angles = [0, 45, 90, 135, 180, 225, 270, 315]
    for angle in angles:
        rad = math.radians(angle)
        for r in range(30, 400, CELL_SIZE):
            x = CENTER + r * math.cos(rad) + rng.uniform(-3, 3)
            z = CENTER + r * math.sin(rad) + rng.uniform(-3, 3)
            if 10 < x < GRID_SIZE - 10 and 10 < z < GRID_SIZE - 10:
                streets.append((x, z))

    # Inner ring road (radius ~120)
    for angle_deg in range(0, 360, 5):
        rad = math.radians(angle_deg)
        x = CENTER + 120 * math.cos(rad) + rng.uniform(-4, 4)
        z = CENTER + 120 * math.sin(rad) + rng.uniform(-4, 4)
        streets.append((x, z))

    # Outer ring road (radius ~300)
    for angle_deg in range(0, 360, 4):
        rad = math.radians(angle_deg)
        x = CENTER + 300 * math.cos(rad) + rng.uniform(-5, 5)
        z = CENTER + 300 * math.sin(rad) + rng.uniform(-5, 5)
        if 10 < x < GRID_SIZE - 10 and 10 < z < GRID_SIZE - 10:
            streets.append((x, z))

    # District side streets (organic, not grid-aligned)
    for d_id, d in DISTRICTS.items():
        x0, z0, x1, z1 = d["bounds"]
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        n_streets = int((x1 - x0) * (z1 - z0) / 8000)
        for _ in range(n_streets):
            sx = rng.uniform(x0 + 20, x1 - 20)
            sz = rng.uniform(z0 + 20, z1 - 20)
            # Short street segment toward district center
            dx = (cx - sx) * 0.3
            dz = (cz - sz) * 0.3
            for t in range(0, 8):
                x = sx + dx * t / 8 + rng.uniform(-2, 2)
                z = sz + dz * t / 8 + rng.uniform(-2, 2)
                streets.append((x, z))

    return streets


def get_district(x, z):
    """Determine which district a coordinate belongs to."""
    for d_id, d in DISTRICTS.items():
        x0, z0, x1, z1 = d["bounds"]
        if x0 <= x <= x1 and z0 <= z <= z1:
            return d_id
    # Fallback: nearest district center
    best = 3
    best_dist = float('inf')
    for d_id, d in DISTRICTS.items():
        x0, z0, x1, z1 = d["bounds"]
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        dist = (x - cx) ** 2 + (z - cz) ** 2
        if dist < best_dist:
            best_dist = dist
            best = d_id
    return best


# ═══════════════════════════════════════════════
# Building Placement
# ═══════════════════════════════════════════════

def place_buildings(streets, rng):
    """Place buildings along streets, respecting building stock and districts."""
    placements = []
    next_id = 1

    # Place street tiles first
    street_set = set()
    for sx, sz in streets:
        gx = int(sx / CELL_SIZE)
        gz = int(sz / CELL_SIZE)
        if 0 <= gx < GRID_CELLS and 0 <= gz < GRID_CELLS:
            street_set.add((gx, gz))

    for gx, gz in street_set:
        wx = gx * CELL_SIZE + CELL_SIZE / 2
        wz = gz * CELL_SIZE + CELL_SIZE / 2
        placements.append({
            "id": next_id, "model": "road-straight", "x": wx, "z": wz,
            "rotation": rng.choice([0, math.pi / 2]),
            "scale": 1, "type": "road", "district": get_district(wx, wz),
            "label": "Straße", "functional_type": "Road", "capacity": 0,
        })
        next_id += 1

    # Collect valid building positions (adjacent to streets, not on streets)
    building_positions = []
    for gx, gz in street_set:
        for dx, dz in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)]:
            nx, nz = gx + dx, gz + dz
            if (nx, nz) not in street_set and 1 <= nx < GRID_CELLS - 1 and 1 <= nz < GRID_CELLS - 1:
                building_positions.append((nx, nz))

    # Deduplicate and shuffle
    building_positions = list(set(building_positions))
    rng.shuffle(building_positions)

    # Place buildings by type, prioritizing correct districts
    occupied = set()

    for btype, spec in BUILDING_STOCK.items():
        placed = 0
        target = spec["count"]
        preferred_districts = spec["districts"]

        # Sort positions: preferred districts first
        sorted_positions = sorted(
            building_positions,
            key=lambda p: (
                0 if get_district(p[0] * CELL_SIZE + 8, p[1] * CELL_SIZE + 8) in preferred_districts else 1,
                rng.random()
            )
        )

        for gx, gz in sorted_positions:
            if placed >= target:
                break
            if (gx, gz) in occupied:
                continue

            wx = gx * CELL_SIZE + CELL_SIZE / 2 + rng.uniform(-3, 3)
            wz = gz * CELL_SIZE + CELL_SIZE / 2 + rng.uniform(-3, 3)
            district = get_district(wx, wz)

            model = rng.choice(MODEL_MAP.get(btype, ["building-small-a"]))
            scale = SCALE_MAP.get(btype, 12) / CELL_SIZE

            # Determine label
            functional = spec["functional"]
            label_map = {
                "Villa": "Villa", "Rowhouse": "Reihenhaus", "Apartment": "Wohnung",
                "Office": "Büro", "Shop": "Geschäft", "Factory": "Fabrik",
                "Warehouse": "Lager", "Cafe": "Café", "Restaurant": "Restaurant",
                "Bar": "Bar", "University": "Universität", "Library": "Bibliothek",
                "Parliament": "Rathaus", "MediaCenter": "Medienzentrum",
                "Park": "Park", "SportsFacility": "Sportplatz",
                "Marketplace": "Marktplatz", "CentralSquare": "Zentralplatz",
            }
            label = label_map.get(functional, btype)

            placements.append({
                "id": next_id,
                "model": model,
                "x": round(wx, 1),
                "z": round(wz, 1),
                "rotation": round(rng.uniform(0, math.pi * 2), 3),
                "scale": round(scale, 2),
                "type": btype if btype not in ("park", "sports", "marketplace", "central_square") else "deco",
                "district": district,
                "label": label,
                "functional_type": functional,
                "capacity": spec["capacity"],
            })

            occupied.add((gx, gz))
            next_id += 1
            placed += 1

        if placed < target:
            print(f"  WARNING: Only placed {placed}/{target} {btype}")

    return placements, street_set, occupied


# ═══════════════════════════════════════════════
# Walkable Grid
# ═══════════════════════════════════════════════

def build_walkable_grid(street_set, occupied):
    """Build tile map for A* pathfinding."""
    grid = [['.' for _ in range(GRID_CELLS)] for _ in range(GRID_CELLS)]

    for gx, gz in street_set:
        if 0 <= gx < GRID_CELLS and 0 <= gz < GRID_CELLS:
            grid[gz][gx] = 'R'

    for gx, gz in occupied:
        if 0 <= gx < GRID_CELLS and 0 <= gz < GRID_CELLS:
            if grid[gz][gx] != 'R':
                grid[gz][gx] = 'B'

    # Add sidewalks: empty cells adjacent to roads or buildings
    for z in range(GRID_CELLS):
        for x in range(GRID_CELLS):
            if grid[z][x] == '.':
                has_neighbor = False
                for dx, dz in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nx, nz = x + dx, z + dz
                    if 0 <= nx < GRID_CELLS and 0 <= nz < GRID_CELLS:
                        if grid[nz][nx] in ('R', 'B'):
                            has_neighbor = True
                            break
                if has_neighbor:
                    grid[z][x] = 'D'  # Deco/sidewalk (walkable but slower)

    # Flatten to string
    tile_map = ''.join(''.join(row) for row in grid)
    return tile_map


# ═══════════════════════════════════════════════
# District Map
# ═══════════════════════════════════════════════

def build_district_map():
    """Build cell→district mapping."""
    dmap = {}
    for gz in range(GRID_CELLS):
        for gx in range(GRID_CELLS):
            wx = gx * CELL_SIZE + CELL_SIZE / 2
            wz = gz * CELL_SIZE + CELL_SIZE / 2
            d = get_district(wx, wz)
            dmap[f"{gx},{gz}"] = d
    return dmap


# ═══════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════

def main():
    rng = random.Random(SEED)

    print("Generating compact city for 500 Blobs...")
    print(f"  Grid: {GRID_SIZE}×{GRID_SIZE} ({GRID_CELLS}×{GRID_CELLS} cells)")

    # 1. Generate streets
    streets = generate_streets(rng)
    print(f"  Streets: {len(streets)} points")

    # 2. Place buildings
    placements, street_set, occupied = place_buildings(streets, rng)
    n_roads = sum(1 for p in placements if p["type"] == "road")
    n_buildings = sum(1 for p in placements if p["type"] != "road")
    print(f"  Roads: {n_roads} tiles")
    print(f"  Buildings: {n_buildings}")

    # Count by type
    by_type = {}
    for p in placements:
        ft = p["functional_type"]
        by_type[ft] = by_type.get(ft, 0) + 1
    print(f"\n  By functional type:")
    for ft, count in sorted(by_type.items(), key=lambda x: -x[1]):
        if ft != "Road":
            print(f"    {ft:20s}: {count}")

    # Count by district
    by_district = {}
    for p in placements:
        if p["type"] != "road":
            d = p["district"]
            by_district[d] = by_district.get(d, 0) + 1
    print(f"\n  By district:")
    for d in range(5):
        name = DISTRICTS[d]["name"]
        count = by_district.get(d, 0)
        print(f"    {d} ({name:15s}): {count}")

    # 3. Build walkable grid
    tile_map = build_walkable_grid(street_set, occupied)
    walkable_count = tile_map.count('R') + tile_map.count('D')
    print(f"\n  Walkable cells: {walkable_count}/{GRID_CELLS * GRID_CELLS} ({walkable_count / (GRID_CELLS * GRID_CELLS) * 100:.0f}%)")

    # 4. Build district map
    district_map = build_district_map()

    # 5. Assemble and save
    city = {
        "version": 2,
        "placements": placements,
        "walkableGrid": {
            "map": tile_map,
            "cells": GRID_CELLS,
            "cellSize": CELL_SIZE,
        },
        "districtMap": district_map,
    }

    output_path = "data/blobtopia-city.json"
    with open(output_path, 'w') as f:
        json.dump(city, f, indent=None)  # compact JSON

    size_mb = len(json.dumps(city)) / 1024 / 1024
    print(f"\n  Output: {output_path} ({size_mb:.1f} MB)")
    print("  Done!")


if __name__ == "__main__":
    main()
