#!/usr/bin/env python3
"""Generate LLM-based tweets for Blobs via Anthropic Haiku API.

Blobs write short, opinionated tweets about events and policy topics,
based on their individual traits. Tweets are pre-computed and stored
in the timeline DB for deterministic playback.

Usage:
    python scripts/generate_tweets.py [path/to/timeline.db]
    python scripts/generate_tweets.py --dry-run
    python scripts/generate_tweets.py --resume
    python scripts/generate_tweets.py --max-tweets 100
    python scripts/generate_tweets.py --model claude-haiku-4-5-20251001
"""

import sqlite3
import hashlib
import sys
import json
import random
import re
import time
import os
import argparse

# ═══════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════

TICKS_PER_YEAR = 365
DEFAULT_MODEL = "claude-haiku-4-5-20251001"
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2.0

# ═══════════════════════════════════════════════════════
# Event-to-Topic Mapping
# ═══════════════════════════════════════════════════════

EVENT_TOPIC_MAP = {
    "Wirtschaftskrise":                 ["wirtschaft", "vertrauen"],
    "Wirtschaftsaufschwung":            ["wirtschaft"],
    "Ungleichheitsbericht":             ["wirtschaft", "vertrauen", "teilhabe"],
    "Grundsatzdebatte":                 None,  # parse from description
    "Skandal":                          ["vertrauen", "teilhabe"],
    "Korruptionsenthuellung":           ["vertrauen", "teilhabe"],
    "Korruptionsenthüllung":            ["vertrauen", "teilhabe"],
    "Naturkatastrophe":                 ["wirtschaft", "umwelt", "sicherheit", "vertrauen"],
    "Medienkampagne":                   ["teilhabe", "vertrauen", "wirtschaft"],
    "Wahl ausgerufen":                  ["teilhabe", "wirtschaft", "vertrauen", "umwelt", "sicherheit"],
    "Bildungsreform":                   ["teilhabe", "wirtschaft"],
    "Erfolgreiche Buergerbeteiligung":  ["teilhabe", "vertrauen"],
    "Erfolgreiche Bürgerbeteiligung":   ["teilhabe", "vertrauen"],
    "Kulturereignis":                   [],  # no political topic
    "Wertekonflikt":                    ["sicherheit", "vertrauen", "teilhabe"],
    "Politische Reform":                ["wirtschaft", "teilhabe", "vertrauen"],
}

PARTY_NAMES = {0: "Fortschritt", 1: "Mitte", 2: "Tradition", 3: "Unabhaengige"}

DISTRICT_NAMES = {0: "Gruental", 1: "Sonnenberg", 2: "Hafenviertel", 3: "Mittelfeld", 4: "Industriezone"}

EMOTION_CONTEXTS = {
    "begeistert": "Du bist gerade begeistert und voller Energie — dein Tweet klingt enthusiastisch.",
    "hoffnungsvoll": "Du bist hoffnungsvoll — dein Tweet klingt optimistisch.",
    "zufrieden": "Du bist zufrieden — dein Tweet klingt ausgeglichen.",
    "wuetend": "Du bist gerade wuetend — dein Tweet klingt scharf, emotional, aufgebracht.",
    "frustriert": "Du bist frustriert — dein Tweet klingt genervt, klagend.",
    "besorgt": "Du machst dir Sorgen — dein Tweet klingt nachdenklich, aengstlich.",
    "angespannt": "Du bist angespannt — dein Tweet klingt nervoes, unruhig.",
    "gelassen": "Du bist gelassen — dein Tweet klingt ruhig, bedaechtig.",
}

ACTIVITY_CONTEXTS = {
    "SLEEPING": "Du wurdest gerade geweckt und tippst verschlafen aufs Handy.",
    "COMMUTING": "Du tippst unterwegs auf dem Weg zur Arbeit.",
    "WORKING": "Du schreibst in einer kurzen Arbeitspause.",
    "LUNCH_BREAK": "Du schreibst entspannt in deiner Mittagspause.",
    "SHOPPING": "Du schreibst beim Einkaufen, zwischen Regalen.",
    "SOCIALIZING": "Du schreibst, waehrend du Freunde oder Nachbarn triffst.",
    "LEISURE": "Du hast gerade frei und scrollst durch den Feed.",
    "PROTESTING": "Du schreibst direkt von einer Demo — du bist aufgeladen und leidenschaftlich.",
    "GOING_HOME": "Du schreibst auf dem Heimweg.",
}

NFC_TWEET_STYLES = {
    "low": "Du formulierst differenziert, zeigst Ambivalenz, sagst auch mal 'einerseits... andererseits'.",
    "high": "Du formulierst klar und eindeutig. Keine Graustufen, keine Relativierungen.",
}

def policy_label(value, labels):
    """Map a 0-10 policy value to a label."""
    if value < 2.5: return labels[0]
    if value < 4.5: return labels[1]
    if value < 5.5: return labels[2]
    if value < 7.5: return labels[3]
    return labels[4]

POLICY_LABELS = {
    "economy": ["klar fuer staatliche Regulation", "eher fuer Regulation", "ambivalent", "eher fuer freien Markt", "klar fuer Deregulierung"],
    "environment": ["klarer Umweltschutz-Vorrang", "eher Umweltschutz", "ambivalent", "eher Wirtschaftswachstum", "klarer Wachstums-Vorrang"],
    "security": ["klar fuer Freiheitsrechte", "eher fuer Freiheit", "ambivalent", "eher fuer Ordnung", "klar fuer Sicherheit und Ordnung"],
    "social": ["klar fuer Umverteilung", "eher solidarisch", "ambivalent", "eher Eigenverantwortung", "klar fuer Eigenverantwortung"],
    "migration": ["sehr offen", "eher offen", "ambivalent", "eher restriktiv", "klar restriktiv"],
    "democracy": ["klar fuer direkte Demokratie", "eher basisdemokratisch", "ambivalent", "eher repraesentativ", "klar fuer repraesentative Demokratie"],
}

EDU_STYLES = {
    0: ("sehr umgangssprachlich, mit Abkuerzungen (hab, nen, nix, ma, is, "
        "kannste, gehste), gelegentlichen Tippfehlern und kurzen Saetzen. "
        "Schreib wie jemand, der schnell auf dem Handy tippt"),
    1: ("locker und bodenstaendig, manchmal umgangssprachlich "
        "(z.B. 'hab', 'nen', 'was'), wie man unter Freunden redet"),
    2: ("sachlich aber alltagsnah, mit gelegentlich umgangssprachlichen "
        "Wendungen, wie ein Beitrag in einem Diskussionsforum"),
    3: ("differenziert und reflektiert, aber immer noch wie ein Social-Media-Post, "
        "nicht wie ein Essay — maximal 2 Saetze, mit persoenlicher Note"),
}

STYLE_SEEDS = [
    "Beginne mit einer Beobachtung aus deinem Alltag.",
    "Formuliere eine direkte Meinung, als wuerdest du sie einem Freund sagen.",
    "Stelle eine rhetorische Frage, die dich gerade aufregt oder beschaeftigt.",
    "Aeussere dich emotional — Frust, Freude, Aerger, Hoffnung.",
    "Beziehe dich auf deine persoenliche Situation oder Erfahrung.",
    "Reagiere, als haettest du gerade eine Nachricht gelesen.",
    "Schreib so, als wuerdest du laut denken.",
    "Kommentiere etwas, das du in deiner Nachbarschaft erlebt hast.",
    "Beginne mit 'Ehrlich gesagt...' oder 'Mal ehrlich...'.",
    "Schreib einen kurzen, knackigen Satz — wie ein Stossseufzer.",
]


def map_event_to_topics(description):
    """Map an event description to Politikfeld topics."""
    for key, topics in EVENT_TOPIC_MAP.items():
        if key in description:
            if topics is None:
                # Grundsatzdebatte: parse topic from description
                return debate_topic_from_description(description)
            return topics
    return []


def debate_topic_from_description(desc):
    """Grundsatzdebatte: extract topic from description."""
    if "Klima" in desc:
        return ["umwelt"]
    if "Sicherheit" in desc:
        return ["sicherheit"]
    if "Wirtschaft" in desc or "Solidarit" in desc or "Zukunft" in desc:
        return ["wirtschaft"]
    return ["wirtschaft"]  # fallback


# ═══════════════════════════════════════════════════════
# Politikfeld Computation
# ═══════════════════════════════════════════════════════

def compute_politikfeld(traits, sat, trust, income, ideology):
    """Compute policy field positions and salience for a Blob.

    Returns: {field: {position: -1..+1, salience: 0..10}}
    """
    income_norm = min(income / 700.0, 10.0)

    return {
        "wirtschaft": {
            "position": (ideology - 5.5) / 4.5,
            "salience": abs(traits.get("economic_security_priority", 5.0) - 5.0)
                        + max(0, 3.0 - income_norm) * 1.5
                        + 0.5,
        },
        "umwelt": {
            "position": -(traits.get("environment_over_economy", 5.0) - 5.0) / 5.0,
            "salience": abs(traits.get("environment_over_economy", 5.0) - 5.0)
                        + 2.0,
        },
        "sicherheit": {
            "position": -(traits.get("freedom_over_order", 5.0) - 5.0) / 5.0,
            "salience": abs(traits.get("freedom_over_order", 5.0) - 5.0)
                        + abs(traits.get("strong_leader_preference", 5.0) - 5.0) * 0.5
                        + 1.5,
        },
        "vertrauen": {
            "position": (trust - 5.0) / 5.0,
            "salience": abs(trust - 5.0)
                        + abs(traits.get("powerlessness", 5.0) - 5.0) * 0.3
                        + 0.5,
        },
        "teilhabe": {
            "position": (traits.get("vote_importance", 5.0) - 5.0) / 5.0,
            "salience": abs(traits.get("vote_importance", 5.0) - 5.0)
                        + abs(traits.get("self_efficacy", 5.0) - 5.0) * 0.3
                        + 0.5,
        },
    }


def tweet_affinity(blob_row, traits):
    """How likely is this Blob to tweet? Returns 0.0-1.0."""
    score = 0.15
    score += traits.get("self_efficacy", 5.0) * 0.025
    score += blob_row["education_level"] * 0.02
    score -= max(0, blob_row["age"] - 40) * 0.002
    score += abs(blob_row["satisfaction"] - 5.0) * 0.02
    score -= traits.get("party_indifference", 5.0) * 0.015
    return max(0.05, min(0.50, score))


# ═══════════════════════════════════════════════════════
# Zeitgeist Computation
# ═══════════════════════════════════════════════════════

def compute_zeitgeist(tick, events):
    """Compute the active topic landscape at a given tick.

    Returns: {topic: {intensity: 0-1, events: [{desc, tick, decay}]}}
    """
    active = {}
    for evt in events:
        evt_tick = evt["tick"]
        if evt_tick > tick:
            continue
        decay = max(0.0, 1.0 - (tick - evt_tick) / 365.0)
        if decay < 0.05:
            continue

        topics = map_event_to_topics(evt["description"])
        for topic in topics:
            if topic not in active:
                active[topic] = {"intensity": 0.0, "events": []}
            active[topic]["intensity"] = max(active[topic]["intensity"], decay)
            active[topic]["events"].append({
                "desc": evt["description"],
                "tick": evt_tick,
                "decay": round(decay, 2),
            })
    return active


ALL_TOPICS = ["wirtschaft", "umwelt", "sicherheit", "vertrauen", "teilhabe", "persoenlich"]


def select_tweet_topic(blob_row, traits, zeitgeist, topic_counts=None, rng=None):
    """Select the topic this Blob tweets about.

    Uses weighted random with deficit correction for balanced distribution.
    Returns: (topic_name, event_desc_or_None)
    """
    pf = compute_politikfeld(
        traits, blob_row["satisfaction"], blob_row["trust"],
        blob_row["income"], blob_row["ideology"]
    )

    # Raw scores: political topics via salience*intensity, persoenlich = flat base
    # Each political topic gets a baseline from salience alone (even without zeitgeist)
    scores = {}
    for topic in ALL_TOPICS:
        if topic == "persoenlich":
            scores[topic] = 0.6
            continue
        zg = zeitgeist.get(topic)
        base = pf[topic]["salience"] * 0.2 if topic in pf else 0.15  # baseline from salience alone
        if zg and topic in pf:
            scores[topic] = pf[topic]["salience"] * zg["intensity"] + base
        else:
            scores[topic] = base

    # Deficit correction: boost underrepresented topics
    if topic_counts:
        total = max(sum(topic_counts.values()), 1)
        for topic in ALL_TOPICS:
            current_pct = topic_counts.get(topic, 0) / total
            deficit = max(0, (1.0 / 6.0) - current_pct)
            scores[topic] *= (1.0 + 12.0 * deficit)

    # Weighted random selection
    if rng is None:
        rng = random.Random()
    topics_list = list(scores.keys())
    weights = [max(scores[t], 0.01) for t in topics_list]
    chosen = rng.choices(topics_list, weights=weights, k=1)[0]

    # Find event description if political topic
    event_desc = None
    if chosen != "persoenlich" and chosen in zeitgeist:
        zg = zeitgeist[chosen]
        event_desc = max(zg["events"], key=lambda e: e["decay"])["desc"]

    return chosen, event_desc


# ═══════════════════════════════════════════════════════
# Prompt Building
# ═══════════════════════════════════════════════════════

def sat_to_label(sat):
    """Convert satisfaction value to verbal label."""
    if sat < 1.0:
        return "am Tiefpunkt, verzweifelt"
    elif sat < 2.0:
        return "sehr unzufrieden, frustriert"
    elif sat < 4.0:
        return "unzufrieden"
    elif sat < 6.0:
        return "gemischt"
    elif sat < 8.0:
        return "zufrieden"
    else:
        return "sehr zufrieden"


def trust_to_label(trust):
    """Convert trust value to verbal label."""
    if trust < 2.0:
        return "tiefes Misstrauen"
    elif trust < 4.0:
        return "eher misstrauisch"
    elif trust < 6.0:
        return "ambivalent"
    elif trust < 8.0:
        return "eher vertrauensvoll"
    else:
        return "hohes Vertrauen"


def build_topic_context(blob_row, traits, topic, event_desc=None):
    """Generate the thematic block based on Politikfeld + position."""
    pf = compute_politikfeld(
        traits, blob_row["satisfaction"], blob_row["trust"],
        blob_row["income"], blob_row["ideology"]
    )

    if topic == "persoenlich":
        sat = blob_row.get("satisfaction", 5.0)
        emotion = blob_row.get("emotion_label", "gelassen")
        if sat < 3.0:
            return "Schreib ueber etwas, das dich gerade nervt oder belastet — Arbeit, Geld, Nachbarn, das Leben."
        elif sat > 7.0:
            return "Schreib ueber etwas Positives aus deinem Alltag — ein guter Moment, eine Beobachtung, Dankbarkeit."
        else:
            return "Schreib ueber deinen Alltag, dein Lebensgefuehl oder etwas, das dich gerade beschaeftigt."

    pos = pf.get(topic, {}).get("position", 0.0)

    context = ""
    if event_desc:
        context = f"In Blobtopia ist gerade passiert: {event_desc}\nReagiere darauf aus deiner Perspektive.\n\n"

    if topic == "wirtschaft":
        if pos < -0.3:
            context += "Du findest, der Staat muss mehr fuer die Schwachen tun. Umverteilung ist dringend noetig."
        elif pos > 0.3:
            context += "Du findest, jeder sollte fuer sich selbst sorgen. Zu viel Staat schadet der Wirtschaft."
        else:
            context += "Wirtschaftlich bist du gespalten — manches laeuft, manches nicht."
        if blob_row["income"] < 1500:
            context += " Du spuerst wirtschaftlichen Druck im Alltag."
        elif blob_row["income"] > 4000:
            context += " Dir geht es finanziell gut."

    elif topic == "umwelt":
        if pos < -0.3:
            context += "Umweltschutz ist dir sehr wichtig, auch wenn es die Wirtschaft kostet."
        elif pos > 0.3:
            context += "Arbeitsplaetze und Wirtschaft gehen fuer dich vor Umweltschutz."
        else:
            context += "Umwelt ist dir wichtig, aber nicht um jeden Preis."

    elif topic == "sicherheit":
        if pos < -0.3:
            context += "Freiheit und Buergerrechte sind dir wichtiger als Ordnung und Kontrolle."
        elif pos > 0.3:
            context += "Ordnung und Sicherheit sind dir sehr wichtig. Starke Fuehrung ist noetig."
        else:
            context += "Du willst beides — Freiheit und Sicherheit — und siehst den Konflikt."

    elif topic == "vertrauen":
        if pos < -0.3:
            context += "Du misstraust den Institutionen zutiefst. Das System funktioniert nicht fuer dich."
        elif pos > 0.3:
            context += "Du vertraust den Institutionen grundsaetzlich. Das System ist nicht perfekt, aber es funktioniert."
        else:
            context += "Dein Vertrauen in die Institutionen schwankt — mal mehr, mal weniger."

    elif topic == "teilhabe":
        if pos < -0.3:
            context += "Politik ist dir fremd oder sinnlos. Deine Stimme zaehlt nicht."
        elif pos > 0.3:
            context += "Politische Teilhabe ist dir wichtig. Waehlen und Engagement machen einen Unterschied."
        else:
            context += "Du bist politisch ambivalent — manchmal engagiert, manchmal gleichgueltig."

    return context


def build_tweet_prompt(blob_row, traits, tick, topic, trigger_type, event_desc, zeitgeist):
    """Build the complete tweet prompt for the LLM."""
    persona = blob_row["persona_text"]
    first_name = blob_row["name"].split()[0]
    edu = blob_row["education_level"]
    edu_style = EDU_STYLES.get(edu, EDU_STYLES[1])
    party_name = PARTY_NAMES.get(blob_row["party"], "keiner Partei")
    will_vote = blob_row["will_vote"]
    district_name = DISTRICT_NAMES.get(blob_row["district"], "Unbekannt")

    sat_label = sat_to_label(blob_row["satisfaction"])
    trust_label = trust_to_label(blob_row["trust"])

    # Emotion context
    emotion = blob_row.get("emotion_label", "gelassen")
    emotion_ctx = EMOTION_CONTEXTS.get(emotion, EMOTION_CONTEXTS["gelassen"])

    # Activity context
    activity = blob_row.get("activity", "LEISURE")
    activity_ctx = ACTIVITY_CONTEXTS.get(activity, ACTIVITY_CONTEXTS["LEISURE"])

    # NfC style
    nfc = blob_row.get("need_for_closure", 5.0)
    nfc_ctx = ""
    if nfc < 3.5:
        nfc_ctx = NFC_TWEET_STYLES["low"]
    elif nfc > 6.5:
        nfc_ctx = NFC_TWEET_STYLES["high"]

    # Policy positions summary (only for political topics)
    policy_block = ""
    if topic != "persoenlich":
        pol_lines = []
        pol_lines.append(f"  Wirtschaft: {policy_label(blob_row.get('policy_economy', 5.0), POLICY_LABELS['economy'])}")
        pol_lines.append(f"  Umwelt: {policy_label(blob_row.get('policy_environment', 5.0), POLICY_LABELS['environment'])}")
        pol_lines.append(f"  Sicherheit: {policy_label(blob_row.get('policy_security', 5.0), POLICY_LABELS['security'])}")
        pol_lines.append(f"  Soziales: {policy_label(blob_row.get('policy_social', 5.0), POLICY_LABELS['social'])}")
        pol_lines.append(f"  Migration: {policy_label(blob_row.get('policy_migration', 5.0), POLICY_LABELS['migration'])}")
        pol_lines.append(f"  Demokratie: {policy_label(blob_row.get('policy_democracy', 5.0), POLICY_LABELS['democracy'])}")
        policy_block = "\nDeine politischen Positionen:\n" + "\n".join(pol_lines)

    topic_block = build_topic_context(blob_row, traits, topic, event_desc)

    # Zeitgeist block
    zeitgeist_lines = []
    for t, zg in sorted(zeitgeist.items(), key=lambda x: -x[1]["intensity"]):
        if zg["intensity"] < 0.1:
            continue
        latest = max(zg["events"], key=lambda e: e["decay"])
        recency = "kuerzlich" if latest["decay"] > 0.7 else "vor einiger Zeit"
        zeitgeist_lines.append(f"- {latest['desc']} ({recency})")
    zeitgeist_block = "\n".join(zeitgeist_lines[:4]) if zeitgeist_lines else "Keine besonderen Ereignisse."

    # Rotating style seed
    style_idx = hash((blob_row["id"], tick, topic)) % len(STYLE_SEEDS)
    style = STYLE_SEEDS[style_idx]

    return f"""=== WER DU BIST ===
{persona}
Stadtteil: {district_name}

=== DEINE AKTUELLE SITUATION ===
Stimmung: {emotion}
{emotion_ctx}
{activity_ctx}

Lebenslage: {sat_label} | {trust_label}
Partei: {party_name} | {"Waehlt" if will_vote else "Waehlt nicht"}{policy_block}

=== WAS BLOBTOPIA GERADE BEWEGT ===
{zeitgeist_block}

=== DEIN TWEET-ANLASS ===
{topic_block}

=== REGELN ===
Schreib als {first_name} GENAU EINEN kurzen Tweet (maximal 180 Zeichen, 1-2 Saetze).
Schreibstil: {edu_style}.
{nfc_ctx}
{style}
WICHTIG: Antworte NUR mit dem Tweet-Text. Keine Einleitung, kein Kommentar, keine Ueberschrift, kein "Hier ist...".
Schreib wie auf Social Media — kurz, persoenlich, meinungsstark.
Umgangssprache ist ausdruecklich erlaubt und erwuenscht.
Dein Grundton spiegelt deine Stimmung ({emotion}) und Lebenslage wider.
Nenne KEINE Zahlen aus deinem Profil.
Keine Hashtags, keine Emojis.
Sprich ueber dein Lebensgefuehl und deine Perspektive zum Thema."""


# ═══════════════════════════════════════════════════════
# Anthropic API
# ═══════════════════════════════════════════════════════

def call_anthropic(prompt, model, api_key):
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
        "max_tokens": 150,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                text = result["content"][0]["text"].strip()
                # Clean up: remove quotes if wrapped
                if text.startswith('"') and text.endswith('"'):
                    text = text[1:-1]
                if text.startswith('\u201e') or text.startswith('\u201c') or text.startswith('\u201d'):
                    text = text[1:]
                if text.endswith('\u201c') or text.endswith('\u201d') or text.endswith('\u201e'):
                    text = text[:-1]
                # Remove meta-commentary lines (e.g. "# Name's Tweet", "Hier ist...")
                lines = text.strip().split('\n')
                cleaned = []
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    # Skip markdown headers, meta-commentary
                    if line.startswith('#'):
                        continue
                    low = line.lower()
                    # Detect assistant-mode responses (LLM broke out of persona)
                    if any(p in low for p in [
                        'ich kann dir', 'ich vermisse', 'ich bin bereit',
                        'worüber soll', 'worueber soll', 'hier ist',
                        'here is', 'kannst du mir', 'tweet-anlass',
                        'ich helfe', 'soll ich', 'du hast geschrieben',
                        'lass mich', 'ich brauche mehr',
                    ]):
                        continue
                    if any(low.startswith(p) for p in [
                        'als ', 'okay,', 'klar,', 'gerne', 'natuerlich',
                        'natürlich', 'sicher,',
                    ]):
                        continue
                    cleaned.append(line)
                text = ' '.join(cleaned).strip() if cleaned else text.strip()
                # If cleaned text is empty (entire response was meta), return None
                if not text or len(text) < 10:
                    return None
                return text
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

    return None


# ═══════════════════════════════════════════════════════
# Data Loading
# ═══════════════════════════════════════════════════════

def load_blobs(conn):
    """Load all adult blobs with their base data."""
    has_persona = False
    try:
        conn.execute("SELECT persona_text FROM blobs LIMIT 0")
        has_persona = True
    except Exception:
        pass

    has_nfc = False
    try:
        conn.execute("SELECT need_for_closure FROM blobs LIMIT 0")
        has_nfc = True
    except Exception:
        pass

    persona_col = "COALESCE(g.persona_text, '')" if has_persona else "''"
    nfc_col = "COALESCE(g.need_for_closure, 5.0)" if has_nfc else "5.0"
    rows = conn.execute(f"""
        SELECT g.id, g.name, g.district, g.age, g.education_level, g.income,
               {persona_col}, {nfc_col}
        FROM blobs g
        WHERE g.age >= 18
        ORDER BY g.district, g.name
    """).fetchall()

    blobs = []
    for row in rows:
        blobs.append({
            "id": row[0], "name": row[1], "district": row[2],
            "age": row[3], "education_level": row[4], "income": row[5],
            "persona_text": row[6], "need_for_closure": row[7],
        })
    return blobs


def load_events(conn):
    """Load all events from the database."""
    rows = conn.execute(
        "SELECT tick, event_type, description FROM events ORDER BY tick"
    ).fetchall()
    return [{"tick": r[0], "event_type": r[1], "description": r[2]} for r in rows]


def get_blob_state_at_tick(conn, blob_id, tick):
    """Get a blob's state (satisfaction, ideology, trust, party, emotion, policies) at a given tick."""
    row = conn.execute("""
        SELECT s.satisfaction, s.ideology, s.trust, s.party, s.will_vote,
               s.income, s.latent_traits_json,
               COALESCE(s.emotion_label, 'gelassen'),
               COALESCE(s.policy_economy, 5.0), COALESCE(s.policy_environment, 5.0),
               COALESCE(s.policy_security, 5.0), COALESCE(s.policy_social, 5.0),
               COALESCE(s.policy_migration, 5.0), COALESCE(s.policy_democracy, 5.0)
        FROM blob_daily_state s
        WHERE s.blob_id = ? AND s.tick <= ? AND s.latent_traits_json IS NOT NULL
        ORDER BY s.tick DESC LIMIT 1
    """, (blob_id, tick)).fetchone()

    if not row:
        row = conn.execute("""
            SELECT s.satisfaction, s.ideology, s.trust, s.party, s.will_vote,
                   s.income, NULL,
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
        "satisfaction": row[0],
        "ideology": row[1],
        "trust": row[2],
        "party": row[3],
        "will_vote": row[4],
        "income": row[5],
        "emotion_label": row[7],
        "policy_economy": row[8],
        "policy_environment": row[9],
        "policy_security": row[10],
        "policy_social": row[11],
        "policy_migration": row[12],
        "policy_democracy": row[13],
    }
    traits = json.loads(row[6]) if row[6] else {}
    return state, traits


def resolve_activity(conn, blob_id, tick, hour=14.0):
    """Look up a blob's activity at a given tick and hour from the schedule."""
    row = conn.execute("""
        SELECT schedule_json FROM daily_schedules
        WHERE blob_id = ? AND tick <= ? ORDER BY tick DESC LIMIT 1
    """, (blob_id, tick)).fetchone()
    if not row or not row[0]:
        return "LEISURE"
    try:
        sched = json.loads(row[0])
        entries = sched.get("entries", [])
        activity = "LEISURE"
        for entry in entries:
            if hour >= entry.get("hour", 0):
                activity = entry.get("activity", "LEISURE")
        return activity
    except Exception:
        return "LEISURE"


def enrich_blob_at_tick(conn, blob, tick):
    """Combine static blob data with dynamic state at a specific tick."""
    state, traits = get_blob_state_at_tick(conn, blob["id"], tick)
    if state is None:
        return None, None

    current_age = blob["age"] + tick // TICKS_PER_YEAR

    # Pick a plausible hour for the tweet (varies by trigger, added later)
    hour = 14.0
    activity = resolve_activity(conn, blob["id"], tick, hour)

    enriched = {
        **blob,
        "age": current_age,
        "satisfaction": state["satisfaction"],
        "ideology": state["ideology"],
        "trust": state["trust"],
        "party": state["party"],
        "will_vote": state["will_vote"],
        "income": state["income"],
        "emotion_label": state["emotion_label"],
        "policy_economy": state["policy_economy"],
        "policy_environment": state["policy_environment"],
        "policy_security": state["policy_security"],
        "policy_social": state["policy_social"],
        "policy_migration": state["policy_migration"],
        "policy_democracy": state["policy_democracy"],
        "activity": activity,
    }
    return enriched, traits


# ═══════════════════════════════════════════════════════
# Tweet Selection Algorithm
# ═══════════════════════════════════════════════════════

def find_extreme_blobs(conn, blobs, tick, sat_low=1.5, sat_high=8.5, trust_low=2.0):
    """Find blobs with extreme values at a given tick."""
    extremes = []
    for blob in blobs:
        enriched, traits = enrich_blob_at_tick(conn, blob, tick)
        if enriched is None:
            continue
        if (enriched["satisfaction"] <= sat_low or
            enriched["satisfaction"] >= sat_high or
            enriched["trust"] <= trust_low):
            extremes.append((enriched, traits))
    return extremes


def has_nearby_event(events, tick, window=15):
    """Check if there's an event within +/- window ticks."""
    return any(abs(e["tick"] - tick) <= window for e in events)


def balance_tweet_plan(tweet_plan, target_total=650, rng=None):
    """Post-process tweet plan to achieve balanced topic distribution.

    Trims overrepresented topics while preserving temporal spread.
    """
    if rng is None:
        rng = random.Random(42)

    by_topic = {t: [] for t in ALL_TOPICS}
    for spec in tweet_plan:
        by_topic[spec["topic"]].append(spec)

    target_per_topic = max(1, target_total // len(ALL_TOPICS))

    balanced = []
    for topic in ALL_TOPICS:
        pool = by_topic[topic]
        if len(pool) > target_per_topic:
            # Keep evenly spaced samples to preserve temporal spread
            pool.sort(key=lambda s: s["tick"])
            step = len(pool) / target_per_topic
            indices = [int(i * step) for i in range(target_per_topic)]
            balanced.extend(pool[idx] for idx in indices)
        else:
            balanced.extend(pool)

    balanced.sort(key=lambda s: s["tick"])
    return balanced


def build_tweet_plan(conn, blobs, events, max_tweets=None):
    """Build the complete tweet plan (without API calls).

    Returns list of tweet specs: [{blob, traits, tick, topic, trigger_type, event_desc, zeitgeist}]
    """
    all_tweets = []
    max_tick = max(e["tick"] for e in events) + 500 if events else 8030

    # Deterministic RNG for selection
    rng = random.Random(42)

    # Running topic counts for deficit correction
    topic_counts = {t: 0 for t in ALL_TOPICS}

    def _append_tweet(spec):
        all_tweets.append(spec)
        topic_counts[spec["topic"]] = topic_counts.get(spec["topic"], 0) + 1

    # === Type 1: Event Reactions (~300-400 tweets) ===
    for event in events:
        topics = map_event_to_topics(event["description"])
        if not topics:
            continue

        evt_tick = event["tick"]
        zeitgeist = compute_zeitgeist(evt_tick, events)

        # How many tweets? Major events get more.
        # Scaled up for network density (target ~2000 total tweets)
        desc = event["description"]
        if any(kw in desc for kw in ["Wahl", "Krise", "Korruption"]):
            n_tweets = 25
        elif "Kultur" in desc:
            n_tweets = 6
        elif any(kw in desc for kw in ["Ungleichheit", "Skandal", "Naturkatastrophe"]):
            n_tweets = 18
        else:
            n_tweets = 12

        # Score all blobs
        candidates = []
        for blob in blobs:
            enriched, traits = enrich_blob_at_tick(conn, blob, evt_tick)
            if enriched is None or not traits:
                continue
            aff = tweet_affinity(enriched, traits)
            pf = compute_politikfeld(traits, enriched["satisfaction"],
                                      enriched["trust"], enriched["income"],
                                      enriched["ideology"])
            max_sal = max((pf.get(t, {}).get("salience", 0) for t in topics), default=0)
            score = aff * max_sal
            candidates.append((score, enriched, traits))

        candidates.sort(key=lambda x: -x[0])

        # Ensure district diversity: pick top candidates but spread across districts
        selected = []
        district_counts = {}
        for score, enriched, traits in candidates:
            d = enriched["district"]
            if district_counts.get(d, 0) >= max(2, n_tweets // 3):
                continue
            selected.append((enriched, traits))
            district_counts[d] = district_counts.get(d, 0) + 1
            if len(selected) >= n_tweets:
                break

        for enriched, traits in selected:
            tweet_topic, tweet_event = select_tweet_topic(
                enriched, traits, zeitgeist, topic_counts=topic_counts, rng=rng)
            _append_tweet({
                "blob": enriched, "traits": traits, "tick": evt_tick,
                "topic": tweet_topic, "trigger_type": "event_reaction",
                "event_desc": tweet_event, "zeitgeist": zeitgeist,
            })

    # === Type 2: Threshold Tweets (~80-150 tweets) ===
    for tick in range(0, max_tick, 45):  # every ~6 weeks
        zeitgeist = compute_zeitgeist(tick, events)
        extremes = find_extreme_blobs(conn, blobs, tick)
        for enriched, traits in extremes:
            aff = tweet_affinity(enriched, traits)
            if rng.random() < aff * 0.15:  # moderate probability
                tweet_topic, tweet_event = select_tweet_topic(
                    enriched, traits, zeitgeist, topic_counts=topic_counts, rng=rng)
                _append_tweet({
                    "blob": enriched, "traits": traits, "tick": tick,
                    "topic": tweet_topic, "trigger_type": "threshold",
                    "event_desc": tweet_event, "zeitgeist": zeitgeist,
                })

    # === Type 3: Periodic Opinion (~200-400 tweets) ===
    for tick in range(90, max_tick, 90):
        zeitgeist = compute_zeitgeist(tick, events)
        high_eff = []
        for blob in blobs:
            enriched, traits = enrich_blob_at_tick(conn, blob, tick)
            if enriched is None or not traits:
                continue
            if traits.get("self_efficacy", 5.0) > 6.0 and tweet_affinity(enriched, traits) > 0.25:
                high_eff.append((enriched, traits))

        n_select = min(len(high_eff), 8)
        if n_select > 0:
            selected = rng.sample(high_eff, n_select)
            for enriched, traits in selected:
                # 20% chance of persoenlich for periodic tweets
                if rng.random() < 0.20:
                    tweet_topic, tweet_event = "persoenlich", None
                else:
                    tweet_topic, tweet_event = select_tweet_topic(
                        enriched, traits, zeitgeist, topic_counts=topic_counts, rng=rng)
                _append_tweet({
                    "blob": enriched, "traits": traits, "tick": tick,
                    "topic": tweet_topic, "trigger_type": "periodic",
                    "event_desc": tweet_event, "zeitgeist": zeitgeist,
                })

    # === Type 4: Background Chatter (~200-400 tweets) ===
    for tick in range(30, max_tick, 30):
        if has_nearby_event(events, tick, window=15):
            continue
        zeitgeist = compute_zeitgeist(tick, events)
        high_aff = []
        for blob in blobs:
            enriched, traits = enrich_blob_at_tick(conn, blob, tick)
            if enriched is None or not traits:
                continue
            if tweet_affinity(enriched, traits) > 0.25:
                high_aff.append((enriched, traits))

        n_select = rng.randint(2, 4)
        if len(high_aff) >= n_select:
            selected = rng.sample(high_aff, n_select)
            for enriched, traits in selected:
                # 40% chance of persoenlich regardless of zeitgeist
                if rng.random() < 0.40:
                    tweet_topic, tweet_event = "persoenlich", None
                else:
                    tweet_topic, tweet_event = select_tweet_topic(
                        enriched, traits, zeitgeist, topic_counts=topic_counts, rng=rng)
                _append_tweet({
                    "blob": enriched, "traits": traits, "tick": tick,
                    "topic": tweet_topic, "trigger_type": "background",
                    "event_desc": tweet_event, "zeitgeist": zeitgeist,
                })

    # Sort by tick
    all_tweets.sort(key=lambda t: t["tick"])

    # Balance topic distribution and trim to target
    target = max_tweets or 650
    all_tweets = balance_tweet_plan(all_tweets, target_total=target, rng=rng)

    return all_tweets


# ═══════════════════════════════════════════════════════
# Validation
# ═══════════════════════════════════════════════════════

def validate_tweets(conn, tweets_generated):
    """Run validation checks on generated tweets."""
    print("\n" + "=" * 60)
    print("VALIDIERUNG")
    print("=" * 60)

    warnings = 0

    # 1. Length check
    long_tweets = [(t[0], t[1], len(t[5])) for t in tweets_generated if len(t[5]) > 280]
    if long_tweets:
        print(f"\n[WARNUNG] {len(long_tweets)} Tweets > 280 Zeichen:")
        for blob_id, tick, length in long_tweets[:5]:
            print(f"  - Blob {blob_id[:8]}... @ tick {tick}: {length} Zeichen")
        warnings += len(long_tweets)

    over200 = sum(1 for t in tweets_generated if len(t[5]) > 200)
    if over200:
        print(f"  ({over200} Tweets > 200 Zeichen)")

    # 2. Number leak check
    number_pattern = re.compile(r'\d+[.,]\d+\s*(/|von)\s*10|\d+/10')
    leaks = [(t[0], t[1], t[5]) for t in tweets_generated if number_pattern.search(t[5])]
    if leaks:
        print(f"\n[WARNUNG] {len(leaks)} Tweets mit Zahlen-Leakage:")
        for blob_id, tick, text in leaks[:5]:
            print(f"  - Blob {blob_id[:8]}... @ tick {tick}: {text[:80]}...")
        warnings += len(leaks)

    # 3. District coverage
    district_counts = {}
    total = len(tweets_generated)
    for t in tweets_generated:
        # Look up district from blob
        d = conn.execute("SELECT district FROM blobs WHERE id = ?", (t[0],)).fetchone()
        if d:
            district_counts[d[0]] = district_counts.get(d[0], 0) + 1

    print(f"\nDistrikt-Verteilung ({total} Tweets):")
    for d in range(5):
        count = district_counts.get(d, 0)
        pct = count / max(total, 1) * 100
        bar = "#" * int(pct / 2)
        print(f"  Distrikt {d}: {count:4d} ({pct:5.1f}%) {bar}")
        if pct < 15:
            print(f"  [WARNUNG] Distrikt {d} unter 15%!")
            warnings += 1

    # 4. Temporal distribution
    if tweets_generated:
        ticks = sorted(set(t[1] for t in tweets_generated))
        max_gap = 0
        for i in range(1, len(ticks)):
            gap = ticks[i] - ticks[i-1]
            if gap > max_gap:
                max_gap = gap
        print(f"\nZeitliche Verteilung:")
        print(f"  Tick-Range: {ticks[0]} - {ticks[-1]}")
        print(f"  Groesste Luecke: {max_gap} Ticks")
        if max_gap > 200:
            print(f"  [WARNUNG] Luecke > 200 Ticks!")
            warnings += 1

    # 5. Topic distribution
    topic_counts = {}
    for t in tweets_generated:
        topic_counts[t[2]] = topic_counts.get(t[2], 0) + 1
    print(f"\nThemen-Verteilung:")
    for topic, count in sorted(topic_counts.items(), key=lambda x: -x[1]):
        pct = count / max(total, 1) * 100
        print(f"  {topic:15s}: {count:4d} ({pct:5.1f}%)")

    # 6. Trigger type distribution
    trigger_counts = {}
    for t in tweets_generated:
        trigger_counts[t[3]] = trigger_counts.get(t[3], 0) + 1
    print(f"\nTrigger-Verteilung:")
    for trigger, count in sorted(trigger_counts.items(), key=lambda x: -x[1]):
        pct = count / max(total, 1) * 100
        print(f"  {trigger:18s}: {count:4d} ({pct:5.1f}%)")

    if warnings == 0:
        print(f"\nAlle Checks bestanden!")
    else:
        print(f"\n{warnings} Warnungen insgesamt.")

    return warnings


# ═══════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Generate LLM tweets for Blobs")
    parser.add_argument("db_path", nargs="?", default="data/blobtopia_timeline.db",
                        help="Path to timeline database")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show tweet plan without API calls")
    parser.add_argument("--resume", action="store_true",
                        help="Skip already generated tweets")
    parser.add_argument("--max-tweets", type=int, default=None,
                        help="Limit total number of tweets")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL,
                        help=f"LLM model (default: {DEFAULT_MODEL})")
    args = parser.parse_args()

    # API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.dry_run:
        print("FEHLER: ANTHROPIC_API_KEY nicht gesetzt. Nutze --dry-run oder setze die Variable.")
        sys.exit(1)

    conn = sqlite3.connect(args.db_path)

    # Create tweets table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tweets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blob_id TEXT NOT NULL,
            tick INTEGER NOT NULL,
            topic TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            event_description TEXT,
            tweet_text TEXT NOT NULL,
            sentiment REAL,
            model_version TEXT,
            FOREIGN KEY (blob_id) REFERENCES blobs(id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tweets_tick ON tweets(tick)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tweets_blob ON tweets(blob_id)")
    conn.commit()

    # Check for existing tweets (for --resume)
    existing_count = conn.execute("SELECT COUNT(*) FROM tweets").fetchone()[0]
    existing_keys = set()
    if args.resume and existing_count > 0:
        rows = conn.execute("SELECT blob_id, tick, topic FROM tweets").fetchall()
        existing_keys = {(r[0], r[1], r[2]) for r in rows}
        print(f"{existing_count} bestehende Tweets gefunden (--resume aktiv).")
    elif not args.resume and existing_count > 0:
        conn.execute("DELETE FROM tweets")
        conn.commit()
        print(f"{existing_count} bestehende Tweets geloescht (kein --resume).")

    # Load data
    print("Lade Blobs...")
    blobs = load_blobs(conn)
    print(f"{len(blobs)} erwachsene Blobs geladen.")

    print("Lade Events...")
    events = load_events(conn)
    print(f"{len(events)} Events geladen.")

    # Build tweet plan
    print("\nErstelle Tweet-Plan...")
    tweet_plan = build_tweet_plan(conn, blobs, events, max_tweets=args.max_tweets)
    print(f"Plan: {len(tweet_plan)} Tweets.")

    # Skip existing in resume mode
    if existing_keys:
        tweet_plan = [t for t in tweet_plan
                      if (t["blob"]["id"], t["tick"], t["topic"]) not in existing_keys]
        print(f"Nach Resume-Filter: {len(tweet_plan)} neue Tweets.")

    if args.dry_run:
        print("\n=== DRY RUN ===")
        print(f"Tweets gesamt: {len(tweet_plan)}")

        # Show sample tweets
        for i, spec in enumerate(tweet_plan[:10]):
            g = spec["blob"]
            print(f"\n--- Tweet {i+1}: {g['name']} @ Tick {spec['tick']} ---")
            print(f"  Topic: {spec['topic']} | Trigger: {spec['trigger_type']}")
            if spec["event_desc"]:
                print(f"  Event: {spec['event_desc']}")
            print(f"  Affinity: {tweet_affinity(g, spec['traits']):.2f}")

        # Show plan stats
        by_type = {}
        by_topic = {}
        for spec in tweet_plan:
            by_type[spec["trigger_type"]] = by_type.get(spec["trigger_type"], 0) + 1
            by_topic[spec["topic"]] = by_topic.get(spec["topic"], 0) + 1

        print(f"\nNach Trigger-Typ:")
        for t, c in sorted(by_type.items(), key=lambda x: -x[1]):
            print(f"  {t:18s}: {c}")
        print(f"\nNach Thema:")
        for t, c in sorted(by_topic.items(), key=lambda x: -x[1]):
            print(f"  {t:15s}: {c}")

        conn.close()
        return

    # Generate tweets
    print(f"\nGeneriere {len(tweet_plan)} Tweets mit {args.model}...")
    tweets_generated = []  # [(blob_id, tick, topic, trigger, event_desc, text)]
    start_time = time.time()

    for i, spec in enumerate(tweet_plan):
        g = spec["blob"]
        prompt = build_tweet_prompt(
            g, spec["traits"], spec["tick"], spec["topic"],
            spec["trigger_type"], spec["event_desc"], spec["zeitgeist"]
        )

        try:
            tweet_text = call_anthropic(prompt, args.model, api_key)
        except Exception as e:
            print(f"\n  FEHLER bei {g['name']} @ tick {spec['tick']}: {e}")
            continue

        if not tweet_text:
            continue

        # Estimate sentiment from satisfaction
        sentiment = (g["satisfaction"] - 5.0) / 5.0  # -1 to +1

        conn.execute("""
            INSERT INTO tweets (blob_id, tick, topic, trigger_type, event_description,
                                tweet_text, sentiment, model_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (g["id"], spec["tick"], spec["topic"], spec["trigger_type"],
              spec["event_desc"], tweet_text, round(sentiment, 2), args.model))

        tweets_generated.append((
            g["id"], spec["tick"], spec["topic"], spec["trigger_type"],
            spec["event_desc"], tweet_text
        ))

        # Progress
        elapsed = time.time() - start_time
        rate = (i + 1) / elapsed if elapsed > 0 else 0
        remaining = (len(tweet_plan) - i - 1) / rate if rate > 0 else 0
        print(f"\r  [{i+1}/{len(tweet_plan)}] {g['name'][:20]:20s} "
              f"({rate:.1f}/s, ~{remaining:.0f}s verbleibend)", end="", flush=True)

        # Commit every 50 tweets
        if (i + 1) % 50 == 0:
            conn.commit()

    conn.commit()
    elapsed = time.time() - start_time
    print(f"\n\nFertig: {len(tweets_generated)} Tweets in {elapsed:.0f}s generiert.")

    # Validation
    validate_tweets(conn, tweets_generated)

    # Sample output
    print("\n" + "=" * 60)
    print("STICHPROBE: 5 zufaellige Tweets")
    print("=" * 60)
    sample = conn.execute("""
        SELECT t.tweet_text, t.topic, t.trigger_type, t.tick, g.name, g.district
        FROM tweets t JOIN blobs g ON t.blob_id = g.id
        ORDER BY RANDOM() LIMIT 5
    """).fetchall()
    for text, topic, trigger, tick, name, district in sample:
        print(f"\n  @{name} (Distrikt {district}) [Tick {tick}, {topic}/{trigger}]:")
        print(f"  \"{text}\"")

    conn.close()


if __name__ == "__main__":
    main()
