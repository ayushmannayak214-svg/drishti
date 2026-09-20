from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"

IMAGE_SIZE = (300, 300)
NUM_CLASSES = 5

CLASS_NAMES = [
    "No_DR",
    "Mild",
    "Moderate",
    "Severe",
    "Proliferative_DR",
]

SEED = 42
BATCH_SIZE = 16
HEAD_EPOCHS = 8
FINETUNE_EPOCHS = 30
LEARNING_RATE = 4e-4
FINETUNE_LEARNING_RATE = 2e-5
UNFREEZE_LAST_N = 150
EPOCHS = HEAD_EPOCHS + FINETUNE_EPOCHS

MODEL_SAVE_PATH = BASE_DIR / "best_model.keras"