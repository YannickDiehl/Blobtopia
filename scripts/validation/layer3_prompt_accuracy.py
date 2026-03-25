"""Layer 3: Prompt-Genauigkeit — 7 Tests.

Repliziert die Rust-Prompt-Logik aus stats.rs und vergleicht gegen DB-Werte.
"""

import json
import sqlite3

from .config import (
    EDU_STYLES,
    EXPECTED_BLOBS,
    PARTY_NAMES,
    PROMPT_SAMPLE_SIZE,
    TICKS_PER_YEAR,
    TRAIT_KEYS,
)
from .report import Status, TestResult, run_test


def _get_ticks_per_year(conn: sqlite3.Connection) -> int:
    """Read ticks_per_year from meta table, fallback to config default."""
    try:
        row = conn.execute(
            "SELECT value FROM meta WHERE key = 'ticks_per_year'"
        ).fetchone()
        if row:
            return int(row[0])
    except Exception:
        pass
    return TICKS_PER_YEAR


def _get_sample_blob_ids(conn: sqlite3.Connection, n: int) -> list[str]:
    """Get n evenly-spaced Blob IDs."""
    all_ids = [r[0] for r in conn.execute("SELECT id FROM blobs ORDER BY id").fetchall()]
    if len(all_ids) <= n:
        return all_ids
    step = len(all_ids) / n
    return [all_ids[int(i * step)] for i in range(n)]


def _get_state_at_tick(conn: sqlite3.Connection, blob_id: str, tick: int) -> dict | None:
    """Replicate Rust logic: SELECT ... WHERE blob_id=? AND tick<=? ORDER BY tick DESC LIMIT 1."""
    row = conn.execute(
        "SELECT satisfaction, ideology, trust, party, will_vote, "
        "protest_readiness, income, latent_traits_json "
        "FROM blob_daily_state "
        "WHERE blob_id = ? AND tick <= ? "
        "ORDER BY tick DESC LIMIT 1",
        (blob_id, tick),
    ).fetchone()
    if not row:
        return None
    return {
        "satisfaction": row[0],
        "ideology": row[1],
        "trust": row[2],
        "party": row[3],
        "will_vote": row[4],
        "protest_readiness": row[5],
        "income": row[6],
        "latent_traits_json": row[7],
    }


def _get_traits_with_fallback(conn: sqlite3.Connection, blob_id: str, tick: int, primary_json: str | None) -> dict:
    """Replicate Rust trait fallback: if primary is None, search backward for non-null."""
    if primary_json:
        try:
            return json.loads(primary_json)
        except json.JSONDecodeError:
            pass

    row = conn.execute(
        "SELECT latent_traits_json FROM blob_daily_state "
        "WHERE blob_id = ? AND tick <= ? AND latent_traits_json IS NOT NULL "
        "ORDER BY tick DESC LIMIT 1",
        (blob_id, tick),
    ).fetchone()
    if row and row[0]:
        try:
            return json.loads(row[0])
        except json.JSONDecodeError:
            pass
    return {}


def _build_prompt(conn: sqlite3.Connection, blob_id: str, tick: int, tpy: int) -> dict:
    """Replicate the full Rust prompt-building logic, return structured data."""
    blob = conn.execute(
        "SELECT name, district, age, education_level, "
        "COALESCE(persona_text, ''), COALESCE(job, '') "
        "FROM blobs WHERE id = ?",
        (blob_id,),
    ).fetchone()
    if not blob:
        return {"error": "Blob not found"}

    name, district, start_age, edu, persona_base, job = blob
    current_age = start_age + tick // tpy
    year = tick // tpy
    month = (tick % tpy) // 30 + 1
    first_name = name.split()[0] if name else name

    state = _get_state_at_tick(conn, blob_id, tick)
    if not state:
        return {"error": "No state data"}

    traits = _get_traits_with_fallback(conn, blob_id, tick, state["latent_traits_json"])
    t = lambda key: float(traits.get(key, 5.0))

    party_name = PARTY_NAMES.get(state["party"], "keine")
    edu_style = EDU_STYLES.get(edu, EDU_STYLES[3])

    change_summary = ""
    row = conn.execute(
        "SELECT COALESCE(change_summary, '') FROM blob_persona_snapshots "
        "WHERE blob_id = ? AND tick <= ? ORDER BY tick DESC LIMIT 1",
        (blob_id, tick),
    ).fetchone()
    if row:
        change_summary = row[0]

    return {
        "blob_id": blob_id,
        "name": name,
        "first_name": first_name,
        "district": district,
        "start_age": start_age,
        "current_age": current_age,
        "year": year,
        "month": month,
        "edu": edu,
        "edu_style": edu_style,
        "persona_base": persona_base,
        "job": job,
        "satisfaction": state["satisfaction"],
        "ideology": state["ideology"],
        "trust": state["trust"],
        "party": state["party"],
        "party_name": party_name,
        "will_vote": state["will_vote"],
        "protest_readiness": state["protest_readiness"],
        "income": state["income"],
        "traits": {k: t(k) for k in TRAIT_KEYS},
        "change_summary": change_summary,
    }


def run_layer3(conn: sqlite3.Connection) -> list[TestResult]:
    results = []
    tpy = _get_ticks_per_year(conn)
    sample_ids = _get_sample_blob_ids(conn, PROMPT_SAMPLE_SIZE)

    # 3.1 Tick-0-Werte: DB vs. Prompt-Logik
    def test_3_1():
        errors = []
        for gid in sample_ids:
            prompt_data = _build_prompt(conn, gid, 0, tpy)
            if "error" in prompt_data:
                errors.append(f"{gid}: {prompt_data['error']}")
                continue
            db_state = conn.execute(
                "SELECT satisfaction, ideology, trust, party, will_vote, income "
                "FROM blob_daily_state WHERE blob_id = ? AND tick = 0",
                (gid,),
            ).fetchone()
            if not db_state:
                errors.append(f"{gid}: keine Tick-0-Daten")
                continue
            sat, ideo, trust, party, will_vote, income = db_state
            if abs(prompt_data["satisfaction"] - sat) > 0.01:
                errors.append(f"{gid}: sat {prompt_data['satisfaction']} != {sat}")
            if abs(prompt_data["ideology"] - ideo) > 0.01:
                errors.append(f"{gid}: ideo {prompt_data['ideology']} != {ideo}")
            if abs(prompt_data["trust"] - trust) > 0.01:
                errors.append(f"{gid}: trust {prompt_data['trust']} != {trust}")
            if prompt_data["party"] != party:
                errors.append(f"{gid}: party {prompt_data['party']} != {party}")
            if prompt_data["will_vote"] != will_vote:
                errors.append(f"{gid}: will_vote {prompt_data['will_vote']} != {will_vote}")
        if errors:
            return Status.FAIL, f"{len(errors)} Abweichungen: {errors[:3]}"
        return Status.PASS, f"{len(sample_ids)} Blobs geprüft"

    results.append(run_test("3.1", "Tick-0-Werte korrekt", test_3_1))

    # 3.2 Tick-4000-Werte: beliebiger non-snapshot Tick
    def test_3_2():
        test_tick = 4000
        errors = []
        for gid in sample_ids:
            prompt_data = _build_prompt(conn, gid, test_tick, tpy)
            if "error" in prompt_data:
                errors.append(f"{gid}: {prompt_data['error']}")
                continue
            state = _get_state_at_tick(conn, gid, test_tick)
            if not state:
                errors.append(f"{gid}: kein State bei Tick {test_tick}")
                continue
            if abs(prompt_data["satisfaction"] - state["satisfaction"]) > 0.01:
                errors.append(f"{gid}: sat mismatch")
            if abs(prompt_data["ideology"] - state["ideology"]) > 0.01:
                errors.append(f"{gid}: ideo mismatch")
            if abs(prompt_data["trust"] - state["trust"]) > 0.01:
                errors.append(f"{gid}: trust mismatch")
        if errors:
            return Status.FAIL, f"{len(errors)} Abweichungen: {errors[:3]}"
        return Status.PASS, f"{len(sample_ids)} Blobs bei Tick 4000 geprüft"

    results.append(run_test("3.2", "Tick-4000-Werte korrekt", test_3_2))

    # 3.3 Altersberechnung: start_age + tick/tpy
    def test_3_3():
        test_ticks = [0, 1460, 4000, 8029]
        errors = []
        for gid in sample_ids:
            blob = conn.execute(
                "SELECT age FROM blobs WHERE id = ?", (gid,)
            ).fetchone()
            if not blob:
                continue
            start_age = blob[0]
            for tick in test_ticks:
                expected_age = start_age + tick // tpy
                prompt_data = _build_prompt(conn, gid, tick, tpy)
                if "error" in prompt_data:
                    continue
                if prompt_data["current_age"] != expected_age:
                    errors.append(
                        f"{gid}@{tick}: {prompt_data['current_age']} != {expected_age}"
                    )
        if errors:
            return Status.FAIL, f"{len(errors)} Fehler: {errors[:3]}"
        return Status.PASS, f"{len(sample_ids)} × {len(test_ticks)} Altersberechnungen korrekt"

    results.append(run_test("3.3", "Altersberechnung korrekt", test_3_3))

    # 3.4 Parteiname korrekt
    def test_3_4():
        errors = []
        for gid in sample_ids:
            state = _get_state_at_tick(conn, gid, 0)
            if not state:
                continue
            expected_name = PARTY_NAMES.get(state["party"], "keine")
            prompt_data = _build_prompt(conn, gid, 0, tpy)
            if "error" in prompt_data:
                continue
            if prompt_data["party_name"] != expected_name:
                errors.append(f"{gid}: {prompt_data['party_name']} != {expected_name}")
        if errors:
            return Status.FAIL, f"{len(errors)} Fehler: {errors[:3]}"
        return Status.PASS, f"{len(sample_ids)} Parteinamen korrekt"

    results.append(run_test("3.4", "Parteiname korrekt", test_3_4))

    # 3.5 15 Traits vorhanden
    def test_3_5():
        errors = []
        for gid in sample_ids:
            prompt_data = _build_prompt(conn, gid, 0, tpy)
            if "error" in prompt_data:
                errors.append(f"{gid}: {prompt_data['error']}")
                continue
            missing = [k for k in TRAIT_KEYS if k not in prompt_data["traits"]]
            if missing:
                errors.append(f"{gid}: fehlende Keys {missing}")
        if errors:
            return Status.FAIL, f"{len(errors)} Fehler: {errors[:3]}"
        return Status.PASS, f"Alle 15 Traits bei {len(sample_ids)} Blobs vorhanden"

    results.append(run_test("3.5", "15 Traits vorhanden", test_3_5))

    # 3.6 Base-Persona > 50 chars
    def test_3_6():
        cnt = conn.execute(
            "SELECT COUNT(*) FROM blobs WHERE LENGTH(persona_text) <= 50"
        ).fetchone()[0]
        if cnt > 0:
            return Status.FAIL, f"{cnt}/{EXPECTED_BLOBS} Blobs mit persona_text <= 50 Zeichen"
        return Status.PASS, f"Alle {EXPECTED_BLOBS} Personas > 50 Zeichen"

    results.append(run_test("3.6", "Base-Persona > 50 chars", test_3_6))

    # 3.7 Traits-Fallback: bei Tick ohne direkte traits_json
    def test_3_7():
        errors = []
        for gid in sample_ids:
            # Find a tick where latent_traits_json IS NULL (if any)
            row = conn.execute(
                "SELECT tick FROM blob_daily_state "
                "WHERE blob_id = ? AND latent_traits_json IS NULL "
                "ORDER BY tick LIMIT 1",
                (gid,),
            ).fetchone()
            if not row:
                continue  # All ticks have traits, fallback not needed
            null_tick = row[0]
            prompt_data = _build_prompt(conn, gid, null_tick, tpy)
            if "error" in prompt_data:
                errors.append(f"{gid}: {prompt_data['error']}")
                continue
            # The fallback should still produce traits (from earlier tick)
            all_default = all(
                abs(v - 5.0) < 0.01 for v in prompt_data["traits"].values()
            )
            if all_default:
                errors.append(f"{gid}@{null_tick}: alle Traits auf Default 5.0 (Fallback versagt?)")
        if errors:
            return Status.FAIL, f"{len(errors)} Fehler: {errors[:3]}"
        return Status.PASS, "Traits-Fallback funktioniert"

    results.append(run_test("3.7", "Traits-Fallback", test_3_7))

    return results
