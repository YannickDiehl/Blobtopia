#!/usr/bin/env python3
"""Integration tests for generate_tweets.py against the real database.

Run:
    python -m pytest scripts/test_generate_tweets_integration.py -v
    python -m unittest scripts.test_generate_tweets_integration -v
"""

import os
import sys
import sqlite3
import unittest
from collections import Counter

# ---------------------------------------------------------------------------
# Path setup so we can import generate_tweets from the scripts directory
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

DB_PATH = os.path.join(SCRIPT_DIR, "..", "data", "blobtopia_timeline.db")

import generate_tweets  # noqa: E402


@unittest.skipUnless(os.path.exists(DB_PATH), "DB not found")
class TestGenerateTweetsIntegration(unittest.TestCase):
    """Integration tests that run against the real Blobtopia database."""

    conn = None
    blobs = None
    events = None
    tweet_plan = None

    @classmethod
    def setUpClass(cls):
        cls.conn = sqlite3.connect(DB_PATH)
        cls.blobs = generate_tweets.load_blobs(cls.conn)
        cls.events = generate_tweets.load_events(cls.conn)
        cls.tweet_plan = generate_tweets.build_tweet_plan(
            cls.conn, cls.blobs, cls.events
        )

    @classmethod
    def tearDownClass(cls):
        if cls.conn:
            cls.conn.close()

    # ---------------------------------------------------------------
    # 1-3: load_blobs
    # ---------------------------------------------------------------

    def test_load_blobs_count(self):
        """384 adult blobs (500 total - 116 children)."""
        self.assertEqual(len(self.blobs), 384)

    def test_load_blobs_all_fields(self):
        """Every blob has id, name, district, age, education_level, income."""
        required = {"id", "name", "district", "age", "education_level", "income"}
        for g in self.blobs:
            self.assertTrue(
                required.issubset(g.keys()),
                f"Blob {g.get('id', '?')} missing keys: {required - g.keys()}",
            )

    def test_load_blobs_no_children(self):
        """All loaded blobs have age >= 18."""
        for g in self.blobs:
            self.assertGreaterEqual(
                g["age"], 18, f"Blob {g['id']} has age {g['age']}"
            )

    # ---------------------------------------------------------------
    # 4: load_events
    # ---------------------------------------------------------------

    def test_load_events_count(self):
        """29 events in the database."""
        self.assertEqual(len(self.events), 29)

    # ---------------------------------------------------------------
    # 5-7: enrich_blob_at_tick
    # ---------------------------------------------------------------

    def test_enrich_blob_at_tick_real(self):
        """Enrichment at tick=4000 returns a non-None result."""
        blob = self.blobs[0]
        enriched, traits = generate_tweets.enrich_blob_at_tick(
            self.conn, blob, 4000
        )
        self.assertIsNotNone(enriched)
        self.assertIsNotNone(traits)

    def test_enrich_blob_at_tick_0(self):
        """Enrichment at tick=0 returns a non-None result."""
        blob = self.blobs[0]
        enriched, traits = generate_tweets.enrich_blob_at_tick(
            self.conn, blob, 0
        )
        self.assertIsNotNone(enriched)

    def test_enrich_blob_at_tick_8030(self):
        """Enrichment at tick=8030 returns a non-None result."""
        blob = self.blobs[0]
        enriched, traits = generate_tweets.enrich_blob_at_tick(
            self.conn, blob, 8030
        )
        self.assertIsNotNone(enriched)

    # ---------------------------------------------------------------
    # 8-17: build_tweet_plan
    # ---------------------------------------------------------------

    def test_build_tweet_plan_count(self):
        """Tweet plan produces 400-900 tweets."""
        count = len(self.tweet_plan)
        self.assertGreaterEqual(count, 400, f"Only {count} tweets")
        self.assertLessEqual(count, 900, f"Too many tweets: {count}")

    def test_tweet_plan_all_specs_valid(self):
        """Each spec has keys: blob, traits, tick, topic, trigger_type, event_desc, zeitgeist."""
        required = {"blob", "traits", "tick", "topic", "trigger_type",
                     "event_desc", "zeitgeist"}
        for i, spec in enumerate(self.tweet_plan):
            self.assertTrue(
                required.issubset(spec.keys()),
                f"Spec #{i} missing keys: {required - spec.keys()}",
            )

    def test_tweet_plan_sorted(self):
        """Tweet plan is sorted by tick."""
        ticks = [s["tick"] for s in self.tweet_plan]
        self.assertEqual(ticks, sorted(ticks))

    def test_tweet_plan_valid_triggers(self):
        """Only valid trigger types appear."""
        valid = {"event_reaction", "threshold", "periodic", "background"}
        for spec in self.tweet_plan:
            self.assertIn(
                spec["trigger_type"], valid,
                f"Invalid trigger: {spec['trigger_type']}",
            )

    def test_tweet_plan_valid_topics(self):
        """Only valid topics appear."""
        valid = {"wirtschaft", "umwelt", "sicherheit", "vertrauen",
                 "teilhabe", "persoenlich"}
        for spec in self.tweet_plan:
            self.assertIn(
                spec["topic"], valid,
                f"Invalid topic: {spec['topic']}",
            )

    def test_tweet_plan_glob_ids_exist(self):
        """All blob IDs referenced in the plan exist among loaded blobs."""
        known_ids = {g["id"] for g in self.blobs}
        for spec in self.tweet_plan:
            self.assertIn(
                spec["blob"]["id"], known_ids,
                f"Unknown blob ID: {spec['blob']['id']}",
            )

    def test_tweet_plan_ticks_in_range(self):
        """All ticks are in range 0..8530."""
        for spec in self.tweet_plan:
            self.assertGreaterEqual(spec["tick"], 0)
            self.assertLessEqual(spec["tick"], 8530)

    def test_tweet_plan_all_districts(self):
        """All 5 districts (0-4) are represented in the plan."""
        districts = {spec["blob"]["district"] for spec in self.tweet_plan}
        for d in range(5):
            self.assertIn(d, districts, f"District {d} not represented")

    def test_tweet_plan_deterministic(self):
        """Calling build_tweet_plan twice yields identical results."""
        plan2 = generate_tweets.build_tweet_plan(
            self.conn, self.blobs, self.events
        )
        self.assertEqual(len(self.tweet_plan), len(plan2))
        for a, b in zip(self.tweet_plan, plan2):
            self.assertEqual(a["blob"]["id"], b["blob"]["id"])
            self.assertEqual(a["tick"], b["tick"])
            self.assertEqual(a["topic"], b["topic"])
            self.assertEqual(a["trigger_type"], b["trigger_type"])

    def test_tweet_plan_max_tweets(self):
        """max_tweets=50 produces at most 50 tweets."""
        plan = generate_tweets.build_tweet_plan(
            self.conn, self.blobs, self.events, max_tweets=50
        )
        self.assertLessEqual(len(plan), 50)

    # ---------------------------------------------------------------
    # 18: build_tweet_prompt
    # ---------------------------------------------------------------

    def test_build_prompt_real(self):
        """Prompt built at tick=4000 is non-empty and contains '=== REGELN ==='."""
        blob = self.blobs[0]
        enriched, traits = generate_tweets.enrich_blob_at_tick(
            self.conn, blob, 4000
        )
        self.assertIsNotNone(enriched)
        zeitgeist = generate_tweets.compute_zeitgeist(4000, self.events)
        prompt = generate_tweets.build_tweet_prompt(
            enriched, traits, 4000, "wirtschaft",
            "event_reaction", "Wirtschaftskrise", zeitgeist,
        )
        self.assertTrue(len(prompt) > 0)
        self.assertIn("=== REGELN ===", prompt)

    # ---------------------------------------------------------------
    # 19: compute_zeitgeist
    # ---------------------------------------------------------------

    def test_zeitgeist_at_event(self):
        """Zeitgeist at tick=400 contains wirtschaft with intensity close to 1.0."""
        zeitgeist = generate_tweets.compute_zeitgeist(400, self.events)
        self.assertIn("wirtschaft", zeitgeist)
        self.assertAlmostEqual(
            zeitgeist["wirtschaft"]["intensity"], 1.0, delta=0.05,
        )

    # ---------------------------------------------------------------
    # 20: trigger distribution
    # ---------------------------------------------------------------

    def test_tweet_plan_event_reactions(self):
        """event_reaction is the most common trigger type."""
        counts = Counter(s["trigger_type"] for s in self.tweet_plan)
        most_common_trigger = counts.most_common(1)[0][0]
        self.assertEqual(
            most_common_trigger, "event_reaction",
            f"Most common trigger is {most_common_trigger}, not event_reaction. "
            f"Counts: {dict(counts)}",
        )


if __name__ == "__main__":
    unittest.main()
