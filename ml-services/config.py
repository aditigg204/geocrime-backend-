"""
ML Pipeline Configuration
"""
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR / "datasets"
PROCESSED_DIR = DATASETS_DIR / "processed"
MODELS_DIR = BASE_DIR / "models"
LOGS_DIR = BASE_DIR / "logs"

# Ensure directories exist
MODELS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# Data files
PROCESSED_DATA_FILE = PROCESSED_DIR / "model1_india_ipc_features.csv"

# Model files
MODEL_FILE = MODELS_DIR / "zone_risk_model.pkl"
SCALER_FILE = MODELS_DIR / "feature_scaler.pkl"
FEATURE_NAMES_FILE = MODELS_DIR / "feature_names.pkl"

# Feature configuration
FEATURE_COLUMNS = [
    'murder', 'attempt_to_murder', 'rape', 'kidnapping_&_abduction',
    'dacoity', 'robbery', 'burglary', 'theft', 'riots',
    'arson', 'hurt_grevious_hurt', 'dowry_deaths',
    'assault_on_women_with_intent_to_outrage_her_modesty',
    'cruelty_by_husband_or_his_relatives',
    'total_crime', 'weighted_severity_raw', 'risk_score',
    'previous_year_total_crime', 'previous_year_risk_score',
    'rolling_3yr_total_crime', 'rolling_3yr_risk_score', 'crime_growth_rate'
]

TARGET_COLUMN = 'next_year_risk_score'

# Model hyperparameters
MODEL_PARAMS = {
    'n_estimators': 100,
    'max_depth': 8,
    'learning_rate': 0.1,
    'subsample': 0.8,
    'colsample_bytree': 0.8,
    'random_state': 42,
    'verbosity': 1
}

# Train-test split
TEST_SIZE = 0.2
VALIDATION_SIZE = 0.1
RANDOM_STATE = 42

# Training config
BATCH_SIZE = 32
EPOCHS = 100
EARLY_STOPPING_PATIENCE = 10
