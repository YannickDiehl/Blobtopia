"""Layer 6: Tweet-Qualität — 18 Tests."""

import re
import sqlite3

from .config import (
    TOTAL_TICKS,
    TWEET_DISTRICT_MIN_PERCENT,
    TWEET_MAX_COUNT,
    TWEET_MAX_LENGTH,
    TWEET_MAX_TEMPORAL_GAP,
    TWEET_MIN_COUNT,
    TWEET_NUMBER_LEAK_PATTERN,
    TWEET_SOFT_MAX_LENGTH,
    TWEET_VALID_TOPICS,
    TWEET_VALID_TRIGGERS,
)
from .report import Status, TestResult, run_test


def run_layer6(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # 6.1 Tweet table exists
    def test_6_1():
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='tweets'"
        ).fetchone()
        if not row:
            return Status.FAIL, "Tabelle 'tweets' existiert nicht"
        cnt = conn.execute("SELECT COUNT(*) FROM tweets").fetchone()[0]
        if cnt == 0:
            return Status.SKIP, "Tabelle leer"
        return Status.PASS, f"{cnt} Tweets vorhanden"

    results.append(run_test("6.1", "Tweet-Tabelle existiert", test_6_1))

    # Early exit if table missing or empty
    table_exists = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tweets'"
    ).fetchone()
    if not table_exists:
        for i in range(2, 19):
            results.append(TestResult(f"6.{i}", f"Test 6.{i}", Status.SKIP, "Tabelle fehlt"))
        return results
    tweet_count = conn.execute("SELECT COUNT(*) FROM tweets").fetchone()[0]
    if tweet_count == 0:
        for i in range(2, 19):
            results.append(TestResult(f"6.{i}", f"Test 6.{i}", Status.SKIP, "Tabelle leer"))
        return results

    # 6.2 Tweet count plausible
    def test_6_2():
        if tweet_count < TWEET_MIN_COUNT or tweet_count > TWEET_MAX_COUNT:
            return Status.FAIL, (
                f"Anzahl {tweet_count} außerhalb [{TWEET_MIN_COUNT}, {TWEET_MAX_COUNT}]"
            )
        return Status.PASS, f"{tweet_count} Tweets"

    results.append(run_test("6.2", "Tweet-Anzahl plausibel", test_6_2))

    # 6.3 No overlength tweets
    def test_6_3():
        over_hard = conn.execute(
            "SELECT COUNT(*) FROM tweets WHERE LENGTH(tweet_text) > ?",
            (TWEET_MAX_LENGTH,),
        ).fetchone()[0]
        if over_hard > 0:
            return Status.FAIL, f"{over_hard} Tweets über {TWEET_MAX_LENGTH} Zeichen"
        over_soft = conn.execute(
            "SELECT COUNT(*) FROM tweets WHERE LENGTH(tweet_text) > ?",
            (TWEET_SOFT_MAX_LENGTH,),
        ).fetchone()[0]
        if over_soft > 0:
            return Status.WARN, f"{over_soft} Tweets über {TWEET_SOFT_MAX_LENGTH} Zeichen"
        return Status.PASS, f"Alle Tweets ≤ {TWEET_SOFT_MAX_LENGTH} Zeichen"

    results.append(run_test("6.3", "Keine Überlänge-Tweets", test_6_3))

    # 6.4 No number leakage
    def test_6_4():
        rows = conn.execute("SELECT tweet_text FROM tweets").fetchall()
        pattern = re.compile(TWEET_NUMBER_LEAK_PATTERN)
        hits = sum(1 for (txt,) in rows if pattern.search(txt))
        pct = hits / len(rows) * 100
        if pct > 2.0:
            return Status.FAIL, f"{hits} Tweets ({pct:.1f}%) mit Zahlen-Leakage"
        if hits > 0:
            return Status.WARN, f"{hits} Tweets ({pct:.1f}%) mit Zahlen-Leakage"
        return Status.PASS, "Kein Zahlen-Leakage"

    results.append(run_test("6.4", "Kein Zahlen-Leakage", test_6_4))

    # 6.5 District coverage
    def test_6_5():
        rows = conn.execute(
            "SELECT g.district, COUNT(*) as cnt FROM tweets t "
            "JOIN blobs g ON g.id = t.blob_id "
            "GROUP BY g.district"
        ).fetchall()
        total = sum(cnt for _, cnt in rows)
        under = []
        for district, cnt in rows:
            pct = cnt / total * 100
            if pct < TWEET_DISTRICT_MIN_PERCENT:
                under.append((district, f"{pct:.1f}%"))
        if under:
            return Status.WARN, f"Unterrepräsentierte Bezirke: {under}"
        return Status.PASS, f"{len(rows)} Bezirke gleichmäßig vertreten"

    results.append(run_test("6.5", "Bezirksabdeckung", test_6_5))

    # 6.6 Temporal distribution
    def test_6_6():
        ticks = conn.execute(
            "SELECT DISTINCT tick FROM tweets ORDER BY tick"
        ).fetchall()
        ticks = [t[0] for t in ticks]
        if len(ticks) < 2:
            return Status.WARN, "Weniger als 2 verschiedene Ticks"
        max_gap = max(ticks[i + 1] - ticks[i] for i in range(len(ticks) - 1))
        if max_gap > TWEET_MAX_TEMPORAL_GAP:
            return Status.WARN, f"Größte Lücke: {max_gap} Ticks (max {TWEET_MAX_TEMPORAL_GAP})"
        return Status.PASS, f"Größte Lücke: {max_gap} Ticks"

    results.append(run_test("6.6", "Temporale Verteilung", test_6_6))

    # 6.7 Topic validity
    def test_6_7():
        rows = conn.execute("SELECT DISTINCT topic FROM tweets").fetchall()
        found = {r[0] for r in rows}
        invalid = found - TWEET_VALID_TOPICS
        if invalid:
            return Status.FAIL, f"Ungültige Topics: {invalid}"
        return Status.PASS, f"Topics: {found}"

    results.append(run_test("6.7", "Topic-Validität", test_6_7))

    # 6.8 Trigger validity
    def test_6_8():
        rows = conn.execute("SELECT DISTINCT trigger_type FROM tweets").fetchall()
        found = {r[0] for r in rows}
        invalid = found - TWEET_VALID_TRIGGERS
        if invalid:
            return Status.FAIL, f"Ungültige Trigger: {invalid}"
        return Status.PASS, f"Trigger: {found}"

    results.append(run_test("6.8", "Trigger-Validität", test_6_8))

    # 6.9 Blob reference integrity
    def test_6_9():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM tweets t "
            "LEFT JOIN blobs g ON g.id = t.blob_id "
            "WHERE g.id IS NULL"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Tweets mit ungültiger blob_id"
        return Status.PASS, "Alle blob_ids referenzieren existierende Blobs"

    results.append(run_test("6.9", "Blob-Referenz-Integrität", test_6_9))

    # 6.10 Tick range valid
    def test_6_10():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM tweets WHERE tick < 0 OR tick > ?",
            (TOTAL_TICKS - 1,),
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Tweets mit Tick außerhalb [0, {TOTAL_TICKS - 1}]"
        return Status.PASS, f"Alle Ticks in [0, {TOTAL_TICKS - 1}]"

    results.append(run_test("6.10", "Tick-Bereich gültig", test_6_10))

    # 6.11 Sentiment range
    def test_6_11():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM tweets "
            "WHERE sentiment IS NOT NULL AND (sentiment < -1.0 OR sentiment > 1.0)"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Tweets mit Sentiment außerhalb [-1.0, 1.0]"
        return Status.PASS, "Alle Sentiments in [-1.0, 1.0]"

    results.append(run_test("6.11", "Sentiment-Bereich", test_6_11))

    # 6.12 No duplicates
    def test_6_12():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM ("
            "  SELECT blob_id, tick, topic, COUNT(*) as cnt "
            "  FROM tweets GROUP BY blob_id, tick, topic HAVING cnt > 1"
            ")"
        ).fetchone()[0]
        if cnt > 0:
            return Status.WARN, f"{cnt} Duplikat-Gruppen (blob_id, tick, topic)"
        return Status.PASS, "Keine Duplikate"

    results.append(run_test("6.12", "Keine Duplikate", test_6_12))

    # 6.13 Event reactions with description
    def test_6_13():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM tweets "
            "WHERE trigger_type = 'event_reaction' "
            "AND (event_description IS NULL OR event_description = '')"
        ).fetchone()[0]
        if cnt > 0:
            return Status.WARN, f"{cnt} event_reactions ohne event_description"
        return Status.PASS, "Alle event_reactions haben Beschreibung"

    results.append(run_test("6.13", "Event-Reactions mit Beschreibung", test_6_13))

    # 6.14 Tweet average length
    def test_6_14():
        avg = conn.execute(
            "SELECT AVG(LENGTH(tweet_text)) FROM tweets"
        ).fetchone()[0]
        if avg is None:
            return Status.WARN, "Keine Tweets vorhanden"
        if avg < 50 or avg > 200:
            return Status.WARN, f"Durchschnittslänge {avg:.1f} außerhalb [50, 200]"
        return Status.PASS, f"Durchschnittslänge: {avg:.1f} Zeichen"

    results.append(run_test("6.14", "Tweet-Durchschnittslänge", test_6_14))

    # 6.15 No empty tweets
    def test_6_15():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM tweets "
            "WHERE tweet_text IS NULL OR TRIM(tweet_text) = ''"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} leere Tweets"
        return Status.PASS, "Keine leeren Tweets"

    results.append(run_test("6.15", "Keine leeren Tweets", test_6_15))

    # 6.16 Model version consistent
    def test_6_16():
        rows = conn.execute(
            "SELECT DISTINCT model_version FROM tweets WHERE model_version IS NOT NULL"
        ).fetchall()
        versions = [r[0] for r in rows]
        if len(versions) > 1:
            return Status.WARN, f"Mehrere Modellversionen: {versions}"
        if len(versions) == 0:
            return Status.PASS, "Keine model_version gesetzt"
        return Status.PASS, f"Einheitliche Version: {versions[0]}"

    results.append(run_test("6.16", "Modellversion konsistent", test_6_16))

    # 6.17 At least 3 topics
    def test_6_17():
        cnt = conn.execute(
            "SELECT COUNT(DISTINCT topic) FROM tweets"
        ).fetchone()[0]
        if cnt < 3:
            return Status.WARN, f"Nur {cnt} Topics verwendet (min. 3 erwartet)"
        return Status.PASS, f"{cnt} verschiedene Topics"

    results.append(run_test("6.17", "Mindestens 3 Topics", test_6_17))

    # 6.18 All 4 trigger types present
    def test_6_18():
        rows = conn.execute("SELECT DISTINCT trigger_type FROM tweets").fetchall()
        found = {r[0] for r in rows}
        missing = TWEET_VALID_TRIGGERS - found
        if missing:
            return Status.WARN, f"Fehlende Trigger-Typen: {missing}"
        return Status.PASS, "Alle 4 Trigger-Typen vorhanden"

    results.append(run_test("6.18", "Alle 4 Trigger-Typen", test_6_18))

    return results
