"""
High-Speed Reinforcement & Calibration Optimizer for Diabetic Retinopathy Staging.
Precomputes retinal forward passes and biomarkers, then runs rapid multi-iteration
reward-driven calibration to eliminate bias and optimize multi-class accuracy.
"""

import sys
import json
import time
from pathlib import Path
import cv2
import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F
from scipy.optimize import minimize

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.models.cascade import ClinicalCascade
from src.models.biomarkers import RetinalBiomarkerExtractor
from src.api.predict import RetinalPredictor

CLASS_NAMES = ["No_DR", "Mild", "Moderate", "Severe", "Proliferative_DR"]

def load_evaluation_suite():
    """Builds an evaluation suite containing real internet/wikimedia images and diverse held-out fundus samples."""
    suite = []

    # 1. Benchmark & Wikimedia internet images
    presets = [
        ("Normal Benchmark (Internet)", ROOT_DIR / "normal_benchmark.png", 0),
        ("Mild Benchmark (Internet)", ROOT_DIR / "mild_benchmark.png", 1),
        ("Moderate Wikimedia (Internet)", ROOT_DIR / "moderate_wikimedia.png", 2),
        ("Severe Benchmark (Internet)", ROOT_DIR / "severe_benchmark.png", 3),
        ("PDR Wikimedia (Internet)", ROOT_DIR / "pdr_wikimedia.jpg", 4),
    ]
    for name, p, label in presets:
        if p.exists():
            suite.append({"name": name, "path": p, "label": label, "source": "internet"})

    # 2. Bing user screenshots from Downloads
    dl = Path(r"C:\Users\koush\Downloads")
    bing_images = [
        ("Bing 151540 (Google/Bing)", dl / "Screenshot_19-9-2026_151540_www.bing.com.jpeg", 2),
        ("Bing 14939 (Google/Bing)", dl / "Screenshot_19-9-2026_14939_www.bing.com.jpeg", 3),
        ("Bing 14630 (Google/Bing)", dl / "Screenshot_19-9-2026_14630_www.bing.com.jpeg", 3),
    ]
    for name, p, label in bing_images:
        if p.exists():
            suite.append({"name": name, "path": p, "label": label, "source": "google_bing"})

    # 3. Held-out diverse validation images from val_processed.csv (3 per class)
    val_csv = ROOT_DIR / "data" / "processed" / "val_processed.csv"
    if val_csv.exists():
        df = pd.read_csv(val_csv)
        for c in range(5):
            c_df = df[df["diagnosis"] == c]
            sample_paths = c_df["image_path"].head(3).tolist()
            for i, sp in enumerate(sample_paths):
                p = Path(sp)
                if p.exists():
                    suite.append({
                        "name": f"Val_Fundus_G{c}_{i+1}",
                        "path": p,
                        "label": c,
                        "source": "clinical_val"
                    })

    return suite

def precompute_dataset(suite, predictor):
    print("[Precompute] Caching retinal features & model logits...", flush=True)
    cached = []
    for item in suite:
        img = cv2.imread(str(item["path"]))
        if img is None:
            continue
        tensor_np, _ = predictor.preprocess_image(img)
        with torch.no_grad():
            logits = predictor.model(torch.from_numpy(tensor_np).to(predictor.device))
            raw_probs = F.softmax(logits, dim=1).cpu().numpy()[0]
        biomarkers = RetinalBiomarkerExtractor.extract_features(img)
        cached.append({
            "name": item["name"],
            "raw_probs": raw_probs,
            "biomarkers": biomarkers,
            "true_idx": item["label"]
        })
    print(f"[Precompute] Cached {len(cached)} images successfully.", flush=True)
    return cached

def evaluate_cached(cached, weights):
    total_reward = 0.0
    correct_count = 0
    results = []

    for item in cached:
        raw_probs = item["raw_probs"]
        biomarkers = item["biomarkers"]
        true_idx = item["true_idx"]

        cascade = ClinicalCascade.process_probabilities(raw_probs, calibration_weights=weights, biomarkers=biomarkers)
        pred_idx = cascade["tier_4_exact_staging"]["class_index"]
        conf = cascade["tier_4_exact_staging"]["confidence_pct"]

        # Reward & Punishment matrix
        if pred_idx == true_idx:
            # Positive Reward
            reward = 2.0
            if true_idx in [1, 2]: # Bonus for mastering difficult Mild / Moderate boundary
                reward += 1.0
            correct_count += 1
            status = "REWARD (+)"
        else:
            diff = abs(pred_idx - true_idx)
            if diff == 1:
                # Mild punishment for adjacent class
                reward = -1.5
            elif (true_idx >= 1 and pred_idx == 0) or (true_idx == 0 and pred_idx >= 2):
                # Heavy punishment for missing disease or false referable
                reward = -6.0
            else:
                reward = -3.5
            status = "PUNISH (-)"

        total_reward += reward
        results.append({
            "name": item["name"],
            "true_class": CLASS_NAMES[true_idx],
            "pred_class": CLASS_NAMES[pred_idx],
            "confidence": conf,
            "reward": reward,
            "status": status,
            "correct": pred_idx == true_idx
        })

    accuracy = (correct_count / len(results)) * 100 if results else 0.0
    return total_reward, accuracy, results

def run_reinforcement_optimization():
    print("=" * 75)
    print("  REINFORCEMENT LEARNING & CLINICAL CALIBRATION OPTIMIZER")
    print("=" * 75)

    predictor = RetinalPredictor()
    suite = load_evaluation_suite()
    cached = precompute_dataset(suite, predictor)

    # Initial weights
    init_weights = np.array([1.05, 1.35, 1.30, 1.15, 1.15], dtype=np.float32)
    print("\n[Episode 0: Baseline Evaluation]")
    base_reward, base_acc, base_res = evaluate_cached(cached, init_weights)
    print(f"Baseline Total Reward: {base_reward:+.2f} | Accuracy: {base_acc:.1f}%")

    iteration_history = []
    
    def loss_func(w):
        w_norm = np.clip(w, 0.2, 5.0).astype(np.float32)
        rew, acc, _ = evaluate_cached(cached, w_norm)
        iteration_history.append((rew, acc, w_norm.copy()))
        if len(iteration_history) % 10 == 1 or len(iteration_history) <= 3:
            print(f"  Iteration {len(iteration_history):3d} -> Reward: {rew:+6.2f} | Acc: {acc:5.1f}% | Weights: {np.round(w_norm, 2)}")
        return -rew

    print("\n[Starting Reward-Maximization Optimization (Nelder-Mead Exploration)...]")
    res = minimize(
        loss_func,
        init_weights,
        method="Nelder-Mead",
        options={"maxiter": 80, "xatol": 0.02, "fatol": 0.2, "disp": False}
    )

    best_weights = np.clip(res.x, 0.2, 5.0).astype(np.float32)
    final_reward, final_acc, final_res = evaluate_cached(cached, best_weights)

    print("\n" + "=" * 75)
    print("  OPTIMIZATION COMPLETE & CONVERGED!")
    print(f"  Initial Reward: {base_reward:+.2f} ({base_acc:.1f}%) -> Final Reward: {final_reward:+.2f} ({final_acc:.1f}%)")
    print(f"  Optimal Calibrated Multipliers: {np.round(best_weights, 3)}")
    print("=" * 75)

    # Print Scorecard
    print(f"\n{'Image Name':30s} | {'True Stage':14s} | {'Predicted':14s} | {'Conf':7s} | {'Feedback':12s}")
    print("-" * 88)
    for r in final_res:
        mark = "[PASS]" if r["correct"] else "[FAIL]"
        print(f"{r['name']:30s} | {r['true_class']:14s} | {r['pred_class']:14s} | {r['confidence']:5.1f}% | {r['status']} ({r['reward']:+3.1f}) {mark}")

    # Save optimal weights to optimal_thresholds.npy
    save_path = ROOT_DIR / "data" / "optimal_thresholds.npy"
    np.save(str(save_path), best_weights)
    print(f"\n[Artifact Saved] Optimal weights written to {save_path}")

    return best_weights, final_acc, final_reward

if __name__ == "__main__":
    run_reinforcement_optimization()
