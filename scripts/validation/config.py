"""Schwellenwerte und Konstanten für die Validierung."""

import os

# --- Pfade ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "data", "blobtopia_timeline.db")
EVENTS_PATH = os.path.join(BASE_DIR, "data", "blobtopia-events.json")

# --- Simulation ---
EXPECTED_BLOBS = 500
TICKS_PER_YEAR = 365
TOTAL_TICKS = 8031  # 0..8030 inclusive
EXPECTED_ROWS_PER_GLOB = TOTAL_TICKS
SNAPSHOT_TICKS = [0, 1460, 2920, 4380, 5475, 7300, 8029]
EXPECTED_SNAPSHOTS = EXPECTED_BLOBS * len(SNAPSHOT_TICKS)  # 3500
ELECTION_TICKS = [1460, 2920, 4380, 5475, 7300]

# --- Wertebereiche ---
SATISFACTION_RANGE = (0.0, 10.0)
IDEOLOGY_RANGE = (1.0, 10.0)
TRUST_RANGE = (0.0, 10.0)
PROTEST_RANGE = (0.0, 1.0)
VALID_PARTIES = {0, 1, 2, 3}
EDUCATION_LEVELS = {0, 1, 2, 3}

# --- Parteinamen ---
PARTY_NAMES = {0: "Fortschritt", 1: "Mitte", 2: "Tradition", 3: "Unabhaengige", None: "keine"}

# --- Latent Traits (15 Indikatoren, 5 Konstrukte) ---
TRAIT_KEYS = [
    "self_efficacy", "political_knowledge", "vote_importance",
    "obedience_value", "strong_leader_preference", "rule_conformity",
    "powerlessness", "political_complexity", "party_indifference",
    "economic_security_priority", "environment_over_economy", "freedom_over_order",
    "neighbor_trust", "community_participation", "network_size",
]

CFA_MODEL = """
    efficacy =~ self_efficacy + political_knowledge + vote_importance
    social =~ neighbor_trust + community_participation + network_size
    authoritarianism =~ obedience_value + rule_conformity + strong_leader_preference
    alienation =~ powerlessness + political_complexity + party_indifference
    materialism =~ economic_security_priority + environment_over_economy + freedom_over_order
"""

# --- Layer 1 Schwellenwerte ---
ELECTION_VOTE_SUM_MIN = 200
ELECTION_VOTE_SUM_MAX = 500

# --- Layer 2 Schwellenwerte ---
CFA_CFI_PASS = 0.95
CFA_CFI_WARN = 0.90
CFA_CFI_FAIL = 0.90  # < this = FAIL
CFA_CFI_END_PASS = 0.85
CFA_CFI_END_WARN = 0.75

CRONBACH_PASS = 0.60
CRONBACH_WARN = 0.50

TURNOUT_RANGE = (0.55, 0.85)
ENP_RANGE = (2.5, 5.5)
GINI_RANGE = (0.2, 0.5)

VARIANCE_MIN = 1.0

# --- Layer 3 ---
PROMPT_SAMPLE_SIZE = 50

# --- Layer 4 ---
LLM_MAD_THRESHOLD = 1.0
LLM_DIRECTION_THRESHOLD = 0.85

# --- Layer 5 Schwellenwerte ---
SAT_JUMP_THRESHOLD = 2.0
TRUST_JUMP_THRESHOLD = 2.0
IDEOLOGY_JUMP_THRESHOLD = 1.35
MAX_JUMPS_PER_GLOB_WARN = 10
PARTY_SWITCH_AVG_WARN = 50

# --- Layer 6 Schwellenwerte ---
TWEET_MIN_COUNT = 300
TWEET_MAX_COUNT = 1000
TWEET_MAX_LENGTH = 280
TWEET_SOFT_MAX_LENGTH = 200
TWEET_NUMBER_LEAK_PATTERN = r'\d+[.,]\d+\s*(/|von)\s*10|\d+/10'
TWEET_DISTRICT_MIN_PERCENT = 12.0
TWEET_MAX_TEMPORAL_GAP = 250
TWEET_VALID_TOPICS = {"wirtschaft", "umwelt", "sicherheit", "vertrauen", "teilhabe", "persoenlich"}
TWEET_VALID_TRIGGERS = {"event_reaction", "threshold", "periodic", "background"}
TWEET_TOPIC_MIN_PERCENT = 10.0
TWEET_TOPIC_MAX_PERCENT = 25.0

# --- Education Style Mapping (Rust-Prompt-Logik) ---
EDU_STYLES = {
    0: "direkt und unverbluemt, ohne akademische Umschweife",
    1: "unkompliziert und bodenstaendig",
    2: "sachlich und bestimmt",
    3: "differenziert und reflektiert",
}
