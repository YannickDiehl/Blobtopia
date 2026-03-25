"""Layer 5: Temporale Konsistenz — 6 Tests."""

import json
import sqlite3

from .config import (
    IDEOLOGY_JUMP_THRESHOLD,
    MAX_JUMPS_PER_GLOB_WARN,
    PARTY_SWITCH_AVG_WARN,
    SAT_JUMP_THRESHOLD,
    TICKS_PER_YEAR,
    TRUST_JUMP_THRESHOLD,
)
from .report import Status, TestResult, run_test


def _load_event_ticks(conn: sqlite3.Connection) -> set[int]:
    """Load event ticks from the events table."""
    try:
        rows = conn.execute("SELECT DISTINCT tick FROM events").fetchall()
        event_ticks = set(r[0] for r in rows)
    except Exception:
        event_ticks = set()
    # Also include a window around events (±7 ticks)
    expanded = set()
    for t in event_ticks:
        for offset in range(-7, 8):
            expanded.add(t + offset)
    return expanded


def _count_jumps(
    conn: sqlite3.Connection,
    column: str,
    threshold: float,
    event_ticks: set[int],
) -> dict[str, int]:
    """Count per-Blob jumps in a column that exceed threshold, excluding event windows."""
    # Use a sample of 100 Blobs for performance
    blob_ids = [r[0] for r in conn.execute(
        "SELECT id FROM blobs ORDER BY id LIMIT 100"
    ).fetchall()]

    jump_counts = {}
    for gid in blob_ids:
        rows = conn.execute(
            f"SELECT tick, {column} FROM blob_daily_state "
            f"WHERE blob_id = ? ORDER BY tick",
            (gid,),
        ).fetchall()
        jumps = 0
        for i in range(1, len(rows)):
            tick = rows[i][0]
            if tick in event_ticks:
                continue
            diff = abs(rows[i][1] - rows[i - 1][1])
            if diff > threshold:
                jumps += 1
        jump_counts[gid] = jumps

    return jump_counts


def run_layer5(conn: sqlite3.Connection) -> list[TestResult]:
    results = []
    event_ticks = _load_event_ticks(conn)

    # 5.1 Satisfaction-Sprünge
    def test_5_1():
        counts = _count_jumps(conn, "satisfaction", SAT_JUMP_THRESHOLD, event_ticks)
        high = {gid: c for gid, c in counts.items() if c > MAX_JUMPS_PER_GLOB_WARN}
        if len(high) > len(counts) * 0.2:
            return Status.WARN, f"{len(high)}/{len(counts)} Blobs mit > {MAX_JUMPS_PER_GLOB_WARN} Sprüngen"
        return Status.PASS, f"Max Sprünge: {max(counts.values()) if counts else 0}"

    results.append(run_test("5.1", "Satisfaction-Sprünge", test_5_1))

    # 5.2 Trust-Sprünge
    def test_5_2():
        counts = _count_jumps(conn, "trust", TRUST_JUMP_THRESHOLD, event_ticks)
        high = {gid: c for gid, c in counts.items() if c > MAX_JUMPS_PER_GLOB_WARN}
        if len(high) > len(counts) * 0.2:
            return Status.WARN, f"{len(high)}/{len(counts)} Blobs mit > {MAX_JUMPS_PER_GLOB_WARN} Sprüngen"
        return Status.PASS, f"Max Sprünge: {max(counts.values()) if counts else 0}"

    results.append(run_test("5.2", "Trust-Sprünge", test_5_2))

    # 5.3 Ideology-Sprünge
    def test_5_3():
        counts = _count_jumps(conn, "ideology", IDEOLOGY_JUMP_THRESHOLD, event_ticks)
        high = {gid: c for gid, c in counts.items() if c > MAX_JUMPS_PER_GLOB_WARN}
        if len(high) > len(counts) * 0.2:
            return Status.WARN, f"{len(high)}/{len(counts)} Blobs mit > {MAX_JUMPS_PER_GLOB_WARN} Sprüngen"
        return Status.PASS, f"Max Sprünge: {max(counts.values()) if counts else 0}"

    results.append(run_test("5.3", "Ideology-Sprünge", test_5_3))

    # 5.4 Income ≥ 0 über Zeit (schon in L1, hier temporale Prüfung)
    def test_5_4():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blob_daily_state WHERE income < 0"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt} Verletzungen (negatives Einkommen)"
        return Status.PASS, ""

    results.append(run_test("5.4", "Income >= 0 über Zeit", test_5_4))

    # 5.5 Parteiwechsel-Frequenz
    def test_5_5():
        blob_ids = [r[0] for r in conn.execute(
            "SELECT id FROM blobs ORDER BY id LIMIT 100"
        ).fetchall()]

        switch_counts = []
        for gid in blob_ids:
            rows = conn.execute(
                "SELECT party FROM blob_daily_state WHERE blob_id = ? ORDER BY tick",
                (gid,),
            ).fetchall()
            switches = 0
            for i in range(1, len(rows)):
                if rows[i][0] != rows[i - 1][0]:
                    switches += 1
            switch_counts.append(switches)

        if not switch_counts:
            return Status.FAIL, "Keine Daten"
        avg = sum(switch_counts) / len(switch_counts)
        if avg > PARTY_SWITCH_AVG_WARN:
            return Status.WARN, f"Durchschnitt {avg:.1f} Wechsel > {PARTY_SWITCH_AVG_WARN}"
        return Status.PASS, f"Durchschnitt {avg:.1f} Wechsel"

    results.append(run_test("5.5", "Parteiwechsel-Frequenz", test_5_5))

    # 5.6 will_vote stabil bei Kindern (will_vote=0 bis 18)
    def test_5_6():
        tpy = TICKS_PER_YEAR
        try:
            row = conn.execute("SELECT value FROM meta WHERE key = 'ticks_per_year'").fetchone()
            if row:
                tpy = int(row[0])
        except Exception:
            pass

        # Find Blobs that start as children
        children = conn.execute(
            "SELECT id, age FROM blobs WHERE age < 18"
        ).fetchall()
        violations = 0
        checked = 0
        for gid, start_age in children:
            adult_tick = (18 - start_age) * tpy
            # Check will_vote before they turn 18
            cnt = conn.execute(
                "SELECT COUNT(*) FROM blob_daily_state "
                "WHERE blob_id = ? AND tick < ? AND will_vote != 0",
                (gid, adult_tick),
            ).fetchone()[0]
            violations += cnt
            checked += 1

        if violations > 0:
            return Status.FAIL, f"{violations} Verletzungen bei {checked} Kindern"
        return Status.PASS, f"{checked} Kinder geprüft, alle will_vote=0 bis 18"

    results.append(run_test("5.6", "will_vote stabil bei Kindern", test_5_6))

    return results
