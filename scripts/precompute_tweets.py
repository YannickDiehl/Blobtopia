#!/usr/bin/env python3
"""Extract tweet scheduling context from timeline DB (no LLM needed).

Reuses the deterministic scheduling logic from generate_tweets.py to build
a tweets-context.json that Claude Code can use to generate all tweet texts.

Usage:
    python3 scripts/precompute_tweets.py [path/to/timeline.db]
    python3 scripts/precompute_tweets.py --output data/tweets-context.json
    python3 scripts/precompute_tweets.py --max-tweets 600
"""

import sqlite3
import json
import sys
import os
import argparse
from collections import defaultdict

# Import scheduling logic from existing generate_tweets.py
from generate_tweets import (
    load_blobs, load_events, build_tweet_plan, build_tweet_prompt,
    DISTRICT_NAMES, PARTY_NAMES, TICKS_PER_YEAR, ALL_TOPICS,
    sat_to_label, trust_to_label, EDU_STYLES, EMOTION_CONTEXTS,
    build_topic_context,
)


HASHTAG_POOL = {
    "wirtschaft": ["Wirtschaft", "Arbeit", "Einkommen", "Krise", "Aufschwung", "Ungleichheit", "Reform"],
    "umwelt": ["Klimaschutz", "Umwelt", "Nachhaltigkeit", "Zukunft", "Natur", "Verantwortung"],
    "sicherheit": ["Sicherheit", "Ordnung", "Zusammenleben", "Kriminalität", "Polizei", "Freiheit"],
    "vertrauen": ["Vertrauen", "Politik", "Demokratie", "Wahlen", "Transparenz", "Korruption"],
    "teilhabe": ["Mitbestimmung", "Beteiligung", "Engagement", "Zusammenhalt", "Gemeinschaft"],
    "persoenlich": ["Alltag", "MeinLeben", "Nachbarschaft", "Globtopia", "Gedanken"],
}


def build_contact_graph(conn):
    """Reconstruct contact graph from shared buildings (mirrors Rust ContactGraph::build)."""
    rows = conn.execute(
        "SELECT id, name, home_building_id, workplace_id, leisure_spot_id, lunch_spot_id "
        "FROM blobs WHERE age >= 18"
    ).fetchall()

    blob_info = {}
    for r in rows:
        blob_info[r["id"]] = {
            "name": r["name"],
            "home": r["home_building_id"],
            "work": r["workplace_id"],
            "leisure": r["leisure_spot_id"],
            "lunch": r["lunch_spot_id"],
        }

    # Group by building → relationship type (priority: household > work > leisure > lunch)
    building_groups = [
        ("home_building_id", "household", 2.0),
        ("workplace_id", "coworker", 1.0),
        ("leisure_spot_id", "friend", 0.5),
        ("lunch_spot_id", "acquaintance", 0.2),
    ]

    contacts = defaultdict(dict)  # blob_id → {other_id: {"name", "type", "weight"}}

    for col, rel_type, weight in building_groups:
        by_building = defaultdict(list)
        for r in rows:
            bid = r[col]
            if bid is not None:
                by_building[bid].append(r["id"])

        for building_id, members in by_building.items():
            if len(members) < 2 or len(members) > 50:  # skip oversized groups
                continue
            for i, a in enumerate(members):
                for b in members[i + 1:]:
                    # Keep strongest relationship (first match wins due to priority order)
                    if b not in contacts[a]:
                        contacts[a][b] = {"name": blob_info[b]["name"], "type": rel_type, "weight": weight}
                    if a not in contacts[b]:
                        contacts[b][a] = {"name": blob_info[a]["name"], "type": rel_type, "weight": weight}

    # Cap at 15 per blob, sorted by weight descending
    result = {}
    for blob_id, contact_dict in contacts.items():
        sorted_contacts = sorted(contact_dict.values(), key=lambda c: -c["weight"])[:15]
        result[blob_id] = sorted_contacts

    return result


def tweet_spec_to_context(spec, contact_graph=None):
    """Convert a tweet plan spec into a serializable context dict."""
    blob = spec["blob"]
    traits = spec["traits"]
    tick = spec["tick"]
    year = tick // TICKS_PER_YEAR + 1
    month = (tick % TICKS_PER_YEAR) // 30 + 1
    day = (tick % TICKS_PER_YEAR) % 30 + 1

    district_name = DISTRICT_NAMES.get(blob["district"], "Unbekannt")
    party_name = PARTY_NAMES.get(blob.get("party"), "parteilos")
    first_name = blob["name"].split()[0] if blob.get("name") else "Blob"

    # Zeitgeist summary (top events)
    zeitgeist = spec.get("zeitgeist", {})
    zeitgeist_lines = []
    for t, zg in sorted(zeitgeist.items(), key=lambda x: -x[1]["intensity"]):
        if zg["intensity"] < 0.1:
            continue
        latest = max(zg["events"], key=lambda e: e["decay"])
        recency = "kuerzlich" if latest["decay"] > 0.7 else "vor einiger Zeit"
        zeitgeist_lines.append(f"{latest['desc']} ({recency})")
    zeitgeist_summary = zeitgeist_lines[:4] if zeitgeist_lines else ["Keine besonderen Ereignisse."]

    # Topic context
    topic_context = build_topic_context(blob, traits, spec["topic"], spec.get("event_desc"))

    # Education style
    edu = blob.get("education_level", 1)
    edu_style = EDU_STYLES.get(edu, EDU_STYLES[1])

    # NfC
    nfc = blob.get("need_for_closure", 5.0)
    nfc_note = ""
    if nfc < 3.5:
        nfc_note = "Formuliert differenziert, zeigt Ambivalenz."
    elif nfc > 6.5:
        nfc_note = "Formuliert klar und eindeutig, keine Graustufen."

    ctx = {
        "blob_id": blob["id"],
        "blob_name": blob["name"],
        "first_name": first_name,
        "district": district_name,
        "district_id": blob["district"],
        "age": blob.get("age", "?"),
        "education": edu,
        "tick": tick,
        "year": year,
        "month": month,
        "day": day,
        "topic": spec["topic"],
        "trigger_type": spec["trigger_type"],
        "event_desc": spec.get("event_desc"),
        "prompt_context": {
            "persona_snippet": (blob.get("persona_text", "")[:300] + "...") if blob.get("persona_text") else "",
            "emotion": blob.get("emotion_label", "gelassen"),
            "emotion_hint": EMOTION_CONTEXTS.get(blob.get("emotion_label", "gelassen"), ""),
            "activity": blob.get("activity", "LEISURE"),
            "satisfaction_label": sat_to_label(blob.get("satisfaction", 5.0)),
            "trust_label": trust_to_label(blob.get("trust", 5.0)),
            "party": party_name,
            "will_vote": blob.get("will_vote", False),
            "edu_style": edu_style,
            "nfc_note": nfc_note,
            "topic_context": topic_context,
            "zeitgeist": zeitgeist_summary,
        },
        "sentiment": round((blob.get("satisfaction", 5.0) - 5.0) / 5.0, 2),
        "contacts": [],
        "household": [],
        "hashtag_hints": [],
    }

    # Inject contacts from graph
    if contact_graph and blob["id"] in contact_graph:
        blob_contacts = contact_graph[blob["id"]]
        ctx["contacts"] = [c["name"] for c in blob_contacts[:5]]
        ctx["household"] = [c["name"] for c in blob_contacts if c["type"] == "household"]

    # Hashtag hints based on topic
    import random
    topic = spec["topic"]
    pool = HASHTAG_POOL.get(topic, HASHTAG_POOL["persoenlich"])
    ctx["hashtag_hints"] = random.sample(pool, min(4, len(pool)))

    return ctx


def main():
    parser = argparse.ArgumentParser(description="Extract tweet context from timeline DB")
    parser.add_argument("db_path", nargs="?", default="data/blobtopia_timeline.db")
    parser.add_argument("--output", default="data/tweets-context.json")
    parser.add_argument("--max-tweets", type=int, default=650)
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
    conn.row_factory = sqlite3.Row

    print(f"Loading data from {args.db_path}...")
    blobs = load_blobs(conn)
    events = load_events(conn)
    print(f"  {len(blobs)} adult blobs, {len(events)} events")

    print(f"Building tweet plan (max {args.max_tweets})...")
    tweet_plan = build_tweet_plan(conn, blobs, events, max_tweets=args.max_tweets)
    print(f"  {len(tweet_plan)} tweets planned")

    # Topic distribution
    by_topic = {}
    for spec in tweet_plan:
        t = spec["topic"]
        by_topic[t] = by_topic.get(t, 0) + 1
    print(f"  Topics: {dict(sorted(by_topic.items()))}")

    # Trigger distribution
    by_trigger = {}
    for spec in tweet_plan:
        t = spec["trigger_type"]
        by_trigger[t] = by_trigger.get(t, 0) + 1
    print(f"  Triggers: {dict(sorted(by_trigger.items()))}")

    print("Building contact graph from shared buildings...")
    contact_graph = build_contact_graph(conn)
    avg_contacts = sum(len(v) for v in contact_graph.values()) / max(len(contact_graph), 1)
    print(f"  {len(contact_graph)} blobs with contacts, avg {avg_contacts:.1f} contacts/blob")

    print("Extracting context for each tweet...")
    tweets_context = []
    for i, spec in enumerate(tweet_plan):
        ctx = tweet_spec_to_context(spec, contact_graph)
        tweets_context.append(ctx)
        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{len(tweet_plan)}...")

    # Write output
    output_path = args.output
    if not os.path.isabs(output_path):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(script_dir, "..", output_path)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"tweets": tweets_context, "total": len(tweets_context)}, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {len(tweets_context)} tweet contexts -> {output_path}")
    print(f"  Ready for: /generate-tweets")

    conn.close()


if __name__ == "__main__":
    main()
