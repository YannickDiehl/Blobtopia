#!/usr/bin/env python3
"""Comprehensive unit tests for the tweet generation system.

Usage:
    python scripts/test_generate_tweets.py
    python -m pytest scripts/test_generate_tweets.py -v
"""

import json
import os
import random
import sqlite3
import sys
import unittest

# Ensure the scripts directory is importable
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

from generate_tweets import (
    ALL_TOPICS,
    PARTY_NAMES,
    EDU_STYLES,
    STYLE_SEEDS,
    TICKS_PER_YEAR,
    EVENT_TOPIC_MAP,
    map_event_to_topics,
    debate_topic_from_description,
    compute_politikfeld,
    tweet_affinity,
    compute_zeitgeist,
    select_tweet_topic,
    balance_tweet_plan,
    sat_to_label,
    trust_to_label,
    build_topic_context,
    build_tweet_prompt,
    has_nearby_event,
    validate_tweets,
    load_blobs,
    load_events,
    get_blob_state_at_tick,
    enrich_blob_at_tick,
)


# ═══════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════

def _make_blob_row(**overrides):
    """Create a minimal blob_row dict with sensible defaults."""
    defaults = {
        "id": "blob-001",
        "name": "Test Blob",
        "district": 0,
        "age": 30,
        "education_level": 2,
        "income": 2500,
        "persona_text": "Ein durchschnittlicher Blob.",
        "satisfaction": 5.0,
        "trust": 5.0,
        "ideology": 5.5,
        "party": 1,
        "will_vote": True,
    }
    defaults.update(overrides)
    return defaults


def _make_traits(**overrides):
    """Create a minimal traits dict with neutral defaults."""
    defaults = {
        "self_efficacy": 5.0,
        "party_indifference": 5.0,
        "economic_security_priority": 5.0,
        "environment_over_economy": 5.0,
        "freedom_over_order": 5.0,
        "strong_leader_preference": 5.0,
        "powerlessness": 5.0,
        "vote_importance": 5.0,
    }
    defaults.update(overrides)
    return defaults


def _setup_test_db():
    """Create an in-memory SQLite DB with the required schema and sample data."""
    conn = sqlite3.connect(":memory:")
    conn.execute("""
        CREATE TABLE blobs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            district INTEGER NOT NULL,
            age INTEGER NOT NULL,
            education_level INTEGER NOT NULL,
            income REAL NOT NULL,
            persona_text TEXT DEFAULT ''
        )
    """)
    conn.execute("""
        CREATE TABLE events (
            tick INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE blob_daily_state (
            blob_id TEXT NOT NULL,
            tick INTEGER NOT NULL,
            satisfaction REAL,
            ideology REAL,
            trust REAL,
            party INTEGER,
            will_vote INTEGER,
            income REAL,
            latent_traits_json TEXT,
            FOREIGN KEY (blob_id) REFERENCES blobs(id)
        )
    """)
    conn.execute("""
        CREATE TABLE tweets (
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
    return conn


def _insert_blob(conn, blob_id="blob-001", name="Test Blob", district=0,
                 age=25, education_level=2, income=2500, persona_text="Ein Blob."):
    conn.execute(
        "INSERT INTO blobs VALUES (?, ?, ?, ?, ?, ?, ?)",
        (blob_id, name, district, age, education_level, income, persona_text),
    )


def _insert_state(conn, blob_id="blob-001", tick=0, satisfaction=5.0,
                  ideology=5.5, trust=5.0, party=1, will_vote=1,
                  income=2500, traits=None):
    traits_json = json.dumps(traits) if traits else None
    conn.execute(
        "INSERT INTO blob_daily_state VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (blob_id, tick, satisfaction, ideology, trust, party, will_vote, income, traits_json),
    )


def _insert_event(conn, tick, event_type, description):
    conn.execute(
        "INSERT INTO events VALUES (?, ?, ?)",
        (tick, event_type, description),
    )


# ═══════════════════════════════════════════════════════
# Tests: map_event_to_topics
# ═══════════════════════════════════════════════════════

class TestMapEventToTopics(unittest.TestCase):

    def test_wirtschaftskrise(self):
        self.assertEqual(map_event_to_topics("Wirtschaftskrise in Blobtopia"), ["wirtschaft", "vertrauen"])

    def test_wirtschaftsaufschwung(self):
        self.assertEqual(map_event_to_topics("Wirtschaftsaufschwung"), ["wirtschaft"])

    def test_ungleichheitsbericht(self):
        self.assertEqual(map_event_to_topics("Ungleichheitsbericht veroeffentlicht"),
                         ["wirtschaft", "vertrauen", "teilhabe"])

    def test_korruptionsenthuellung_ascii(self):
        self.assertEqual(map_event_to_topics("Korruptionsenthuellung im Rat"), ["vertrauen", "teilhabe"])

    def test_korruptionsenthuellung_unicode(self):
        self.assertEqual(map_event_to_topics("Korruptionsenthüllung im Rat"), ["vertrauen", "teilhabe"])

    def test_kulturereignis_empty(self):
        self.assertEqual(map_event_to_topics("Kulturereignis: grosses Fest"), [])

    def test_grundsatzdebatte_delegates(self):
        result = map_event_to_topics("Grundsatzdebatte ueber Klima")
        self.assertEqual(result, ["umwelt"])

    def test_skandal(self):
        self.assertEqual(map_event_to_topics("Skandal im Parlament"), ["vertrauen", "teilhabe"])

    def test_unknown_event(self):
        self.assertEqual(map_event_to_topics("Alien-Invasion"), [])

    def test_naturkatastrophe(self):
        self.assertEqual(map_event_to_topics("Naturkatastrophe trifft Distrikt 2"),
                         ["wirtschaft", "umwelt", "sicherheit", "vertrauen"])

    def test_medienkampagne(self):
        self.assertEqual(map_event_to_topics("Medienkampagne gestartet"),
                         ["teilhabe", "vertrauen", "wirtschaft"])

    def test_wahl_ausgerufen(self):
        self.assertEqual(map_event_to_topics("Wahl ausgerufen"),
                         ["teilhabe", "wirtschaft", "vertrauen", "umwelt", "sicherheit"])

    def test_politische_reform(self):
        self.assertEqual(map_event_to_topics("Politische Reform beschlossen"),
                         ["wirtschaft", "teilhabe", "vertrauen"])


# ═══════════════════════════════════════════════════════
# Tests: debate_topic_from_description
# ═══════════════════════════════════════════════════════

class TestDebateTopicFromDescription(unittest.TestCase):

    def test_klima(self):
        self.assertEqual(debate_topic_from_description("Grundsatzdebatte Klima"), ["umwelt"])

    def test_sicherheit(self):
        self.assertEqual(debate_topic_from_description("Debatte Sicherheit"), ["sicherheit"])

    def test_wirtschaft(self):
        self.assertEqual(debate_topic_from_description("Debatte Wirtschaft"), ["wirtschaft"])

    def test_solidaritaet(self):
        self.assertEqual(debate_topic_from_description("Solidaritaet debattiert"), ["wirtschaft"])

    def test_zukunft(self):
        self.assertEqual(debate_topic_from_description("Zukunft der Gesellschaft"), ["wirtschaft"])

    def test_fallback(self):
        self.assertEqual(debate_topic_from_description("irgendwas"), ["wirtschaft"])


# ═══════════════════════════════════════════════════════
# Tests: compute_politikfeld
# ═══════════════════════════════════════════════════════

class TestComputePolitikfeld(unittest.TestCase):

    def test_returns_five_keys(self):
        result = compute_politikfeld(_make_traits(), 5.0, 5.0, 2500, 5.5)
        self.assertEqual(set(result.keys()),
                         {"wirtschaft", "umwelt", "sicherheit", "vertrauen", "teilhabe"})

    def test_each_key_has_position_and_salience(self):
        result = compute_politikfeld(_make_traits(), 5.0, 5.0, 2500, 5.5)
        for field in result.values():
            self.assertIn("position", field)
            self.assertIn("salience", field)

    def test_wirtschaft_position_neutral(self):
        result = compute_politikfeld(_make_traits(), 5.0, 5.0, 2500, 5.5)
        self.assertAlmostEqual(result["wirtschaft"]["position"], 0.0)

    def test_wirtschaft_position_left(self):
        result = compute_politikfeld(_make_traits(), 5.0, 5.0, 2500, 1.0)
        self.assertAlmostEqual(result["wirtschaft"]["position"], (1.0 - 5.5) / 4.5)

    def test_wirtschaft_position_right(self):
        result = compute_politikfeld(_make_traits(), 5.0, 5.0, 2500, 10.0)
        self.assertAlmostEqual(result["wirtschaft"]["position"], (10.0 - 5.5) / 4.5)

    def test_wirtschaft_salience_low_income_boost(self):
        """Low income (below 700*3=2100) boosts wirtschaft salience."""
        result_low = compute_politikfeld(_make_traits(), 5.0, 5.0, 500, 5.5)
        result_high = compute_politikfeld(_make_traits(), 5.0, 5.0, 5000, 5.5)
        self.assertGreater(result_low["wirtschaft"]["salience"],
                           result_high["wirtschaft"]["salience"])

    def test_income_norm_capped_at_10(self):
        """income_norm = min(income/700, 10.0) - very high income is capped."""
        result = compute_politikfeld(_make_traits(), 5.0, 5.0, 100000, 5.5)
        # income_norm = 10.0, so max(0, 3.0 - 10.0) * 1.5 = 0, + baseline 0.5
        self.assertAlmostEqual(result["wirtschaft"]["salience"],
                               abs(5.0 - 5.0) + 0.0 + 0.5)

    def test_umwelt_position_neutral(self):
        result = compute_politikfeld(_make_traits(environment_over_economy=5.0), 5.0, 5.0, 2500, 5.5)
        self.assertAlmostEqual(result["umwelt"]["position"], 0.0)

    def test_umwelt_position_high_env(self):
        """High environment_over_economy => negative position (pro-environment)."""
        result = compute_politikfeld(_make_traits(environment_over_economy=10.0), 5.0, 5.0, 2500, 5.5)
        self.assertAlmostEqual(result["umwelt"]["position"], -(10.0 - 5.0) / 5.0)

    def test_sicherheit_position(self):
        result = compute_politikfeld(_make_traits(freedom_over_order=10.0), 5.0, 5.0, 2500, 5.5)
        self.assertAlmostEqual(result["sicherheit"]["position"], -(10.0 - 5.0) / 5.0)

    def test_vertrauen_position(self):
        result = compute_politikfeld(_make_traits(), 5.0, 8.0, 2500, 5.5)
        self.assertAlmostEqual(result["vertrauen"]["position"], (8.0 - 5.0) / 5.0)

    def test_teilhabe_position(self):
        result = compute_politikfeld(_make_traits(vote_importance=8.0), 5.0, 5.0, 2500, 5.5)
        self.assertAlmostEqual(result["teilhabe"]["position"], (8.0 - 5.0) / 5.0)

    def test_salience_non_negative(self):
        result = compute_politikfeld(_make_traits(), 5.0, 5.0, 2500, 5.5)
        for field in result.values():
            self.assertGreaterEqual(field["salience"], 0.0)

    def test_missing_traits_use_defaults(self):
        """Empty traits dict should use 5.0 defaults."""
        result = compute_politikfeld({}, 5.0, 5.0, 2500, 5.5)
        self.assertAlmostEqual(result["wirtschaft"]["position"], 0.0)
        self.assertAlmostEqual(result["umwelt"]["position"], 0.0)


# ═══════════════════════════════════════════════════════
# Tests: tweet_affinity
# ═══════════════════════════════════════════════════════

class TestTweetAffinity(unittest.TestCase):

    def test_returns_float(self):
        result = tweet_affinity(_make_blob_row(), _make_traits())
        self.assertIsInstance(result, float)

    def test_clamped_minimum(self):
        """Very unfavorable parameters should still return >= 0.05."""
        blob = _make_blob_row(education_level=0, age=90, satisfaction=5.0)
        traits = _make_traits(self_efficacy=0.0, party_indifference=10.0)
        result = tweet_affinity(blob, traits)
        self.assertAlmostEqual(result, 0.05)

    def test_clamped_maximum(self):
        """Very favorable parameters should still return <= 0.50."""
        blob = _make_blob_row(education_level=3, age=20, satisfaction=0.0)
        traits = _make_traits(self_efficacy=10.0, party_indifference=0.0)
        result = tweet_affinity(blob, traits)
        self.assertAlmostEqual(result, 0.50)

    def test_higher_education_increases_affinity(self):
        low = tweet_affinity(_make_blob_row(education_level=0), _make_traits())
        high = tweet_affinity(_make_blob_row(education_level=3), _make_traits())
        self.assertGreater(high, low)

    def test_older_age_decreases_affinity(self):
        young = tweet_affinity(_make_blob_row(age=25), _make_traits())
        old = tweet_affinity(_make_blob_row(age=70), _make_traits())
        self.assertGreater(young, old)

    def test_age_under_40_no_penalty(self):
        """Ages <= 40 should not incur the age penalty."""
        a30 = tweet_affinity(_make_blob_row(age=30), _make_traits())
        a40 = tweet_affinity(_make_blob_row(age=40), _make_traits())
        self.assertAlmostEqual(a30, a40)

    def test_extreme_satisfaction_increases_affinity(self):
        neutral = tweet_affinity(_make_blob_row(satisfaction=5.0), _make_traits())
        extreme = tweet_affinity(_make_blob_row(satisfaction=0.0), _make_traits())
        self.assertGreater(extreme, neutral)

    def test_high_self_efficacy_increases_affinity(self):
        low = tweet_affinity(_make_blob_row(), _make_traits(self_efficacy=1.0))
        high = tweet_affinity(_make_blob_row(), _make_traits(self_efficacy=9.0))
        self.assertGreater(high, low)

    def test_high_party_indifference_decreases_affinity(self):
        low = tweet_affinity(_make_blob_row(), _make_traits(party_indifference=1.0))
        high = tweet_affinity(_make_blob_row(), _make_traits(party_indifference=9.0))
        self.assertGreater(low, high)

    def test_neutral_defaults(self):
        """With all neutral defaults, check the exact formula."""
        blob = _make_blob_row(education_level=2, age=30, satisfaction=5.0)
        traits = _make_traits(self_efficacy=5.0, party_indifference=5.0)
        expected = 0.15 + 5.0 * 0.025 + 2 * 0.02 - 0 * 0.002 + 0.0 * 0.02 - 5.0 * 0.015
        expected = max(0.05, min(0.50, expected))
        self.assertAlmostEqual(tweet_affinity(blob, traits), expected)


# ═══════════════════════════════════════════════════════
# Tests: compute_zeitgeist
# ═══════════════════════════════════════════════════════

class TestComputeZeitgeist(unittest.TestCase):

    def test_empty_events(self):
        self.assertEqual(compute_zeitgeist(100, []), {})

    def test_future_events_skipped(self):
        events = [{"tick": 200, "description": "Wirtschaftskrise", "event_type": "crisis"}]
        result = compute_zeitgeist(100, events)
        self.assertEqual(result, {})

    def test_same_tick_full_decay(self):
        events = [{"tick": 100, "description": "Wirtschaftskrise", "event_type": "crisis"}]
        result = compute_zeitgeist(100, events)
        self.assertIn("wirtschaft", result)
        self.assertAlmostEqual(result["wirtschaft"]["intensity"], 1.0)

    def test_decay_formula(self):
        events = [{"tick": 0, "description": "Wirtschaftskrise", "event_type": "crisis"}]
        result = compute_zeitgeist(182, events)
        expected_decay = max(0.0, 1.0 - 182 / 365.0)
        self.assertAlmostEqual(result["wirtschaft"]["intensity"], expected_decay, places=2)

    def test_old_events_filtered(self):
        """Events older than ~365 ticks with decay < 0.05 are removed."""
        events = [{"tick": 0, "description": "Wirtschaftskrise", "event_type": "crisis"}]
        result = compute_zeitgeist(365, events)
        self.assertEqual(result, {})

    def test_decay_just_above_threshold(self):
        """Event at decay = 0.05 exactly is borderline - just barely included."""
        # decay = 1.0 - (tick - evt_tick)/365 = 0.05 => tick - evt_tick = 365 * 0.95 = 346.75
        events = [{"tick": 0, "description": "Wirtschaftskrise", "event_type": "crisis"}]
        result = compute_zeitgeist(346, events)
        self.assertIn("wirtschaft", result)

    def test_decay_just_below_threshold(self):
        events = [{"tick": 0, "description": "Wirtschaftskrise", "event_type": "crisis"}]
        result = compute_zeitgeist(350, events)
        decay = 1.0 - 350 / 365.0
        if decay < 0.05:
            self.assertNotIn("wirtschaft", result)
        else:
            self.assertIn("wirtschaft", result)

    def test_max_intensity_used(self):
        """When multiple events map to same topic, max decay wins."""
        events = [
            {"tick": 0, "description": "Wirtschaftskrise 1", "event_type": "crisis"},
            {"tick": 90, "description": "Wirtschaftsaufschwung", "event_type": "boom"},
        ]
        result = compute_zeitgeist(100, events)
        # tick 90 event has decay = 1 - 10/365 ≈ 0.97
        # tick 0 event has decay = 1 - 100/365 ≈ 0.73
        expected_max = max(0.0, 1.0 - 10 / 365.0)
        self.assertAlmostEqual(result["wirtschaft"]["intensity"], expected_max, places=2)

    def test_multiple_topics(self):
        events = [
            {"tick": 100, "description": "Wirtschaftskrise", "event_type": "crisis"},
            {"tick": 100, "description": "Medienkampagne", "event_type": "media"},
        ]
        result = compute_zeitgeist(100, events)
        self.assertIn("wirtschaft", result)
        self.assertIn("vertrauen", result)  # Wirtschaftskrise now maps to wirtschaft + vertrauen
        self.assertIn("teilhabe", result)   # Medienkampagne maps to teilhabe + vertrauen + wirtschaft

    def test_kulturereignis_no_topics(self):
        events = [{"tick": 100, "description": "Kulturereignis: Fest", "event_type": "culture"}]
        result = compute_zeitgeist(100, events)
        self.assertEqual(result, {})

    def test_events_list_populated(self):
        events = [{"tick": 50, "description": "Skandal aufgedeckt", "event_type": "scandal"}]
        result = compute_zeitgeist(50, events)
        self.assertEqual(len(result["vertrauen"]["events"]), 1)
        self.assertEqual(result["vertrauen"]["events"][0]["desc"], "Skandal aufgedeckt")


# ═══════════════════════════════════════════════════════
# Tests: select_tweet_topic
# ═══════════════════════════════════════════════════════

class TestSelectTweetTopic(unittest.TestCase):

    def test_returns_tuple(self):
        blob = _make_blob_row()
        traits = _make_traits()
        rng = random.Random(42)
        result = select_tweet_topic(blob, traits, {}, rng=rng)
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 2)

    def test_empty_zeitgeist_still_returns_valid_topic(self):
        blob = _make_blob_row()
        traits = _make_traits()
        rng = random.Random(42)
        topics_seen = set()
        for i in range(100):
            topic, event = select_tweet_topic(blob, traits, {}, rng=random.Random(i))
            topics_seen.add(topic)
        # Without zeitgeist, persoenlich should appear frequently
        self.assertIn("persoenlich", topics_seen)

    def test_high_wirtschaft_zeitgeist_biases_toward_wirtschaft(self):
        blob = _make_blob_row(satisfaction=1.0, trust=1.0, income=500, ideology=1.0)
        traits = _make_traits(economic_security_priority=9.0)
        zeitgeist = {
            "wirtschaft": {
                "intensity": 1.0,
                "events": [{"desc": "Krise", "tick": 50, "decay": 1.0}],
            },
        }
        counts = {}
        for i in range(200):
            topic, _ = select_tweet_topic(blob, traits, zeitgeist, rng=random.Random(i))
            counts[topic] = counts.get(topic, 0) + 1
        # wirtschaft should be the most common topic
        self.assertEqual(max(counts, key=counts.get), "wirtschaft")

    def test_deficit_correction_boosts_underrepresented(self):
        blob = _make_blob_row()
        traits = _make_traits()
        zeitgeist = {
            "wirtschaft": {"intensity": 0.5, "events": [{"desc": "Boom", "tick": 50, "decay": 0.5}]},
        }
        # Heavily skewed counts: wirtschaft overrepresented
        topic_counts = {"wirtschaft": 100, "umwelt": 0, "sicherheit": 0,
                        "vertrauen": 0, "teilhabe": 0, "persoenlich": 0}
        counts = {}
        for i in range(200):
            topic, _ = select_tweet_topic(blob, traits, zeitgeist,
                                          topic_counts=topic_counts, rng=random.Random(i))
            counts[topic] = counts.get(topic, 0) + 1
        # wirtschaft should NOT dominate when deficit correction is active
        self.assertLess(counts.get("wirtschaft", 0), 100)

    def test_selects_event_with_highest_decay(self):
        blob = _make_blob_row(trust=1.0)
        traits = _make_traits(powerlessness=9.0)
        zeitgeist = {
            "vertrauen": {
                "intensity": 0.9,
                "events": [
                    {"desc": "Skandal alt", "tick": 10, "decay": 0.3},
                    {"desc": "Skandal neu", "tick": 90, "decay": 0.9},
                ],
            },
        }
        # When vertrauen is selected, the event should be the one with highest decay
        found_vertrauen = False
        for i in range(200):
            topic, event = select_tweet_topic(blob, traits, zeitgeist, rng=random.Random(i))
            if topic == "vertrauen":
                self.assertEqual(event, "Skandal neu")
                found_vertrauen = True
                break
        self.assertTrue(found_vertrauen, "vertrauen should be selected at least once in 200 tries")


# ═══════════════════════════════════════════════════════
# Tests: sat_to_label
# ═══════════════════════════════════════════════════════

class TestSatToLabel(unittest.TestCase):

    def test_tiefpunkt(self):
        self.assertEqual(sat_to_label(0.5), "am Tiefpunkt, verzweifelt")

    def test_boundary_1(self):
        self.assertEqual(sat_to_label(0.99), "am Tiefpunkt, verzweifelt")
        self.assertEqual(sat_to_label(1.0), "sehr unzufrieden, frustriert")

    def test_sehr_unzufrieden(self):
        self.assertEqual(sat_to_label(1.5), "sehr unzufrieden, frustriert")

    def test_boundary_2(self):
        self.assertEqual(sat_to_label(1.99), "sehr unzufrieden, frustriert")
        self.assertEqual(sat_to_label(2.0), "unzufrieden")

    def test_unzufrieden(self):
        self.assertEqual(sat_to_label(3.0), "unzufrieden")

    def test_gemischt(self):
        self.assertEqual(sat_to_label(5.0), "gemischt")

    def test_zufrieden(self):
        self.assertEqual(sat_to_label(7.0), "zufrieden")

    def test_sehr_zufrieden(self):
        self.assertEqual(sat_to_label(9.0), "sehr zufrieden")

    def test_boundary_8(self):
        self.assertEqual(sat_to_label(7.99), "zufrieden")
        self.assertEqual(sat_to_label(8.0), "sehr zufrieden")


# ═══════════════════════════════════════════════════════
# Tests: trust_to_label
# ═══════════════════════════════════════════════════════

class TestTrustToLabel(unittest.TestCase):

    def test_tiefes_misstrauen(self):
        self.assertEqual(trust_to_label(1.0), "tiefes Misstrauen")

    def test_boundary_2(self):
        self.assertEqual(trust_to_label(1.99), "tiefes Misstrauen")
        self.assertEqual(trust_to_label(2.0), "eher misstrauisch")

    def test_eher_misstrauisch(self):
        self.assertEqual(trust_to_label(3.0), "eher misstrauisch")

    def test_ambivalent(self):
        self.assertEqual(trust_to_label(5.0), "ambivalent")

    def test_eher_vertrauensvoll(self):
        self.assertEqual(trust_to_label(7.0), "eher vertrauensvoll")

    def test_hohes_vertrauen(self):
        self.assertEqual(trust_to_label(9.0), "hohes Vertrauen")

    def test_boundary_8(self):
        self.assertEqual(trust_to_label(7.99), "eher vertrauensvoll")
        self.assertEqual(trust_to_label(8.0), "hohes Vertrauen")


# ═══════════════════════════════════════════════════════
# Tests: build_topic_context
# ═══════════════════════════════════════════════════════

class TestBuildTopicContext(unittest.TestCase):

    def test_persoenlich(self):
        result = build_topic_context(_make_blob_row(), _make_traits(), "persoenlich")
        self.assertIn("Alltag", result)

    def test_wirtschaft_left(self):
        blob = _make_blob_row(ideology=1.0)
        result = build_topic_context(blob, _make_traits(), "wirtschaft")
        self.assertIn("Schwachen", result)

    def test_wirtschaft_right(self):
        blob = _make_blob_row(ideology=10.0)
        result = build_topic_context(blob, _make_traits(), "wirtschaft")
        self.assertIn("selbst sorgen", result)

    def test_wirtschaft_neutral(self):
        blob = _make_blob_row(ideology=5.5)
        result = build_topic_context(blob, _make_traits(), "wirtschaft")
        self.assertIn("gespalten", result)

    def test_wirtschaft_low_income_extra(self):
        blob = _make_blob_row(ideology=5.5, income=1000)
        result = build_topic_context(blob, _make_traits(), "wirtschaft")
        self.assertIn("Druck", result)

    def test_wirtschaft_high_income_extra(self):
        blob = _make_blob_row(ideology=5.5, income=5000)
        result = build_topic_context(blob, _make_traits(), "wirtschaft")
        self.assertIn("finanziell gut", result)

    def test_umwelt_pro(self):
        traits = _make_traits(environment_over_economy=10.0)
        result = build_topic_context(_make_blob_row(), traits, "umwelt")
        self.assertIn("sehr wichtig", result)

    def test_sicherheit_freedom(self):
        traits = _make_traits(freedom_over_order=10.0)
        result = build_topic_context(_make_blob_row(), traits, "sicherheit")
        self.assertIn("Freiheit", result)

    def test_vertrauen_low(self):
        blob = _make_blob_row(trust=1.0)
        result = build_topic_context(blob, _make_traits(), "vertrauen")
        self.assertIn("misstraust", result)

    def test_teilhabe_high(self):
        traits = _make_traits(vote_importance=10.0)
        result = build_topic_context(_make_blob_row(), traits, "teilhabe")
        self.assertIn("Teilhabe", result)

    def test_event_prefix(self):
        result = build_topic_context(_make_blob_row(), _make_traits(), "wirtschaft",
                                     event_desc="Krise im Norden")
        self.assertIn("In Blobtopia: Krise im Norden", result)

    def test_no_event_no_prefix(self):
        result = build_topic_context(_make_blob_row(), _make_traits(), "wirtschaft")
        self.assertNotIn("In Blobtopia:", result)


# ═══════════════════════════════════════════════════════
# Tests: build_tweet_prompt
# ═══════════════════════════════════════════════════════

class TestBuildTweetPrompt(unittest.TestCase):

    def _base_call(self, **overrides):
        blob = _make_blob_row(
            name="Max Muster", persona_text="Ein nachdenklicher Blob.",
            education_level=2, party=0, will_vote=True,
            satisfaction=5.0, trust=5.0,
        )
        blob.update(overrides.get("blob_overrides", {}))
        traits = _make_traits()
        zeitgeist = overrides.get("zeitgeist", {})
        return build_tweet_prompt(
            blob, traits, tick=100, topic="wirtschaft",
            trigger_type="event_reaction", event_desc="Krise",
            zeitgeist=zeitgeist,
        )

    def test_contains_persona(self):
        result = self._base_call()
        self.assertIn("Ein nachdenklicher Blob.", result)

    def test_contains_first_name(self):
        result = self._base_call()
        self.assertIn("Max", result)

    def test_contains_200_zeichen(self):
        result = self._base_call()
        self.assertIn("200 Zeichen", result)

    def test_contains_keine_hashtags(self):
        result = self._base_call()
        self.assertIn("Keine Hashtags", result)

    def test_contains_regeln_header(self):
        result = self._base_call()
        self.assertIn("=== REGELN ===", result)

    def test_party_name_used(self):
        result = self._base_call()
        self.assertIn("Fortschritt", result)  # party=0

    def test_edu_style_used(self):
        result = self._base_call()
        self.assertIn("sachlich", result)  # education_level=2

    def test_waehlt_true(self):
        result = self._base_call()
        self.assertIn("Waehlt", result)

    def test_zeitgeist_block_empty(self):
        result = self._base_call()
        self.assertIn("Keine besonderen Ereignisse", result)

    def test_zeitgeist_block_with_events(self):
        zg = {
            "wirtschaft": {
                "intensity": 0.8,
                "events": [{"desc": "Wirtschaftskrise!", "tick": 90, "decay": 0.8}],
            },
        }
        result = self._base_call(zeitgeist=zg)
        self.assertIn("Wirtschaftskrise!", result)


# ═══════════════════════════════════════════════════════
# Tests: has_nearby_event
# ═══════════════════════════════════════════════════════

class TestHasNearbyEvent(unittest.TestCase):

    def test_empty_events(self):
        self.assertFalse(has_nearby_event([], 100))

    def test_event_at_same_tick(self):
        events = [{"tick": 100}]
        self.assertTrue(has_nearby_event(events, 100))

    def test_event_within_window(self):
        events = [{"tick": 110}]
        self.assertTrue(has_nearby_event(events, 100, window=15))

    def test_event_outside_window(self):
        events = [{"tick": 200}]
        self.assertFalse(has_nearby_event(events, 100, window=15))

    def test_event_at_window_boundary(self):
        events = [{"tick": 115}]
        self.assertTrue(has_nearby_event(events, 100, window=15))

    def test_event_just_beyond_boundary(self):
        events = [{"tick": 116}]
        self.assertFalse(has_nearby_event(events, 100, window=15))

    def test_custom_window(self):
        events = [{"tick": 130}]
        self.assertTrue(has_nearby_event(events, 100, window=30))

    def test_event_before_tick(self):
        events = [{"tick": 90}]
        self.assertTrue(has_nearby_event(events, 100, window=15))


# ═══════════════════════════════════════════════════════
# Tests: validate_tweets
# ═══════════════════════════════════════════════════════

class TestValidateTweets(unittest.TestCase):

    def setUp(self):
        self.conn = _setup_test_db()
        for d in range(5):
            _insert_blob(self.conn, blob_id=f"blob-{d:03d}", district=d)
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_no_warnings_on_clean_data(self):
        tweets = []
        for d in range(5):
            for tick in range(0, 1000, 50):
                tweets.append((
                    f"blob-{d:03d}", tick, "wirtschaft", "event_reaction",
                    "Krise", "Ein kurzer Tweet."
                ))
        warnings = validate_tweets(self.conn, tweets)
        self.assertEqual(warnings, 0)

    def test_long_tweet_warning(self):
        tweets = [(
            "blob-000", 100, "wirtschaft", "event_reaction",
            "Krise", "A" * 281,
        )]
        warnings = validate_tweets(self.conn, tweets)
        self.assertGreater(warnings, 0)

    def test_number_leak_warning(self):
        tweets = [(
            "blob-000", 100, "wirtschaft", "event_reaction",
            None, "Meine Zufriedenheit ist 7,3/10 und das nervt.",
        )]
        warnings = validate_tweets(self.conn, tweets)
        self.assertGreater(warnings, 0)

    def test_temporal_gap_warning(self):
        tweets = [
            ("blob-000", 0, "wirtschaft", "event_reaction", None, "Tweet eins."),
            ("blob-000", 500, "wirtschaft", "event_reaction", None, "Tweet zwei."),
        ]
        warnings = validate_tweets(self.conn, tweets)
        self.assertGreater(warnings, 0)


# ═══════════════════════════════════════════════════════
# Tests: load_blobs
# ═══════════════════════════════════════════════════════

class TestLoadBlobs(unittest.TestCase):

    def test_filters_underage(self):
        conn = _setup_test_db()
        _insert_blob(conn, blob_id="adult", age=25)
        _insert_blob(conn, blob_id="child", name="Kind Blob", age=12)
        conn.commit()
        result = load_blobs(conn)
        ids = [g["id"] for g in result]
        self.assertIn("adult", ids)
        self.assertNotIn("child", ids)
        conn.close()

    def test_exact_age_18(self):
        conn = _setup_test_db()
        _insert_blob(conn, blob_id="just18", age=18)
        conn.commit()
        result = load_blobs(conn)
        self.assertEqual(len(result), 1)
        conn.close()

    def test_returns_required_keys(self):
        conn = _setup_test_db()
        _insert_blob(conn)
        conn.commit()
        result = load_blobs(conn)
        for key in ("id", "name", "district", "age", "education_level", "income", "persona_text"):
            self.assertIn(key, result[0])
        conn.close()

    def test_empty_table(self):
        conn = _setup_test_db()
        result = load_blobs(conn)
        self.assertEqual(result, [])
        conn.close()


# ═══════════════════════════════════════════════════════
# Tests: load_events
# ═══════════════════════════════════════════════════════

class TestLoadEvents(unittest.TestCase):

    def test_returns_ordered_by_tick(self):
        conn = _setup_test_db()
        _insert_event(conn, 200, "crisis", "Wirtschaftskrise")
        _insert_event(conn, 50, "media", "Medienkampagne")
        conn.commit()
        result = load_events(conn)
        self.assertEqual(result[0]["tick"], 50)
        self.assertEqual(result[1]["tick"], 200)
        conn.close()

    def test_returns_required_keys(self):
        conn = _setup_test_db()
        _insert_event(conn, 100, "crisis", "Test Event")
        conn.commit()
        result = load_events(conn)
        for key in ("tick", "event_type", "description"):
            self.assertIn(key, result[0])
        conn.close()

    def test_empty_table(self):
        conn = _setup_test_db()
        result = load_events(conn)
        self.assertEqual(result, [])
        conn.close()


# ═══════════════════════════════════════════════════════
# Tests: get_blob_state_at_tick
# ═══════════════════════════════════════════════════════

class TestGetBlobStateAtTick(unittest.TestCase):

    def setUp(self):
        self.conn = _setup_test_db()
        _insert_blob(self.conn, blob_id="g1")
        self.default_traits = {"self_efficacy": 6.0, "party_indifference": 3.0}

    def tearDown(self):
        self.conn.close()

    def test_returns_none_when_no_state(self):
        self.conn.commit()
        state, traits = get_blob_state_at_tick(self.conn, "g1", 100)
        self.assertIsNone(state)
        self.assertIsNone(traits)

    def test_returns_latest_state_at_or_before_tick(self):
        _insert_state(self.conn, "g1", tick=50, satisfaction=3.0, traits=self.default_traits)
        _insert_state(self.conn, "g1", tick=100, satisfaction=7.0, traits=self.default_traits)
        self.conn.commit()
        state, _ = get_blob_state_at_tick(self.conn, "g1", 100)
        self.assertAlmostEqual(state["satisfaction"], 7.0)

    def test_uses_earlier_state_when_tick_between(self):
        _insert_state(self.conn, "g1", tick=50, satisfaction=3.0, traits=self.default_traits)
        _insert_state(self.conn, "g1", tick=200, satisfaction=8.0, traits=self.default_traits)
        self.conn.commit()
        state, _ = get_blob_state_at_tick(self.conn, "g1", 100)
        self.assertAlmostEqual(state["satisfaction"], 3.0)

    def test_returns_traits_dict(self):
        _insert_state(self.conn, "g1", tick=50, traits=self.default_traits)
        self.conn.commit()
        _, traits = get_blob_state_at_tick(self.conn, "g1", 50)
        self.assertEqual(traits["self_efficacy"], 6.0)

    def test_returns_state_keys(self):
        _insert_state(self.conn, "g1", tick=50, traits=self.default_traits)
        self.conn.commit()
        state, _ = get_blob_state_at_tick(self.conn, "g1", 50)
        for key in ("satisfaction", "ideology", "trust", "party", "will_vote", "income"):
            self.assertIn(key, state)

    def test_fallback_without_traits(self):
        """When no row has latent_traits_json, fallback query returns empty traits."""
        _insert_state(self.conn, "g1", tick=50, traits=None)
        self.conn.commit()
        state, traits = get_blob_state_at_tick(self.conn, "g1", 50)
        self.assertIsNotNone(state)
        self.assertEqual(traits, {})


# ═══════════════════════════════════════════════════════
# Tests: enrich_blob_at_tick
# ═══════════════════════════════════════════════════════

class TestEnrichBlobAtTick(unittest.TestCase):

    def setUp(self):
        self.conn = _setup_test_db()
        _insert_blob(self.conn, blob_id="g1", age=25, income=2500)
        self.traits = {"self_efficacy": 6.0}

    def tearDown(self):
        self.conn.close()

    def test_returns_none_when_no_state(self):
        self.conn.commit()
        blob = {"id": "g1", "age": 25, "name": "Test", "district": 0,
                "education_level": 2, "income": 2500, "persona_text": ""}
        enriched, traits = enrich_blob_at_tick(self.conn, blob, 100)
        self.assertIsNone(enriched)

    def test_age_adjusted_by_tick(self):
        _insert_state(self.conn, "g1", tick=0, traits=self.traits)
        self.conn.commit()
        blob = {"id": "g1", "age": 25, "name": "Test", "district": 0,
                "education_level": 2, "income": 2500, "persona_text": ""}
        enriched, _ = enrich_blob_at_tick(self.conn, blob, 730)
        # 730 // 365 = 2
        self.assertEqual(enriched["age"], 27)

    def test_merges_static_and_dynamic(self):
        _insert_state(self.conn, "g1", tick=0, satisfaction=3.5,
                      ideology=7.0, trust=2.0, party=2, will_vote=0,
                      income=1800, traits=self.traits)
        self.conn.commit()
        blob = {"id": "g1", "age": 25, "name": "Test", "district": 0,
                "education_level": 2, "income": 2500, "persona_text": "Ein Blob."}
        enriched, traits = enrich_blob_at_tick(self.conn, blob, 50)
        self.assertAlmostEqual(enriched["satisfaction"], 3.5)
        self.assertAlmostEqual(enriched["ideology"], 7.0)
        self.assertEqual(enriched["name"], "Test")
        self.assertEqual(enriched["persona_text"], "Ein Blob.")
        # income comes from state, not static
        self.assertAlmostEqual(enriched["income"], 1800)


# ═══════════════════════════════════════════════════════
# Tests: Constants
# ═══════════════════════════════════════════════════════

class TestConstants(unittest.TestCase):

    def test_party_names_four_entries(self):
        self.assertEqual(len(PARTY_NAMES), 4)
        self.assertIn(0, PARTY_NAMES)
        self.assertIn(3, PARTY_NAMES)

    def test_edu_styles_four_entries(self):
        self.assertEqual(len(EDU_STYLES), 4)
        self.assertIn(0, EDU_STYLES)
        self.assertIn(3, EDU_STYLES)

    def test_style_seeds_entries(self):
        self.assertEqual(len(STYLE_SEEDS), 10)

    def test_ticks_per_year(self):
        self.assertEqual(TICKS_PER_YEAR, 365)

    def test_party_names_values(self):
        self.assertEqual(PARTY_NAMES[0], "Fortschritt")
        self.assertEqual(PARTY_NAMES[1], "Mitte")
        self.assertEqual(PARTY_NAMES[2], "Tradition")
        self.assertEqual(PARTY_NAMES[3], "Unabhaengige")


if __name__ == "__main__":
    unittest.main()
