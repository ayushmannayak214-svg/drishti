

import subprocess
import sys

PYTHON = r"C:\Users\koush\AppData\Local\Programs\Python\Python311\python.exe"


def run(cmd):
    print(f"\n{'='*60}")
    print(f"RUNNING: {' '.join(cmd)}")
    print('='*60)
    result = subprocess.run(cmd, check=True)
    return result


if __name__ == "__main__":
    # Step 1: CLAHE preprocessing (fast, ~3–5 min)
    run([PYTHON, "-m", "src.data.clahe_preprocess"])

    # Step 2: Training
    run([PYTHON, "-m", "src.training.train_arc"])

    # Step 3: Evaluation with TTA
    run([PYTHON, "-m", "src.evaluation.evaluate_arc"])

    print("\n[ALL DONE] Training pipeline complete!")
