from pathlib import Path
from src.api.predict import RetinalPredictor

models = [
    'best_model_balanced.pth',
    'best_model_arc.pth',
    'models/EXP_TARGETED_MILD_SEVERE_ORDINAL.pth',
    'models/EXP_A2_LOGIT_ADJUSTED_TAU035.pth',
    'models/baseline_efficientnetv2s.pth'
]

test_cases = [
    ('Mild (APTOS)', r'C:\Users\koush\OneDrive\Desktop\SIH-DR-XAI2\AI-model\data\raw\aptos2019\train_images\eba3acc42197.png', 1),
    ('Moderate (APTOS)', r'C:\Users\koush\OneDrive\Desktop\SIH-DR-XAI2\AI-model\data\raw\aptos2019\train_images\44855f666225.png', 2),
    ('Severe (APTOS)', r'C:\Users\koush\OneDrive\Desktop\SIH-DR-XAI2\AI-model\data\raw\aptos2019\train_images\7b29e3783919.png', 3),
    ('Internet Moderate', 'moderate_wikimedia.png', 2),
    ('Internet Cotton Wool', 'cotton_wool_wikimedia.png', 3),
    ('Internet Proliferative', 'pdr_wikimedia.jpg', 4)
]

for m_name in models:
    p_path = Path(m_name)
    if not p_path.exists():
        continue
    print(f"\n=======================================================")
    print(f"MODEL CHECKPOINT: {m_name}")
    print("=======================================================")
    engine = RetinalPredictor(model_path=p_path)
    for label, path, true_g in test_cases:
        r = engine.predict(path)
        if r.get('success'):
            pred_idx = r['clinical_decision_tiers']['tier_4_exact_staging']['class_index']
            pred_name = r['clinical_decision_tiers']['tier_4_exact_staging']['class_name']
            cal_p = r['probabilities']['calibrated_pct']
            raw_p = r['probabilities']['raw_softmax_pct']
            match = "CORRECT" if pred_idx == true_g else ("CLOSE" if abs(pred_idx - true_g) <= 1 else "WRONG")
            print(f"[{match:7s}] True:{true_g} -> Pred:{pred_idx} ({pred_name:16s}) for {label}")
            print(f"          Raw: 0:{raw_p['No_DR']}% | 1:{raw_p['Mild']}% | 2:{raw_p['Moderate']}% | 3:{raw_p['Severe']}% | 4:{raw_p['Proliferative_DR']}%")
            print(f"          Cal: 0:{cal_p['No_DR']}% | 1:{cal_p['Mild']}% | 2:{cal_p['Moderate']}% | 3:{cal_p['Severe']}% | 4:{cal_p['Proliferative_DR']}%")
