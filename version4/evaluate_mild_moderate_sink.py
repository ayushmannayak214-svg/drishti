import pandas as pd
import numpy as np
from pathlib import Path
from src.api.predict import RetinalPredictor

predictor = RetinalPredictor()
df = pd.read_csv("data/processed/val_processed.csv")

mild_samples = df[df['diagnosis'] == 1].head(5)
mod_samples = df[df['diagnosis'] == 2].head(5)
sev_samples = df[df['diagnosis'] == 3].head(5)

print("=" * 80)
print("INVESTIGATING THE 'MODERATE SINK' ON 5 MILD SAMPLES (Grade 1):")
print("=" * 80)
for idx, row in mild_samples.iterrows():
    p = row['image_path']
    fname = Path(p).name
    res = predictor.predict(p)
    if res.get('success'):
        stage = res['clinical_decision_tiers']['tier_4_exact_staging']
        raw = res['probabilities']['raw_softmax_pct']
        cal = res['probabilities']['calibrated_pct']
        print(f"Sample {fname}: Predicted -> {stage['class_name']} ({stage['class_index']}) | Conf: {stage['confidence_pct']}%")
        print(f"   Raw Softmax: No_DR:{raw['No_DR']}% | Mild:{raw['Mild']}% | Mod:{raw['Moderate']}% | Sev:{raw['Severe']}% | PDR:{raw['Proliferative_DR']}%")

print("\n" + "=" * 80)
print("INVESTIGATING 5 SEVERE SAMPLES (Grade 3) TO CHECK IF SINKING TO MODERATE:")
print("=" * 80)
for idx, row in sev_samples.iterrows():
    p = row['image_path']
    fname = Path(p).name
    res = predictor.predict(p)
    if res.get('success'):
        stage = res['clinical_decision_tiers']['tier_4_exact_staging']
        raw = res['probabilities']['raw_softmax_pct']
        print(f"Sample {fname}: Predicted -> {stage['class_name']} ({stage['class_index']}) | Conf: {stage['confidence_pct']}%")
        print(f"   Raw Softmax: No_DR:{raw['No_DR']}% | Mild:{raw['Mild']}% | Mod:{raw['Moderate']}% | Sev:{raw['Severe']}% | PDR:{raw['Proliferative_DR']}%")
