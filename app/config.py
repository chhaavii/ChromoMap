"""ChronoMem configuration — all knobs overridable via env vars."""
import os

# LLM
LLM_MODEL = os.getenv("LLM_MODEL", "claude-sonnet-4-5")

# Token pricing (USD per 1M tokens) for the cost ledger
PRICE_PER_1M_INPUT_TOKENS = float(os.getenv("PRICE_PER_1M_INPUT_TOKENS", "3.0"))
PRICE_PER_1M_OUTPUT_TOKENS = float(os.getenv("PRICE_PER_1M_OUTPUT_TOKENS", "15.0"))

# Hebbian / decay constants
HEBBIAN_ETA = float(os.getenv("HEBBIAN_ETA", "0.2"))
DECAY_LAMBDA = float(os.getenv("DECAY_LAMBDA", "0.05"))
WEIGHT_FLOOR = float(os.getenv("WEIGHT_FLOOR", "0.1"))
WEIGHT_CAP = float(os.getenv("WEIGHT_CAP", "5.0"))

# Retrieval
PAGERANK_TOP_N = int(os.getenv("PAGERANK_TOP_N", "8"))
# Pinned nodes always score at least this much (pagerank scores sum to 1)
PINNED_SCORE_FLOOR = float(os.getenv("PINNED_SCORE_FLOOR", "0.1"))
# Question keywords that imply the past -> include superseded edges
PAST_HINTS = {
    "before",
    "used to",
    "previously",
    "in the past",
    "former",
    "back then",
    "prior",
    "did",
    "history of",
}

# Exclusive relations trigger supersession when subject matches but object differs
EXCLUSIVE_RELATIONS = {
    "dating",
    "lives_in",
    "works_at",
    "studies_at",
    "married_to",
}

# Server
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

# Database location
DATABASE_PATH = os.getenv("DATABASE_PATH", "chronomem.db")

# LLM call settings
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
LLM_MAX_RETRIES = 1  # one retry on failure / parse error

# Decay tick cadence (seconds) for the background task
DECAY_TICK_SECONDS = float(os.getenv("DECAY_TICK_SECONDS", "60"))

# Node types and clusters accepted by the data model
NODE_TYPES = {"person", "topic", "event", "place", "decision"}
CLUSTERS = {"relationships", "work", "places", "hobbies", "other"}
