"""
Balanced Multi-Class Fine-Tuning for Intel Arc GPU.
Targets Severe (Class 3), Mild (Class 1), and Proliferative (Class 4) to eliminate the Moderate Sink.
Features:
- LogitAdjustedLoss (ICML 2021) with exact class counts
- Minority-Boosted Weighted Random Sampler
- Per-Epoch Confusion Matrix, Per-Class Recall, and QWK tracking
- Checkpoint saving on Balanced Macro-Recall with Regression Guards (No_DR specificity >= 90%)
"""

import os, sys, time, gc, math
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import DataLoader, WeightedRandomSampler
from sklearn.metrics import confusion_matrix, cohen_kappa_score
from pathlib import Path

# Suppress HF warnings
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TRANSFORMERS_VERBOSITY"] = "error"

import timm
from src.config import DATA_DIR, NUM_CLASSES, SEED, CLASS_NAMES
from src.training.train_arc import DRDataset, DRModel
from src.training.losses import LogitAdjustedLoss

CACHE_DIR          = DATA_DIR / "cache"
BASE_DIR           = Path(__file__).resolve().parent
STARTING_CHECKPOINT = BASE_DIR / "best_model_arc.pth"
NEW_BEST_CHECKPOINT = BASE_DIR / "best_model_balanced.pth"

EPOCHS     = 20
PATIENCE   = 6
BATCH_SIZE = 8   # Safe for 8GB VRAM with full backbone unfreeze

torch.manual_seed(SEED)
np.random.seed(SEED)


def get_device():
    if hasattr(torch, 'xpu') and torch.xpu.is_available():
        print(f"Using Intel Arc XPU: {torch.xpu.get_device_name(0)}", flush=True)
        return torch.device("xpu")
    elif torch.cuda.is_available():
        print(f"Using CUDA: {torch.cuda.get_device_name(0)}", flush=True)
        return torch.device("cuda")
    print("Using CPU", flush=True)
    return torch.device("cpu")


def make_minority_boosted_sampler(labels):
    """
    Boosts minority classes (Severe, Proliferative, Mild) to ensure
    adequate gradient representation per batch without completely flattening priors.
    """
    class_counts = np.bincount(labels, minlength=NUM_CLASSES).astype(np.float32)
    # Base sqrt-inverse
    class_weights = 1.0 / (np.sqrt(class_counts) + 1e-6)
    # Extra boost multipliers for underrepresented classes
    # [No_DR, Mild, Moderate, Severe, Proliferative]
    multipliers = np.array([0.7, 1.3, 0.8, 2.5, 1.8], dtype=np.float32)
    final_weights = class_weights * multipliers
    sample_weights = final_weights[labels]
    return WeightedRandomSampler(
        weights=torch.from_numpy(sample_weights),
        num_samples=len(labels),
        replacement=True
    )


@torch.no_grad()
def evaluate_epoch(model, loader, criterion, device):
    model.eval()
    total_loss = 0.0
    all_preds = []
    all_targets = []

    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        outputs = model(images)
        loss = criterion(outputs, labels)

        preds = outputs.argmax(dim=1)
        total_loss += loss.item() * len(labels)
        all_preds.extend(preds.cpu().numpy())
        all_targets.extend(labels.cpu().numpy())

    all_preds = np.array(all_preds)
    all_targets = np.array(all_targets)
    cm = confusion_matrix(all_targets, all_preds, labels=range(NUM_CLASSES))

    recalls = []
    for i in range(NUM_CLASSES):
        tot = np.sum(all_targets == i)
        rec = cm[i, i] / tot if tot > 0 else 0.0
        recalls.append(rec)

    overall_acc = np.mean(all_preds == all_targets)
    macro_recall = np.mean(recalls)
    qwk = cohen_kappa_score(all_targets, all_preds, weights="quadratic")

    # Balanced score targeting Severe, Proliferative & Mild
    balanced_score = (
        recalls[0] * 0.15 +
        recalls[1] * 0.20 +
        recalls[2] * 0.15 +
        recalls[3] * 0.30 +
        recalls[4] * 0.20
    )

    return {
        "loss": total_loss / len(all_targets),
        "acc": overall_acc,
        "macro_recall": macro_recall,
        "balanced_score": balanced_score,
        "recalls": recalls,
        "qwk": qwk,
        "cm": cm
    }


def main():
    device = get_device()

    print("[1/5] Loading CLAHE datasets...", flush=True)
    train_cache = CACHE_DIR / "train_clahe.npz"
    val_cache   = CACHE_DIR / "val_clahe.npz"
    if not train_cache.exists():
        train_cache = CACHE_DIR / "train_cache.npz"
        val_cache   = CACHE_DIR / "val_cache.npz"

    train_data = np.load(train_cache)
    val_data   = np.load(val_cache)
    train_images, train_labels = train_data["images"], train_data["labels"]
    val_images, val_labels     = val_data["images"], val_data["labels"]
    print(f"      Train samples: {len(train_images)}, Val samples: {len(val_images)}", flush=True)

    train_ds = DRDataset(train_images, train_labels, augment=True)
    val_ds   = DRDataset(val_images, val_labels, augment=False)
    sampler  = make_minority_boosted_sampler(train_labels)

    train_loader = DataLoader(
        train_ds, batch_size=BATCH_SIZE, sampler=sampler,
        num_workers=0, pin_memory=False, drop_last=True
    )
    val_loader = DataLoader(
        val_ds, batch_size=16, shuffle=False,
        num_workers=0, pin_memory=False
    )

    print("[2/5] Initializing Model from previous best checkpoint...", flush=True)
    model = DRModel(num_classes=NUM_CLASSES, pretrained=False)
    ckpt = torch.load(STARTING_CHECKPOINT, map_location="cpu")
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"      Loaded checkpoint val_acc: {ckpt.get('val_acc', 'N/A')}", flush=True)

    # Unfreeze backbone with gradient checkpointing
    for param in model.parameters():
        param.requires_grad = True
    if hasattr(model.backbone, "set_grad_checkpointing"):
        model.backbone.set_grad_checkpointing(enable=True)

    gc.collect()
    if hasattr(torch, 'xpu'):
        torch.xpu.empty_cache()
    model = model.to(device)

    # Class counts: [1444, 296, 799, 154, 236]
    class_counts = [1444, 296, 799, 154, 236]
    criterion = LogitAdjustedLoss(class_counts=class_counts, tau=0.8).to(device)

    optimizer = optim.AdamW(model.parameters(), lr=8e-6, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=1e-7)

    # Baseline evaluation before training
    print("\n[3/5] Evaluating Starting Checkpoint with Logit-Adjusted Loss...", flush=True)
    base_val = evaluate_epoch(model, val_loader, criterion, device)
    print(f"      Baseline Acc: {base_val['acc']*100:.2f}% | Macro-Recall: {base_val['macro_recall']*100:.2f}% | QWK: {base_val['qwk']:.4f}")
    print(f"      Recalls: No_DR: {base_val['recalls'][0]*100:.1f}%, Mild: {base_val['recalls'][1]*100:.1f}%, Mod: {base_val['recalls'][2]*100:.1f}%, Sev: {base_val['recalls'][3]*100:.1f}%, Prolif: {base_val['recalls'][4]*100:.1f}%")

    best_balanced_score = base_val["balanced_score"]
    patience_counter = 0

    print(f"\n[4/5] Starting Balanced Optimization ({EPOCHS} epochs max)...", flush=True)
    print("=" * 65, flush=True)

    for epoch in range(EPOCHS):
        t0 = time.time()
        model.train()
        train_loss = 0.0
        total_samples = 0

        for batch_idx, (images, labels) in enumerate(train_loader):
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)

            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()

            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            train_loss += loss.item() * len(labels)
            total_samples += len(labels)

        scheduler.step()
        train_loss /= total_samples

        # Validation
        val_res = evaluate_epoch(model, val_loader, criterion, device)
        elapsed = time.time() - t0

        print(f"Epoch {epoch+1:02d}/{EPOCHS:02d} [{elapsed:.0f}s] | "
              f"Train Loss: {train_loss:.4f} | Val Acc: {val_res['acc']*100:.2f}% | "
              f"Macro-Rec: {val_res['macro_recall']*100:.2f}% | QWK: {val_res['qwk']:.4f}", flush=True)
        print(f"  --> Recalls: No_DR: {val_res['recalls'][0]*100:.1f}% | "
              f"Mild: {val_res['recalls'][1]*100:.1f}% | "
              f"Mod: {val_res['recalls'][2]*100:.1f}% | "
              f"Severe: {val_res['recalls'][3]*100:.1f}% | "
              f"Prolif: {val_res['recalls'][4]*100:.1f}%", flush=True)

        # Checkpoint condition: Balanced score improved AND No_DR specificity >= 90%
        if val_res["balanced_score"] > best_balanced_score and val_res["recalls"][0] >= 0.90:
            best_balanced_score = val_res["balanced_score"]
            patience_counter = 0
            torch.save({
                "epoch": epoch + 1,
                "model_state_dict": model.state_dict(),
                "val_loss": val_res["loss"],
                "val_acc": val_res["acc"],
                "macro_recall": val_res["macro_recall"],
                "recalls": val_res["recalls"],
                "qwk": val_res["qwk"],
                "cm": val_res["cm"]
            }, NEW_BEST_CHECKPOINT)
            print(f"  [SAVED] New best balanced checkpoint! (Score: {best_balanced_score:.4f})", flush=True)
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                print(f"  [EARLY STOP] Patience counter reached {PATIENCE}.", flush=True)
                break

    print("\n" + "=" * 65, flush=True)
    print(f"[5/5] Training finished. Best balanced score: {best_balanced_score:.4f}", flush=True)
    if NEW_BEST_CHECKPOINT.exists():
        print(f"Best checkpoint saved to: {NEW_BEST_CHECKPOINT}", flush=True)


if __name__ == "__main__":
    main()
