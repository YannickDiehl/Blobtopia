"""Layer 1: Datenintegrität — 15 SQL-Tests."""

import json
import sqlite3

from .config import (
    ELECTION_VOTE_SUM_MAX,
    ELECTION_VOTE_SUM_MIN,
    EXPECTED_BLOBS,
    EXPECTED_SNAPSHOTS,
    IDEOLOGY_RANGE,
    PROTEST_RANGE,
    SATISFACTION_RANGE,
    TOTAL_TICKS,
    TRAIT_KEYS,
    TRUST_RANGE,
    VALID_PARTIES,
)
from .report import Status, TestResult, run_test


def run_layer1(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # 1.1 Vollständige Timeline
    def test_1_1():
        row = conn.execute(
            "SELECT COUNT(DISTINCT blob_id), COUNT(*) FROM blob_daily_state"
        ).fetchone()
        n_globs, n_rows = row
        expected_rows = EXPECTED_BLOBS * TOTAL_TICKS
        if n_globs != EXPECTED_BLOBS:
            return Status.FAIL, f"Erwartet {EXPECTED_BLOBS} Blobs, gefunden: {n_globs}"
        # Allow some tolerance on total rows (±1% or exact)
        if abs(n_rows - expected_rows) > expected_rows * 0.01:
            return Status.FAIL, f"Erwartet ~{expected_rows} Rows, gefunden: {n_rows}"
        return Status.PASS, f"{n_globs} Blobs, {n_rows} Rows"

    results.append(run_test("1.1", "Vollständige Timeline", test_1_1))

    # 1.2 Jeder Blob alle Ticks
    def test_1_2():
        rows = conn.execute(
            f"SELECT blob_id, COUNT(*) as cnt FROM blob_daily_state "
            f"GROUP BY blob_id HAVING cnt != {TOTAL_TICKS}"
        ).fetchall()
        if rows:
            examples = rows[:3]
            return Status.FAIL, f"{len(rows)} Blobs mit falscher Tick-Anzahl, z.B. {examples}"
        return Status.PASS, f"Alle {EXPECTED_BLOBS} Blobs haben {TOTAL_TICKS} Ticks"

    results.append(run_test("1.2", "Jeder Blob alle Ticks", test_1_2))

    # 1.3 Satisfaction 0-10
    def test_1_3():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blob_daily_state WHERE satisfaction < ? OR satisfaction > ?",
            SATISFACTION_RANGE,
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Zeilen außerhalb [0, 10]"
        return Status.PASS, ""

    results.append(run_test("1.3", "Satisfaction 0-10", test_1_3))

    # 1.4 Ideology -5/+5
    def test_1_4():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blob_daily_state WHERE ideology < ? OR ideology > ?",
            IDEOLOGY_RANGE,
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Zeilen außerhalb [-5, +5]"
        return Status.PASS, ""

    results.append(run_test("1.4", "Ideology -5/+5", test_1_4))

    # 1.5 Trust 0-10
    def test_1_5():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blob_daily_state WHERE trust < ? OR trust > ?",
            TRUST_RANGE,
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Zeilen außerhalb [0, 10]"
        return Status.PASS, ""

    results.append(run_test("1.5", "Trust 0-10", test_1_5))

    # 1.6 Party 0-3/NULL
    def test_1_6():
        parties_str = ",".join(str(p) for p in VALID_PARTIES)
        cnt = conn.execute(
            f"SELECT COUNT(*) FROM blob_daily_state "
            f"WHERE party IS NOT NULL AND party NOT IN ({parties_str})"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Zeilen mit ungültiger Partei"
        return Status.PASS, ""

    results.append(run_test("1.6", "Party 0-3/NULL", test_1_6))

    # 1.7 Kinder ohne Partei (T0)
    def test_1_7():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blob_daily_state ds "
            "JOIN blobs g ON g.id = ds.blob_id "
            "WHERE g.age < 18 AND ds.party IS NOT NULL AND ds.tick = 0"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Kinder mit Partei bei Tick 0"
        return Status.PASS, ""

    results.append(run_test("1.7", "Kinder ohne Partei (T0)", test_1_7))

    # 1.8 Traits-JSON wohlgeformt (Stichprobe 50 Blobs)
    def test_1_8():
        rows = conn.execute(
            "SELECT blob_id, latent_traits_json FROM blob_daily_state "
            "WHERE latent_traits_json IS NOT NULL AND tick = 0 "
            "ORDER BY blob_id LIMIT 50"
        ).fetchall()
        if not rows:
            return Status.FAIL, "Keine Traits-JSON bei Tick 0 gefunden"
        missing_keys = []
        for blob_id, traits_json in rows:
            try:
                data = json.loads(traits_json)
            except json.JSONDecodeError:
                return Status.FAIL, f"Ungültiges JSON für Blob {blob_id}"
            for key in TRAIT_KEYS:
                if key not in data:
                    missing_keys.append((blob_id, key))
        if missing_keys:
            examples = missing_keys[:5]
            return Status.FAIL, f"{len(missing_keys)} fehlende Keys, z.B. {examples}"
        return Status.PASS, f"{len(rows)} Blobs geprüft, alle 15 Keys vorhanden"

    results.append(run_test("1.8", "Traits-JSON wohlgeformt", test_1_8))

    # 1.9 persona_text vorhanden
    def test_1_9():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blobs WHERE persona_text IS NULL OR persona_text = ''"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Blobs ohne persona_text"
        return Status.PASS, ""

    results.append(run_test("1.9", "persona_text vorhanden", test_1_9))

    # 1.10 Job vorhanden
    def test_1_10():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blobs WHERE job IS NULL OR job = ''"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Blobs ohne Job"
        return Status.PASS, ""

    results.append(run_test("1.10", "Job vorhanden", test_1_10))

    # 1.11 Wahl-Summen plausibel
    def test_1_11():
        rows = conn.execute(
            "SELECT tick, fortschritt + mitte + tradition + unabhaengige as total "
            "FROM elections ORDER BY tick"
        ).fetchall()
        if not rows:
            return Status.FAIL, "Keine Wahlergebnisse gefunden"
        issues = []
        for tick, total in rows:
            if total < ELECTION_VOTE_SUM_MIN or total > ELECTION_VOTE_SUM_MAX:
                issues.append((tick, total))
        if issues:
            return Status.WARN, f"Summen außerhalb [{ELECTION_VOTE_SUM_MIN}, {ELECTION_VOTE_SUM_MAX}]: {issues}"
        return Status.PASS, f"{len(rows)} Wahlen geprüft"

    results.append(run_test("1.11", "Wahl-Summen plausibel", test_1_11))

    # 1.12 Snapshots vorhanden
    def test_1_12():
        cnt = conn.execute("SELECT COUNT(*) FROM blob_persona_snapshots").fetchone()[0]
        if cnt != EXPECTED_SNAPSHOTS:
            return Status.FAIL, f"Erwartet {EXPECTED_SNAPSHOTS}, gefunden: {cnt}"
        return Status.PASS, f"{cnt} Snapshots"

    results.append(run_test("1.12", "Snapshots vorhanden", test_1_12))

    # 1.13 Income ≥ 0
    def test_1_13():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blob_daily_state WHERE income < 0"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Zeilen mit negativem Einkommen"
        return Status.PASS, ""

    results.append(run_test("1.13", "Income >= 0", test_1_13))

    # 1.14 Protest 0-1
    def test_1_14():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blob_daily_state "
            "WHERE protest_readiness < ? OR protest_readiness > ?",
            PROTEST_RANGE,
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Zeilen außerhalb [0, 1]"
        return Status.PASS, ""

    results.append(run_test("1.14", "Protest 0-1", test_1_14))

    # 1.15 Erwachsenen-Income
    def test_1_15():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blob_daily_state ds "
            "JOIN blobs g ON g.id = ds.blob_id "
            "WHERE g.age >= 18 AND ds.income > 0 AND ds.income < 800"
        ).fetchone()[0]
        if cnt > 0:
            return Status.WARN, f"{cnt} Erwachsene mit Income > 0 aber < 800"
        return Status.PASS, ""

    results.append(run_test("1.15", "Erwachsenen-Income", test_1_15))

    return results
