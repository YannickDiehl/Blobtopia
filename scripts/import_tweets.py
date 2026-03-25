#!/usr/bin/env python3
"""Re-import archived tweets into a fresh timeline DB.

Matches tweets by blob name (not blob_id) so they survive precompute reruns.

Usage:
    python scripts/import_tweets.py [path/to/timeline.db] [path/to/tweets-archive.json]
"""

import sqlite3
import json
import sys
import os

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "data/blobtopia_timeline.db"
ARCHIVE_PATH = sys.argv[2] if len(sys.argv) > 2 else "data/tweets-archive.json"

if not os.path.exists(DB_PATH):
    print(f"ERROR: DB not found: {DB_PATH}")
    sys.exit(1)

if not os.path.exists(ARCHIVE_PATH):
    print(f"ERROR: Archive not found: {ARCHIVE_PATH}")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)

# Create tweets table if it doesn't exist
conn.execute("""
    CREATE TABLE IF NOT EXISTS tweets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        blob_id TEXT NOT NULL,
        tick INTEGER NOT NULL,
        topic TEXT NOT NULL DEFAULT '',
        trigger_type TEXT NOT NULL DEFAULT '',
        event_description TEXT,
        tweet_text TEXT NOT NULL,
        sentiment REAL NOT NULL DEFAULT 0.0
    )
""")

# Check if tweets already exist
existing = conn.execute("SELECT COUNT(*) FROM tweets").fetchone()[0]
if existing > 0:
    print(f"WARNING: {existing} tweets already in DB. Skipping import.")
    print("  Drop the table first if you want to re-import: sqlite3 DB 'DELETE FROM tweets;'")
    conn.close()
    sys.exit(0)

# Build name → blob_id map
name_map = {}
for row in conn.execute("SELECT id, name FROM blobs"):
    name_map[row[1]] = row[0]

# Load archive
with open(ARCHIVE_PATH, "r") as f:
    tweets = json.load(f)

print(f"Importing {len(tweets)} tweets from {ARCHIVE_PATH}")
print(f"  {len(name_map)} blobs in DB")

matched = 0
skipped = 0

for tweet in tweets:
    blob_id = name_map.get(tweet["blob_name"])
    if not blob_id:
        skipped += 1
        continue

    conn.execute(
        "INSERT INTO tweets (blob_id, tick, topic, trigger_type, event_description, tweet_text, sentiment) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (blob_id, tweet["tick"], tweet["topic"], tweet["trigger_type"],
         tweet.get("event_description"), tweet["tweet_text"], tweet["sentiment"])
    )
    matched += 1

conn.commit()
conn.close()

print(f"  Imported: {matched}")
print(f"  Skipped (name not found): {skipped}")
print("Done!")
