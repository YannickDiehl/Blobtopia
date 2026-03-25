#!/usr/bin/env python3
"""Generate evolving personality descriptions for all 500 Blobs.

Two-part system:
1. STATIC BASE (persona_base): Stable identity — name, backstory, district, education, communication style
2. DYNAMIC SNAPSHOTS (persona_state): Current state at 7 key timepoints — age-adjusted, with change narrative

Usage:
    python scripts/generate_persona_texts.py [path/to/timeline.db]
"""

import sqlite3
import hashlib
import sys
import json
import random
import math

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "data/blobtopia_timeline.db"
TICKS_PER_YEAR = 365

# Snapshot ticks: start + 5 elections + end
SNAPSHOT_TICKS = [0, 1460, 2920, 4380, 5475, 7300, 8029]

# ═══════════════════════════════════════════════════════
# Gender detection
# ═══════════════════════════════════════════════════════

FEMALE_NAMES = {
    "Alma","Amelie","Aminata","Amira","Agnieszka","Aisha","Alina","Anna","Annika",
    "Awa","Ayse","Brigitte","Charlotte","Chiara","Christa","Clara","Defne","Deniz",
    "Derya","Elif","Ella","Emilia","Emine","Fatima","Fatma","Finja","Giulia","Greta",
    "Hanna","Hannelore","Hatice","Heike","Helena","Hoa","Ida","Ingrid","Ionela","Irina",
    "Isabelle","Jana","Johanna","Julia","Karin","Katharina","Katarzyna","Laura","Layla",
    "Leni","Leyla","Lina","Linh","Lisa","Luisa","Mara","Maria","Marie","Melanie","Merve",
    "Mira","Monika","Nele","Nina","Nora","Nour","Nur","Olga","Paula","Petra","Pia",
    "Priya","Renate","Rosa","Sabine","Samira","Sandra","Sarah","Selin","Sophia",
    "Stefanie","Tatjana","Thea","Tilda","Tomoko","Victoria","Wei","Yagmur","Zeynep",
}

def detect_gender(first_name):
    if first_name in FEMALE_NAMES:
        return "f"
    return "m"

def g(gender, male, female):
    return female if gender == "f" else male

def pron(gender):
    return "sie" if gender == "f" else "er"

def Pron(gender):
    return "Sie" if gender == "f" else "Er"

def pron_dat(gender):
    return "ihr" if gender == "f" else "ihm"

# ═══════════════════════════════════════════════════════
# District, education, and job data
# ═══════════════════════════════════════════════════════

DISTRICTS = {
    0: {"name": "Gruental", "label": "Gruental",
        "vibe": ["einem ruhigen, laendlich gepraegten Viertel mit Einfamilienhaeusern und viel Gruen",
                 "einer eher konservativen Gegend mit Villen und gepflegten Vorgaerten",
                 "einem traditionellen Wohnviertel am Stadtrand"]},
    1: {"name": "Sonnenberg", "label": "Sonnenberg",
        "vibe": ["einem akademisch gepraegten Viertel mit Reihenhaeusern und lebendiger Cafe-Kultur",
                 "einem bildungsbuergerlichen Stadtteil nahe der Universitaet",
                 "einem kosmopolitischen Viertel mit vielen Akademikern"]},
    2: {"name": "Hafenviertel", "label": "Hafenviertel",
        "vibe": ["einem lebendigen, multikulturellen Stadtteil",
                 "einem bunten, diversen Viertel mit kultureller Vielfalt",
                 "einem Stadtteil im Wandel, gepraegt von Gentrifizierung"]},
    3: {"name": "Mittelfeld", "label": "Mittelfeld",
        "vibe": ["einem gemischten, suburbanen Wohngebiet",
                 "einer buergerlichen Gegend der Mittelschicht",
                 "einem durchschnittlichen Stadtteil fuer Familien und Berufstaetige"]},
    4: {"name": "Industriezone", "label": "Industriezone",
        "vibe": ["einem Arbeiterviertel, das vom Strukturwandel gepraegt ist",
                 "einem wirtschaftlich benachteiligten Stadtteil",
                 "einem Viertel, in dem vor allem Arbeiter mit Migrationshintergrund leben"]},
}

EDU_LABELS = {0: "ohne formalen Bildungsabschluss", 1: "mit mittlerem Schulabschluss",
              2: "mit hoeherer Bildung", 3: "mit akademischem Abschluss"}

EDU_BACKSTORY = {
    0: ["hat die Schule frueh abgebrochen und sich mit Gelegenheitsjobs durchgeschlagen",
        "konnte aus familiaeeren Gruenden keine Ausbildung abschliessen",
        "hat sich das meiste im Leben selbst beigebracht"],
    1: ["hat eine solide Berufsausbildung abgeschlossen",
        "hat nach dem Schulabschluss eine Lehre gemacht",
        "verfuegt ueber eine handwerkliche Ausbildung"],
    2: ["hat nach dem Abitur eine Fachausbildung absolviert",
        "verfuegt ueber einen weitergehenden Bildungsabschluss",
        "hat sich fachlich qualifiziert"],
    3: ["hat studiert und einen Hochschulabschluss erworben",
        "ist akademisch ausgebildet",
        "hat an der Universitaet studiert"],
}

SPEECH_STYLE = {
    0: "In Gespraechen ist {pron} direkt und unverbluemt, ohne akademische Umschweife.",
    1: "In Gespraechen kommuniziert {pron} unkompliziert und bodenstaendig.",
    2: "In Diskussionen vertritt {pron} die eigene Meinung sachlich und bestimmt.",
    3: "In Gespraechen argumentiert {pron} differenziert und belegt Aussagen gerne mit Fakten.",
}

JOBS = {
    (0,0): ["Landschaftsgaertner|Landschaftsgaertnerin","Hausmeister|Hausmeisterin","Erntehelfer|Erntehelferin","Reinigungskraft|Reinigungskraft"],
    (0,1): ["Gebaeudereiniger|Gebaeudereinigerin","Kuechenhilfe|Kuechenhilfe","Paketbote|Paketbotin"],
    (0,2): ["Hafenarbeiter|Hafenarbeiterin","Kuechenhilfe|Kuechenhilfe","Lagerarbeiter|Lagerarbeiterin"],
    (0,3): ["Lagerarbeiter|Lagerarbeiterin","Aushilfe im Supermarkt|Aushilfe im Supermarkt","Reinigungskraft|Reinigungskraft"],
    (0,4): ["Fabrikarbeiter|Fabrikarbeiterin","Lagerarbeiter|Lagerarbeiterin","Hilfsarbeiter|Hilfsarbeiterin"],
    (1,0): ["Handwerker|Handwerkerin","Elektriker|Elektrikerin","Gaertner|Gaertnerin","KFZ-Mechatroniker|KFZ-Mechatronikerin"],
    (1,1): ["Friseur|Friseurin","Einzelhandelskaufmann|Einzelhandelskauffrau","Verwaltungsangestellter|Verwaltungsangestellte"],
    (1,2): ["Koch|Koechin","Baecker|Baeckerin","Altenpfleger|Altenpflegerin","Kellner|Kellnerin"],
    (1,3): ["Buerokaufmann|Buerokauffrau","Versicherungskaufmann|Versicherungskauffrau","Verwaltungsangestellter|Verwaltungsangestellte"],
    (1,4): ["Industriemechaniker|Industriemechanikerin","Schweisser|Schweisserin","Schlosser|Schlosserin","LKW-Fahrer|LKW-Fahrerin"],
    (2,0): ["Bankkaufmann|Bankkauffrau","Polizeibeamter|Polizeibeamtin","Versicherungsmakler|Versicherungsmaklerin"],
    (2,1): ["Mediengestalter|Mediengestalterin","IT-Techniker|IT-Technikerin","Projektmanager|Projektmanagerin"],
    (2,2): ["Sozialarbeiter|Sozialarbeiterin","Erzieher|Erzieherin","Krankenpfleger|Krankenpflegerin"],
    (2,3): ["Bankkaufmann|Bankkauffrau","Industriekaufmann|Industriekauffrau","Steuerfachangestellter|Steuerfachangestellte"],
    (2,4): ["Meister in der Fertigung|Meisterin in der Fertigung","Techniker|Technikerin","Qualitaetspruefer|Qualitaetsprueferin"],
    (3,0): ["Tierarzt|Tieraerztin","Ingenieur|Ingenieurin","Gymnasiallehrer|Gymnasiallehrerin"],
    (3,1): ["Universitaetsdozent|Universitaetsdozentin","Softwareentwickler|Softwareentwicklerin","Rechtsanwalt|Rechtsanwaeltin","Journalist|Journalistin"],
    (3,2): ["Kulturmanager|Kulturmanagerin","Lehrer|Lehrerin","NGO-Mitarbeiter|NGO-Mitarbeiterin"],
    (3,3): ["Unternehmensberater|Unternehmensberaterin","Ingenieur|Ingenieurin","Betriebswirt|Betriebswirtin","IT-Manager|IT-Managerin"],
    (3,4): ["Betriebsleiter|Betriebsleiterin","Ingenieur|Ingenieurin","Sozialarbeiter|Sozialarbeiterin"],
}

PARTY_NAMES = {0: "Fortschritt", 1: "Mitte", 2: "Tradition", 3: "Unabhaengige"}

EVENT_DESCRIPTIONS = {
    400: "Wirtschaftskrise", 900: "Wirtschaftsaufschwung", 1100: "Ungleichheitsbericht",
    1300: "Debatte ueber Wirtschaftspolitik", 1460: "Wahl",
    1800: "Skandal bei der Mitte-Partei", 2200: "Buergerbeteiligung im Hafenviertel",
    2500: "Sicherheitsdebatte", 2700: "Wertekonflikt Sonnenberg vs Industriezone",
    2920: "Wahl", 3500: "Bildungsreform in der Industriezone",
    3800: "Klimadebatte", 4380: "Wahl",
    4800: "Korruptionsenthuellung", 5000: "Naturkatastrophe in der Industriezone",
    5200: "Solidaritaetsdebatte", 5475: "Wahl",
    6200: "Buergerbeteiligung in der Industriezone", 6570: "Sozialreform",
    7100: "Zukunftsdebatte", 7300: "Wahl",
}


def pick_job(edu, district, gender, rng):
    key = (edu, district)
    jobs = JOBS.get(key, JOBS.get((edu, 2), ["Angestellter|Angestellte"]))
    pair = rng.choice(jobs).split("|")
    return pair[1] if gender == "f" else pair[0]


def current_age(start_age, tick):
    return start_age + tick // TICKS_PER_YEAR


def life_phase(age):
    if age < 18: return "kind"
    if age < 30: return "jung"
    if age < 50: return "mittel"
    if age < 65: return "aelter"
    return "senior"


def life_phase_text(age, gender):
    p = life_phase(age)
    if p == "jung":
        return g(gender, "Als junger Erwachsener", "Als junge Erwachsene")
    elif p == "mittel":
        return "Mitten im Berufsleben"
    elif p == "aelter":
        return "Mit zunehmender Lebenserfahrung"
    elif p == "senior":
        return g(gender, "Als erfahrener Senior", "Als erfahrene Seniorin")
    return ""


# ═══════════════════════════════════════════════════════
# BASE PERSONA (stable identity)
# ═══════════════════════════════════════════════════════

BIO_REASONS = {
    0: ["weil die Familie das Geld brauchte und {p} frueh arbeiten musste",
        "weil {p} sich um die kranke Mutter kuemmern musste",
        "weil es in der Familie nie als wichtig galt, lange zur Schule zu gehen",
        "weil {p} mit der Schule nie klarkam und lieber praktisch arbeiten wollte"],
    1: ["weil die Eltern auf eine solide Ausbildung drangen",
        "weil {p} schon immer praktisch veranlagt war und etwas Handfestes lernen wollte",
        "weil das der uebliche Weg im Viertel war"],
    2: ["weil {pron_dat} Bildung immer wichtig war",
        "weil die Eltern grossen Wert auf einen guten Abschluss legten",
        "weil {p} ehrgeizig war und mehr wollte als die Eltern hatten"],
    3: ["weil {p} schon als Kind wissbegierig war und unbedingt studieren wollte",
        "weil die Familie akademisch gepraegt war",
        "weil {p} in der Schule glaenzte und ein Stipendium bekam"],
}

DAILY_HABITS = {
    0: {
        "low": ["{first} lebt bescheiden in einer kleinen Wohnung und muss jeden Euro umdrehen.",
                "{first} faehrt mit dem Fahrrad zur Arbeit und kauft nur das Noetigste ein."],
        "mid": ["{first} lebt in einer einfachen, aber ordentlichen Wohnung.",
                "Der Alltag von {first} ist geregelt — Arbeit, einkaufen, Feierabend."],
        "high": ["{first} lebt komfortabel und goennt sich gelegentlich etwas.", ""],
    },
    1: {
        "low": ["{first} wohnt in einer guenstigen Einzimmerwohnung.", ""],
        "mid": ["{first} lebt in einer gemuetlichen Wohnung im Viertel.", ""],
        "high": ["{first} bewohnt eine schoene Wohnung und legt Wert auf Lebensqualitaet.", ""],
    },
    2: {
        "low": ["{first} lebt in einer beengten Wohnung, teilt sich manchmal Raeume.",
                "{first} kommt gerade so ueber die Runden und muss sparen."],
        "mid": ["{first} lebt in einer lebhaften WG oder kleinen Wohnung im Viertel.", ""],
        "high": ["{first} hat eine schoene Altbauwohnung im Hafenviertel.", ""],
    },
    3: {
        "low": ["{first} wohnt guenstig und spart wo es geht.", ""],
        "mid": ["{first} lebt solide in einer Familienwohnung.", ""],
        "high": ["{first} lebt in einem gemuetlichen Reihenhaus.", ""],
    },
    4: {
        "low": ["{first} lebt in einer der guenstigen Sozialwohnungen der Industriezone.",
                "{first} teilt sich eine kleine Wohnung und muss auf jeden Cent achten."],
        "mid": ["{first} hat eine bescheidene, aber eigene Wohnung.", ""],
        "high": ["{first} lebt vergleichsweise gut fuer das Viertel.", ""],
    },
}

def generate_base_persona(blob_id, name, district, start_age, education, gender, rng):
    """Generate the STABLE part of the persona (doesn't change over time)."""
    first = name.split()[0]
    P = Pron(gender)
    p = pron(gender)
    pd = pron_dat(gender)
    d = DISTRICTS[district]
    vibe = rng.choice(d["vibe"])
    backstory = rng.choice(EDU_BACKSTORY[education])
    speech = SPEECH_STYLE[education].format(pron=p)

    # Biographical reason for education level
    bio_reason = rng.choice(BIO_REASONS[education]).format(p=p, pron_dat=pd)

    # Living situation
    inc_cat = "low"  # will be overridden but needs default
    daily_options = DAILY_HABITS.get(district, DAILY_HABITS[3])
    daily = rng.choice(daily_options.get("mid", [""])).format(first=first)

    lines = []
    lines.append(f"{name} lebt in {d['label']}, {vibe}. "
                 f"{P} {backstory}, {bio_reason}.")

    if daily:
        lines.append(daily)

    lines.append(speech)

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════
# DYNAMIC STATE SNAPSHOT
# ═══════════════════════════════════════════════════════

def val_label(v, labels_5):
    """Map 0-10 value to a 5-level label: very low / low / moderate / high / very high."""
    if v <= 2: return labels_5[0]
    if v <= 4: return labels_5[1]
    if v <= 6: return labels_5[2]
    if v <= 8: return labels_5[3]
    return labels_5[4]


def generate_state_snapshot(first, gender, age, edu, income, job,
                            sat, ideo, trust, party, will_vote, traits, tick):
    """Generate the DYNAMIC state text for a specific tick.

    Includes NUMERIC ANCHOR VALUES so the LLM can calibrate scale responses.
    Uses 5-level granularity instead of binary thresholds.
    """
    P = Pron(gender)
    p = pron(gender)
    pd = pron_dat(gender)
    year = tick // TICKS_PER_YEAR

    lines = []

    # Age + job + income
    income_word = "niedriges" if income < 2000 else ("mittleres" if income < 3500 else "gutes")
    lp = life_phase_text(age, gender)
    lines.append(f"{first} ist aktuell {age} Jahre alt und arbeitet als {job}. "
                 f"{P} verdient rund {income:.0f} Euro monatlich ({income_word} Einkommen). "
                 f"{lp} hat sich {first} beruflich {['noch nicht gefunden','eingelebt','etabliert','bewaehrt'][min(edu,3)]}.")

    # Political orientation — with numeric anchor
    if ideo < -2.0:
        ideo_t = f"steht {p} klar links (Selbsteinstufung ca. {ideo:+.1f} auf einer Skala von -5 bis +5)"
    elif ideo < -0.5:
        ideo_t = f"tendiert {p} eher nach links (ca. {ideo:+.1f})"
    elif ideo <= 0.5:
        ideo_t = f"ist {p} politisch in der Mitte (ca. {ideo:+.1f})"
    elif ideo <= 2.0:
        ideo_t = f"neigt {p} eher zu konservativen Positionen (ca. {ideo:+.1f})"
    else:
        ideo_t = f"steht {p} klar rechts (ca. {ideo:+.1f})"

    pn = PARTY_NAMES.get(party, "keiner Partei")
    if will_vote:
        vote_t = f"und waehlt die Partei {pn}"
    else:
        vote_t = f"und sympathisiert mit {pn}, geht aber nicht waehlen"

    lines.append(f"Politisch {ideo_t} {vote_t}.")

    # Satisfaction — 5 levels with numeric anchor
    sat_label = val_label(sat, [
        f"zutiefst unzufrieden ({sat:.1f}/10)",
        f"eher unzufrieden ({sat:.1f}/10)",
        f"teils zufrieden, teils unzufrieden ({sat:.1f}/10)",
        f"eher zufrieden ({sat:.1f}/10)",
        f"sehr zufrieden ({sat:.1f}/10)",
    ])
    lines.append(f"Mit der politischen Lage ist {first} {sat_label}.")

    # Trust — 5 levels with numeric anchor
    trust_label = val_label(trust, [
        f"misstraut den politischen Institutionen stark ({trust:.1f}/10)",
        f"hat eher wenig Vertrauen in die Institutionen ({trust:.1f}/10)",
        f"steht den Institutionen ambivalent gegenueber ({trust:.1f}/10)",
        f"hat ein gewisses Grundvertrauen in die Institutionen ({trust:.1f}/10)",
        f"vertraut den demokratischen Institutionen weitgehend ({trust:.1f}/10)",
    ])
    lines.append(f"{P} {trust_label}.")

    # === NUMERISCHE ANKERWERTE fuer alle latenten Konstrukte ===
    # Diese Werte helfen dem LLM, Fragebogen-Skalen korrekt zu kalibrieren.
    eff_se = traits.get("self_efficacy", 5)
    eff_vi = traits.get("vote_importance", 5)
    know = traits.get("political_knowledge", 5)
    obed = traits.get("obedience_value", 5)
    leader = traits.get("strong_leader_preference", 5)
    rule = traits.get("rule_conformity", 5)
    pwr = traits.get("powerlessness", 5)
    cmplx = traits.get("political_complexity", 5)
    indiff = traits.get("party_indifference", 5)
    mat = traits.get("economic_security_priority", 5)
    env = traits.get("environment_over_economy", 5)
    freedom = traits.get("freedom_over_order", 5)

    eff = (eff_se + eff_vi) / 2
    auth = (obed + leader) / 2
    alien = (pwr + indiff) / 2

    # Efficacy — always describe, with anchor
    eff_label = val_label(eff, [
        "fuehlt sich politisch voellig machtlos",
        "hat eher wenig Vertrauen in die eigene politische Wirksamkeit",
        "ist unsicher, ob die eigene Stimme wirklich zaehlt",
        "glaubt durchaus, politisch etwas bewirken zu koennen",
        "ist fest ueberzeugt, politisch Einfluss nehmen zu koennen",
    ])
    lines.append(f"{first} {eff_label} (Selbstwirksamkeit: {eff_se:.1f}/10, Stimmenwichtigkeit: {eff_vi:.1f}/10).")

    # Authoritarianism — always describe, with anchor
    auth_label = val_label(auth, [
        "lehnt autoritaere Strukturen entschieden ab und betont persoenliche Freiheit",
        "steht Autoritaet eher skeptisch gegenueber",
        "hat ein ambivalentes Verhaeltnis zu Autoritaet — sieht Vor- und Nachteile",
        "schaetzt Ordnung und klare Regeln und neigt zu autoritaeren Positionen",
        "wuenscht sich deutlich staerkere Fuehrung und strikte Ordnung",
    ])
    lines.append(f"{P} {auth_label} (Gehorsam: {obed:.1f}/10, Starke Fuehrung: {leader:.1f}/10).")

    # Alienation — always describe
    alien_label = val_label(alien, [
        "fuehlt sich dem politischen System nahe und identifiziert sich mit dem Prozess",
        "ist politisch maessig interessiert",
        "hat ein zwiespaltiges Verhaeltnis zur Politik",
        "zeigt deutliche Zeichen politischer Entfremdung",
        "ist zutiefst politikverdrossen und empfindet die Politik als fremd",
    ])
    lines.append(f"{P} {alien_label} (Machtlosigkeit: {pwr:.1f}/10, Parteigleichgueltigkeit: {indiff:.1f}/10).")

    # Materialism — always describe
    mat_label = val_label(mat, [
        "vertritt klar postmaterialistische Werte",
        "priorisiert Lebensqualitaet ueber materielle Sicherheit",
        "waegt zwischen materiellen und ideellen Werten ab",
        "legt Wert auf wirtschaftliche Sicherheit",
        "stellt wirtschaftliche Sicherheit klar ueber alles andere",
    ])
    lines.append(f"{P} {mat_label} (Oekonomische Sicherheit: {mat:.1f}/10, Umwelt>Wirtschaft: {env:.1f}/10, Freiheit>Ordnung: {freedom:.1f}/10).")

    # Political knowledge — with anchor
    know_label = val_label(know, [
        "verfolgt das politische Geschehen kaum",
        "bekommt nur am Rande mit, was in der Politik passiert",
        "hat ein durchschnittliches Interesse an Politik",
        "informiert sich regelmaessig ueber politische Themen",
        "verfolgt das Tagesgeschehen aufmerksam und kennt politische Zusammenhaenge",
    ])
    lines.append(f"{first} {know_label} (Pol. Wissen: {know:.1f}/10).")

    # Social embedding — with numeric anchors
    nt = traits.get("neighbor_trust", 5)
    cp = traits.get("community_participation", 5)

    soc_label = val_label(cp, [
        "lebt zurueckgezogen und beteiligt sich kaum am oeffentlichen Leben",
        "nimmt selten an Gemeinschaftsaktivitaeten teil",
        "nimmt gelegentlich an Nachbarschaftsaktivitaeten teil",
        "engagiert sich regelmaessig in der Nachbarschaft",
        "ist im Viertel sehr aktiv und engagiert sich stark",
    ])
    lines.append(f"{first} {soc_label} (Gemeinschaftsbeteiligung: {cp:.1f}/10, Nachbarvertrauen: {nt:.1f}/10).")

    # Emotional baseline — with calibrated thresholds
    if sat < 2.0 and trust < 3.0:
        lines.append(f"Emotional schwankt {first} zwischen Resignation und Wut.")
    elif sat < 3.0:
        lines.append(f"{first} ist innerlich frustriert und unzufrieden.")
    elif sat < 5.0:
        lines.append(f"{first} ist mit der eigenen Situation eher haderndem.")
    elif sat > 7.5 and trust > 7.0:
        lines.append(f"{first} strahlt eine grundlegende Zufriedenheit und Gelassenheit aus.")
    elif sat > 6.0:
        lines.append(f"{first} wirkt im Alltag ausgeglichen.")
    else:
        lines.append(f"{first} hat gemischte Gefuehle — es gibt gute und schlechte Tage.")

    return " ".join(lines)


def generate_change_summary(first, gender, current, previous, tick, events):
    """Generate 1-3 sentences about what changed since last snapshot."""
    if previous is None:
        return ""

    P = Pron(gender)
    p = pron(gender)
    changes = []

    # Party switch
    if current["party"] != previous["party"] and current["party"] is not None and previous["party"] is not None:
        old_p = PARTY_NAMES.get(previous["party"], "?")
        new_p = PARTY_NAMES.get(current["party"], "?")
        changes.append(f"{first} hat die Partei gewechselt: von {old_p} zu {new_p}.")

    # Voting change
    if current["will_vote"] != previous["will_vote"]:
        if current["will_vote"]:
            changes.append(f"{P} hat sich entschieden, kuenftig waehlen zu gehen.")
        else:
            changes.append(f"{P} geht nicht mehr waehlen.")

    # Satisfaction shift
    sat_d = current["sat"] - previous["sat"]
    if sat_d < -2.0:
        changes.append(f"Die Zufriedenheit von {first} ist stark gesunken.")
    elif sat_d > 2.0:
        changes.append(f"{first} ist deutlich zufriedener geworden.")

    # Trust shift
    trust_d = current["trust"] - previous["trust"]
    if trust_d < -2.0:
        changes.append(f"Das Vertrauen in die Institutionen hat stark abgenommen.")
    elif trust_d > 2.0:
        changes.append(f"Das institutionelle Vertrauen ist deutlich gewachsen.")

    # Ideology shift
    ideo_d = current["ideo"] - previous["ideo"]
    if abs(ideo_d) > 1.5:
        direction = "nach rechts" if ideo_d > 0 else "nach links"
        changes.append(f"Politisch hat sich {first} {direction} bewegt.")

    # Income change
    inc_d = current["income"] - previous["income"]
    if previous["income"] > 0 and abs(inc_d / max(previous["income"], 1)) > 0.3:
        if inc_d > 0:
            changes.append(f"Das Einkommen ist deutlich gestiegen.")
        else:
            changes.append(f"Das Einkommen ist deutlich gesunken.")

    # Event context
    relevant_events = []
    prev_tick = previous.get("tick", 0)
    for etick, edesc in sorted(EVENT_DESCRIPTIONS.items()):
        if prev_tick < etick <= tick:
            relevant_events.append(edesc)
    if relevant_events and changes:
        ev_text = ", ".join(relevant_events[:2])
        changes.insert(0, f"Seit {ev_text}:")

    # Coming of age
    prev_age = previous.get("age", 0)
    curr_age = current.get("age", 0)
    if prev_age < 18 <= curr_age:
        changes = [f"{first} ist volljaerig geworden und nimmt nun erstmals am politischen Leben teil."]

    return " ".join(changes)


# ═══════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════

def main():
    conn = sqlite3.connect(DB_PATH)

    # Schema
    try:
        conn.execute("ALTER TABLE blobs ADD COLUMN persona_text TEXT NOT NULL DEFAULT ''")
    except: pass

    conn.execute("""
        CREATE TABLE IF NOT EXISTS blob_persona_snapshots (
            blob_id TEXT NOT NULL,
            tick INTEGER NOT NULL,
            year INTEGER NOT NULL,
            current_age INTEGER NOT NULL,
            job TEXT NOT NULL DEFAULT '',
            persona_state TEXT NOT NULL,
            change_summary TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (blob_id, tick)
        )
    """)
    conn.execute("DELETE FROM blob_persona_snapshots")  # Clean slate
    conn.commit()
    print("Schema bereit.")

    # Load all blobs
    blobs = conn.execute("""
        SELECT id, name, district, age, education_level, income
        FROM blobs ORDER BY district, name
    """).fetchall()
    print(f"{len(blobs)} Blobs geladen.")

    # Process each blob
    base_count = 0
    snap_count = 0

    for blob_id, name, district, start_age, edu, start_income in blobs:
        first = name.split()[0]
        gender = detect_gender(first)
        seed = int(hashlib.md5(blob_id.encode()).hexdigest()[:8], 16)
        rng = random.Random(seed)

        # Deterministic job (based on blob identity)
        job = pick_job(edu, district, gender, rng)

        # Generate BASE persona
        base = generate_base_persona(blob_id, name, district, start_age, edu, gender, rng)
        conn.execute("UPDATE blobs SET persona_text = ? WHERE id = ?", (base, blob_id))
        base_count += 1

        # Generate SNAPSHOTS at each key tick
        previous_state = None

        for tick in SNAPSHOT_TICKS:
            age = current_age(start_age, tick)
            year = tick // TICKS_PER_YEAR

            # Get tick data (find nearest tick with latent traits)
            row = conn.execute("""
                SELECT s.satisfaction, s.ideology, s.trust, s.party, s.will_vote, s.income,
                       s.latent_traits_json
                FROM blob_daily_state s
                WHERE s.blob_id = ? AND s.tick <= ? AND s.latent_traits_json IS NOT NULL
                ORDER BY s.tick DESC LIMIT 1
            """, (blob_id, tick)).fetchone()

            if not row:
                # Try without latent traits requirement
                row = conn.execute("""
                    SELECT s.satisfaction, s.ideology, s.trust, s.party, s.will_vote, s.income, NULL
                    FROM blob_daily_state s
                    WHERE s.blob_id = ? AND s.tick <= ?
                    ORDER BY s.tick DESC LIMIT 1
                """, (blob_id, tick)).fetchone()

            if not row:
                continue

            sat, ideo, trust, party, will_vote, income, traits_json = row
            traits = json.loads(traits_json) if traits_json else {}

            # Children: simple text until 18
            if age < 18:
                state_text = (f"{first} ist {age} Jahre alt und besucht die Schule in "
                              f"{DISTRICTS[district]['label']}. "
                              f"{Pron(gender)} ist noch zu jung fuer politische Einordnung.")
                change_text = ""

                # Adjust job for children who will grow up
                child_job = "Schueler" if gender == "m" else "Schuelerin"

                current_state = {"sat": sat, "ideo": ideo, "trust": trust,
                                "party": party, "will_vote": will_vote,
                                "income": income, "age": age, "tick": tick}
            else:
                # Adults: full state description
                # If child just turned 18, assign education-appropriate job
                actual_job = job
                if start_age < 18 and age >= 18:
                    # Education may have been assigned by now
                    actual_edu = edu  # from blobs table
                    actual_job = pick_job(actual_edu, district, gender, rng)

                state_text = generate_state_snapshot(
                    first, gender, age, edu, income, actual_job,
                    sat, ideo, trust, party, will_vote, traits, tick
                )
                child_job = actual_job

                current_state = {"sat": sat, "ideo": ideo, "trust": trust,
                                "party": party, "will_vote": will_vote,
                                "income": income, "age": age, "tick": tick}

                # Change summary
                change_text = generate_change_summary(
                    first, gender, current_state, previous_state, tick, EVENT_DESCRIPTIONS
                )

            conn.execute("""
                INSERT OR REPLACE INTO blob_persona_snapshots
                (blob_id, tick, year, current_age, job, persona_state, change_summary)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (blob_id, tick, year, age, child_job if age < 18 else job, state_text, change_text))
            snap_count += 1

            previous_state = current_state

    conn.commit()
    print(f"\nFertig: {base_count} Basis-Texte, {snap_count} Zustandssnapshots.")

    # Samples
    print("\n" + "=" * 70)
    print("STICHPROBE: Brigitte Schulz ueber die Zeit")
    print("=" * 70)
    rows = conn.execute("""
        SELECT s.tick, s.year, s.current_age, s.job, s.persona_state, s.change_summary
        FROM blob_persona_snapshots s
        JOIN blobs g ON s.blob_id = g.id
        WHERE g.name = 'Brigitte Schulz' AND g.district = 0
        ORDER BY s.tick
    """).fetchall()

    if not rows:
        # Try any adult
        rows = conn.execute("""
            SELECT s.tick, s.year, s.current_age, s.job, s.persona_state, s.change_summary
            FROM blob_persona_snapshots s
            JOIN blobs g ON s.blob_id = g.id
            WHERE g.age >= 25 AND g.district = 0
            ORDER BY s.tick LIMIT 7
        """).fetchall()

    for tick, year, age, job, state, change in rows:
        print(f"\n--- Jahr {year} (Tick {tick}), Alter {age}, Beruf: {job} ---")
        if change:
            print(f"[Veraenderung] {change}")
        print(state)

    # Count stats
    adults = conn.execute("SELECT COUNT(*) FROM blob_persona_snapshots WHERE current_age >= 18").fetchone()[0]
    children = conn.execute("SELECT COUNT(*) FROM blob_persona_snapshots WHERE current_age < 18").fetchone()[0]
    print(f"\nStatistik: {adults} Erwachsenen-Snapshots, {children} Kinder-Snapshots")

    conn.close()


if __name__ == "__main__":
    main()
