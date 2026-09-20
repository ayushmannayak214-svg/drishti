import os, sys
from pathlib import Path
from src.api.predict import RetinalPredictor

p = RetinalPredictor()
test_images = [
    ('Internet: Moderate NPDR (Wikimedia Commons)', 'moderate_wikimedia.png', 'Moderate NPDR (Grade 2)'),
    ('Internet: Cotton Wool Spots / Pre-Proliferative (Wikimedia)', 'cotton_wool_wikimedia.png', 'Severe / High Moderate (Grade 2-3)'),
    ('Internet: Proliferative Retinopathy (Wikimedia)', 'pdr_wikimedia.jpg', 'Proliferative DR (Grade 4)'),
    ('APTOS: Verified Mild NPDR (Grade 1)', r'C:\Users\koush\OneDrive\Desktop\SIH-DR-XAI2\AI-model\data\raw\aptos2019\train_images\eba3acc42197.png', 'Mild NPDR (Grade 1)'),
    ('APTOS: Verified Moderate NPDR (Grade 2)', r'C:\Users\koush\OneDrive\Desktop\SIH-DR-XAI2\AI-model\data\raw\aptos2019\train_images\44855f666225.png', 'Moderate NPDR (Grade 2)'),
    ('APTOS: Verified Severe NPDR (Grade 3)', r'C:\Users\koush\OneDrive\Desktop\SIH-DR-XAI2\AI-model\data\raw\aptos2019\train_images\7b29e3783919.png', 'Severe NPDR (Grade 3)')
]

for label, img_path, ground_truth in test_images:
    print('=' * 75)
    print('Test Image  :', label)
    print('Ground Truth:', ground_truth)
    res = p.predict(img_path)
    if not res.get('success'):
        err = res.get('error')
        print('REJECTED/FAILED:', err)
        if 'iqa_report' in res:
            print('  IQA Details:', res['iqa_report'])
    else:
        stage = res['clinical_decision_tiers']['tier_4_exact_staging']
        ref = res['clinical_decision_tiers']['tier_2_referability_triage']
        stdr = res['clinical_decision_tiers']['tier_3_sight_threatening_triage']
        abst = res['clinical_decision_tiers']['tier_5_uncertainty_abstention']
        c_name = stage['class_name']
        c_idx = stage['class_index']
        conf = stage['confidence_pct']
        print(f'  PREDICTED STAGE   : {c_name} (Grade {c_idx})')
        print(f'  Confidence        : {conf}%')
        print('  Referable DR (>=2):', ref['referable'], f'(Prob: {ref["p_referable_pct"]}%)')
        print('  Sight-Threatening :', stdr['sight_threatening'], f'(Prob: {stdr["p_stdr_pct"]}%)')
        print('  Abstention Flag   :', abst['clinical_abstention_flag'], f'(Margin: {abst["confidence_margin_pct"]}%)')
        print('  Calibrated Distribution:')
        for k, v in res['probabilities']['calibrated_pct'].items():
            print(f'    {k:18s}: {v:6.2f}%')
        print('  Raw Softmax Distribution:')
        for k, v in res['probabilities']['raw_softmax_pct'].items():
            print(f'    {k:18s}: {v:6.2f}%')
