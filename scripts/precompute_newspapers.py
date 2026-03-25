#!/usr/bin/env python3
"""Extract simulation data for newspaper generation (no LLM needed).

Reads the timeline DB and newspaper_config, outputs newspaper-context.json
with all data needed for Claude Code to generate article texts.

Usage:
    python3 scripts/precompute_newspapers.py [path/to/timeline.db]
    python3 scripts/precompute_newspapers.py --output data/newspaper-context.json
"""

import sqlite3
import json
import sys
import os
import uuid
import argparse

from newspaper_config import (
    NEWSPAPERS, ALL_EVENTS, DISTRICT_NAMES, DISTRICT_DISPLAY,
    PARTY_NAMES, TICKS_PER_YEAR,
)

# ═══════════════════════════════════════════════════════
# Data Loading (reused from generate_newspaper.py)
# ═══════════════════════════════════════════════════════

def load_blobs(conn):
    """Load all adult blobs with their base data."""
    rows = conn.execute("""
        SELECT g.id, g.name, g.district, g.age, g.education_level, g.income,
               COALESCE(g.persona_text, ''), COALESCE(g.need_for_closure, 5.0)
        FROM blobs g
        WHERE g.age >= 18
        ORDER BY g.district, g.name
    """).fetchall()
    return [{
        "id": row[0], "name": row[1], "district": row[2],
        "age": row[3], "education_level": row[4], "income": row[5],
        "persona_text": row[6], "need_for_closure": row[7],
    } for row in rows]


def get_blob_state_at_tick(conn, blob_id, tick):
    """Get a blob's dynamic state at a given tick."""
    row = conn.execute("""
        SELECT s.satisfaction, s.ideology, s.trust, s.party, s.will_vote,
               s.protest_readiness, s.income, s.latent_traits_json,
               COALESCE(s.emotion_label, 'gelassen')
        FROM blob_daily_state s
        WHERE s.blob_id = ? AND s.tick <= ?
        ORDER BY s.tick DESC LIMIT 1
    """, (blob_id, tick)).fetchone()
    if not row:
        return None, None
    state = {
        "satisfaction": row[0], "ideology": row[1], "trust": row[2],
        "party": row[3], "will_vote": row[4], "protest_readiness": row[5],
        "income": row[6], "emotion_label": row[8],
    }
    traits = json.loads(row[7]) if row[7] else {}
    return state, traits


def get_election_results(conn, tick):
    """Get election results at a given tick."""
    row = conn.execute(
        "SELECT fortschritt, mitte, tradition, unabhaengige FROM elections WHERE tick = ?",
        (tick,)
    ).fetchone()
    if row:
        return {"fortschritt": row[0], "mitte": row[1], "tradition": row[2], "unabhaengige": row[3]}
    return None


def get_district_aggregates(conn, tick):
    """Compute aggregate statistics per district at a given tick."""
    rows = conn.execute("""
        SELECT district, COUNT(*), ROUND(AVG(satisfaction), 2),
               ROUND(AVG(income), 0), ROUND(AVG(trust), 2),
               ROUND(AVG(protest_readiness), 2)
        FROM blob_daily_state WHERE tick = ? GROUP BY district
    """, (tick,)).fetchall()
    agg = {}
    for row in rows:
        agg[str(row[0])] = {
            "count": row[1], "avg_satisfaction": row[2],
            "avg_income": row[3], "avg_trust": row[4], "avg_protest": row[5],
        }
    # Overall
    row = conn.execute("""
        SELECT COUNT(*), ROUND(AVG(satisfaction), 2), ROUND(AVG(income), 0),
               ROUND(AVG(trust), 2), ROUND(AVG(protest_readiness), 2)
        FROM blob_daily_state WHERE tick = ?
    """, (tick,)).fetchone()
    if row:
        agg["all"] = {
            "count": row[0], "avg_satisfaction": row[1],
            "avg_income": row[2], "avg_trust": row[3], "avg_protest": row[4],
        }
    return agg


def resolve_metric(source, agg, election=None, prev_agg=None):
    """Resolve a metric source key to a display value."""
    if source.startswith("avg_income_district_"):
        d = source.split("_")[-1]
        v = agg.get(d, {}).get("avg_income", "k.A.")
        return f"{v}\u20ac" if isinstance(v, (int, float)) else v
    if source.startswith("avg_satisfaction_district_"):
        return agg.get(source.split("_")[-1], {}).get("avg_satisfaction", "k.A.")
    if source.startswith("avg_trust_district_"):
        return agg.get(source.split("_")[-1], {}).get("avg_trust", "k.A.")
    if source.startswith("avg_protest_district_"):
        return agg.get(source.split("_")[-1], {}).get("avg_protest", "k.A.")
    if source == "avg_income_all":
        v = agg.get("all", {}).get("avg_income", "k.A.")
        return f"{v}\u20ac" if isinstance(v, (int, float)) else v
    if source == "avg_satisfaction_all":
        return agg.get("all", {}).get("avg_satisfaction", "k.A.")
    if source == "avg_trust_all":
        return agg.get("all", {}).get("avg_trust", "k.A.")
    if source == "avg_protest_all":
        return agg.get("all", {}).get("avg_protest", "k.A.")
    if source == "income_change" and prev_agg:
        curr = agg.get("all", {}).get("avg_income", 0)
        prev = prev_agg.get("all", {}).get("avg_income", 0)
        if prev > 0:
            return f"{((curr - prev) / prev) * 100:+.1f}%"
        return "k.A."
    if source == "stable_income_pct":
        return "~72%"
    if source == "satisfaction_industriezone_change":
        return f"{agg.get('4', {}).get('avg_satisfaction', 'k.A.')} (aktuell)"
    if election:
        if source == "election_turnout":
            total = sum(election.values())
            return f"{total} von 376 ({total * 100 // 376}%)"
        if source == "election_fortschritt":
            return election.get("fortschritt", "k.A.")
        if source == "election_mitte":
            return election.get("mitte", "k.A.")
        if source == "election_tradition":
            return election.get("tradition", "k.A.")
        if source == "election_winner":
            winner = max(election, key=election.get)
            return PARTY_NAMES.get(
                {"fortschritt": 0, "mitte": 1, "tradition": 2, "unabhaengige": 3}.get(winner, 0),
                winner
            )
    return "k.A."


# ═══════════════════════════════════════════════════════
# Blob Selection
# ═══════════════════════════════════════════════════════

def select_blobs_for_quotes(conn, blobs, tick, districts, count, paper_profile):
    """Select blobs for article quotes with district diversity."""
    candidates = [b for b in blobs if b["district"] in districts]
    if not candidates:
        candidates = blobs[:50]

    enriched = []
    for blob in candidates[:80]:
        state, traits = get_blob_state_at_tick(conn, blob["id"], tick)
        if state:
            enriched.append({**blob, **state, "traits": traits or {}})
    if not enriched:
        return []

    pref = paper_profile.get("source_preference", {})
    edu_min = pref.get("education_min", 0)
    dw = pref.get("district_weight", {})

    def score(b):
        s = 1.0
        if b["education_level"] >= edu_min: s += 0.5
        s += dw.get(b["district"], 0.5)
        s += abs(b["satisfaction"] - 5.0) * 0.2
        return s

    # District diversity: pick best per district first
    selected, used = [], set()
    for d in dict.fromkeys(districts):
        dc = [b for b in enriched if b["district"] == d]
        if dc:
            dc.sort(key=lambda b: -score(b))
            selected.append(dc[0])
            used.add(dc[0]["id"])
    remaining = count - len(selected)
    if remaining > 0:
        rest = sorted([b for b in enriched if b["id"] not in used], key=lambda b: -score(b))
        selected.extend(rest[:remaining])
    return selected[:count]


def select_blobs_for_leserbriefe(conn, blobs, tick, criteria, paper_profile):
    """Select blobs for reader letters based on mood criteria."""
    selected, used_ids = [], set()
    for crit in criteria:
        candidates = [b for b in blobs if b["district"] == crit["district"] and b["id"] not in used_ids]
        if not candidates:
            candidates = [b for b in blobs if b["id"] not in used_ids][:30]
        best, best_score = None, -1
        for blob in candidates[:40]:
            state, traits = get_blob_state_at_tick(conn, blob["id"], tick)
            if not state:
                continue
            enriched = {**blob, **state, "traits": traits or {}}
            s = 0.0
            mood = crit.get("mood", "neutral")
            if mood in ("frustrated", "angry", "desperate"):
                s += max(0, 5.0 - enriched["satisfaction"]) * 2 + max(0, 5.0 - enriched["trust"])
            elif mood in ("worried", "concerned"):
                s += abs(enriched["satisfaction"] - 4.0) + max(0, 5.0 - enriched["trust"])
            elif mood in ("calm", "satisfied", "helpful", "compassionate", "resilient", "proud", "optimistic"):
                s += max(0, enriched["satisfaction"] - 4.0) * 1.5 + max(0, enriched["trust"] - 4.0)
            elif mood in ("cynical",):
                s += max(0, 5.0 - enriched["satisfaction"]) + enriched["traits"].get("powerlessness", 5.0) * 0.5
            elif mood in ("engaged",):
                s += enriched["traits"].get("self_efficacy", 5.0) * 0.3 + enriched["traits"].get("vote_importance", 5.0) * 0.3
            elif mood in ("moderate", "uncertain", "pragmatic"):
                s += 5.0 - abs(enriched["satisfaction"] - 5.0)
            if s > best_score:
                best_score = s
                best = enriched
        if best:
            selected.append(best)
            used_ids.add(best["id"])
    return selected


def blob_to_context(blob):
    """Convert enriched blob to a compact context dict for the generation prompt."""
    return {
        "id": blob["id"],
        "name": blob["name"],
        "district": DISTRICT_DISPLAY.get(blob["district"], "Unbekannt"),
        "district_id": blob["district"],
        "age": blob.get("age", "?"),
        "education": blob.get("education_level", 0),
        "satisfaction": round(blob.get("satisfaction", 5.0), 1),
        "trust": round(blob.get("trust", 5.0), 1),
        "party": PARTY_NAMES.get(blob.get("party"), "parteilos"),
        "emotion": blob.get("emotion_label", "gelassen"),
    }


# ═══════════════════════════════════════════════════════
# Main: Build Context JSON
# ═══════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Extract newspaper context from timeline DB")
    parser.add_argument("db_path", nargs="?", default="data/blobtopia_timeline.db")
    parser.add_argument("--output", default="data/newspaper-context.json")
    args = parser.parse_args()

    if not os.path.exists(args.db_path):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        alt = os.path.join(script_dir, "..", args.db_path)
        if os.path.exists(alt):
            args.db_path = alt
        else:
            print(f"ERROR: DB not found: {args.db_path}")
            sys.exit(1)

    conn = sqlite3.connect(args.db_path)
    blobs = load_blobs(conn)
    print(f"Loaded {len(blobs)} adult blobs from {args.db_path}")

    events_context = []

    for tick in sorted(ALL_EVENTS.keys()):
        event_cfg = ALL_EVENTS[tick]
        year = tick // TICKS_PER_YEAR + 1
        month = (tick % TICKS_PER_YEAR) // 30 + 1
        day = (tick % TICKS_PER_YEAR) % 30 + 1

        print(f"  Tick {tick}: {event_cfg.get('event_label', '?')} (Year {year})...")

        agg = get_district_aggregates(conn, tick)
        prev_agg = get_district_aggregates(conn, max(0, tick - 30)) if tick > 30 else None
        election = get_election_results(conn, tick) if event_cfg.get("event_type") == "Election" else None

        event_entry = {
            "tick": tick,
            "year": year,
            "month": month,
            "day": day,
            "event_type": event_cfg.get("event_type", "Unknown"),
            "event_label": event_cfg.get("event_label", "Ereignis"),
            "aggregates": agg,
            "election_results": election,
            "newspapers": {},
        }

        for paper_id in ["kurier", "blobspiegel"]:
            paper = NEWSPAPERS[paper_id]
            mapping = event_cfg[paper_id]

            # Quote blobs
            leit = mapping["leitartikel"]
            quote_blobs = select_blobs_for_quotes(
                conn, blobs, tick,
                leit.get("quote_districts", [2, 4] if paper_id == "kurier" else [3, 0]),
                leit.get("quote_count", 2),
                paper
            )

            # Leserbrief blobs
            lb_blobs = select_blobs_for_leserbriefe(
                conn, blobs, tick,
                mapping["leserbriefe"]["criteria"],
                paper
            )

            # Resolve zahlen_box metrics
            resolved_metrics = []
            for m in mapping["zahlen_box"]["metrics"]:
                val = resolve_metric(m["source"], agg, election, prev_agg)
                resolved_metrics.append({"label": m["label"], "value": str(val)})

            event_entry["newspapers"][paper_id] = {
                "newspaper_name": paper["name"],
                "issue_id": str(uuid.uuid4()),
                "frames": {
                    "leitartikel": {
                        "headline_hint": leit["headline_hint"],
                        "frame": leit["frame"],
                    },
                    "lokalnachricht": {
                        "headline_hint": mapping["lokalnachricht"]["headline_hint"],
                        "frame": mapping["lokalnachricht"]["frame"],
                        "focus_district": DISTRICT_DISPLAY.get(
                            mapping["lokalnachricht"].get("focus_district", 3), "Mittelfeld"
                        ),
                    },
                    "kommentar": {
                        "headline_hint": mapping["kommentar"]["headline_hint"],
                        "frame": mapping["kommentar"]["frame"],
                    },
                },
                "quoted_blobs": [blob_to_context(b) for b in quote_blobs],
                "leserbrief_blobs": [
                    {**blob_to_context(b), "mood": mapping["leserbriefe"]["criteria"][i]["mood"],
                     "desc": mapping["leserbriefe"]["criteria"][i]["desc"]}
                    for i, b in enumerate(lb_blobs) if i < len(mapping["leserbriefe"]["criteria"])
                ],
                "zahlen_box": {
                    "headline": mapping["zahlen_box"]["headline"],
                    "metrics": resolved_metrics,
                },
                "kurzmeldungen": mapping.get("kurzmeldungen", []),
            }

        events_context.append(event_entry)

    # Write context
    output_path = args.output
    if not os.path.isabs(output_path):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(script_dir, "..", output_path)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"events": events_context}, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {len(events_context)} event contexts -> {output_path}")
    print(f"  {len(events_context) * 2} newspaper issues to generate")


if __name__ == "__main__":
    main()
