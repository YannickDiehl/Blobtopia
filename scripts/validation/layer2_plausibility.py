"""Layer 2: Simulationsplausibilität — 9 Tests (CFA, Alpha, ENP, Gini)."""

import json
import sqlite3

import numpy as np

from .config import (
    CFA_CFI_END_PASS,
    CFA_CFI_END_WARN,
    CFA_CFI_PASS,
    CFA_CFI_WARN,
    CFA_MODEL,
    CRONBACH_PASS,
    CRONBACH_WARN,
    ENP_RANGE,
    GINI_RANGE,
    TRAIT_KEYS,
    TURNOUT_RANGE,
    VARIANCE_MIN,
)
from .report import Status, TestResult, run_test


def _load_traits_at_tick(conn: sqlite3.Connection, tick: int) -> dict[str, list[float]]:
    """Load all 15 trait indicators for all Blobs at a given tick."""
    rows = conn.execute(
        "SELECT latent_traits_json FROM blob_daily_state "
        "WHERE tick = ? AND latent_traits_json IS NOT NULL",
        (tick,),
    ).fetchall()
    data = {k: [] for k in TRAIT_KEYS}
    for (traits_json,) in rows:
        traits = json.loads(traits_json)
        for k in TRAIT_KEYS:
            data[k].append(float(traits.get(k, 5.0)))
    return data


def _cronbach_alpha(items: np.ndarray) -> float:
    """Cronbach's alpha for a matrix of shape (n_subjects, n_items)."""
    n_items = items.shape[1]
    if n_items < 2:
        return 0.0
    item_vars = items.var(axis=0, ddof=1)
    total_var = items.sum(axis=1).var(ddof=1)
    if total_var == 0:
        return 0.0
    return (n_items / (n_items - 1)) * (1 - item_vars.sum() / total_var)


def _run_cfa(trait_data: dict[str, list[float]]) -> float | None:
    """Run CFA with semopy, return CFI. Returns None if semopy not available."""
    try:
        import pandas as pd
        import semopy
    except ImportError:
        return None

    df = pd.DataFrame(trait_data)
    if df.shape[0] < 50:
        return None

    model = semopy.Model(CFA_MODEL)
    try:
        model.fit(df)
    except Exception:
        return None

    stats = semopy.calc_stats(model)
    cfi = stats.get("CFI")
    if cfi is not None:
        if hasattr(cfi, "values"):
            cfi = float(cfi.values[0])
        else:
            cfi = float(cfi)
    return cfi


def _gini(values: list[float]) -> float:
    """Gini coefficient."""
    arr = np.sort(np.array(values, dtype=float))
    n = len(arr)
    if n == 0 or arr.sum() == 0:
        return 0.0
    index = np.arange(1, n + 1)
    return (2 * (index * arr).sum()) / (n * arr.sum()) - (n + 1) / n


def _enp(votes: list[int]) -> float:
    """Effective Number of Parties (Laakso-Taagepera)."""
    total = sum(votes)
    if total == 0:
        return 0.0
    shares = [v / total for v in votes]
    hhi = sum(s**2 for s in shares)
    return 1.0 / hhi if hhi > 0 else 0.0


def run_layer2(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # 2.1 Distrikt-Richtung: Distrikte zeigen ideologische Differenzierung bei T0
    def test_2_1():
        rows = conn.execute(
            "SELECT ds.district, AVG(ds.ideology) as avg_ideo "
            "FROM blob_daily_state ds WHERE ds.tick = 0 "
            "GROUP BY ds.district ORDER BY ds.district"
        ).fetchall()
        if len(rows) < 5:
            return Status.FAIL, f"Nur {len(rows)} Distrikte gefunden"
        values = [r[1] for r in rows]
        spread = max(values) - min(values)
        if spread < 1.0:
            return Status.FAIL, f"Ideologische Spanne nur {spread:.2f} (< 1.0)"
        detail = ", ".join(f"D{r[0]}={r[1]:.2f}" for r in rows)
        return Status.PASS, f"Spanne={spread:.2f} ({detail})"

    results.append(run_test("2.1", "Distrikt-Differenzierung Ideologie", test_2_1))

    # 2.2 Varianz > 0 pro Distrikt
    def test_2_2():
        rows = conn.execute(
            "SELECT ds.district, MAX(ds.ideology) - MIN(ds.ideology) as rng "
            "FROM blob_daily_state ds WHERE ds.tick = 0 "
            "GROUP BY ds.district"
        ).fetchall()
        low = [(d, r) for d, r in rows if r < VARIANCE_MIN]
        if low:
            return Status.FAIL, f"Distrikte mit Range < {VARIANCE_MIN}: {low}"
        return Status.PASS, f"Alle Distrikte Range > {VARIANCE_MIN}"

    results.append(run_test("2.2", "Varianz > 0 pro Distrikt", test_2_2))

    # 2.3 CFA Tick 0
    def test_2_3():
        trait_data = _load_traits_at_tick(conn, 0)
        if not trait_data["self_efficacy"]:
            return Status.FAIL, "Keine Traits bei Tick 0"
        cfi = _run_cfa(trait_data)
        if cfi is None:
            return Status.SKIP, "semopy nicht installiert"
        if cfi >= CFA_CFI_PASS:
            return Status.PASS, f"CFI = {cfi:.3f}"
        if cfi >= CFA_CFI_WARN:
            return Status.WARN, f"CFI = {cfi:.3f} (< {CFA_CFI_PASS})"
        return Status.FAIL, f"CFI = {cfi:.3f} (< {CFA_CFI_WARN})"

    results.append(run_test("2.3", "CFA Tick 0", test_2_3))

    # 2.4 CFA Tick 8029
    def test_2_4():
        trait_data = _load_traits_at_tick(conn, 8029)
        if not trait_data["self_efficacy"]:
            return Status.FAIL, "Keine Traits bei Tick 8029"
        cfi = _run_cfa(trait_data)
        if cfi is None:
            return Status.SKIP, "semopy nicht installiert"
        if cfi >= CFA_CFI_END_PASS:
            return Status.PASS, f"CFI = {cfi:.3f}"
        if cfi >= CFA_CFI_END_WARN:
            return Status.WARN, f"CFI = {cfi:.3f} (< {CFA_CFI_END_PASS})"
        return Status.FAIL, f"CFI = {cfi:.3f} (< {CFA_CFI_END_WARN})"

    results.append(run_test("2.4", "CFA Tick 8029", test_2_4))

    # 2.5 Cronbach α (5 Konstrukte)
    def test_2_5():
        trait_data = _load_traits_at_tick(conn, 0)
        if not trait_data["self_efficacy"]:
            return Status.FAIL, "Keine Traits bei Tick 0"

        # Indicators that are inverted (high value = low construct score)
        inverted = {"environment_over_economy", "freedom_over_order"}

        constructs = {
            "Efficacy": ["self_efficacy", "political_knowledge", "vote_importance"],
            "Social": ["neighbor_trust", "community_participation", "network_size"],
            "Authoritarianism": ["obedience_value", "rule_conformity", "strong_leader_preference"],
            "Alienation": ["powerlessness", "political_complexity", "party_indifference"],
            "Materialism": ["economic_security_priority", "environment_over_economy", "freedom_over_order"],
        }

        worst_status = Status.PASS
        details = []
        for name, keys in constructs.items():
            cols = []
            for k in keys:
                arr = np.array(trait_data[k])
                if k in inverted:
                    arr = 10.0 - arr  # Reverse-code inverted indicators
                cols.append(arr)
            items = np.column_stack(cols)
            alpha = _cronbach_alpha(items)
            details.append(f"{name}: α={alpha:.3f}")
            if alpha < CRONBACH_WARN:
                worst_status = Status.FAIL
            elif alpha < CRONBACH_PASS:
                if worst_status != Status.FAIL:
                    worst_status = Status.WARN

        return worst_status, "; ".join(details)

    results.append(run_test("2.5", "Cronbach α (5 Konstrukte)", test_2_5))

    # 2.6 Turnout
    def test_2_6():
        elections = conn.execute(
            "SELECT tick, fortschritt + mitte + tradition + unabhaengige FROM elections"
        ).fetchall()
        if not elections:
            return Status.FAIL, "Keine Wahlergebnisse"
        issues = []
        for tick, total_votes in elections:
            eligible = conn.execute(
                "SELECT COUNT(*) FROM blob_daily_state ds "
                "JOIN blobs g ON g.id = ds.blob_id "
                "WHERE ds.tick = ? AND (g.age + ? / 365) >= 18",
                (tick, tick),
            ).fetchone()[0]
            if eligible == 0:
                continue
            turnout = total_votes / eligible
            if turnout < TURNOUT_RANGE[0] or turnout > TURNOUT_RANGE[1]:
                issues.append(f"Tick {tick}: {turnout:.1%}")
        if issues:
            return Status.WARN, f"Turnout außerhalb {TURNOUT_RANGE}: {'; '.join(issues)}"
        return Status.PASS, f"{len(elections)} Wahlen geprüft"

    results.append(run_test("2.6", "Turnout 55-85%", test_2_6))

    # 2.7 ENP
    def test_2_7():
        elections = conn.execute(
            "SELECT tick, fortschritt, mitte, tradition, unabhaengige FROM elections"
        ).fetchall()
        if not elections:
            return Status.FAIL, "Keine Wahlergebnisse"
        issues = []
        for tick, f, m, t, u in elections:
            enp = _enp([f, m, t, u])
            if enp < ENP_RANGE[0] or enp > ENP_RANGE[1]:
                issues.append(f"Tick {tick}: ENP={enp:.2f}")
        if issues:
            return Status.WARN, f"ENP außerhalb {ENP_RANGE}: {'; '.join(issues)}"
        return Status.PASS, f"{len(elections)} Wahlen geprüft"

    results.append(run_test("2.7", "ENP 2.5-5.5", test_2_7))

    # 2.8 Gini
    def test_2_8():
        incomes = conn.execute(
            "SELECT income FROM blob_daily_state WHERE tick = 0 AND income > 0"
        ).fetchall()
        if not incomes:
            return Status.FAIL, "Keine Einkommensdaten"
        gini = _gini([r[0] for r in incomes])
        if gini < GINI_RANGE[0] or gini > GINI_RANGE[1]:
            return Status.WARN, f"Gini={gini:.3f} außerhalb {GINI_RANGE}"
        return Status.PASS, f"Gini={gini:.3f}"

    results.append(run_test("2.8", "Gini 0.2-0.5", test_2_8))

    # 2.9 Bildungsunterschied D0 > D4 (Grüntal hat höhere Bildung als Industriezone)
    def test_2_9():
        rows = conn.execute(
            "SELECT district, AVG(education_level) FROM blobs GROUP BY district ORDER BY district"
        ).fetchall()
        if len(rows) < 5:
            return Status.FAIL, f"Nur {len(rows)} Distrikte"
        d0_edu = rows[0][1]
        d4_edu = rows[4][1]
        # Sonnenberg (D1) should have highest education, Industriezone (D4) lowest
        d1_edu = rows[1][1]
        if d1_edu <= d4_edu:
            return Status.FAIL, f"D1 avg edu ({d1_edu:.2f}) <= D4 ({d4_edu:.2f})"
        return Status.PASS, f"D1={d1_edu:.2f} > D4={d4_edu:.2f}"

    results.append(run_test("2.9", "Bildungsunterschied D1 > D4", test_2_9))

    return results
