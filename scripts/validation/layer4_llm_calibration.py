"""Layer 4: LLM-Kalibrierung (optional, mit --with-llm Flag).

Sendet Likert-Fragen an das LLM und prüft, ob die Antworten zu den DB-Werten passen.
"""

import json
import os
import re
import sqlite3

from .config import (
    LLM_DIRECTION_THRESHOLD,
    LLM_MAD_THRESHOLD,
    PARTY_NAMES,
    TICKS_PER_YEAR,
    TRAIT_KEYS,
)
from .report import Status, TestResult, run_test


LIKERT_QUESTIONS = [
    {
        "question": "Auf einer Skala von 1-5: Wie zufrieden sind Sie mit der aktuellen politischen Lage?",
        "trait_key": "satisfaction",
        "source": "state",
    },
    {
        "question": "Auf einer Skala von 1-5: Wie sehr vertrauen Sie den politischen Institutionen?",
        "trait_key": "trust",
        "source": "state",
    },
    {
        "question": "Auf einer Skala von 1-5: Wie stark glauben Sie, dass Sie politische Entscheidungen beeinflussen können?",
        "trait_key": "self_efficacy",
        "source": "trait",
    },
    {
        "question": "Auf einer Skala von 1-5: Wie wichtig sind Ihnen Gehorsam und Respekt als Tugenden?",
        "trait_key": "obedience_value",
        "source": "trait",
    },
    {
        "question": "Auf einer Skala von 1-5: Wie stark empfinden Sie, dass 'die da oben' machen, was sie wollen?",
        "trait_key": "powerlessness",
        "source": "trait",
    },
]


def _get_ticks_per_year(conn: sqlite3.Connection) -> int:
    try:
        row = conn.execute("SELECT value FROM meta WHERE key = 'ticks_per_year'").fetchone()
        if row:
            return int(row[0])
    except Exception:
        pass
    return TICKS_PER_YEAR


def _build_system_prompt(conn: sqlite3.Connection, blob_id: str, tick: int, tpy: int) -> str | None:
    """Build the system prompt exactly as the Rust server does."""
    blob = conn.execute(
        "SELECT name, district, age, education_level, "
        "COALESCE(persona_text, ''), COALESCE(job, '') "
        "FROM blobs WHERE id = ?",
        (blob_id,),
    ).fetchone()
    if not blob:
        return None

    name, district, start_age, edu, persona_base, job = blob
    current_age = start_age + tick // tpy
    year = tick // tpy
    month = (tick % tpy) // 30 + 1
    first_name = name.split()[0] if name else name

    row = conn.execute(
        "SELECT satisfaction, ideology, trust, party, will_vote, "
        "protest_readiness, income, latent_traits_json "
        "FROM blob_daily_state WHERE blob_id = ? AND tick <= ? "
        "ORDER BY tick DESC LIMIT 1",
        (blob_id, tick),
    ).fetchone()
    if not row:
        return None

    sat, ideo, trust, party, will_vote, protest, income, traits_json_raw = row

    if traits_json_raw:
        try:
            traits = json.loads(traits_json_raw)
        except json.JSONDecodeError:
            traits = {}
    else:
        fallback = conn.execute(
            "SELECT latent_traits_json FROM blob_daily_state "
            "WHERE blob_id = ? AND tick <= ? AND latent_traits_json IS NOT NULL "
            "ORDER BY tick DESC LIMIT 1",
            (blob_id, tick),
        ).fetchone()
        traits = json.loads(fallback[0]) if fallback and fallback[0] else {}

    t = lambda key: float(traits.get(key, 5.0))
    party_name = PARTY_NAMES.get(party, "keine")

    edu_styles = {
        0: "direkt und unverbluemt, ohne akademische Umschweife",
        1: "unkompliziert und bodenstaendig",
        2: "sachlich und bestimmt",
        3: "differenziert und reflektiert",
    }
    edu_style = edu_styles.get(edu, edu_styles[3])

    change_summary = ""
    cs_row = conn.execute(
        "SELECT COALESCE(change_summary, '') FROM blob_persona_snapshots "
        "WHERE blob_id = ? AND tick <= ? ORDER BY tick DESC LIMIT 1",
        (blob_id, tick),
    ).fetchone()
    if cs_row:
        change_summary = cs_row[0]

    prompt = (
        f"=== IDENTITAET ===\n{persona_base}\n\n"
        f"=== AKTUELLER ZUSTAND (Tick {tick}, Jahr {year}.{month}) ===\n"
        f"Alter: {current_age} | Beruf: {job} | Einkommen: {income:.0f} EUR/Monat\n\n"
        f"Zufriedenheit:          {sat:.1f}/10\n"
        f"Vertrauen:              {trust:.1f}/10\n"
        f"Ideologie:              {ideo:+.1f} (-5=links, +5=rechts)\n"
        f"Partei:                 {party_name}\n"
        f"Waehlt:                 {'ja' if will_vote == 1 else 'nein'}\n"
        f"Protestbereitschaft:    {protest:.1f}/10\n\n"
        f"Selbstwirksamkeit:      {t('self_efficacy'):.1f}/10\n"
        f"Pol. Wissen:            {t('political_knowledge'):.1f}/10\n"
        f"Stimmenwichtigkeit:     {t('vote_importance'):.1f}/10\n"
        f"Gehorsam:               {t('obedience_value'):.1f}/10\n"
        f"Starke Fuehrung:        {t('strong_leader_preference'):.1f}/10\n"
        f"Regelkonformitaet:      {t('rule_conformity'):.1f}/10\n"
        f"Machtlosigkeit:         {t('powerlessness'):.1f}/10\n"
        f"Pol. Komplexitaet:      {t('political_complexity'):.1f}/10\n"
        f"Parteigleichgueltigkeit:{t('party_indifference'):.1f}/10\n"
        f"Oekon. Sicherheit:      {t('economic_security_priority'):.1f}/10\n"
        f"Umwelt>Wirtschaft:      {t('environment_over_economy'):.1f}/10\n"
        f"Freiheit>Ordnung:       {t('freedom_over_order'):.1f}/10\n"
        f"Nachbarvertrauen:       {t('neighbor_trust'):.1f}/10\n"
        f"Gemeinschaft:           {t('community_participation'):.1f}/10\n\n"
        f"=== JUENGSTE VERAENDERUNGEN ===\n"
        f"{'Keine bedeutenden Veraenderungen.' if not change_summary else change_summary}\n\n"
        f"=== REGELN ===\n"
        f"Du bist {name}. Antworte als {first_name} in der Ich-Form, auf Deutsch.\n"
        f"Sprich {edu_style}.\n"
        f"Werte-Interpretation:\n"
        f"  0-2 = sehr niedrig  |  3-4 = eher niedrig  |  5-6 = ambivalent\n"
        f"  7-8 = eher hoch     |  9-10 = sehr hoch\n"
        f"Bei Likert-Skalen (1-5): Dein Wert X/10 entspricht ungefaehr (X/2 + 0.5) gerundet.\n"
        f"Nenne KEINE Zahlenwerte woertlich — druecke sie durch Verhalten und Meinung aus.\n"
        f"Halte deine Antworten kurz (2-5 Saetze)."
    )

    return prompt


def _get_expected_likert(value_0_10: float) -> float:
    """Convert 0-10 internal value to expected 1-5 Likert per the prompt rule."""
    return round(value_0_10 / 2 + 0.5)


def _extract_likert_from_response(text: str) -> int | None:
    """Try to extract a 1-5 number from an LLM response."""
    match = re.search(r'\b([1-5])\b', text)
    if match:
        return int(match.group(1))
    return None


def _call_llm(system_prompt: str, user_message: str) -> str | None:
    """Call Anthropic Claude API."""
    try:
        import anthropic
    except ImportError:
        return None

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        system=system_prompt,
        messages=[
            {"role": "user", "content": user_message + "\nAntworte NUR mit einer Zahl von 1-5."}
        ],
    )
    return response.content[0].text


def run_layer4(conn: sqlite3.Connection) -> list[TestResult]:
    results = []
    tpy = _get_ticks_per_year(conn)

    # Get 10 diverse Blobs
    blob_ids = [r[0] for r in conn.execute(
        "SELECT id FROM blobs ORDER BY id LIMIT 10"
    ).fetchall()]

    # 4.1 Likert-Kalibrierung
    def test_4_1():
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return Status.SKIP, "ANTHROPIC_API_KEY nicht gesetzt"
        try:
            import anthropic
        except ImportError:
            return Status.SKIP, "anthropic Paket nicht installiert"

        deviations = []
        for gid in blob_ids:
            system_prompt = _build_system_prompt(conn, gid, 4000, tpy)
            if not system_prompt:
                continue

            state = conn.execute(
                "SELECT satisfaction, ideology, trust, party, will_vote, "
                "protest_readiness, income, latent_traits_json "
                "FROM blob_daily_state WHERE blob_id = ? AND tick <= 4000 "
                "ORDER BY tick DESC LIMIT 1",
                (gid,),
            ).fetchone()
            if not state:
                continue

            traits = {}
            if state[7]:
                try:
                    traits = json.loads(state[7])
                except json.JSONDecodeError:
                    pass

            for q in LIKERT_QUESTIONS:
                if q["source"] == "state":
                    val = state[{"satisfaction": 0, "trust": 2}[q["trait_key"]]]
                else:
                    val = float(traits.get(q["trait_key"], 5.0))

                expected_likert = _get_expected_likert(val)
                response = _call_llm(system_prompt, q["question"])
                if not response:
                    continue
                actual = _extract_likert_from_response(response)
                if actual is not None:
                    deviations.append(abs(actual - expected_likert))

        if not deviations:
            return Status.SKIP, "Keine LLM-Antworten erhalten"

        mad = sum(deviations) / len(deviations)
        if mad <= LLM_MAD_THRESHOLD:
            return Status.PASS, f"MAD = {mad:.2f} ({len(deviations)} Antworten)"
        return Status.WARN, f"MAD = {mad:.2f} > {LLM_MAD_THRESHOLD} ({len(deviations)} Antworten)"

    results.append(run_test("4.1", "Likert-Kalibrierung", test_4_1))

    # 4.2 Richtungsübereinstimmung
    def test_4_2():
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return Status.SKIP, "ANTHROPIC_API_KEY nicht gesetzt"
        try:
            import anthropic
        except ImportError:
            return Status.SKIP, "anthropic Paket nicht installiert"

        correct = 0
        total = 0
        midpoint = 3  # Likert midpoint

        for gid in blob_ids:
            system_prompt = _build_system_prompt(conn, gid, 4000, tpy)
            if not system_prompt:
                continue

            state = conn.execute(
                "SELECT satisfaction, ideology, trust, party, will_vote, "
                "protest_readiness, income, latent_traits_json "
                "FROM blob_daily_state WHERE blob_id = ? AND tick <= 4000 "
                "ORDER BY tick DESC LIMIT 1",
                (gid,),
            ).fetchone()
            if not state:
                continue

            traits = {}
            if state[7]:
                try:
                    traits = json.loads(state[7])
                except json.JSONDecodeError:
                    pass

            for q in LIKERT_QUESTIONS:
                if q["source"] == "state":
                    val = state[{"satisfaction": 0, "trust": 2}[q["trait_key"]]]
                else:
                    val = float(traits.get(q["trait_key"], 5.0))

                expected_likert = _get_expected_likert(val)
                response = _call_llm(system_prompt, q["question"])
                if not response:
                    continue
                actual = _extract_likert_from_response(response)
                if actual is not None:
                    total += 1
                    expected_above = expected_likert >= midpoint
                    actual_above = actual >= midpoint
                    if expected_above == actual_above:
                        correct += 1

        if total == 0:
            return Status.SKIP, "Keine Antworten"

        rate = correct / total
        if rate >= LLM_DIRECTION_THRESHOLD:
            return Status.PASS, f"Übereinstimmung: {rate:.1%} ({correct}/{total})"
        return Status.WARN, f"Übereinstimmung: {rate:.1%} < {LLM_DIRECTION_THRESHOLD:.0%}"

    results.append(run_test("4.2", "Richtungsübereinstimmung", test_4_2))

    return results
