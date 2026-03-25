#!/usr/bin/env python3
"""Generate LLM-based newspaper issues for the BlobGazetta system.

Two newspapers (Blobtopia Kurier + Der Blobspiegel) cover simulation events
with subtly different framing, source selection, and statistical emphasis.

Pilot mode: generates 6 probe issues (3 events x 2 newspapers) for validation.

Usage:
    python scripts/generate_newspaper.py [path/to/timeline.db]
    python scripts/generate_newspaper.py --dry-run
    python scripts/generate_newspaper.py --model claude-haiku-4-5-20251001
"""

import sqlite3
import sys
import json
import random
import time
import os
import argparse
import uuid

from newspaper_config import (
    NEWSPAPERS, PILOT_EVENTS, DISTRICT_NAMES, DISTRICT_DISPLAY,
    PARTY_NAMES, TICKS_PER_YEAR,
)

# ═══════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2.0


# ═══════════════════════════════════════════════════════
# Data Loading (reuses patterns from generate_tweets.py)
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


def load_events(conn):
    """Load all events from the database."""
    rows = conn.execute(
        "SELECT tick, event_type, description FROM events ORDER BY tick"
    ).fetchall()
    return [{"tick": r[0], "event_type": r[1], "description": r[2]} for r in rows]


def get_blob_state_at_tick(conn, blob_id, tick):
    """Get a blob's dynamic state at a given tick."""
    row = conn.execute("""
        SELECT s.satisfaction, s.ideology, s.trust, s.party, s.will_vote,
               s.protest_readiness, s.income, s.latent_traits_json,
               COALESCE(s.emotion_label, 'gelassen'),
               COALESCE(s.policy_economy, 5.0), COALESCE(s.policy_environment, 5.0),
               COALESCE(s.policy_security, 5.0), COALESCE(s.policy_social, 5.0),
               COALESCE(s.policy_migration, 5.0), COALESCE(s.policy_democracy, 5.0)
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
        "policy_economy": row[9], "policy_environment": row[10],
        "policy_security": row[11], "policy_social": row[12],
        "policy_migration": row[13], "policy_democracy": row[14],
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
        SELECT district,
               COUNT(*) as n,
               ROUND(AVG(satisfaction), 2) as avg_sat,
               ROUND(AVG(income), 0) as avg_inc,
               ROUND(AVG(trust), 2) as avg_trust,
               ROUND(AVG(protest_readiness), 2) as avg_protest
        FROM blob_daily_state
        WHERE tick = ?
        GROUP BY district
    """, (tick,)).fetchall()

    aggregates = {}
    for row in rows:
        aggregates[row[0]] = {
            "count": row[1], "avg_satisfaction": row[2],
            "avg_income": row[3], "avg_trust": row[4],
            "avg_protest": row[5],
        }

    # Overall
    row = conn.execute("""
        SELECT COUNT(*), ROUND(AVG(satisfaction), 2), ROUND(AVG(income), 0),
               ROUND(AVG(trust), 2), ROUND(AVG(protest_readiness), 2)
        FROM blob_daily_state WHERE tick = ?
    """, (tick,)).fetchone()
    if row:
        aggregates["all"] = {
            "count": row[0], "avg_satisfaction": row[1],
            "avg_income": row[2], "avg_trust": row[3],
            "avg_protest": row[4],
        }
    return aggregates


def resolve_metric(metric_source, aggregates, election_results=None, prev_aggregates=None):
    """Resolve a metric source string to an actual value."""
    if metric_source.startswith("avg_income_district_"):
        d = int(metric_source.split("_")[-1])
        val = aggregates.get(d, {}).get("avg_income", "k.A.")
        return f"{val}€" if isinstance(val, (int, float)) else val

    if metric_source.startswith("avg_satisfaction_district_"):
        d = int(metric_source.split("_")[-1])
        return aggregates.get(d, {}).get("avg_satisfaction", "k.A.")

    if metric_source.startswith("avg_trust_district_"):
        d = int(metric_source.split("_")[-1])
        return aggregates.get(d, {}).get("avg_trust", "k.A.")

    if metric_source.startswith("avg_protest_district_"):
        d = int(metric_source.split("_")[-1])
        return aggregates.get(d, {}).get("avg_protest", "k.A.")

    if metric_source == "avg_income_all":
        val = aggregates.get("all", {}).get("avg_income", "k.A.")
        return f"{val}€" if isinstance(val, (int, float)) else val

    if metric_source == "avg_satisfaction_all":
        return aggregates.get("all", {}).get("avg_satisfaction", "k.A.")

    if metric_source == "avg_trust_all":
        return aggregates.get("all", {}).get("avg_trust", "k.A.")

    if metric_source == "avg_protest_all":
        return aggregates.get("all", {}).get("avg_protest", "k.A.")

    if metric_source == "income_change":
        if prev_aggregates:
            curr = aggregates.get("all", {}).get("avg_income", 0)
            prev = prev_aggregates.get("all", {}).get("avg_income", 0)
            if prev > 0:
                change = ((curr - prev) / prev) * 100
                return f"{change:+.1f}%"
        return "k.A."

    if metric_source == "stable_income_pct":
        return "~72%"  # placeholder based on simulation characteristics

    if metric_source == "satisfaction_industriezone_change":
        val = aggregates.get(4, {}).get("avg_satisfaction", "k.A.")
        return f"{val} (aktuell)"

    # Election metrics
    if election_results:
        if metric_source == "election_turnout":
            total = sum(election_results.values())
            return f"{total} von 376 ({total * 100 // 376}%)"
        if metric_source == "election_fortschritt":
            return election_results.get("fortschritt", "k.A.")
        if metric_source == "election_mitte":
            return election_results.get("mitte", "k.A.")
        if metric_source == "election_tradition":
            return election_results.get("tradition", "k.A.")
        if metric_source == "election_winner":
            winner = max(election_results, key=election_results.get)
            return PARTY_NAMES.get({"fortschritt": 0, "mitte": 1, "tradition": 2, "unabhaengige": 3}[winner], winner)

    return "k.A."


# ═══════════════════════════════════════════════════════
# Blob Selection for Quotes and Reader Letters
# ═══════════════════════════════════════════════════════

def select_blobs_for_quotes(conn, blobs, tick, districts, count, newspaper_profile):
    """Select blobs to quote in articles based on newspaper bias.

    Ensures district diversity: picks the best-scoring blob from each requested
    district before filling remaining slots from the overall pool.
    """
    candidates = [b for b in blobs if b["district"] in districts]
    if not candidates:
        candidates = blobs[:50]

    # Enrich with state
    enriched = []
    for blob in candidates[:80]:  # limit DB queries
        state, traits = get_blob_state_at_tick(conn, blob["id"], tick)
        if state:
            enriched.append({**blob, **state, "traits": traits})

    if not enriched:
        return []

    # Apply newspaper source preference weighting
    pref = newspaper_profile.get("source_preference", {})
    edu_min = pref.get("education_min", 0)
    district_weights = pref.get("district_weight", {})

    def score(b):
        s = 1.0
        if b["education_level"] >= edu_min:
            s += 0.5
        s += district_weights.get(b["district"], 0.5)
        # Prefer blobs with strong opinions (high or low satisfaction)
        s += abs(b["satisfaction"] - 5.0) * 0.2
        return s

    # Ensure district diversity: pick best blob per district first
    selected = []
    used_ids = set()
    unique_districts = list(dict.fromkeys(districts))  # preserve order, deduplicate

    for d in unique_districts:
        d_candidates = [b for b in enriched if b["district"] == d]
        if d_candidates:
            d_candidates.sort(key=lambda b: -score(b))
            best = d_candidates[0]
            selected.append(best)
            used_ids.add(best["id"])

    # Fill remaining slots from overall pool
    remaining = count - len(selected)
    if remaining > 0:
        rest = [b for b in enriched if b["id"] not in used_ids]
        rest.sort(key=lambda b: -score(b))
        selected.extend(rest[:remaining])

    return selected[:count]


def select_blobs_for_leserbriefe(conn, blobs, tick, criteria, newspaper_profile):
    """Select specific blobs for reader letters based on criteria."""
    selected = []
    used_ids = set()

    for crit in criteria:
        target_district = crit["district"]
        candidates = [b for b in blobs if b["district"] == target_district and b["id"] not in used_ids]

        if not candidates:
            candidates = [b for b in blobs if b["id"] not in used_ids][:30]

        # Enrich and score
        best = None
        best_score = -1
        for blob in candidates[:40]:
            state, traits = get_blob_state_at_tick(conn, blob["id"], tick)
            if not state:
                continue

            enriched = {**blob, **state, "traits": traits or {}}
            score = 0.0

            mood = crit.get("mood", "neutral")
            if mood in ("frustrated", "angry", "desperate"):
                score += max(0, 5.0 - enriched["satisfaction"]) * 2
                score += max(0, 5.0 - enriched["trust"])
            elif mood in ("worried", "concerned"):
                score += abs(enriched["satisfaction"] - 4.0)
                score += max(0, 5.0 - enriched["trust"])
            elif mood in ("calm", "satisfied", "helpful", "compassionate", "resilient"):
                score += max(0, enriched["satisfaction"] - 4.0) * 1.5
                score += max(0, enriched["trust"] - 4.0)
            elif mood in ("cynical",):
                score += max(0, 5.0 - enriched["satisfaction"])
                score += enriched["traits"].get("powerlessness", 5.0) * 0.5
                score += enriched["traits"].get("party_indifference", 5.0) * 0.5
            elif mood in ("engaged",):
                score += enriched["traits"].get("self_efficacy", 5.0) * 0.3
                score += enriched["traits"].get("vote_importance", 5.0) * 0.3

            if score > best_score:
                best_score = score
                best = enriched

        if best:
            selected.append(best)
            used_ids.add(best["id"])

    return selected


# ═══════════════════════════════════════════════════════
# Prompt Building
# ═══════════════════════════════════════════════════════

def build_leitartikel_prompt(newspaper, event_config, section_config, aggregates,
                              quoted_blobs, election_results=None):
    """Build prompt for the lead article."""
    paper = NEWSPAPERS[newspaper]
    year = event_config.get("_tick", 0) // TICKS_PER_YEAR + 1
    tick = event_config.get("_tick", 0)

    # Build quotes block
    quotes_block = ""
    for i, blob in enumerate(quoted_blobs):
        district = DISTRICT_DISPLAY.get(blob["district"], "Unbekannt")
        party = PARTY_NAMES.get(blob.get("party"), "parteilos")
        sat_label = "zufrieden" if blob["satisfaction"] > 6 else "unzufrieden" if blob["satisfaction"] < 4 else "gemischt"
        quotes_block += (
            f"\nZitat-Quelle {i+1}: {blob['name']}, {blob.get('age', '?')} Jahre, "
            f"{district}, {party}-nah, Stimmung: {sat_label}, "
            f"Emotion: {blob.get('emotion_label', 'gelassen')}\n"
        )

    # Build stats context
    stats_lines = []
    for d_id, d_name in DISTRICT_DISPLAY.items():
        if d_id in aggregates:
            a = aggregates[d_id]
            stats_lines.append(
                f"  {d_name}: Zufriedenheit {a['avg_satisfaction']}, "
                f"Einkommen {a['avg_income']}€, Vertrauen {a['avg_trust']}"
            )
    stats_block = "\n".join(stats_lines)

    # Election results if applicable
    election_block = ""
    if election_results:
        total = sum(election_results.values())
        election_block = (
            f"\nWahlergebnis: Fortschritt {election_results['fortschritt']}, "
            f"Mitte {election_results['mitte']}, Tradition {election_results['tradition']}, "
            f"Unabhaengige {election_results['unabhaengige']}. "
            f"Gesamt: {total} von 376 Wahlberechtigten ({total * 100 // 376}% Beteiligung).\n"
        )

    return f"""{paper['style_prompt']}

=== AUSGABE ===
Zeitung: {paper['name']} | Jahr {year} in Blobtopia (Tick {tick})
Anlass: {event_config.get('event_label', 'Ereignis')}

=== LEITARTIKEL ===
Schreibe den Leitartikel (250-350 Woerter).
Ueberschrift-Vorschlag: {section_config['headline_hint']}

Framing-Anweisung: {section_config['frame']}

=== DATENGRUNDLAGE ===
Distriktwerte zum Zeitpunkt des Ereignisses:
{stats_block}
{election_block}
=== ZITATE ===
Baue mindestens ein direktes Zitat von folgenden Personen ein:{quotes_block}

=== FORMAT ===
Antworte in diesem exakten Format:
UEBERSCHRIFT: [Deine Ueberschrift]
---
[Artikeltext mit eingebetteten Zitaten. Nenne zitierte Personen mit Namen und Distrikt.]

WICHTIG:
- Schreibe als professioneller Journalist, nicht als Kommentator
- Bias zeigt sich in der Auswahl und Gewichtung, NICHT in offener Meinung
- Verwende die echten Statistiken aus der Datengrundlage
- Nenne keine Zahlenwerte aus dem Profil der zitierten Personen (Zufriedenheit etc.)
- Schreibe auf Deutsch
- Halte dich an 250-350 Woerter"""


def build_lokalnachricht_prompt(newspaper, event_config, section_config, aggregates):
    """Build prompt for local news section."""
    paper = NEWSPAPERS[newspaper]
    year = event_config.get("_tick", 0) // TICKS_PER_YEAR + 1
    focus = DISTRICT_DISPLAY.get(section_config.get("focus_district"), "Unbekannt")

    return f"""{paper['style_prompt']}

=== LOKALNACHRICHT ===
Zeitung: {paper['name']} | Jahr {year}
Anlass: {event_config.get('event_label', 'Ereignis')}
Fokus-Distrikt: {focus}

Schreibe eine Lokalnachricht (150-200 Woerter).
Ueberschrift-Vorschlag: {section_config['headline_hint']}
Framing: {section_config['frame']}

=== FORMAT ===
UEBERSCHRIFT: [Deine Ueberschrift]
---
[Artikeltext]

Schreibe als lokaler Reporter. Konkret, nahbar, distriktbezogen. Auf Deutsch. 150-200 Woerter."""


def build_kommentar_prompt(newspaper, event_config, section_config, aggregates):
    """Build prompt for opinion/commentary section."""
    paper = NEWSPAPERS[newspaper]
    year = event_config.get("_tick", 0) // TICKS_PER_YEAR + 1

    return f"""{paper['style_prompt']}

=== KOMMENTAR / MEINUNG ===
Zeitung: {paper['name']} | Jahr {year}
Anlass: {event_config.get('event_label', 'Ereignis')}

Schreibe einen Meinungskommentar (200-300 Woerter).
Ueberschrift-Vorschlag: {section_config['headline_hint']}
Argumentationslinie: {section_config['frame']}

=== FORMAT ===
UEBERSCHRIFT: [Deine Ueberschrift]
---
[Kommentartext. Hier darfst du Meinung zeigen — du bist Kommentator, nicht Reporter.]

Im Kommentar darf und soll die redaktionelle Haltung deutlicher durchscheinen als im Leitartikel.
Schreibe auf Deutsch. 200-300 Woerter."""


def build_leserbrief_prompt(newspaper, event_config, blob, criteria_desc):
    """Build prompt for a single reader letter."""
    paper = NEWSPAPERS[newspaper]
    district = DISTRICT_DISPLAY.get(blob["district"], "Unbekannt")
    party = PARTY_NAMES.get(blob.get("party"), "parteilos")
    sat = blob.get("satisfaction", 5.0)
    trust = blob.get("trust", 5.0)
    emotion = blob.get("emotion_label", "gelassen")

    # Latent trait context
    traits = blob.get("traits", {})
    trait_lines = []
    if traits.get("powerlessness", 5.0) > 6.5:
        trait_lines.append("Du fuehlst dich politisch machtlos.")
    if traits.get("anti_elitism", 5.0) > 6.5:
        trait_lines.append("Du misstraust den Eliten.")
    if traits.get("self_efficacy", 5.0) > 7.0:
        trait_lines.append("Du glaubst, dass du politisch etwas bewirken kannst.")
    if traits.get("community_participation", 5.0) > 6.5:
        trait_lines.append("Du bist aktiv in deiner Nachbarschaft.")
    trait_block = "\n".join(trait_lines) if trait_lines else ""

    sat_label = (
        "sehr unzufrieden" if sat < 2 else
        "unzufrieden" if sat < 4 else
        "gemischt" if sat < 6 else
        "zufrieden" if sat < 8 else
        "sehr zufrieden"
    )

    persona_snippet = blob.get("persona_text", "")[:500]

    return f"""Du bist {blob['name']}, {blob.get('age', '?')} Jahre, aus {district}.
Parteinaehe: {party} | Stimmung: {sat_label} | Emotion: {emotion} | Vertrauen: {'hoch' if trust > 6 else 'niedrig' if trust < 4 else 'mittel'}
{trait_block}

Kurz-Biografie: {persona_snippet}

=== AUFGABE ===
Schreibe einen Leserbrief an den '{paper['name']}' zum Thema: {event_config.get('event_label', 'Ereignis')}.
Charakter des Briefs: {criteria_desc}

=== REGELN ===
- 50-80 Woerter, 2-4 Saetze
- Schreibe in der Ich-Perspektive
- Dein Brief spiegelt deine Lebenslage und Stimmung wider
- Nenne KEINE Zahlen aus deinem Profil
- Kein Meta-Kommentar, keine Einleitung
- Unterschreibe mit: {blob['name']}, {district}
- Schreibe auf Deutsch"""


def build_kurzmeldung_prompt(newspaper, event_config, hint):
    """Build prompt for a brief news item."""
    paper = NEWSPAPERS[newspaper]
    return f"""{paper['style_prompt']}

Schreibe eine Kurzmeldung (30-50 Woerter, 1-2 Saetze) zu folgendem Thema:
{hint}

Kontext: {event_config.get('event_label', 'Ereignis')} in Blobtopia, Jahr {event_config.get('_tick', 0) // TICKS_PER_YEAR + 1}.

Antworte NUR mit der Meldung. Kein Titel, keine Einleitung. Auf Deutsch."""


# ═══════════════════════════════════════════════════════
# Anthropic API
# ═══════════════════════════════════════════════════════

def call_anthropic(prompt, model, api_key, max_tokens=600):
    """Call the Anthropic API with retry logic."""
    import urllib.request
    import urllib.error

    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                text = result["content"][0]["text"].strip()
                usage = result.get("usage", {})
                return text, usage
        except urllib.error.HTTPError as e:
            if e.code in (429, 529) and attempt < MAX_RETRIES - 1:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  Rate limit ({e.code}), retry in {delay:.0f}s...")
                time.sleep(delay)
                continue
            raise
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  Error: {e}, retry in {delay:.0f}s...")
                time.sleep(delay)
                continue
            raise

    return None, {}


def parse_article(raw_text):
    """Parse UEBERSCHRIFT: ... --- body format."""
    if not raw_text:
        return {"headline": "Ohne Titel", "body": raw_text or ""}

    lines = raw_text.strip().split("\n")
    headline = ""
    body_start = 0

    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("UEBERSCHRIFT:") or stripped.startswith("ÜBERSCHRIFT:"):
            headline = stripped.split(":", 1)[1].strip()
            body_start = i + 1
            continue
        if stripped == "---" and headline:
            body_start = i + 1
            break

    body = "\n".join(lines[body_start:]).strip()
    if not headline and body:
        # Fallback: first line as headline
        headline = lines[0].strip()
        body = "\n".join(lines[1:]).strip()

    return {"headline": headline, "body": body}


# ═══════════════════════════════════════════════════════
# Issue Generation
# ═══════════════════════════════════════════════════════

def generate_issue(conn, blobs, tick, newspaper_id, event_mapping, model, api_key, dry_run=False):
    """Generate a complete newspaper issue for one event and one newspaper."""
    paper = NEWSPAPERS[newspaper_id]
    mapping = event_mapping[newspaper_id]
    year = tick // TICKS_PER_YEAR + 1
    month = (tick % TICKS_PER_YEAR) // 30 + 1
    day = (tick % TICKS_PER_YEAR) % 30 + 1

    # Enrich event_config with tick
    event_config = {**event_mapping, "_tick": tick}

    # Load aggregates
    aggregates = get_district_aggregates(conn, tick)
    prev_aggregates = get_district_aggregates(conn, max(0, tick - 30)) if tick > 30 else None

    # Election results if applicable
    election_results = None
    if event_mapping.get("event_type") == "Election":
        election_results = get_election_results(conn, tick)

    issue = {
        "id": str(uuid.uuid4()),
        "newspaper": newspaper_id,
        "newspaper_name": paper["name"],
        "tick": tick,
        "year": year,
        "month": month,
        "day": day,
        "event_type": event_mapping.get("event_type", "Unknown"),
        "event_label": event_mapping.get("event_label", "Ereignis"),
        "sections": {},
    }

    total_tokens = {"input": 0, "output": 0}

    # ─── Leitartikel ───
    print(f"  Leitartikel...")
    leit_config = mapping["leitartikel"]
    quote_blobs = select_blobs_for_quotes(
        conn, blobs, tick,
        leit_config.get("quote_districts", []),
        leit_config.get("quote_count", 2),
        paper
    )
    prompt = build_leitartikel_prompt(
        newspaper_id, event_config, leit_config, aggregates, quote_blobs, election_results
    )

    if dry_run:
        issue["sections"]["leitartikel"] = {"headline": leit_config["headline_hint"], "body": "[DRY RUN]", "quotes": [b["name"] for b in quote_blobs]}
    else:
        raw, usage = call_anthropic(prompt, model, api_key, max_tokens=800)
        total_tokens["input"] += usage.get("input_tokens", 0)
        total_tokens["output"] += usage.get("output_tokens", 0)
        parsed = parse_article(raw)
        parsed["quotes"] = [{"name": b["name"], "district": DISTRICT_DISPLAY.get(b["district"], "?")} for b in quote_blobs]
        issue["sections"]["leitartikel"] = parsed

    # ─── Lokalnachricht ───
    print(f"  Lokalnachricht...")
    lokal_config = mapping["lokalnachricht"]
    prompt = build_lokalnachricht_prompt(newspaper_id, event_config, lokal_config, aggregates)

    if dry_run:
        issue["sections"]["lokalnachricht"] = {"headline": lokal_config["headline_hint"], "body": "[DRY RUN]"}
    else:
        raw, usage = call_anthropic(prompt, model, api_key, max_tokens=500)
        total_tokens["input"] += usage.get("input_tokens", 0)
        total_tokens["output"] += usage.get("output_tokens", 0)
        issue["sections"]["lokalnachricht"] = parse_article(raw)

    # ─── Kommentar ───
    print(f"  Kommentar...")
    komm_config = mapping["kommentar"]
    prompt = build_kommentar_prompt(newspaper_id, event_config, komm_config, aggregates)

    if dry_run:
        issue["sections"]["kommentar"] = {"headline": komm_config["headline_hint"], "body": "[DRY RUN]"}
    else:
        raw, usage = call_anthropic(prompt, model, api_key, max_tokens=600)
        total_tokens["input"] += usage.get("input_tokens", 0)
        total_tokens["output"] += usage.get("output_tokens", 0)
        issue["sections"]["kommentar"] = parse_article(raw)

    # ─── Leserbriefe ───
    print(f"  Leserbriefe ({mapping['leserbriefe']['count']})...")
    lb_criteria = mapping["leserbriefe"]["criteria"]
    lb_blobs = select_blobs_for_leserbriefe(conn, blobs, tick, lb_criteria, paper)

    issue["sections"]["leserbriefe"] = []
    for i, blob in enumerate(lb_blobs):
        desc = lb_criteria[i]["desc"] if i < len(lb_criteria) else "Allgemeine Meinung"
        prompt = build_leserbrief_prompt(newspaper_id, event_config, blob, desc)

        if dry_run:
            issue["sections"]["leserbriefe"].append({
                "blob_id": blob["id"], "blob_name": blob["name"],
                "district": DISTRICT_DISPLAY.get(blob["district"], "?"),
                "text": f"[DRY RUN: {desc}]",
            })
        else:
            raw, usage = call_anthropic(prompt, model, api_key, max_tokens=200)
            total_tokens["input"] += usage.get("input_tokens", 0)
            total_tokens["output"] += usage.get("output_tokens", 0)
            issue["sections"]["leserbriefe"].append({
                "blob_id": blob["id"], "blob_name": blob["name"],
                "district": DISTRICT_DISPLAY.get(blob["district"], "?"),
                "text": raw.strip() if raw else f"[Fehler bei Generierung]",
            })

    # ─── Zahlen-Box ───
    print(f"  Zahlen-Box...")
    zb_config = mapping["zahlen_box"]
    metrics = []
    for m in zb_config["metrics"]:
        value = resolve_metric(m["source"], aggregates, election_results, prev_aggregates)
        metrics.append({"label": m["label"], "value": str(value)})
    issue["sections"]["zahlen_box"] = {
        "headline": zb_config["headline"],
        "metrics": metrics,
    }

    # ─── Kurzmeldungen ───
    print(f"  Kurzmeldungen...")
    issue["sections"]["kurzmeldungen"] = []
    for km in mapping.get("kurzmeldungen", []):
        if dry_run:
            issue["sections"]["kurzmeldungen"].append({"text": f"[DRY RUN: {km['hint']}]"})
        else:
            prompt = build_kurzmeldung_prompt(newspaper_id, event_config, km["hint"])
            raw, usage = call_anthropic(prompt, model, api_key, max_tokens=120)
            total_tokens["input"] += usage.get("input_tokens", 0)
            total_tokens["output"] += usage.get("output_tokens", 0)
            issue["sections"]["kurzmeldungen"].append({"text": raw.strip() if raw else km["hint"]})

    issue["_generation_meta"] = {
        "model": model,
        "total_input_tokens": total_tokens["input"],
        "total_output_tokens": total_tokens["output"],
    }

    return issue


# ═══════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Generate BlobGazetta newspaper issues")
    parser.add_argument("db_path", nargs="?",
                        default="data/blobtopia_timeline.db",
                        help="Path to timeline database")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Anthropic model to use")
    parser.add_argument("--dry-run", action="store_true", help="Skip LLM calls, output structure only")
    parser.add_argument("--output", default="data/newspaper-pilot.json", help="Output JSON path")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key and not args.dry_run:
        print("ERROR: ANTHROPIC_API_KEY not set. Use --dry-run or set the key.")
        sys.exit(1)

    # Connect to DB
    if not os.path.exists(args.db_path):
        # Try relative to script dir
        script_dir = os.path.dirname(os.path.abspath(__file__))
        alt_path = os.path.join(script_dir, "..", args.db_path)
        if os.path.exists(alt_path):
            args.db_path = alt_path
        else:
            print(f"ERROR: Database not found: {args.db_path}")
            sys.exit(1)

    conn = sqlite3.connect(args.db_path)
    conn.row_factory = sqlite3.Row

    print(f"Loading data from {args.db_path}...")
    blobs = load_blobs(conn)
    print(f"  {len(blobs)} adult blobs loaded")

    all_issues = []

    for tick, event_mapping in sorted(PILOT_EVENTS.items()):
        print(f"\n{'='*60}")
        print(f"Event: {event_mapping['event_label']} (Tick {tick}, Year {tick // TICKS_PER_YEAR + 1})")
        print(f"{'='*60}")

        for newspaper_id in ["kurier", "blobspiegel"]:
            paper_name = NEWSPAPERS[newspaper_id]["name"]
            print(f"\n  --- {paper_name} ---")

            issue = generate_issue(
                conn, blobs, tick, newspaper_id, event_mapping,
                args.model, api_key, dry_run=args.dry_run
            )
            all_issues.append(issue)

            meta = issue.get("_generation_meta", {})
            print(f"  Tokens: {meta.get('total_input_tokens', 0)} in / {meta.get('total_output_tokens', 0)} out")

    # Save output
    output_path = args.output
    if not os.path.isabs(output_path):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(script_dir, "..", output_path)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_issues, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Generated {len(all_issues)} issues -> {output_path}")

    total_in = sum(i.get("_generation_meta", {}).get("total_input_tokens", 0) for i in all_issues)
    total_out = sum(i.get("_generation_meta", {}).get("total_output_tokens", 0) for i in all_issues)
    print(f"Total tokens: {total_in} input, {total_out} output")
    if total_in > 0:
        # Haiku pricing: $0.25/1M input, $1.25/1M output
        cost = (total_in * 0.25 + total_out * 1.25) / 1_000_000
        print(f"Estimated cost: ~${cost:.4f}")

    conn.close()


if __name__ == "__main__":
    main()
