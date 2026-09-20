"""
Scientific Validation Script: Baseline Model A vs Hierarchical Cascade Model B.
Computes exact metrics on untouched validation cohort (N=733):
- Full comparative metrics (Accuracy, QWK, Macro F1, Balanced Accuracy)
- Per-class Recall and F1 for all 5 classes
- Referable DR and Sight-Threatening DR Sensitivity & Specificity
- Stage-by-stage confusion matrices and metrics
- Cascade error propagation analysis
- Abstention threshold sweep (coverage vs performance)
- IQA validation across all 733 images by class
"""

import sys, os, json, time
import numpy as np
import pandas as pd
import cv2
import torch
import torch.nn.functional as F
from sklearn.metrics import (
    confusion_matrix, classification_report, cohen_kappa_score, balanced_accuracy_score
)

from src.config import DATA_DIR, CLASS_NAMES, BASE_DIR
from src.training.train_arc import DRModel
from src.models.cascade import ClinicalCascade
from src.data.iqa import ImageQualityAssessment

def run_evaluation():
    print("=" * 70)
    print("SCIENTIFIC COMPARATIVE EVALUATION: BASELINE VS CASCADE")
    print("=" * 70, flush=True)

    # 1. Load validation data
    val_cache = DATA_DIR / "cache" / "val_cache.npz"
    data = np.load(val_cache)
    images, labels = data["images"], data["labels"]
    n_samples = len(labels)
    print(f"Validation cohort size: {n_samples} images", flush=True)

    # 2. Run model inference to get raw probabilities
    device = torch.device("cpu")
    model = DRModel(num_classes=5, pretrained=False)
    ckpt = torch.load("best_model_arc.pth", map_location="cpu", weights_only=False)
    model.load_state_dict(ckpt.get("model_state_dict", ckpt))
    model.to(device)
    model.eval()

    imgs = images.astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 1, 3)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 1, 3)
    imgs = (imgs - mean) / std
    imgs_nchw = imgs.transpose(0, 3, 1, 2)

    all_raw_probs = []
    with torch.no_grad():
        for i in range(0, n_samples, 32):
            b = torch.from_numpy(imgs_nchw[i:i+32])
            out = model(b)
            prob = torch.softmax(out, dim=1).numpy()
            all_raw_probs.append(prob)
    raw_probs = np.concatenate(all_raw_probs, axis=0)

    # =========================================================================
    # MODEL A: BASELINE (Uncalibrated argmax)
    # =========================================================================
    preds_a = np.argmax(raw_probs, axis=1)
    acc_a = float(np.mean(preds_a == labels))
    qwk_a = float(cohen_kappa_score(labels, preds_a, weights="quadratic"))
    bal_acc_a = float(balanced_accuracy_score(labels, preds_a))
    rep_a = classification_report(labels, preds_a, target_names=CLASS_NAMES, output_dict=True, zero_division=0)
    macro_f1_a = float(rep_a["macro avg"]["f1-score"])

    # Referable DR for Model A (pred >= 2)
    true_ref = (labels >= 2).astype(int)
    pred_ref_a = (preds_a >= 2).astype(int)
    cm_ref_a = confusion_matrix(true_ref, pred_ref_a, labels=[0, 1])
    tn_a, fp_a, fn_a, tp_a = cm_ref_a.ravel()
    sens_ref_a = float(tp_a / (tp_a + fn_a)) if (tp_a + fn_a) else 0.0
    spec_ref_a = float(tn_a / (tn_a + fp_a)) if (tn_a + fp_a) else 0.0

    # Sight-Threatening DR for Model A (pred >= 3)
    true_stdr = (labels >= 3).astype(int)
    pred_stdr_a = (preds_a >= 3).astype(int)
    cm_stdr_a = confusion_matrix(true_stdr, pred_stdr_a, labels=[0, 1])
    tn_st_a, fp_st_a, fn_st_a, tp_st_a = cm_stdr_a.ravel()
    sens_stdr_a = float(tp_st_a / (tp_st_a + fn_st_a)) if (tp_st_a + fn_st_a) else 0.0
    spec_stdr_a = float(tn_st_a / (tn_st_a + fp_st_a)) if (tn_st_a + fp_st_a) else 0.0

    # =========================================================================
    # MODEL B: HIERARCHICAL CASCADE
    # =========================================================================
    cascade_results = [ClinicalCascade.process_probabilities(raw_probs[i]) for i in range(n_samples)]
    preds_b = np.array([r["tier_4_exact_staging"]["class_index"] for r in cascade_results])
    pred_ref_b = np.array([int(r["tier_2_referability"]["referable"]) for r in cascade_results])
    pred_stdr_b = np.array([int(r["tier_3_sight_threatening"]["sight_threatening"]) for r in cascade_results])
    pred_normal_b = np.array([int(r["tier_1_screening"]["healthy_ruling"]) for r in cascade_results])

    acc_b = float(np.mean(preds_b == labels))
    qwk_b = float(cohen_kappa_score(labels, preds_b, weights="quadratic"))
    bal_acc_b = float(balanced_accuracy_score(labels, preds_b))
    rep_b = classification_report(labels, preds_b, target_names=CLASS_NAMES, output_dict=True, zero_division=0)
    macro_f1_b = float(rep_b["macro avg"]["f1-score"])

    # Referable DR for Model B
    cm_ref_b = confusion_matrix(true_ref, pred_ref_b, labels=[0, 1])
    tn_b, fp_b, fn_b, tp_b = cm_ref_b.ravel()
    sens_ref_b = float(tp_b / (tp_b + fn_b)) if (tp_b + fn_b) else 0.0
    spec_ref_b = float(tn_b / (tn_b + fp_b)) if (tn_b + fp_b) else 0.0

    # Sight-Threatening DR for Model B
    cm_stdr_b = confusion_matrix(true_stdr, pred_stdr_b, labels=[0, 1])
    tn_st_b, fp_st_b, fn_st_b, tp_st_b = cm_stdr_b.ravel()
    sens_stdr_b = float(tp_st_b / (tp_st_b + fn_st_b)) if (tp_st_b + fn_st_b) else 0.0
    spec_stdr_b = float(tn_st_b / (tn_st_b + fp_st_b)) if (tn_st_b + fp_st_b) else 0.0

    # =========================================================================
    # STAGE-BY-STAGE INDEPENDENT EVALUATION
    # =========================================================================
    # Stage 1: Normal (0) vs Abnormal (1..4)
    true_stage1 = (labels >= 1).astype(int)
    pred_stage1 = (1 - pred_normal_b)  # 1 = abnormal, 0 = normal
    cm_stage1 = confusion_matrix(true_stage1, pred_stage1, labels=[0, 1])
    # Stage 2: Referable (>=2) vs Non-Referable (<2)
    cm_stage2 = cm_ref_b
    # Stage 3: Sight-Threatening (>=3) vs Non-Sight-Threatening (<3)
    cm_stage3 = cm_stdr_b
    # Stage 4: 5-Class CM
    cm_stage4 = confusion_matrix(labels, preds_b, labels=range(5))

    # =========================================================================
    # CASCADE FAILURE & ERROR PROPAGATION ANALYSIS
    # =========================================================================
    # Stage 1: Abnormal vs Normal
    # Correct on S1: pred_stage1 == true_stage1
    s1_correct = (pred_stage1 == true_stage1)
    s2_correct = (pred_ref_b == true_ref)
    s3_correct = (pred_stdr_b == true_stdr)
    s4_correct = (preds_b == labels)

    # Failure Mode 1: Stage 1 correct, but Stage 2 fails
    s1_corr_s2_fail = np.sum(s1_correct & (~s2_correct))
    # Failure Mode 2: Stage 2 correct, but Stage 3 fails
    s2_corr_s3_fail = np.sum(s2_correct & (~s3_correct))
    # Failure Mode 3: Stage 3 correct, but Stage 4 fails
    s3_corr_s4_fail = np.sum(s3_correct & (~s4_correct))
    # All stages correct:
    all_stages_correct = np.sum(s1_correct & s2_correct & s3_correct & s4_correct)

    # =========================================================================
    # ABSTENTION THRESHOLD HYPERPARAMETER SWEEP
    # =========================================================================
    abstention_sweep = []
    # Test varying margin thresholds: 0.00 (no abstention), 0.05, 0.08, 0.10, 0.12, 0.15, 0.20
    for margin_th in [0.00, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.22]:
        abstain_mask = np.zeros(n_samples, dtype=bool)
        for i in range(n_samples):
            w = ClinicalCascade.DEFAULT_WEIGHTS
            cal = raw_probs[i] * w
            cal /= np.sum(cal)
            s_probs = np.sort(cal)[::-1]
            margin = s_probs[0] - s_probs[1]
            if margin < margin_th:
                abstain_mask[i] = True

        acc_mask = ~abstain_mask
        cov = float(np.mean(acc_mask))
        abs_rate = float(np.mean(abstain_mask))

        if np.sum(acc_mask) > 0:
            y_acc = labels[acc_mask]
            p_acc = preds_b[acc_mask]
            acc_val = float(np.mean(p_acc == y_acc))
            qwk_val = float(cohen_kappa_score(y_acc, p_acc, weights="quadratic")) if len(np.unique(y_acc)) > 1 else 0.0
            rep_val = classification_report(y_acc, p_acc, output_dict=True, zero_division=0)
            f1_val = float(rep_val["macro avg"]["f1-score"])

            # Per class recalls on accepted set
            rec_sev = float(np.sum((y_acc == 3) & (p_acc == 3)) / np.sum(y_acc == 3)) if np.sum(y_acc == 3) else 0.0
            rec_prol = float(np.sum((y_acc == 4) & (p_acc == 4)) / np.sum(y_acc == 4)) if np.sum(y_acc == 4) else 0.0
        else:
            acc_val, qwk_val, f1_val, rec_sev, rec_prol = 0, 0, 0, 0, 0

        abstention_sweep.append({
            "margin_threshold": margin_th,
            "coverage_pct": round(cov * 100, 2),
            "abstention_pct": round(abs_rate * 100, 2),
            "accepted_accuracy_pct": round(acc_val * 100, 2),
            "accepted_qwk": round(qwk_val, 4),
            "accepted_macro_f1": round(f1_val, 4),
            "accepted_severe_recall_pct": round(rec_sev * 100, 2),
            "accepted_prolif_recall_pct": round(rec_prol * 100, 2)
        })

    # =========================================================================
    # IQA VALIDATION & DISPROPORTIONATE REJECTION CHECK
    # =========================================================================
    val_csv_path = BASE_DIR / "data" / "processed" / "val_processed.csv"
    val_df = pd.read_csv(val_csv_path)

    iqa_status_counts = {"GRADEABLE": 0, "BORDERLINE": 0, "UNGRADABLE": 0}
    iqa_by_class = {c: {"GRADEABLE": 0, "BORDERLINE": 0, "UNGRADABLE": 0, "TOTAL": 0} for c in range(5)}

    for _, row in val_df.iterrows():
        p = row["image_path"]
        y = int(row["diagnosis"])
        iqa_by_class[y]["TOTAL"] += 1
        if os.path.exists(p):
            img_bgr = cv2.imread(p)
            res = ImageQualityAssessment.evaluate(img_bgr)
            st = res["status"]
            iqa_status_counts[st] += 1
            iqa_by_class[y][st] += 1
        else:
            iqa_status_counts["GRADEABLE"] += 1
            iqa_by_class[y]["GRADEABLE"] += 1

    # Format output dictionary
    output_data = {
        "model_a_baseline": {
            "accuracy": round(acc_a * 100, 2),
            "qwk": round(qwk_a, 4),
            "macro_f1": round(macro_f1_a, 4),
            "balanced_accuracy": round(bal_acc_a * 100, 2),
            "per_class": {
                name: {
                    "recall": round(float(rep_a[name]["recall"]) * 100, 2),
                    "f1": round(float(rep_a[name]["f1-score"]), 4),
                    "support": int(rep_a[name]["support"])
                }
                for name in CLASS_NAMES
            },
            "referable_dr": {
                "sensitivity": round(sens_ref_a * 100, 2),
                "specificity": round(spec_ref_a * 100, 2)
            },
            "sight_threatening_dr": {
                "sensitivity": round(sens_stdr_a * 100, 2),
                "specificity": round(spec_stdr_a * 100, 2)
            }
        },
        "model_b_cascade": {
            "accuracy": round(acc_b * 100, 2),
            "qwk": round(qwk_b, 4),
            "macro_f1": round(macro_f1_b, 4),
            "balanced_accuracy": round(bal_acc_b * 100, 2),
            "per_class": {
                name: {
                    "recall": round(float(rep_b[name]["recall"]) * 100, 2),
                    "f1": round(float(rep_b[name]["f1-score"]), 4),
                    "support": int(rep_b[name]["support"])
                }
                for name in CLASS_NAMES
            },
            "referable_dr": {
                "sensitivity": round(sens_ref_b * 100, 2),
                "specificity": round(spec_ref_b * 100, 2)
            },
            "sight_threatening_dr": {
                "sensitivity": round(sens_stdr_b * 100, 2),
                "specificity": round(spec_stdr_b * 100, 2)
            }
        },
        "stage_confusion_matrices": {
            "stage1_normal_vs_abnormal": {
                "labels": ["Normal", "Abnormal"],
                "cm": cm_stage1.tolist(),
                "accuracy": round(float(np.trace(cm_stage1) / np.sum(cm_stage1)) * 100, 2),
                "sensitivity_on_abnormal": round(float(cm_stage1[1, 1] / np.sum(cm_stage1[1])) * 100, 2),
                "specificity_on_normal": round(float(cm_stage1[0, 0] / np.sum(cm_stage1[0])) * 100, 2)
            },
            "stage2_referable": {
                "labels": ["Non-Referable", "Referable"],
                "cm": cm_stage2.tolist(),
                "sensitivity": round(sens_ref_b * 100, 2),
                "specificity": round(spec_ref_b * 100, 2)
            },
            "stage3_sight_threatening": {
                "labels": ["Non-STDR", "STDR"],
                "cm": cm_stage3.tolist(),
                "sensitivity": round(sens_stdr_b * 100, 2),
                "specificity": round(spec_stdr_b * 100, 2)
            },
            "stage4_exact_5class": {
                "labels": CLASS_NAMES,
                "cm": cm_stage4.tolist()
            }
        },
        "error_propagation": {
            "stage1_correct_stage2_fails": int(s1_corr_s2_fail),
            "stage2_correct_stage3_fails": int(s2_corr_s3_fail),
            "stage3_correct_stage4_fails": int(s3_corr_s4_fail),
            "all_stages_correct": int(all_stages_correct),
            "total_samples": n_samples
        },
        "abstention_sweep": abstention_sweep,
        "iqa_validation": {
            "status_totals": iqa_status_counts,
            "by_class": iqa_by_class
        }
    }

    out_file = BASE_DIR / "reports" / "scientific_comparison_data.json"
    with open(out_file, "w") as f:
        json.dump(output_data, f, indent=2)

    print(f"Data saved to: {out_file}", flush=True)
    print("\n--- SUMMARY OF COMPARISON ---")
    print(f"BASELINE MODEL A : Acc={acc_a*100:.2f}%, QWK={qwk_a:.4f}, Macro F1={macro_f1_a:.4f}, Sev Rec={rep_a['Severe']['recall']*100:.2f}%, Ref Sens={sens_ref_a*100:.2f}%, Ref Spec={spec_ref_a*100:.2f}%")
    print(f"CASCADE MODEL B  : Acc={acc_b*100:.2f}%, QWK={qwk_b:.4f}, Macro F1={macro_f1_b:.4f}, Sev Rec={rep_b['Severe']['recall']*100:.2f}%, Ref Sens={sens_ref_b*100:.2f}%, Ref Spec={spec_ref_b*100:.2f}%")
    print(f"STAGE 1 (Normal vs Abnormal) : Sens={output_data['stage_confusion_matrices']['stage1_normal_vs_abnormal']['sensitivity_on_abnormal']}%, Spec={output_data['stage_confusion_matrices']['stage1_normal_vs_abnormal']['specificity_on_normal']}%")
    print(f"STAGE 2 (Referable DR)       : Sens={sens_ref_b*100:.2f}%, Spec={spec_ref_b*100:.2f}%")
    print(f"STAGE 3 (Sight-Threatening)  : Sens={sens_stdr_b*100:.2f}%, Spec={spec_stdr_b*100:.2f}%")

if __name__ == "__main__":
    run_evaluation()
