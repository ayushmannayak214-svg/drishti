"""
Multi-Class Calibration & Decision Boundary Optimization (Loops 4, 8 & 9)
Finds optimal per-class multipliers / logit adjustments to pull Severe and Proliferative DR
out of the Moderate sink, maximizing balanced recall while strictly guarding No_DR specificity >= 92%.
"""

import sys
import numpy as np
import torch
from sklearn.metrics import confusion_matrix, classification_report, cohen_kappa_score
from src.config import CLASS_NAMES, DATA_DIR
from src.training.train_arc import DRModel

def load_data_and_model():
    print("[1/3] Loading validation cache and model...", flush=True)
    val_cache = DATA_DIR / "cache" / "val_cache.npz"
    data = np.load(val_cache)
    images, labels = data["images"], data["labels"]

    device = torch.device("cpu")
    model = DRModel(num_classes=5, pretrained=False)
    ckpt = torch.load("best_model_arc.pth", map_location="cpu")
    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()

    print("[2/3] Computing validation probabilities...", flush=True)
    imgs = images.astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 1, 3)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 1, 3)
    imgs = (imgs - mean) / std
    imgs_nchw = imgs.transpose(0, 3, 1, 2)

    all_probs = []
    batch_size = 32
    with torch.no_grad():
        for i in range(0, len(imgs_nchw), batch_size):
            b = torch.from_numpy(imgs_nchw[i:i+batch_size])
            out = model(b)
            prob = torch.softmax(out, dim=1).numpy()
            all_probs.append(prob)
    all_probs = np.concatenate(all_probs, axis=0)
    return all_probs, labels

def evaluate_weights(weights, probs, labels, verbose=False):
    scaled_probs = probs * weights.reshape(1, -1)
    preds = np.argmax(scaled_probs, axis=1)

    cm = confusion_matrix(labels, preds, labels=range(5))
    recalls = []
    for i in range(5):
        tot = np.sum(labels == i)
        rec = cm[i, i] / tot if tot > 0 else 0
        recalls.append(rec)

    overall_acc = np.mean(preds == labels)
    qwk = cohen_kappa_score(labels, preds, weights="quadratic")

    # Binary referable metrics (Class >= 2 vs Class < 2)
    y_true_ref = (labels >= 2).astype(int)
    y_pred_ref = (preds >= 2).astype(int)
    cm_ref = confusion_matrix(y_true_ref, y_pred_ref, labels=[0, 1])
    tn, fp, fn, tp = cm_ref.ravel()
    ref_sens = tp / (tp + fn) if (tp + fn) > 0 else 0
    ref_spec = tn / (tn + fp) if (tn + fp) > 0 else 0

    if verbose:
        print("\n" + "="*55)
        print("CONFUSION MATRIX (Rows: True, Cols: Predicted):")
        print(cm)
        print("\nPER-CLASS RECALL:")
        for i, name in enumerate(CLASS_NAMES):
            tot = np.sum(labels == i)
            cor = cm[i, i]
            print(f"  {name:18s}: {cor:3d}/{tot:3d}  Recall: {recalls[i]*100:6.2f}%")
        print(f"\nOverall Accuracy      : {overall_acc*100:.2f}%")
        print(f"Macro-Averaged Recall : {np.mean(recalls)*100:.2f}%")
        print(f"Severe Recall         : {recalls[3]*100:.2f}%")
        print(f"Proliferative Recall  : {recalls[4]*100:.2f}%")
        print(f"Mild Recall           : {recalls[1]*100:.2f}%")
        print(f"Referable Sensitivity : {ref_sens*100:.2f}%")
        print(f"Referable Specificity : {ref_spec*100:.2f}%")
        print(f"Quadratic Weighted K. : {qwk:.4f}")
        print("="*55)

    return {
        "cm": cm,
        "recalls": recalls,
        "overall_acc": overall_acc,
        "macro_recall": np.mean(recalls),
        "qwk": qwk,
        "ref_sens": ref_sens,
        "ref_spec": ref_spec
    }

def optimize_calibration():
    probs, labels = load_data_and_model()

    print("\n--- BASELINE (Uncalibrated argmax) ---")
    evaluate_weights(np.array([1.0, 1.0, 1.0, 1.0, 1.0]), probs, labels, verbose=True)

    print("\n[3/3] Searching for optimal calibration weights...", flush=True)

    best_score = -1e9
    best_w = None

    # Targeted search over class weights
    for w1 in [1.0, 1.2, 1.5, 1.8, 2.2]:
        for w2 in [0.75, 0.85, 1.0]:
            for w3 in [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5]:
                for w4 in [1.2, 1.5, 1.8, 2.2, 2.5]:
                    w = np.array([1.0, w1, w2, w3, w4])
                    res = evaluate_weights(w, probs, labels, verbose=False)

                    # Guardrails:
                    # 1. No_DR specificity >= 92%
                    # 2. Overall accuracy >= 76%
                    # 3. Referable sensitivity >= 90%
                    if res["recalls"][0] >= 0.92 and res["overall_acc"] >= 0.76 and res["ref_sens"] >= 0.90:
                        score = res["macro_recall"] * 100 + res["recalls"][3] * 70 + res["recalls"][4] * 40 + res["qwk"] * 30
                        if score > best_score:
                            best_score = score
                            best_w = w

    if best_w is not None:
        print(f"\n[OPTIMIZATION SUCCESS] Found optimal calibration weights:")
        print(f"  w = [w0={best_w[0]:.2f}, w1={best_w[1]:.2f}, w2={best_w[2]:.2f}, w3={best_w[3]:.2f}, w4={best_w[4]:.2f}]")
        print("\n--- OPTIMIZED CALIBRATION RESULTS ---")
        evaluate_weights(best_w, probs, labels, verbose=True)

        out_path = DATA_DIR / "optimal_thresholds.npy"
        np.save(str(out_path), best_w)
        print(f"\nSaved optimal calibration multipliers to {out_path}")
    else:
        print("No combination satisfied all constraints. Trying broader range...")

if __name__ == "__main__":
    optimize_calibration()
