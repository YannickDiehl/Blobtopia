"""Empirische Referenzwerte für Plausibilitätstests (Deutschland).

Quellen: ALLBUS, ESS, Bundestagswahlstatistik, Inglehart, Altemeyer, etc.
"""

# --- Ideologie (Links-Rechts Selbsteinstufung, 1-10) ---
# ALLBUS 2021: M ≈ 5.1, SD ≈ 1.8
IDEOLOGY_MEAN_RANGE = (4.5, 6.0)
IDEOLOGY_SD_RANGE = (1.2, 2.5)

# --- Wahlbeteiligung ---
# Bundestagswahlen 2009-2021: 70.8%, 71.5%, 76.2%, 76.6%
TURNOUT_RANGE_REALISTIC = (0.60, 0.82)

# --- Einkommensungleichheit ---
# Deutschland Netto-Gini ~0.29, Brutto ~0.50
GINI_RANGE_REALISTIC = (0.20, 0.45)

# --- Institutionelles Vertrauen ---
# ESS Round 10 (2020/21) Deutschland: trust in parliament M ≈ 4.8/10
TRUST_MEAN_RANGE = (3.5, 6.5)

# --- Bildung-Authoritarismus ---
# Houtman (2003), Stubager (2008): robust negative, r ≈ -0.20 bis -0.40
EDUCATION_AUTHORITARIANISM_R_MAX = -0.15  # mindestens so negativ

# --- Alter-Materialismus ---
# Inglehart (1977, 1997): ältere Kohorten materialistischer
AGE_MATERIALISM_R_MIN = 0.05  # mindestens schwach positiv

# --- Trait-Stabilität (rank-order) ---
# Roberts & DelVecchio (2000): Big Five r ≈ 0.60-0.75
TRAIT_RANK_ORDER_STABILITY_MIN = 0.40  # etwas niedriger für Einstellungen vs. Persönlichkeit

# --- Alterseffekt Authoritarismus ---
# Feldman & Stenner (1997): schwacher positiver Zusammenhang
AGE_AUTHORITARIANISM_R_RANGE = (0.05, 0.35)

# --- Bildung-Efficacy ---
# Verba, Schlozman & Brady (1995): positiver Zusammenhang
EDUCATION_EFFICACY_R_MIN = 0.10

# --- Einkommen-Zufriedenheit ---
# Individuelle Ebene: konsistent positiv, r ≈ 0.15-0.35
INCOME_SATISFACTION_R_RANGE = (0.10, 0.50)

# --- ENP (Effective Number of Parties) ---
# Deutschland Bundestag: ~4.5-5.5 (Mehrparteiensystem)
ENP_REALISTIC_RANGE = (2.0, 5.5)

# --- Protest-Korrelate ---
# Dalton (2008): Protest korreliert mit Unzufriedenheit und Misstrauen
PROTEST_SATISFACTION_R_MAX = -0.30
PROTEST_TRUST_R_MAX = -0.20

# --- Ceiling/Floor Effekte ---
CEILING_FLOOR_MAX_PERCENT = 5.0  # max 5% an den Rändern

# --- Distrikt-Differenzierung ---
# η² > 0.05 = kleiner bis mittlerer Effekt (ausreichend für Differenzierung)
DISTRICT_ETA_SQUARED_MIN = 0.03

# --- Autokorrelation ---
# Tägliche Einstellungswerte sollten sehr stabil sein
ACF1_MIN = 0.90

# --- Varianz-Erhalt über Zeit ---
# SD_end / SD_start > 0.50 (keine Homogenisierung)
VARIANCE_RETENTION_MIN = 0.40

# --- Cronbach Alpha Verfall ---
CRONBACH_MAX_DECLINE = 0.20

# --- CFA Diskriminante Validität ---
MAX_INTER_CONSTRUCT_R = 0.85

# --- Event-Decay ---
EVENT_RECOVERY_MIN_PERCENT = 30.0  # mindestens 30% Recovery nach 365 Ticks

# --- Konstrukt-Korrelat-Erwartungen ---
CONSTRUCT_CORRELATES = {
    # (construct_indicator, external_variable, expected_sign, min_abs_r)
    "efficacy_education": ("self_efficacy", "education_level", "+", 0.10),
    "authoritarianism_ideology": ("obedience_value", "ideology", "+", 0.10),
    "alienation_satisfaction": ("powerlessness", "satisfaction", "-", 0.10),
    "social_trust": ("neighbor_trust", "trust", "+", 0.10),
    "materialism_income": ("economic_security_priority", "income", "+", 0.05),
}
