#!/usr/bin/env python3
"""Merge LLM-generated article texts from a JSON file into the dry-run newspaper structure."""
import json, sys

EVENT_MAP = {1: 400, 2: 1460, 3: 5000}

# Load dry-run structure
with open(sys.argv[1]) as f:
    issues = json.load(f)

# Load generated content
with open(sys.argv[2], encoding="utf-8") as f:
    generated = json.load(f)

# Index generated content
content = {}
for g in generated:
    key = (EVENT_MAP[g["event"]], g["paper"], g["section"])
    content[key] = g

# Merge
for issue in issues:
    tick = issue["tick"]
    paper = issue["newspaper"]
    s = issue["sections"]

    # Leitartikel
    k = (tick, paper, "leitartikel")
    if k in content:
        s["leitartikel"]["headline"] = content[k]["headline"]
        s["leitartikel"]["body"] = content[k]["body"]

    # Lokalnachricht
    k = (tick, paper, "lokalnachricht")
    if k in content:
        s["lokalnachricht"]["headline"] = content[k]["headline"]
        s["lokalnachricht"]["body"] = content[k]["body"]

    # Kommentar
    k = (tick, paper, "kommentar")
    if k in content:
        s["kommentar"]["headline"] = content[k]["headline"]
        s["kommentar"]["body"] = content[k]["body"]

    # Leserbriefe
    for i, lb in enumerate(s["leserbriefe"]):
        k = (tick, paper, f"leserbrief_{i+1}")
        if k in content:
            lb["text"] = content[k]["text"]

    # Kurzmeldungen
    for i, km in enumerate(s["kurzmeldungen"]):
        k = (tick, paper, f"kurzmeldung_{i+1}")
        if k in content:
            km["text"] = content[k]["text"]

with open(sys.argv[3], "w", encoding="utf-8") as f:
    json.dump(issues, f, ensure_ascii=False, indent=2)

print(f"Merged {len(content)} content blocks into {len(issues)} issues -> {sys.argv[3]}")
