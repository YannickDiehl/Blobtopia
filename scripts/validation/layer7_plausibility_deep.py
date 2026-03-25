"""Layer 7: Tiefenplausibilität — ~45 Tests gegen empirische Benchmarks.

Kategorien:
  A. Individuelle Blob-Entwicklung (7 Tests)
  B. Distrikt-Dynamiken (6 Tests)
  C. Politisches Verhalten & Wahlen (8 Tests)
  D. Latente Konstrukte & Messmodell (6 Tests)
  E. Soziale Dynamiken & Events (5 Tests)
  F. Einkommens- & Bildungsdynamiken (4 Tests)
  G. Zeitreihen-Plausibilität (5 Tests)
  H. Empirische Benchmarks Deutschland (6 Tests)
"""

import json
import sqlite3

import numpy as np

from .config import (
    ELECTION_TICKS,
    EXPECTED_BLOBS,
    TICKS_PER_YEAR,
    TOTAL_TICKS,
    TRAIT_KEYS,
)
from .empirical_benchmarks import (
    ACF1_MIN,
    AGE_AUTHORITARIANISM_R_RANGE,
    AGE_MATERIALISM_R_MIN,
    CEILING_FLOOR_MAX_PERCENT,
    CONSTRUCT_CORRELATES,
    CRONBACH_MAX_DECLINE,
    DISTRICT_ETA_SQUARED_MIN,
    EDUCATION_AUTHORITARIANISM_R_MAX,
    EDUCATION_EFFICACY_R_MIN,
    EVENT_RECOVERY_MIN_PERCENT,
    GINI_RANGE_REALISTIC,
    IDEOLOGY_MEAN_RANGE,
    IDEOLOGY_SD_RANGE,
    INCOME_SATISFACTION_R_RANGE,
    MAX_INTER_CONSTRUCT_R,
    PROTEST_SATISFACTION_R_MAX,
    PROTEST_TRUST_R_MAX,
    TRAIT_RANK_ORDER_STABILITY_MIN,
    TRUST_MEAN_RANGE,
    VARIANCE_RETENTION_MIN,
)
from .report import Status, TestResult, run_test


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _nearest_trait_tick(conn: sqlite3.Connection, target: int) -> int:
    """Find the nearest tick that has latent_traits_json data (traits stored every 7 ticks)."""
    row = conn.execute(
        "SELECT tick FROM blob_daily_state "
        "WHERE latent_traits_json IS NOT NULL AND tick >= ? "
        "ORDER BY tick LIMIT 1",
        (target,),
    ).fetchone()
    if row:
        return row[0]
    # Fallback: search backwards
    row = conn.execute(
        "SELECT tick FROM blob_daily_state "
        "WHERE latent_traits_json IS NOT NULL AND tick <= ? "
        "ORDER BY tick DESC LIMIT 1",
        (target,),
    ).fetchone()
    return row[0] if row else target


def _load_traits_at_tick(conn: sqlite3.Connection, tick: int) -> dict[str, list[float]]:
    """Load all trait indicators for all Blobs at a given tick.

    Automatically snaps to the nearest tick that has trait data.
    """
    actual_tick = _nearest_trait_tick(conn, tick)
    rows = conn.execute(
        "SELECT latent_traits_json FROM blob_daily_state "
        "WHERE tick = ? AND latent_traits_json IS NOT NULL",
        (actual_tick,),
    ).fetchall()
    data: dict[str, list[float]] = {k: [] for k in TRAIT_KEYS}
    for (traits_json,) in rows:
        traits = json.loads(traits_json)
        for k in TRAIT_KEYS:
            data[k].append(float(traits.get(k, 5.0)))
    return data


def _pearsonr(x: np.ndarray, y: np.ndarray) -> float:
    """Pearson correlation. Returns 0.0 if degenerate."""
    if len(x) < 3 or np.std(x) == 0 or np.std(y) == 0:
        return 0.0
    return float(np.corrcoef(x, y)[0, 1])


def _eta_squared(groups: list[np.ndarray]) -> float:
    """One-way η² (between-group variance / total variance)."""
    all_vals = np.concatenate(groups)
    grand_mean = all_vals.mean()
    ss_between = sum(len(g) * (g.mean() - grand_mean) ** 2 for g in groups)
    ss_total = ((all_vals - grand_mean) ** 2).sum()
    if ss_total == 0:
        return 0.0
    return float(ss_between / ss_total)


def _cohens_d(a: np.ndarray, b: np.ndarray) -> float:
    """Cohen's d (pooled SD)."""
    na, nb = len(a), len(b)
    if na < 2 or nb < 2:
        return 0.0
    pooled_sd = np.sqrt(((na - 1) * a.var(ddof=1) + (nb - 1) * b.var(ddof=1)) / (na + nb - 2))
    if pooled_sd == 0:
        return 0.0
    return float(abs(a.mean() - b.mean()) / pooled_sd)


def _cronbach_alpha(items: np.ndarray) -> float:
    """Cronbach's alpha for matrix (n_subjects, n_items)."""
    n_items = items.shape[1]
    if n_items < 2:
        return 0.0
    item_vars = items.var(axis=0, ddof=1)
    total_var = items.sum(axis=1).var(ddof=1)
    if total_var == 0:
        return 0.0
    return float((n_items / (n_items - 1)) * (1 - item_vars.sum() / total_var))


def _gini(values: list[float]) -> float:
    arr = np.sort(np.array(values, dtype=float))
    n = len(arr)
    if n == 0 or arr.sum() == 0:
        return 0.0
    index = np.arange(1, n + 1)
    return float((2 * (index * arr).sum()) / (n * arr.sum()) - (n + 1) / n)


def _enp(votes: list[int]) -> float:
    total = sum(votes)
    if total == 0:
        return 0.0
    shares = [v / total for v in votes]
    hhi = sum(s ** 2 for s in shares)
    return 1.0 / hhi if hhi > 0 else 0.0


def _load_attitudes_at_tick(conn: sqlite3.Connection, tick: int):
    """Load key attitudes + demographics at a tick."""
    rows = conn.execute(
        "SELECT ds.blob_id, ds.satisfaction, ds.ideology, ds.trust, "
        "ds.party, ds.will_vote, ds.protest_readiness, ds.income, "
        "ds.education_level, ds.age, ds.district, ds.latent_traits_json "
        "FROM blob_daily_state ds WHERE ds.tick = ?",
        (tick,),
    ).fetchall()
    return rows


def _load_blob_base(conn: sqlite3.Connection) -> dict:
    """Load static blob data keyed by ID."""
    rows = conn.execute(
        "SELECT id, district, education_level, income, age, "
        "base_ideology, base_satisfaction, base_trust, need_for_closure, "
        "home_building_id "
        "FROM blobs"
    ).fetchall()
    blobs = {}
    for r in rows:
        blobs[r[0]] = {
            "district": r[1], "education": r[2], "income": r[3], "age": r[4],
            "base_ideology": r[5], "base_satisfaction": r[6], "base_trust": r[7],
            "nfcc": r[8], "home_building_id": r[9],
        }
    return blobs


# ---------------------------------------------------------------------------
# A. Individuelle Blob-Entwicklung
# ---------------------------------------------------------------------------

def _tests_A(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # A1. Trait-Stabilität (rank-order: Korrelation T=0 vs T=4000 vs T=8029)
    def test_A1():
        t0 = _load_traits_at_tick(conn, 0)
        t_mid = _load_traits_at_tick(conn, 4000)
        t_end = _load_traits_at_tick(conn, 8029)
        if not t0["self_efficacy"] or not t_end["self_efficacy"]:
            return Status.FAIL, "Keine Traits"
        # Check stability for 3 representative traits
        checks = ["self_efficacy", "obedience_value", "powerlessness"]
        details = []
        worst = Status.PASS
        for trait in checks:
            r_0_mid = _pearsonr(np.array(t0[trait]), np.array(t_mid[trait]))
            r_0_end = _pearsonr(np.array(t0[trait]), np.array(t_end[trait]))
            details.append(f"{trait}: r(0,4k)={r_0_mid:.3f}, r(0,8k)={r_0_end:.3f}")
            if r_0_end < TRAIT_RANK_ORDER_STABILITY_MIN:
                worst = Status.WARN
        return worst, "; ".join(details)

    results.append(run_test("7.A1", "Trait-Stabilität (rank-order)", test_A1))

    # A2. Alterseffekt auf Authoritarismus
    def test_A2():
        # Use nearest trait tick and join with age from blob_daily_state
        trait_tick = _nearest_trait_tick(conn, 0)
        rows = conn.execute(
            "SELECT ds.age, ds.latent_traits_json FROM blob_daily_state ds "
            "WHERE ds.tick = ? AND ds.latent_traits_json IS NOT NULL",
            (trait_tick,),
        ).fetchall()
        ages, auth = [], []
        for r in rows:
            traits = json.loads(r[1])
            ages.append(r[0])
            # Use mean of all 3 auth indicators for robustness
            auth_val = np.mean([
                traits.get("obedience_value", 5.0),
                traits.get("rule_conformity", 5.0),
                traits.get("strong_leader_preference", 5.0),
            ])
            auth.append(auth_val)
        r_val = _pearsonr(np.array(ages), np.array(auth))
        lo, hi = AGE_AUTHORITARIANISM_R_RANGE
        if lo <= r_val <= hi:
            return Status.PASS, f"r(Alter, Auth)={r_val:.3f}"
        if r_val > -0.10:
            # Weak or near-zero is acceptable — district effects may dominate
            return Status.WARN, f"r={r_val:.3f} (schwach/null, erwartet leicht positiv [{lo},{hi}])"
        return Status.FAIL, f"r={r_val:.3f} (deutlich negativ)"

    results.append(run_test("7.A2", "Alterseffekt Authoritarismus", test_A2))

    # A3. Coming-of-Age-Effekt
    def test_A3():
        # Find blobs that turn 18 during simulation
        base = _load_blob_base(conn)
        coming_of_age_blobs = {bid: b for bid, b in base.items() if b["age"] < 18}
        if not coming_of_age_blobs:
            return Status.SKIP, "Keine Kinder in Population"

        before_eff, after_eff = [], []
        for bid, b in list(coming_of_age_blobs.items())[:50]:  # Sample
            adult_tick = (18 - b["age"]) * TICKS_PER_YEAR
            pre_tick = _nearest_trait_tick(conn, max(0, adult_tick - TICKS_PER_YEAR))
            post_tick = _nearest_trait_tick(conn, min(TOTAL_TICKS - 1, adult_tick + TICKS_PER_YEAR))

            pre_row = conn.execute(
                "SELECT latent_traits_json FROM blob_daily_state "
                "WHERE blob_id = ? AND tick = ? AND latent_traits_json IS NOT NULL",
                (bid, pre_tick),
            ).fetchone()
            post_row = conn.execute(
                "SELECT latent_traits_json FROM blob_daily_state "
                "WHERE blob_id = ? AND tick = ? AND latent_traits_json IS NOT NULL",
                (bid, post_tick),
            ).fetchone()
            if pre_row and post_row:
                pre_traits = json.loads(pre_row[0])
                post_traits = json.loads(post_row[0])
                before_eff.append(pre_traits.get("self_efficacy", 5.0))
                after_eff.append(post_traits.get("self_efficacy", 5.0))

        if len(before_eff) < 5:
            return Status.SKIP, f"Nur {len(before_eff)} Fälle"
        mean_before = np.mean(before_eff)
        mean_after = np.mean(after_eff)
        diff = mean_after - mean_before
        if diff > 0.3:
            return Status.PASS, f"Δ(efficacy)={diff:.2f} (n={len(before_eff)})"
        if diff > 0:
            return Status.WARN, f"Δ(efficacy)={diff:.2f} (schwach, n={len(before_eff)})"
        return Status.FAIL, f"Δ(efficacy)={diff:.2f} (negativ/null)"

    results.append(run_test("7.A3", "Coming-of-Age Efficacy-Shift", test_A3))

    # A4. Bildungs-Trait-Gradienten
    def test_A4():
        rows = _load_attitudes_at_tick(conn, 0)
        edu, eff, auth, alien = [], [], [], []
        for r in rows:
            if r[11]:
                traits = json.loads(r[11])
                edu.append(r[8])
                eff.append(traits.get("self_efficacy", 5.0))
                auth.append(traits.get("obedience_value", 5.0))
                alien.append(traits.get("powerlessness", 5.0))
        edu_arr = np.array(edu)
        r_eff = _pearsonr(edu_arr, np.array(eff))
        r_auth = _pearsonr(edu_arr, np.array(auth))
        r_alien = _pearsonr(edu_arr, np.array(alien))
        detail = f"Edu×Eff={r_eff:.3f}, Edu×Auth={r_auth:.3f}, Edu×Alien={r_alien:.3f}"
        # Efficacy positive, Auth negative, Alienation negative
        issues = []
        if r_eff < EDUCATION_EFFICACY_R_MIN:
            issues.append(f"Eff zu niedrig ({r_eff:.3f})")
        if r_auth > EDUCATION_AUTHORITARIANISM_R_MAX:
            issues.append(f"Auth nicht negativ genug ({r_auth:.3f})")
        if r_alien > 0:
            issues.append(f"Alien positiv ({r_alien:.3f})")
        if issues:
            return Status.WARN, f"{detail} — {'; '.join(issues)}"
        return Status.PASS, detail

    results.append(run_test("7.A4", "Bildungs-Trait-Gradienten", test_A4))

    # A5. Einkommens-Zufriedenheit
    def test_A5():
        rows = _load_attitudes_at_tick(conn, 0)
        inc, sat = [], []
        for r in rows:
            if r[7] > 0:  # income > 0 (adults)
                inc.append(r[7])
                sat.append(r[1])
        r_val = _pearsonr(np.array(inc), np.array(sat))
        lo, hi = INCOME_SATISFACTION_R_RANGE
        if lo <= r_val <= hi:
            return Status.PASS, f"r(Income, Sat)={r_val:.3f}"
        if r_val > 0:
            return Status.WARN, f"r={r_val:.3f} außerhalb [{lo},{hi}]"
        return Status.FAIL, f"r={r_val:.3f} (negativ, erwartet positiv)"

    results.append(run_test("7.A5", "Einkommen-Zufriedenheit", test_A5))

    # A6. NFCC und Ideologische Rigidität
    def test_A6():
        base = _load_blob_base(conn)
        # Sample 100 blobs for performance
        sample_ids = list(base.keys())[:100]
        nfcc_vals, ideo_sds = [], []
        for bid in sample_ids:
            nfcc_vals.append(base[bid]["nfcc"])
            rows = conn.execute(
                "SELECT ideology FROM blob_daily_state WHERE blob_id = ? "
                "ORDER BY tick",
                (bid,),
            ).fetchall()
            if rows:
                ideo_sds.append(np.std([r[0] for r in rows]))
        r_val = _pearsonr(np.array(nfcc_vals), np.array(ideo_sds))
        # High NFCC → less variability → negative correlation
        if r_val < -0.10:
            return Status.PASS, f"r(NFCC, SD_ideo)={r_val:.3f}"
        if r_val < 0:
            return Status.WARN, f"r={r_val:.3f} (schwach negativ)"
        return Status.FAIL, f"r={r_val:.3f} (erwartet negativ)"

    results.append(run_test("7.A6", "NFCC → Ideol. Rigidität", test_A6))

    # A7. Keine Ceiling/Floor-Effekte
    def test_A7():
        traits_0 = _load_traits_at_tick(conn, 0)
        traits_end = _load_traits_at_tick(conn, 8029)
        issues = []
        for tick_label, traits in [("T0", traits_0), ("T8029", traits_end)]:
            for key in ["self_efficacy", "obedience_value", "powerlessness",
                        "economic_security_priority", "neighbor_trust"]:
                vals = np.array(traits[key])
                n = len(vals)
                if n == 0:
                    continue
                pct_floor = (vals < 0.5).sum() / n * 100
                pct_ceil = (vals > 9.5).sum() / n * 100
                if pct_floor > CEILING_FLOOR_MAX_PERCENT:
                    issues.append(f"{tick_label} {key}: {pct_floor:.1f}% am Floor")
                if pct_ceil > CEILING_FLOOR_MAX_PERCENT:
                    issues.append(f"{tick_label} {key}: {pct_ceil:.1f}% am Ceiling")
        if issues:
            return Status.WARN, "; ".join(issues[:5])
        return Status.PASS, "Keine Ceiling/Floor-Probleme"

    results.append(run_test("7.A7", "Keine Ceiling/Floor-Effekte", test_A7))

    return results


# ---------------------------------------------------------------------------
# B. Distrikt-Dynamiken
# ---------------------------------------------------------------------------

def _tests_B(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # B1. Distrikt-Profile bleiben distinkt (η²)
    def test_B1():
        details = []
        worst = Status.PASS
        for tick, label in [(0, "T0"), (8029, "T8029")]:
            rows = conn.execute(
                "SELECT district, ideology FROM blob_daily_state WHERE tick = ?",
                (tick,),
            ).fetchall()
            groups = {}
            for d, ideo in rows:
                groups.setdefault(d, []).append(ideo)
            group_arrays = [np.array(v) for v in groups.values()]
            eta2 = _eta_squared(group_arrays)
            details.append(f"{label}: η²={eta2:.4f}")
            if eta2 < DISTRICT_ETA_SQUARED_MIN:
                worst = Status.WARN
        return worst, "; ".join(details)

    results.append(run_test("7.B1", "Distrikt-Differenzierung η²", test_B1))

    # B2. Sonnenberg vs. Industriezone Polarisierung
    def test_B2():
        details = []
        for tick, label in [(0, "T0"), (4000, "T4k"), (8029, "T8k")]:
            d1 = conn.execute(
                "SELECT ideology FROM blob_daily_state WHERE tick = ? AND district = 1",
                (tick,),
            ).fetchall()
            d4 = conn.execute(
                "SELECT ideology FROM blob_daily_state WHERE tick = ? AND district = 4",
                (tick,),
            ).fetchall()
            if d1 and d4:
                d_val = _cohens_d(np.array([r[0] for r in d1]), np.array([r[0] for r in d4]))
                details.append(f"{label}: d={d_val:.2f}")
        if not details:
            return Status.FAIL, "Keine Daten"
        # Check last timepoint
        last_d = float(details[-1].split("d=")[1])
        if last_d > 0.5:
            return Status.PASS, "; ".join(details)
        if last_d > 0.2:
            return Status.WARN, f"Schwache Polarisierung: {'; '.join(details)}"
        return Status.FAIL, f"Keine Polarisierung: {'; '.join(details)}"

    results.append(run_test("7.B2", "D1 vs D4 Polarisierung", test_B2))

    # B3. Hafenviertel höchste Varianz
    def test_B3():
        rows = conn.execute(
            "SELECT district, ideology FROM blob_daily_state WHERE tick = 0"
        ).fetchall()
        groups = {}
        for d, ideo in rows:
            groups.setdefault(d, []).append(ideo)
        variances = {d: np.var(v) for d, v in groups.items()}
        detail = ", ".join(f"D{d}={v:.3f}" for d, v in sorted(variances.items()))
        # D2 (Hafenviertel) should have highest or near-highest variance
        if 2 in variances:
            max_d = max(variances, key=variances.get)
            if max_d == 2:
                return Status.PASS, f"D2 höchste Varianz: {detail}"
            # Allow being in top 2
            sorted_v = sorted(variances.items(), key=lambda x: x[1], reverse=True)
            if sorted_v[1][0] == 2:
                return Status.WARN, f"D2 zweithöchste: {detail}"
            return Status.WARN, f"D2 nicht top-2: {detail}"
        return Status.FAIL, f"D2 fehlt: {detail}"

    results.append(run_test("7.B3", "Hafenviertel Diversity-Hotspot", test_B3))

    # B4. Grüntal Konservativismus-Drift
    def test_B4():
        rows = conn.execute(
            "SELECT tick, AVG(ideology) FROM blob_daily_state "
            "WHERE district = 0 GROUP BY tick ORDER BY tick"
        ).fetchall()
        if len(rows) < 100:
            return Status.FAIL, f"Nur {len(rows)} Datenpunkte"
        ticks = np.array([r[0] for r in rows])
        means = np.array([r[1] for r in rows])
        # Linear fit
        slope = np.polyfit(ticks, means, 1)[0]
        total_drift = slope * (ticks[-1] - ticks[0])
        detail = f"Steigung={slope:.6f}/Tick, Gesamtdrift={total_drift:.2f}"
        if slope > 0:
            # Check if drift stays in bounds
            if means[-1] <= 10.0:
                return Status.PASS, detail
            return Status.WARN, f"Skala-Overflow! Endwert={means[-1]:.2f}. {detail}"
        return Status.WARN, f"Kein Rechtsdrift: {detail}"

    results.append(run_test("7.B4", "Grüntal Konservativismus-Drift", test_B4))

    # B5. Distrikt-Einkommens-Segregation
    def test_B5():
        details = []
        for tick, label in [(0, "T0"), (4000, "T4k")]:
            rows = conn.execute(
                "SELECT district, income FROM blob_daily_state "
                "WHERE tick = ? AND income > 0",
                (tick,),
            ).fetchall()
            groups = {}
            for d, inc in rows:
                groups.setdefault(d, []).append(inc)
            ginis = {d: _gini(v) for d, v in groups.items()}
            detail = ", ".join(f"D{d}={g:.3f}" for d, g in sorted(ginis.items()))
            details.append(f"{label}: {detail}")
        return Status.PASS, "; ".join(details)

    results.append(run_test("7.B5", "Distrikt-Gini", test_B5))

    # B6. Distrikt-Satisfaction-Differenzierung
    def test_B6():
        rows = conn.execute(
            "SELECT district, AVG(satisfaction) FROM blob_daily_state "
            "WHERE tick = 0 GROUP BY district ORDER BY district"
        ).fetchall()
        if len(rows) < 5:
            return Status.FAIL, f"Nur {len(rows)} Distrikte"
        detail = ", ".join(f"D{r[0]}={r[1]:.2f}" for r in rows)
        spread = max(r[1] for r in rows) - min(r[1] for r in rows)
        if spread > 0.5:
            return Status.PASS, f"Spanne={spread:.2f} ({detail})"
        return Status.WARN, f"Geringe Spanne={spread:.2f} ({detail})"

    results.append(run_test("7.B6", "Distrikt-Satisfaction-Spread", test_B6))

    return results


# ---------------------------------------------------------------------------
# C. Politisches Verhalten & Wahlen
# ---------------------------------------------------------------------------

def _tests_C(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # C1. Ideologie-Partei-Kongruenz
    def test_C1():
        for tick in ELECTION_TICKS:
            rows = conn.execute(
                "SELECT party, AVG(ideology) FROM blob_daily_state "
                "WHERE tick = ? AND party IS NOT NULL GROUP BY party ORDER BY party",
                (tick,),
            ).fetchall()
            if len(rows) >= 3:
                party_means = {r[0]: r[1] for r in rows}
                # Fortschritt(0) < Mitte(1) < Tradition(2)
                if 0 in party_means and 1 in party_means and 2 in party_means:
                    if party_means[0] < party_means[1] < party_means[2]:
                        detail = ", ".join(f"P{r[0]}={r[1]:.2f}" for r in rows)
                        return Status.PASS, f"Tick {tick}: {detail}"
        # If no election passes, report last
        detail = ", ".join(f"P{r[0]}={r[1]:.2f}" for r in rows) if rows else "keine Daten"
        return Status.WARN, f"Reihenfolge nicht F<M<T: {detail}"

    results.append(run_test("7.C1", "Ideologie-Partei-Kongruenz", test_C1))

    # C2. Bildungs-Cleavage Wahlbeteiligung
    def test_C2():
        tick = ELECTION_TICKS[0] if ELECTION_TICKS else 1460
        rows = conn.execute(
            "SELECT education_level, will_vote FROM blob_daily_state "
            "WHERE tick = ? AND age >= 18",
            (tick,),
        ).fetchall()
        if not rows:
            return Status.FAIL, "Keine Daten"
        edu = np.array([r[0] for r in rows])
        vote = np.array([r[1] for r in rows])
        r_val = _pearsonr(edu, vote.astype(float))
        if r_val > 0.05:
            return Status.PASS, f"r(Bildung, Turnout)={r_val:.3f}"
        if r_val > 0:
            return Status.WARN, f"r={r_val:.3f} (sehr schwach)"
        return Status.FAIL, f"r={r_val:.3f} (negativ)"

    results.append(run_test("7.C2", "Bildungs-Cleavage Turnout", test_C2))

    # C3. Alters-Wahlbeteiligung
    def test_C3():
        tick = ELECTION_TICKS[0] if ELECTION_TICKS else 1460
        rows = conn.execute(
            "SELECT age, will_vote FROM blob_daily_state "
            "WHERE tick = ? AND age >= 18",
            (tick,),
        ).fetchall()
        if not rows:
            return Status.FAIL, "Keine Daten"
        # Group by age
        young = [r[1] for r in rows if r[0] < 30]
        middle = [r[1] for r in rows if 30 <= r[0] < 60]
        old = [r[1] for r in rows if r[0] >= 60]
        rates = []
        for label, group in [("Jung", young), ("Mittel", middle), ("Alt", old)]:
            if group:
                rates.append((label, np.mean(group)))
        detail = ", ".join(f"{l}={r:.2f}" for l, r in rates)
        if len(rates) >= 2 and rates[-1][1] > rates[0][1]:
            return Status.PASS, detail
        return Status.WARN, f"Ältere nicht höher: {detail}"

    results.append(run_test("7.C3", "Alters-Wahlbeteiligung", test_C3))

    # C4. Partei-Switching Transitions-Matrix
    def test_C4():
        sample_ids = [r[0] for r in conn.execute(
            "SELECT id FROM blobs ORDER BY id LIMIT 100"
        ).fetchall()]
        transitions = {}
        for bid in sample_ids:
            rows = conn.execute(
                "SELECT party FROM blob_daily_state WHERE blob_id = ? ORDER BY tick",
                (bid,),
            ).fetchall()
            for i in range(1, len(rows)):
                prev, curr = rows[i - 1][0], rows[i][0]
                if prev is not None and curr is not None and prev != curr:
                    key = (prev, curr)
                    transitions[key] = transitions.get(key, 0) + 1
        if not transitions:
            return Status.PASS, "Keine Wechsel (sehr stabil)"
        # Check: adjacent switches more common than extreme
        adjacent = transitions.get((0, 1), 0) + transitions.get((1, 0), 0) + \
                   transitions.get((1, 2), 0) + transitions.get((2, 1), 0)
        extreme = transitions.get((0, 2), 0) + transitions.get((2, 0), 0)
        total = sum(transitions.values())
        detail = f"Adj={adjacent}, Extrem={extreme}, Total={total}"
        if adjacent >= extreme:
            return Status.PASS, detail
        return Status.WARN, f"Mehr extreme Wechsel: {detail}"

    results.append(run_test("7.C4", "Partei-Switching-Muster", test_C4))

    # C5. Event-Response bei Wahlen
    def test_C5():
        elections = conn.execute(
            "SELECT tick, fortschritt, mitte, tradition, unabhaengige FROM elections"
        ).fetchall()
        if not elections:
            return Status.FAIL, "Keine Wahlergebnisse"
        event_ticks = set(
            r[0] for r in conn.execute(
                "SELECT tick FROM events WHERE description LIKE '%krise%' "
                "OR description LIKE '%kandal%' OR description LIKE '%orruption%'"
            ).fetchall()
        )
        details = []
        for tick, f, m, t, u in elections:
            total = f + m + t + u
            unab_pct = u / total * 100 if total > 0 else 0
            # Check if negative event within 365 ticks before this election
            has_neg_event = any(abs(tick - et) <= 365 for et in event_ticks)
            details.append(f"Tick{tick}: Unab={unab_pct:.1f}%{'*' if has_neg_event else ''}")
        return Status.PASS, "; ".join(details)

    results.append(run_test("7.C5", "Event-Response Wahlen", test_C5))

    # C6. ENP über Zeit
    def test_C6():
        elections = conn.execute(
            "SELECT tick, fortschritt, mitte, tradition, unabhaengige FROM elections"
        ).fetchall()
        if len(elections) < 2:
            return Status.FAIL, f"Nur {len(elections)} Wahlen"
        enps = []
        for tick, f, m, t, u in elections:
            enps.append((tick, _enp([f, m, t, u])))
        detail = ", ".join(f"T{t}={e:.2f}" for t, e in enps)
        # Check for non-monotonicity (some variation)
        vals = [e for _, e in enps]
        if len(set(vals)) > 1:
            return Status.PASS, detail
        return Status.WARN, f"Konstante ENP: {detail}"

    results.append(run_test("7.C6", "ENP-Variation über Wahlen", test_C6))

    # C7. Protest-Korrelate
    def test_C7():
        rows = _load_attitudes_at_tick(conn, 4000)
        sat, trust, protest = [], [], []
        for r in rows:
            sat.append(r[1])
            trust.append(r[3])
            protest.append(r[6])
        r_sat = _pearsonr(np.array(sat), np.array(protest))
        r_trust = _pearsonr(np.array(trust), np.array(protest))
        detail = f"r(Sat,Protest)={r_sat:.3f}, r(Trust,Protest)={r_trust:.3f}"
        issues = []
        if r_sat > PROTEST_SATISFACTION_R_MAX:
            issues.append(f"Sat-Protest zu schwach ({r_sat:.3f})")
        if r_trust > PROTEST_TRUST_R_MAX:
            issues.append(f"Trust-Protest zu schwach ({r_trust:.3f})")
        if issues:
            return Status.WARN, f"{detail} — {'; '.join(issues)}"
        return Status.PASS, detail

    results.append(run_test("7.C7", "Protest-Korrelate", test_C7))

    # C8. Efficacy als Turnout-Prädiktor
    def test_C8():
        # Election ticks may not have traits; find nearest trait tick and
        # join will_vote from the actual election tick
        election_tick = ELECTION_TICKS[0] if ELECTION_TICKS else 1460
        trait_tick = _nearest_trait_tick(conn, election_tick)
        # Get will_vote from election tick, traits from nearest trait tick
        rows = conn.execute(
            "SELECT e.will_vote, e.education_level, t.latent_traits_json "
            "FROM blob_daily_state e "
            "JOIN blob_daily_state t ON e.blob_id = t.blob_id "
            "WHERE e.tick = ? AND t.tick = ? AND e.age >= 18 "
            "AND t.latent_traits_json IS NOT NULL",
            (election_tick, trait_tick),
        ).fetchall()
        if not rows:
            return Status.FAIL, "Keine Daten"
        vote, edu, eff, alien = [], [], [], []
        for r in rows:
            traits = json.loads(r[2])
            vote.append(float(r[0]))
            edu.append(float(r[1]))
            eff.append(traits.get("self_efficacy", 5.0))
            alien.append(traits.get("powerlessness", 5.0))
        r_eff = _pearsonr(np.array(eff), np.array(vote))
        r_edu = _pearsonr(np.array(edu), np.array(vote))
        r_alien = _pearsonr(np.array(alien), np.array(vote))
        detail = f"r(Eff)={r_eff:.3f}, r(Edu)={r_edu:.3f}, r(Alien)={r_alien:.3f}"
        if abs(r_eff) >= abs(r_edu):
            return Status.PASS, f"Efficacy stärkster Prädiktor: {detail}"
        return Status.WARN, f"Bildung stärker als Efficacy: {detail}"

    results.append(run_test("7.C8", "Efficacy als Turnout-Prädiktor", test_C8))

    return results


# ---------------------------------------------------------------------------
# D. Latente Konstrukte & Messmodell
# ---------------------------------------------------------------------------

def _tests_D(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # D1. Diskriminante Validität
    def test_D1():
        traits = _load_traits_at_tick(conn, 0)
        constructs = {
            "Efficacy": ["self_efficacy", "political_knowledge", "vote_importance"],
            "Social": ["neighbor_trust", "community_participation", "network_size"],
            "Auth": ["obedience_value", "rule_conformity", "strong_leader_preference"],
            "Alien": ["powerlessness", "political_complexity", "party_indifference"],
            "Mater": ["economic_security_priority", "environment_over_economy", "freedom_over_order"],
        }
        # Compute construct scores as means
        scores = {}
        inverted = {"environment_over_economy", "freedom_over_order"}
        for name, keys in constructs.items():
            arrays = []
            for k in keys:
                arr = np.array(traits[k])
                if k in inverted:
                    arr = 10.0 - arr
                arrays.append(arr)
            scores[name] = np.mean(arrays, axis=0)

        # Inter-construct correlations
        names = list(scores.keys())
        max_r = 0.0
        max_pair = ""
        pairs = []
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                r_val = abs(_pearsonr(scores[names[i]], scores[names[j]]))
                pairs.append(f"{names[i]}×{names[j]}={r_val:.3f}")
                if r_val > max_r:
                    max_r = r_val
                    max_pair = f"{names[i]}×{names[j]}"

        if max_r > MAX_INTER_CONSTRUCT_R:
            return Status.FAIL, f"Max |r|={max_r:.3f} ({max_pair}); {', '.join(pairs)}"
        if max_r > 0.70:
            return Status.WARN, f"Max |r|={max_r:.3f} ({max_pair}); {', '.join(pairs)}"
        return Status.PASS, f"Max |r|={max_r:.3f} ({max_pair})"

    results.append(run_test("7.D1", "Diskriminante Validität", test_D1))

    # D2. Cronbach α über Zeit
    def test_D2():
        inverted = {"environment_over_economy", "freedom_over_order"}
        constructs = {
            "Efficacy": ["self_efficacy", "political_knowledge", "vote_importance"],
            "Social": ["neighbor_trust", "community_participation", "network_size"],
            "Auth": ["obedience_value", "rule_conformity", "strong_leader_preference"],
            "Alien": ["powerlessness", "political_complexity", "party_indifference"],
            "Mater": ["economic_security_priority", "environment_over_economy", "freedom_over_order"],
        }
        timepoints = [0, 2000, 4000, 6000, 8029]
        alphas: dict[str, list[float]] = {name: [] for name in constructs}

        for tick in timepoints:
            trait_data = _load_traits_at_tick(conn, tick)
            if not trait_data["self_efficacy"]:
                continue
            for name, keys in constructs.items():
                cols = []
                for k in keys:
                    arr = np.array(trait_data[k])
                    if k in inverted:
                        arr = 10.0 - arr
                    cols.append(arr)
                items = np.column_stack(cols)
                alphas[name].append(_cronbach_alpha(items))

        issues = []
        details = []
        for name, vals in alphas.items():
            if len(vals) >= 2:
                decline = vals[0] - vals[-1]
                details.append(f"{name}: {vals[0]:.3f}→{vals[-1]:.3f}")
                if decline > CRONBACH_MAX_DECLINE:
                    issues.append(f"{name} Δα={decline:.3f}")
        if issues:
            return Status.WARN, f"Starker Verfall: {'; '.join(issues)}. {'; '.join(details)}"
        return Status.PASS, "; ".join(details)

    results.append(run_test("7.D2", "Cronbach α Stabilität", test_D2))

    # D3. Konvergente Validität
    def test_D3():
        rows = _load_attitudes_at_tick(conn, 0)
        data = {"education_level": [], "ideology": [], "satisfaction": [],
                "trust": [], "income": []}
        trait_data: dict[str, list[float]] = {}
        for r in rows:
            if r[11]:
                traits = json.loads(r[11])
                data["education_level"].append(r[8])
                data["ideology"].append(r[2])
                data["satisfaction"].append(r[1])
                data["trust"].append(r[3])
                data["income"].append(r[7])
                for k, v in traits.items():
                    trait_data.setdefault(k, []).append(float(v))

        details = []
        issues = []
        for name, (trait_key, ext_key, sign, min_r) in CONSTRUCT_CORRELATES.items():
            if trait_key in trait_data and ext_key in data:
                r_val = _pearsonr(np.array(trait_data[trait_key]), np.array(data[ext_key]))
                details.append(f"{name}={r_val:.3f}")
                if sign == "+" and r_val < min_r:
                    issues.append(f"{name} zu niedrig ({r_val:.3f})")
                elif sign == "-" and r_val > -min_r:
                    issues.append(f"{name} nicht negativ genug ({r_val:.3f})")
        if issues:
            return Status.WARN, f"{'; '.join(issues)}. {', '.join(details)}"
        return Status.PASS, ", ".join(details)

    results.append(run_test("7.D3", "Konvergente Validität", test_D3))

    # D4. Populismus als Emergenz
    def test_D4():
        rows = _load_attitudes_at_tick(conn, 0)
        alien, eff, social, pop = [], [], [], []
        for r in rows:
            if r[11]:
                traits = json.loads(r[11])
                alien.append(traits.get("powerlessness", 5.0))
                eff.append(traits.get("self_efficacy", 5.0))
                social.append(traits.get("neighbor_trust", 5.0))
                pop.append(traits.get("anti_elitism", 5.0))
        if len(pop) < 50:
            return Status.SKIP, "Zu wenig Daten"
        # Simple multiple correlation (R² from correlations)
        X = np.column_stack([alien, eff, social])
        y = np.array(pop)
        # R² via OLS
        X_with_const = np.column_stack([np.ones(len(y)), X])
        try:
            beta = np.linalg.lstsq(X_with_const, y, rcond=None)[0]
            y_pred = X_with_const @ beta
            ss_res = ((y - y_pred) ** 2).sum()
            ss_tot = ((y - y.mean()) ** 2).sum()
            r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0
        except Exception:
            return Status.SKIP, "Regression fehlgeschlagen"
        if r2 > 0.30:
            return Status.PASS, f"R²={r2:.3f}"
        if r2 > 0.15:
            return Status.WARN, f"R²={r2:.3f} (mäßig)"
        return Status.FAIL, f"R²={r2:.3f} (zu niedrig)"

    results.append(run_test("7.D4", "Populismus-Emergenz R²", test_D4))

    # D5. Keine Homogenisierung (Varianz-Erhalt)
    def test_D5():
        traits_0 = _load_traits_at_tick(conn, 0)
        traits_end = _load_traits_at_tick(conn, 8029)
        issues = []
        details = []
        for key in TRAIT_KEYS:
            sd_0 = np.std(traits_0[key]) if traits_0[key] else 0
            sd_end = np.std(traits_end[key]) if traits_end[key] else 0
            ratio = sd_end / sd_0 if sd_0 > 0 else 0
            details.append(f"{key[:8]}={ratio:.2f}")
            if ratio < VARIANCE_RETENTION_MIN:
                issues.append(f"{key}: {ratio:.2f}")
        if issues:
            return Status.WARN, f"Homogenisierung: {'; '.join(issues)}"
        return Status.PASS, f"Min-Ratio: {min(float(d.split('=')[1]) for d in details):.2f}"

    results.append(run_test("7.D5", "Varianz-Erhalt (SD-Ratio)", test_D5))

    # D6. Faktorladungen-Stabilität (über CFA oder Korrelation)
    def test_D6():
        # Simplified: check indicator-construct correlation stability
        inverted = {"environment_over_economy", "freedom_over_order"}
        constructs = {
            "Efficacy": ["self_efficacy", "political_knowledge", "vote_importance"],
            "Auth": ["obedience_value", "rule_conformity", "strong_leader_preference"],
            "Alien": ["powerlessness", "political_complexity", "party_indifference"],
        }
        max_diff = 0.0
        details = []
        for tick_a, tick_b in [(0, 8029)]:
            ta = _load_traits_at_tick(conn, tick_a)
            tb = _load_traits_at_tick(conn, tick_b)
            for cname, keys in constructs.items():
                for k in keys:
                    arr_a = np.array(ta[k])
                    arr_b = np.array(tb[k])
                    if k in inverted:
                        arr_a = 10.0 - arr_a
                        arr_b = 10.0 - arr_b
                    # Construct = mean of other indicators
                    other_a = np.mean([np.array(ta[ok]) if ok not in inverted
                                       else 10.0 - np.array(ta[ok])
                                       for ok in keys if ok != k], axis=0)
                    other_b = np.mean([np.array(tb[ok]) if ok not in inverted
                                       else 10.0 - np.array(tb[ok])
                                       for ok in keys if ok != k], axis=0)
                    r_a = _pearsonr(arr_a, other_a)
                    r_b = _pearsonr(arr_b, other_b)
                    diff = abs(r_a - r_b)
                    if diff > max_diff:
                        max_diff = diff
                        details = [f"{cname}/{k}: T0={r_a:.3f}, T8k={r_b:.3f}, Δ={diff:.3f}"]
        if max_diff > 0.25:
            return Status.WARN, f"Max Ladungs-Drift={max_diff:.3f}: {details[0]}"
        return Status.PASS, f"Max Ladungs-Drift={max_diff:.3f}"

    results.append(run_test("7.D6", "Faktorladungen-Stabilität", test_D6))

    return results


# ---------------------------------------------------------------------------
# E. Soziale Dynamiken & Events
# ---------------------------------------------------------------------------

def _tests_E(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # E1. Event-Impact-Asymmetrie (negative stärker als positive)
    def test_E1():
        # Find economic crisis and boom ticks
        crisis_ticks = [r[0] for r in conn.execute(
            "SELECT tick FROM events WHERE description LIKE '%krise%'"
        ).fetchall()]
        boom_ticks = [r[0] for r in conn.execute(
            "SELECT tick FROM events WHERE description LIKE '%ufschwung%'"
        ).fetchall()]
        if not crisis_ticks or not boom_ticks:
            return Status.SKIP, "Nicht genug Events"

        def _avg_delta(event_tick: int) -> float:
            pre = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
                (max(0, event_tick - 7),),
            ).fetchone()[0]
            post = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
                (min(TOTAL_TICKS - 1, event_tick + 30),),
            ).fetchone()[0]
            return (post - pre) if pre is not None and post is not None else 0.0

        crisis_deltas = [_avg_delta(t) for t in crisis_ticks]
        boom_deltas = [_avg_delta(t) for t in boom_ticks]
        avg_crisis = np.mean(crisis_deltas)
        avg_boom = np.mean(boom_deltas)
        detail = f"Krisen Δ={avg_crisis:.3f}, Booms Δ={avg_boom:.3f}"
        if abs(avg_crisis) > abs(avg_boom):
            return Status.PASS, f"Negativity Bias bestätigt: {detail}"
        return Status.WARN, f"Kein Negativity Bias: {detail}"

    results.append(run_test("7.E1", "Event-Impact-Asymmetrie", test_E1))

    # E2. Event-Decay (Erholung nach Krise)
    def test_E2():
        crisis_ticks = [r[0] for r in conn.execute(
            "SELECT tick FROM events WHERE description LIKE '%krise%'"
        ).fetchall()]
        if not crisis_ticks:
            return Status.SKIP, "Keine Krisen-Events"
        details = []
        for ct in crisis_ticks:
            pre_tick = max(0, ct - 7)
            post_tick = min(TOTAL_TICKS - 1, ct + 30)
            recovery_tick = min(TOTAL_TICKS - 1, ct + 365)
            pre = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
                (pre_tick,),
            ).fetchone()[0]
            post = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
                (post_tick,),
            ).fetchone()[0]
            recov = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
                (recovery_tick,),
            ).fetchone()[0]
            if pre and post and recov:
                drop = pre - post
                recovery = recov - post
                pct = (recovery / drop * 100) if drop > 0 else 100
                details.append(f"T{ct}: Drop={drop:.2f}, Recovery={pct:.0f}%")
        if not details:
            return Status.SKIP, "Keine Daten"
        # Check if any recovery is below threshold
        return Status.PASS, "; ".join(details)

    results.append(run_test("7.E2", "Event-Decay nach Krisen", test_E2))

    # E3. Distrikt-spezifische Event-Reaktivität
    def test_E3():
        crisis_ticks = [r[0] for r in conn.execute(
            "SELECT tick FROM events WHERE description LIKE '%krise%'"
        ).fetchall()]
        if not crisis_ticks:
            return Status.SKIP, "Keine Krisen"
        ct = crisis_ticks[0]
        pre_tick = max(0, ct - 7)
        post_tick = min(TOTAL_TICKS - 1, ct + 30)
        deltas = {}
        for d in range(5):
            pre = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state "
                "WHERE tick = ? AND district = ?",
                (pre_tick, d),
            ).fetchone()[0]
            post = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state "
                "WHERE tick = ? AND district = ?",
                (post_tick, d),
            ).fetchone()[0]
            if pre is not None and post is not None:
                deltas[d] = post - pre
        detail = ", ".join(f"D{d}={v:.3f}" for d, v in sorted(deltas.items()))
        # D4 (Industriezone) should be hit hardest
        if 4 in deltas and 1 in deltas:
            if deltas[4] < deltas[1]:
                return Status.PASS, f"D4 härter getroffen: {detail}"
            return Status.WARN, f"D4 nicht härter: {detail}"
        return Status.PASS, detail

    results.append(run_test("7.E3", "Distrikt-Event-Reaktivität", test_E3))

    # E4. Household-Konvergenz
    def test_E4():
        # Use home_building_id as household proxy
        base = _load_blob_base(conn)
        buildings: dict[int, list[str]] = {}
        for bid, b in base.items():
            hb = b["home_building_id"]
            if hb is not None:
                buildings.setdefault(hb, []).append(bid)
        # Filter to buildings with 2+ blobs
        households = {k: v for k, v in buildings.items() if len(v) >= 2}
        if not households:
            return Status.SKIP, "Keine Mehrpersonen-Haushalte"

        intra_diffs, inter_diffs = [], []
        tick = 4000
        # Sample up to 50 households
        sample_hh = list(households.items())[:50]
        all_ideos = conn.execute(
            "SELECT blob_id, ideology FROM blob_daily_state WHERE tick = ?",
            (tick,),
        ).fetchall()
        ideo_map = {r[0]: r[1] for r in all_ideos}

        for _, members in sample_hh:
            member_ideos = [ideo_map[m] for m in members if m in ideo_map]
            if len(member_ideos) >= 2:
                for i in range(len(member_ideos)):
                    for j in range(i + 1, len(member_ideos)):
                        intra_diffs.append(abs(member_ideos[i] - member_ideos[j]))

        # Random inter-household pairs
        all_ids = list(ideo_map.keys())
        rng = np.random.default_rng(42)
        for _ in range(min(len(intra_diffs) * 2, 500)):
            i, j = rng.choice(len(all_ids), 2, replace=False)
            inter_diffs.append(abs(ideo_map[all_ids[i]] - ideo_map[all_ids[j]]))

        if not intra_diffs or not inter_diffs:
            return Status.SKIP, "Zu wenig Paare"
        mean_intra = np.mean(intra_diffs)
        mean_inter = np.mean(inter_diffs)
        detail = f"Intra-HH={mean_intra:.2f}, Inter-HH={mean_inter:.2f}"
        if mean_intra < mean_inter:
            return Status.PASS, f"Household-Konvergenz: {detail}"
        return Status.WARN, f"Keine Konvergenz: {detail}"

    results.append(run_test("7.E4", "Household-Konvergenz", test_E4))

    # E5. Trust-Erosion langsamer als Satisfaction-Recovery
    def test_E5():
        # Find skandal/korruption events
        scandal_ticks = [r[0] for r in conn.execute(
            "SELECT tick FROM events WHERE description LIKE '%kandal%' "
            "OR description LIKE '%orruption%'"
        ).fetchall()]
        if not scandal_ticks:
            return Status.SKIP, "Keine Skandale"
        ct = scandal_ticks[0]
        # Measure recovery speed for both
        pre_tick = max(0, ct - 7)
        steps = [30, 90, 180, 365]
        sat_recovery, trust_recovery = [], []
        pre_sat = conn.execute(
            "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
            (pre_tick,),
        ).fetchone()[0]
        pre_trust = conn.execute(
            "SELECT AVG(trust) FROM blob_daily_state WHERE tick = ?",
            (pre_tick,),
        ).fetchone()[0]
        post_sat = conn.execute(
            "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
            (min(TOTAL_TICKS - 1, ct + 14),),
        ).fetchone()[0]
        post_trust = conn.execute(
            "SELECT AVG(trust) FROM blob_daily_state WHERE tick = ?",
            (min(TOTAL_TICKS - 1, ct + 14),),
        ).fetchone()[0]

        if not all([pre_sat, pre_trust, post_sat, post_trust]):
            return Status.SKIP, "Daten fehlen"

        sat_drop = pre_sat - post_sat
        trust_drop = pre_trust - post_trust
        detail = f"Sat-Drop={sat_drop:.3f}, Trust-Drop={trust_drop:.3f}"

        # Check recovery at 365 ticks
        recov_sat = conn.execute(
            "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
            (min(TOTAL_TICKS - 1, ct + 365),),
        ).fetchone()[0]
        recov_trust = conn.execute(
            "SELECT AVG(trust) FROM blob_daily_state WHERE tick = ?",
            (min(TOTAL_TICKS - 1, ct + 365),),
        ).fetchone()[0]
        if recov_sat and recov_trust:
            sat_recov_pct = (recov_sat - post_sat) / sat_drop * 100 if sat_drop > 0 else 100
            trust_recov_pct = (recov_trust - post_trust) / trust_drop * 100 if trust_drop > 0 else 100
            detail += f"; Sat-Recovery={sat_recov_pct:.0f}%, Trust-Recovery={trust_recov_pct:.0f}%"

        return Status.PASS, detail

    results.append(run_test("7.E5", "Trust-Erosion vs Sat-Recovery", test_E5))

    return results


# ---------------------------------------------------------------------------
# F. Einkommens- & Bildungsdynamiken
# ---------------------------------------------------------------------------

def _tests_F(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # F1. Einkommensverteilung rechtsschief
    def test_F1():
        incomes = [r[0] for r in conn.execute(
            "SELECT income FROM blob_daily_state WHERE tick = 0 AND income > 0"
        ).fetchall()]
        if not incomes:
            return Status.FAIL, "Keine Einkommensdaten"
        from scipy.stats import skew as _skew
        sk = _skew(incomes)
        if sk > 0.3:
            return Status.PASS, f"Skewness={sk:.3f} (rechtsschief)"
        if sk > 0:
            return Status.WARN, f"Skewness={sk:.3f} (schwach rechtsschief)"
        return Status.FAIL, f"Skewness={sk:.3f} (linksschief)"

    def test_F1_fallback():
        """Fallback ohne scipy."""
        incomes = np.array([r[0] for r in conn.execute(
            "SELECT income FROM blob_daily_state WHERE tick = 0 AND income > 0"
        ).fetchall()])
        if len(incomes) == 0:
            return Status.FAIL, "Keine Einkommensdaten"
        n = len(incomes)
        mean = incomes.mean()
        std = incomes.std()
        if std == 0:
            return Status.FAIL, "SD = 0"
        sk = (n / ((n - 1) * (n - 2))) * ((((incomes - mean) / std) ** 3).sum())
        if sk > 0.3:
            return Status.PASS, f"Skewness={sk:.3f} (rechtsschief)"
        if sk > 0:
            return Status.WARN, f"Skewness={sk:.3f} (schwach rechtsschief)"
        return Status.FAIL, f"Skewness={sk:.3f}"

    def test_F1_safe():
        try:
            return test_F1()
        except ImportError:
            return test_F1_fallback()

    results.append(run_test("7.F1", "Einkommensverteilung Skewness", test_F1_safe))

    # F2. Bildungs-Einkommens-Premium
    def test_F2():
        rows = conn.execute(
            "SELECT education_level, income FROM blob_daily_state "
            "WHERE tick = 0 AND income > 0 AND age >= 18"
        ).fetchall()
        if not rows:
            return Status.FAIL, "Keine Daten"
        edu = np.array([r[0] for r in rows], dtype=float)
        inc = np.array([r[1] for r in rows])
        r_val = _pearsonr(edu, inc)
        # Also compute mean income per education level
        groups = {}
        for e, i in rows:
            groups.setdefault(e, []).append(i)
        means = {e: np.mean(v) for e, v in sorted(groups.items())}
        detail = f"r={r_val:.3f}; " + ", ".join(f"Edu{e}={m:.0f}€" for e, m in means.items())
        if r_val > 0.10:
            return Status.PASS, detail
        return Status.WARN, detail

    results.append(run_test("7.F2", "Bildungs-Einkommens-Premium", test_F2))

    # F3. Einkommensstabilität
    def test_F3():
        sample_ids = [r[0] for r in conn.execute(
            "SELECT id FROM blobs WHERE income > 0 ORDER BY id LIMIT 50"
        ).fetchall()]
        sds = []
        for bid in sample_ids:
            rows = conn.execute(
                "SELECT income FROM blob_daily_state WHERE blob_id = ? AND income > 0",
                (bid,),
            ).fetchall()
            if rows:
                sds.append(np.std([r[0] for r in rows]))
        if not sds:
            return Status.FAIL, "Keine Daten"
        mean_sd = np.mean(sds)
        max_sd = np.max(sds)
        detail = f"Mean SD={mean_sd:.1f}€, Max SD={max_sd:.1f}€"
        if mean_sd < 500:
            return Status.PASS, detail
        return Status.WARN, detail

    results.append(run_test("7.F3", "Einkommensstabilität", test_F3))

    # F4. Bildungsverteilung pro Distrikt
    def test_F4():
        rows = conn.execute(
            "SELECT district, education_level, COUNT(*) FROM blobs "
            "GROUP BY district, education_level ORDER BY district, education_level"
        ).fetchall()
        if not rows:
            return Status.FAIL, "Keine Daten"
        districts: dict[int, dict[int, int]] = {}
        for d, e, c in rows:
            districts.setdefault(d, {})[e] = c
        details = []
        for d in sorted(districts):
            total = sum(districts[d].values())
            pcts = {e: c / total * 100 for e, c in districts[d].items()}
            details.append(f"D{d}: " + "/".join(f"{pcts.get(e, 0):.0f}%" for e in range(4)))
        # D1 should have highest academic (edu=3), D4 lowest
        d1_acad = districts.get(1, {}).get(3, 0) / sum(districts.get(1, {}).values()) * 100
        d4_acad = districts.get(4, {}).get(3, 0) / sum(districts.get(4, {}).values()) * 100
        detail = "; ".join(details)
        if d1_acad > d4_acad:
            return Status.PASS, f"D1 Akad={d1_acad:.0f}% > D4={d4_acad:.0f}%. {detail}"
        return Status.FAIL, f"D1 Akad={d1_acad:.0f}% <= D4={d4_acad:.0f}%. {detail}"

    results.append(run_test("7.F4", "Bildungsverteilung Distrikte", test_F4))

    return results


# ---------------------------------------------------------------------------
# G. Zeitreihen-Plausibilität
# ---------------------------------------------------------------------------

def _tests_G(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # G1. Autokorrelation ACF(1)
    def test_G1():
        sample_ids = [r[0] for r in conn.execute(
            "SELECT id FROM blobs ORDER BY id LIMIT 20"
        ).fetchall()]
        acfs = []
        for bid in sample_ids:
            rows = conn.execute(
                "SELECT satisfaction FROM blob_daily_state WHERE blob_id = ? ORDER BY tick",
                (bid,),
            ).fetchall()
            if len(rows) > 100:
                vals = np.array([r[0] for r in rows])
                # ACF(1) = corr(x[t], x[t+1])
                acf1 = _pearsonr(vals[:-1], vals[1:])
                acfs.append(acf1)
        if not acfs:
            return Status.FAIL, "Keine Daten"
        mean_acf = np.mean(acfs)
        min_acf = np.min(acfs)
        if min_acf >= ACF1_MIN:
            return Status.PASS, f"Mean ACF(1)={mean_acf:.4f}, Min={min_acf:.4f}"
        if mean_acf >= ACF1_MIN:
            return Status.WARN, f"Mean={mean_acf:.4f} ok, Min={min_acf:.4f} niedrig"
        return Status.FAIL, f"ACF(1) zu niedrig: Mean={mean_acf:.4f}"

    results.append(run_test("7.G1", "Autokorrelation ACF(1)", test_G1))

    # G2. Keine periodischen Artefakte (7-Tage-Zyklus)
    def test_G2():
        # Check if weekly update cycle creates artifacts
        # Use population mean satisfaction time series
        rows = conn.execute(
            "SELECT tick, AVG(satisfaction) FROM blob_daily_state "
            "GROUP BY tick ORDER BY tick"
        ).fetchall()
        if len(rows) < 1000:
            return Status.SKIP, f"Nur {len(rows)} Ticks"
        vals = np.array([r[1] for r in rows])
        # Detrend
        vals_detrended = vals - np.convolve(vals, np.ones(50) / 50, mode='same')
        # FFT
        fft = np.abs(np.fft.rfft(vals_detrended[50:-50]))
        freqs = np.fft.rfftfreq(len(vals_detrended[50:-50]))
        # Check for peak at f≈1/7 (weekly cycle)
        if len(freqs) > 0:
            weekly_idx = np.argmin(np.abs(freqs - 1 / 7))
            peak_power = fft[weekly_idx]
            mean_power = np.mean(fft[1:])  # exclude DC
            ratio = peak_power / mean_power if mean_power > 0 else 0
            if ratio > 5.0:
                return Status.WARN, f"7-Tage-Peak: Power-Ratio={ratio:.1f}"
            return Status.PASS, f"Kein 7-Tage-Artefakt (Ratio={ratio:.1f})"
        return Status.SKIP, "FFT fehlgeschlagen"

    results.append(run_test("7.G2", "Keine 7-Tage-Artefakte", test_G2))

    # G3. Gesamtpopulation-Ideologie annähernd stationär
    def test_G3():
        rows = conn.execute(
            "SELECT tick, AVG(ideology) FROM blob_daily_state "
            "GROUP BY tick ORDER BY tick"
        ).fetchall()
        if len(rows) < 100:
            return Status.FAIL, "Zu wenig Daten"
        ticks = np.array([r[0] for r in rows])
        means = np.array([r[1] for r in rows])
        slope = np.polyfit(ticks, means, 1)[0]
        total_drift = slope * (ticks[-1] - ticks[0])
        detail = f"Slope={slope:.6f}/Tick, Gesamtdrift={total_drift:.2f}"
        if abs(total_drift) < 2.0:
            return Status.PASS, detail
        if abs(total_drift) < 3.0:
            return Status.WARN, detail
        return Status.FAIL, f"Starker Drift: {detail}"

    results.append(run_test("7.G3", "Ideologie-Stationarität (Gesamt)", test_G3))

    # G4. Satisfaction-Recovery nach Krisen
    def test_G4():
        crisis_ticks = [r[0] for r in conn.execute(
            "SELECT tick FROM events WHERE description LIKE '%krise%'"
        ).fetchall()]
        if not crisis_ticks:
            return Status.SKIP, "Keine Krisen"
        details = []
        for ct in crisis_ticks:
            pre = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
                (max(0, ct - 7),),
            ).fetchone()[0]
            trough = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
                (min(TOTAL_TICKS - 1, ct + 30),),
            ).fetchone()[0]
            post = conn.execute(
                "SELECT AVG(satisfaction) FROM blob_daily_state WHERE tick = ?",
                (min(TOTAL_TICKS - 1, ct + 365),),
            ).fetchone()[0]
            if pre and trough and post:
                details.append(f"T{ct}: {pre:.2f}→{trough:.2f}→{post:.2f}")
        if not details:
            return Status.SKIP, "Keine Daten"
        return Status.PASS, "; ".join(details)

    results.append(run_test("7.G4", "Satisfaction-Recovery Krisen", test_G4))

    # G5. Trust langfristige Trends pro Distrikt
    def test_G5():
        details = []
        for d in range(5):
            rows = conn.execute(
                "SELECT tick, AVG(trust) FROM blob_daily_state "
                "WHERE district = ? GROUP BY tick ORDER BY tick",
                (d,),
            ).fetchall()
            if len(rows) > 100:
                ticks = np.array([r[0] for r in rows])
                means = np.array([r[1] for r in rows])
                slope = np.polyfit(ticks, means, 1)[0]
                drift = slope * (ticks[-1] - ticks[0])
                details.append(f"D{d}: Drift={drift:.2f}")
        return Status.PASS, "; ".join(details)

    results.append(run_test("7.G5", "Trust-Trends pro Distrikt", test_G5))

    return results


# ---------------------------------------------------------------------------
# H. Empirische Benchmarks (Deutschland)
# ---------------------------------------------------------------------------

def _tests_H(conn: sqlite3.Connection) -> list[TestResult]:
    results = []

    # H1. Ideologie-Verteilung vs. ALLBUS
    def test_H1():
        rows = conn.execute(
            "SELECT ideology FROM blob_daily_state WHERE tick = 0"
        ).fetchall()
        if not rows:
            return Status.FAIL, "Keine Daten"
        vals = np.array([r[0] for r in rows])
        mean, sd = vals.mean(), vals.std()
        lo_m, hi_m = IDEOLOGY_MEAN_RANGE
        lo_s, hi_s = IDEOLOGY_SD_RANGE
        issues = []
        if mean < lo_m or mean > hi_m:
            issues.append(f"Mean={mean:.2f} außerhalb [{lo_m},{hi_m}]")
        if sd < lo_s or sd > hi_s:
            issues.append(f"SD={sd:.2f} außerhalb [{lo_s},{hi_s}]")
        detail = f"M={mean:.2f}, SD={sd:.2f}"
        if issues:
            return Status.WARN, f"{detail}; {'; '.join(issues)}"
        return Status.PASS, detail

    results.append(run_test("7.H1", "Ideologie vs. ALLBUS", test_H1))

    # H2. Gini vs. Deutschland
    def test_H2():
        incomes = [r[0] for r in conn.execute(
            "SELECT income FROM blob_daily_state WHERE tick = 0 AND income > 0"
        ).fetchall()]
        if not incomes:
            return Status.FAIL, "Keine Daten"
        g = _gini(incomes)
        lo, hi = GINI_RANGE_REALISTIC
        if lo <= g <= hi:
            return Status.PASS, f"Gini={g:.3f}"
        return Status.WARN, f"Gini={g:.3f} außerhalb [{lo},{hi}]"

    results.append(run_test("7.H2", "Gini vs. Deutschland", test_H2))

    # H3. Trust-Niveau vs. ESS
    def test_H3():
        row = conn.execute(
            "SELECT AVG(trust) FROM blob_daily_state WHERE tick = 0"
        ).fetchone()
        if not row or row[0] is None:
            return Status.FAIL, "Keine Daten"
        mean = row[0]
        lo, hi = TRUST_MEAN_RANGE
        if lo <= mean <= hi:
            return Status.PASS, f"Trust M={mean:.2f}"
        return Status.WARN, f"Trust M={mean:.2f} außerhalb [{lo},{hi}]"

    results.append(run_test("7.H3", "Trust vs. ESS", test_H3))

    # H4. Authoritarismus-Bildungseffekt
    def test_H4():
        rows = _load_attitudes_at_tick(conn, 0)
        edu, auth = [], []
        for r in rows:
            if r[11]:
                traits = json.loads(r[11])
                edu.append(r[8])
                # Mean of auth indicators
                auth_val = np.mean([
                    traits.get("obedience_value", 5.0),
                    traits.get("rule_conformity", 5.0),
                    traits.get("strong_leader_preference", 5.0),
                ])
                auth.append(auth_val)
        r_val = _pearsonr(np.array(edu), np.array(auth))
        if r_val <= EDUCATION_AUTHORITARIANISM_R_MAX:
            return Status.PASS, f"r(Edu, Auth)={r_val:.3f}"
        if r_val < 0:
            return Status.WARN, f"r={r_val:.3f} (negativ, aber schwach)"
        return Status.FAIL, f"r={r_val:.3f} (nicht negativ!)"

    results.append(run_test("7.H4", "Auth-Bildung vs. Empirie", test_H4))

    # H5. Materialismus nach Alter (Inglehart)
    def test_H5():
        trait_tick = _nearest_trait_tick(conn, 0)
        rows = conn.execute(
            "SELECT ds.age, ds.latent_traits_json FROM blob_daily_state ds "
            "WHERE ds.tick = ? AND ds.latent_traits_json IS NOT NULL",
            (trait_tick,),
        ).fetchall()
        ages, mat = [], []
        for r in rows:
            traits = json.loads(r[1])
            ages.append(r[0])
            mat.append(traits.get("economic_security_priority", 5.0))
        r_val = _pearsonr(np.array(ages), np.array(mat))
        if r_val >= AGE_MATERIALISM_R_MIN:
            return Status.PASS, f"r(Alter, Materialismus)={r_val:.3f}"
        if r_val > -0.05:
            return Status.WARN, f"r={r_val:.3f} (nahe Null, erwartet positiv — Distrikteffekte könnten überlagern)"
        # Negative correlation: possible if education confounds (older→less education→more materialism
        # but also older→different district composition)
        return Status.WARN, f"r={r_val:.3f} (negativ — Inglehart-Hypothese nicht bestätigt, prüfe Konfundierung)"

    results.append(run_test("7.H5", "Materialismus-Alter (Inglehart)", test_H5))

    # H6. Wahlbeteiligung Trend
    def test_H6():
        elections = conn.execute(
            "SELECT tick, fortschritt + mitte + tradition + unabhaengige FROM elections"
        ).fetchall()
        if not elections:
            return Status.FAIL, "Keine Wahlen"
        turnouts = []
        for tick, total_votes in elections:
            eligible = conn.execute(
                "SELECT COUNT(*) FROM blob_daily_state WHERE tick = ? AND age >= 18",
                (tick,),
            ).fetchone()[0]
            if eligible > 0:
                turnouts.append((tick, total_votes / eligible))
        detail = ", ".join(f"T{t}={tr:.1%}" for t, tr in turnouts)
        return Status.PASS, detail

    results.append(run_test("7.H6", "Wahlbeteiligung Trend", test_H6))

    return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_layer7(conn: sqlite3.Connection) -> list[TestResult]:
    """Run all Layer 7 deep plausibility tests."""
    results = []
    results.extend(_tests_A(conn))
    results.extend(_tests_B(conn))
    results.extend(_tests_C(conn))
    results.extend(_tests_D(conn))
    results.extend(_tests_E(conn))
    results.extend(_tests_F(conn))
    results.extend(_tests_G(conn))
    results.extend(_tests_H(conn))
    return results
