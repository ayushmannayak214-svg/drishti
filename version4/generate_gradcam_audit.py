"""
Grad-CAM Sanity Check Generator (Loop 10 / Phase 16).
Generates class-activation heatmaps for representative validation images from all 5 classes.
Verifies whether activations fall on retinal vascular structures/lesions or shortcut artifacts.
"""

import os, cv2, numpy as np, torch
from pathlib import Path
from src.config import DATA_DIR, CLASS_NAMES, BASE_DIR
from src.training.train_arc import DRModel
from src.explainability.gradcam_pytorch import GradCAMPyTorch

def run_gradcam_audit():
    out_dir = BASE_DIR / "reports" / "gradcam_sanity"
    out_dir.mkdir(parents=True, exist_ok=True)

    val_cache = DATA_DIR / "cache" / "val_cache.npz"
    data = np.load(val_cache)
    images, labels = data["images"], data["labels"]

    import sys
    model_file = sys.argv[1] if len(sys.argv) > 1 else "best_model_balanced.pth"
    if not Path(model_file).exists():
        model_file = "best_model_arc.pth"
    print(f"Loading checkpoint for Grad-CAM: {model_file}...")
    ckpt = torch.load(model_file, map_location="cpu", weights_only=False)
    model = DRModel(num_classes=5, pretrained=False)
    model.load_state_dict(ckpt.get("model_state_dict", ckpt))
    model.eval()

    gradcam = GradCAMPyTorch(model)

    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)

    print("Generating Grad-CAM Sanity Checks across all 5 classes...", flush=True)
    saved_classes = {}
    
    # Select one clear representative per class
    for i in range(len(labels)):
        c = labels[i]
        if c not in saved_classes:
            img_uint8 = images[i]
            img_norm = img_uint8.astype(np.float32) / 255.0
            img_norm = (img_norm - mean) / std
            tensor = torch.from_numpy(img_norm.transpose(2, 0, 1)).unsqueeze(0)

            heatmap, pred_c, conf = gradcam.generate_heatmap(tensor, target_class=c)
            blended = gradcam.overlay_heatmap(img_uint8, heatmap)

            # Check where peak activation is: center vs border
            h, w = heatmap.shape
            border_margin = int(h * 0.15)
            # Central mask vs border mask
            central_activation = np.mean(heatmap[border_margin:h-border_margin, border_margin:w-border_margin])
            border_activation = (np.sum(heatmap) - np.sum(heatmap[border_margin:h-border_margin, border_margin:w-border_margin])) / (h*w - (h - 2*border_margin)*(w - 2*border_margin))

            ratio = central_activation / (border_activation + 1e-6)

            fname = f"class_{c}_{CLASS_NAMES[c]}_pred_{CLASS_NAMES[pred_c]}.png"
            out_path = out_dir / fname
            cv2.imwrite(str(out_path), cv2.cvtColor(blended, cv2.COLOR_RGB2BGR))

            saved_classes[int(c)] = {
                "file": fname,
                "true_class": CLASS_NAMES[c],
                "pred_class": CLASS_NAMES[pred_c],
                "confidence": round(float(conf), 3),
                "central_to_border_ratio": round(float(ratio), 2),
                "shortcut_detected": bool(ratio < 1.0)
            }
            print(f"  Class {c} ({CLASS_NAMES[c]}): Pred={CLASS_NAMES[pred_c]} (conf={conf:.2f}), Central/Border Ratio={ratio:.2f} -> {fname}", flush=True)

        if len(saved_classes) == 5:
            break

    # Save summary json
    summary_path = out_dir / "gradcam_audit_summary.json"
    import json
    with open(summary_path, "w") as f:
        json.dump(saved_classes, f, indent=2)
    print(f"Grad-CAM audit completed. Summary saved to: {summary_path}", flush=True)

if __name__ == "__main__":
    run_gradcam_audit()
