
"""
Dedicated Phase 2 fine-tuning script.
Loads Phase 1 checkpoint, unfreezes full backbone, trains with small batch.
Designed to avoid OOM on Intel Arc 130V (8GB VRAM).
"""

import os, sys, time, gc
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, WeightedRandomSampler
from pathlib import Path

# Suppress HF warnings
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TRANSFORMERS_VERBOSITY"] = "error"

try:
    import intel_extension_for_pytorch as ipex
    IPEX_AVAILABLE = True
except ImportError:
    IPEX_AVAILABLE = False

import timm
print(f"timm version: {timm.__version__}", flush=True)

from src.config import DATA_DIR, NUM_CLASSES, SEED, CLASS_NAMES
from src.training.train_arc import (
    DRDataset, make_balanced_sampler,
    CombinedLoss, train_epoch, val_epoch, DRModel
)

CACHE_DIR          = DATA_DIR / "cache"
BASE_DIR           = Path(__file__).resolve().parent
PYTORCH_MODEL_PATH = BASE_DIR / "best_model_arc.pth"

PHASE2_EPOCHS  = 50
PATIENCE       = 10
PHASE2_BATCH   = 8   # Very conservative for 8GB VRAM with full backbone

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


def main():
    device = get_device()

    # ── Load data ────────────────────────────────────────────────
    print("Loading CLAHE data...", flush=True)
    train_cache = CACHE_DIR / "train_clahe.npz"
    val_cache   = CACHE_DIR / "val_clahe.npz"
    if not train_cache.exists():
        train_cache = CACHE_DIR / "train_cache.npz"
        val_cache   = CACHE_DIR / "val_cache.npz"

    train_data  = np.load(train_cache)
    val_data    = np.load(val_cache)
    train_images, train_labels = train_data["images"], train_data["labels"]
    val_images,   val_labels   = val_data["images"],   val_data["labels"]
    print(f"Train: {len(train_images)}  Val: {len(val_images)}", flush=True)

    train_ds    = DRDataset(train_images, train_labels, augment=True)
    val_ds      = DRDataset(val_images,   val_labels,   augment=False)
    sampler     = make_balanced_sampler(train_labels)

    train_loader = DataLoader(
        train_ds, batch_size=PHASE2_BATCH, sampler=sampler,
        num_workers=0, pin_memory=False, drop_last=True
    )
    val_loader = DataLoader(
        val_ds, batch_size=16, shuffle=False,
        num_workers=0, pin_memory=False
    )
    print(f"Phase 2 batch size: {PHASE2_BATCH}", flush=True)

    # ── Load Phase 1 checkpoint ──────────────────────────────────
    if not PYTORCH_MODEL_PATH.exists():
        print("ERROR: No checkpoint found. Run Phase 1 first.", flush=True)
        sys.exit(1)

    ckpt = torch.load(PYTORCH_MODEL_PATH, map_location='cpu')
    print(f"Resuming from Phase 1 val_acc={ckpt['val_acc']:.4f}", flush=True)

    # ── Build model on CPU, load weights, then move to GPU ───────
    print("Building model on CPU...", flush=True)
    model = DRModel(num_classes=NUM_CLASSES, pretrained=False)  # No download
    model.load_state_dict(ckpt['model_state_dict'])

    # Unfreeze all parameters
    for param in model.parameters():
        param.requires_grad = True

    # Gradient checkpointing to save VRAM
    if hasattr(model.backbone, 'set_grad_checkpointing'):
        model.backbone.set_grad_checkpointing(enable=True)
        print("Gradient checkpointing: ON", flush=True)

    # Move to GPU only now
    gc.collect()
    if hasattr(torch, 'xpu'):
        torch.xpu.empty_cache()
    model = model.to(device)

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Trainable params: {trainable:,}", flush=True)

    # ── Loss, Optimizer, Scheduler ──────────────────────────────
    criterion = CombinedLoss(focal_weight=0.3, smoothing=0.1)

    optimizer = optim.AdamW(
        model.parameters(), lr=1e-5, weight_decay=1e-4
    )
    scheduler = optim.lr_scheduler.OneCycleLR(
        optimizer,
        max_lr=3e-5,
        steps_per_epoch=len(train_loader),
        epochs=PHASE2_EPOCHS,
        pct_start=0.1,
        anneal_strategy='cos',
        div_factor=10,
        final_div_factor=100
    )

    best_val_acc     = ckpt['val_acc']
    patience_counter = 0

    print(f"\n{'='*60}", flush=True)
    print(f"PHASE 2: Fine-tuning Full Backbone ({PHASE2_EPOCHS} epochs max)", flush=True)
    print(f"{'='*60}", flush=True)

    for epoch in range(PHASE2_EPOCHS):
        t0 = time.time()
        try:
            train_loss, train_acc = train_epoch(
                model, train_loader, optimizer, criterion, device,
                scheduler=scheduler, use_onecycle=True
            )
        except torch.cuda.OutOfMemoryError as e:
            print(f"CUDA OOM at epoch {epoch+1}: {e}", flush=True)
            break
        except Exception as e:
            if 'out of memory' in str(e).lower():
                print(f"XPU OOM at epoch {epoch+1}: {e}", flush=True)
                break
            raise

        val_loss, val_acc = val_epoch(model, val_loader, criterion, device)
        elapsed = time.time() - t0

        print(f"Epoch {epoch+1}/{PHASE2_EPOCHS} | {elapsed:.0f}s | "
              f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} | "
              f"val_loss={val_loss:.4f} val_acc={val_acc:.4f}", flush=True)

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'val_loss': val_loss,
                'val_acc':  val_acc,
                'phase': 2,
            }, PYTORCH_MODEL_PATH)
            print(f"  [SAVED] Best val_acc={val_acc:.4f}", flush=True)
            patience_counter = 0
        else:
            patience_counter += 1
            print(f"  No improvement ({patience_counter}/{PATIENCE})", flush=True)
            if patience_counter >= PATIENCE:
                print("Early stopping triggered.", flush=True)
                break

    print(f"\n[DONE] Phase 2 complete. Best val_acc={best_val_acc:.4f}", flush=True)
    print(f"Saved: {PYTORCH_MODEL_PATH}", flush=True)


if __name__ == "__main__":
    main()
