import sys, os, time
import numpy as np
import torch
from sklearn.metrics import confusion_matrix, classification_report, cohen_kappa_score
from src.training.train_arc import DRModel
from src.config import CLASS_NAMES, DATA_DIR

print("[1/4] Loading validation cache...", flush=True)
val_cache = DATA_DIR / "cache" / "val_cache.npz"
data = np.load(val_cache)
images, labels = data["images"], data["labels"]
print(f"      Loaded {len(images)} validation images.", flush=True)

print("[2/4] Loading model weights from best_model_arc.pth...", flush=True)
device = torch.device("cpu")
model = DRModel(num_classes=5, pretrained=False)
ckpt = torch.load("best_model_arc.pth", map_location="cpu")
model.load_state_dict(ckpt["model_state_dict"])
model.to(device)
model.eval()
print(f"      Checkpoint val_acc={ckpt.get('val_acc'):.4f} (Epoch {ckpt.get('epoch')})", flush=True)

print("[3/4] Preprocessing images...", flush=True)
imgs = images.astype(np.float32) / 255.0
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 1, 3)
std  = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 1, 3)
imgs = (imgs - mean) / std
imgs_nchw = imgs.transpose(0, 3, 1, 2)

print("[4/4] Running inference...", flush=True)
all_probs = []
batch_size = 32
t0 = time.time()
with torch.no_grad():
    for i in range(0, len(imgs_nchw), batch_size):
        b = torch.from_numpy(imgs_nchw[i:i+batch_size])
        out = model(b)
        prob = torch.softmax(out, dim=1).numpy()
        all_probs.append(prob)
        if (i // batch_size) % 5 == 0:
            print(f"      Processed {min(i+batch_size, len(imgs_nchw))}/{len(imgs_nchw)} images...", flush=True)

all_probs = np.concatenate(all_probs, axis=0)
preds = np.argmax(all_probs, axis=1)
print(f"      Inference done in {time.time()-t0:.2f}s!", flush=True)

print("\n" + "="*50, flush=True)
print("CONFUSION MATRIX (Rows: True, Cols: Predicted):", flush=True)
cm = confusion_matrix(labels, preds, labels=range(5))
print(cm, flush=True)

print("\nPER-CLASS RECALL & PERFORMANCE:", flush=True)
for i, name in enumerate(CLASS_NAMES):
    tot = np.sum(labels == i)
    cor = cm[i, i]
    rec = cor / tot if tot > 0 else 0
    print(f"  {name:18s}: {cor:3d}/{tot:3d}  Recall: {rec*100:6.2f}%", flush=True)

overall_acc = np.mean(preds == labels)
qwk = cohen_kappa_score(labels, preds, weights="quadratic")

y_true_ref = (labels >= 2).astype(int)
y_pred_ref = (preds >= 2).astype(int)
ref_cm = confusion_matrix(y_true_ref, y_pred_ref, labels=[0, 1])
tn, fp, fn, tp = ref_cm.ravel()
sens = tp / (tp + fn) if (tp + fn) > 0 else 0
spec = tn / (tn + fp) if (tn + fp) > 0 else 0

print("\nCLINICAL SCREENING METRICS (REFERABLE DR):", flush=True)
print(f"  Overall Accuracy        : {overall_acc*100:.2f}%", flush=True)
print(f"  Referable Sensitivity   : {sens*100:.2f}%  (Target: >90%)", flush=True)
print(f"  Referable Specificity   : {spec*100:.2f}%  (Target: >85%)", flush=True)
print(f"  Quadratic Weighted Kappa: {qwk:.4f}", flush=True)
print("="*50, flush=True)
