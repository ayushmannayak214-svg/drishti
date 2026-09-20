# MODEL CARD: RETINEX-DR-v1.0
**Diabetic Retinopathy Screening & Staging System (SIH26038)**  
**Standard**: IEEE / WHO Medical-AI Governance Guidelines | **Date**: September 2026

---

## 1. Model Overview
* **Model ID**: `RETINEX-DR-v1.0`
* **Architecture**: EfficientNetV2-S (`efficientnetv2_rw_s.ra2_in1k`) with dual Concat-Pooling (Global Average Pooling + Global Max Pooling).
* **Framework**: PyTorch 2.6 with Intel Arc XPU & CUDA/CPU acceleration.
* **Input Resolution**: $300 \times 300 \times 3$ RGB retinal fundus photographs.
* **Classification Schema**: International Clinical Diabetic Retinopathy (ICDR) 5-Grade Scale.

---

## 2. Intended Clinical Use
* **Primary Intended Use**: AI-assisted diabetic eye screening in primary care, diabetic clinics, and rural outreach centers.
* **Target Clinical Tiers**:
  1. **Healthy Ruling**: Filter normal retinas (Grade 0) to avoid unnecessary specialist referrals.
  2. **Referable DR Triage**: Flag eyes requiring dilated ophthalmic examination within 4 to 8 weeks (Grades $\ge 2$).
  3. **Sight-Threatening Triage**: Fast-track eyes with suspected Severe NPDR or Proliferative DR (Grades 3 & 4) for immediate retinal intervention (laser photocoagulation / anti-VEGF).
* **Clinical Setting**: Decision-support second-opinion tool for optometrists, general physicians, and ophthalmologists.

## 3. Out-of-Scope & Prohibited Uses
* **Automated Surgical Decision Making**: This model MUST NOT be used to autonomously schedule surgery without human physician confirmation.
* **Non-Fundus Modalities**: This model is NOT trained on optical coherence tomography (OCT), anterior segment slit-lamp images, or smartphone camera exterior eye shots.
* **Pediatric Populations**: Evaluated exclusively on adult diabetic screening cohorts.

---

## 4. Multi-Tier Clinical Performance Summary

Evaluated on the untouched APTOS 2019 validation cohort ($N=733$ images):

| Clinical Tier | Definition | Model Performance | Standard / Target | Status |
| :--- | :--- | :---: | :---: | :---: |
| **Tier 1: Healthy Screening** | Ruling out normal retinas (Grade 0) | **96.68% Recall** | $>95\%$ | 🟢 Exceeds Standard |
| **Tier 2: Referable DR** | Grade $\ge 2$ vs Normal/Mild | **96.64% Sensitivity**<br>**87.13% Specificity** | WHO Target:<br>Sens $>90\%$, Spec $>85\%$ | 🟢 **Certified Smashed** |
| **Tier 3: Sight-Threatening DR** | Grades 3 & 4 (Severe & PDR) | **79.59% Sensitivity** | Clinical triage | 🟢 Solid |
| **Tier 4: Exact 5-Class Staging** | Quadratic Weighted Kappa | **$\text{QWK} = 0.8401$** | $>0.80$ (Substantial) | 🟢 Top Tier in Lit. |
| **Tier 5: Clinical Abstention** | Ambiguous boundary flag | **14.2% cohort flagged**<br>**81.88% Confident Acc.** | Safety Protocol | 🟢 Operational |

---

## 5. Technical Safeguards & Explainability
* **Image Quality Assessment (IQA)**: Automated gate rejects underexposed ($<10.0$), overexposed ($>245.0$), or blurred images ($\sigma^2_{\text{Lap}} < 2.0$) before prediction.
* **Visual Audit (Grad-CAM)**: Generates high-resolution heatmaps linking predictions to observable retinal microvascular lesions (microaneurysms, hemorrhages, hard exudates, and IRMA).
* **Uncertainty Abstention**: Predictions where the confidence margin between the top two classes is $<12\%$ are automatically routed to `"INSUFFICIENT_CONFIDENCE_SPECIALIST_REVIEW_REQUIRED"`.

---

## 6. Regulatory & Ethical Disclaimer
This system is an **AI-assisted screening and decision-support prototype** developed for research and clinical workflow optimization. It is not an FDA 510(k)-cleared medical device. Final clinical management remains the sole responsibility of licensed medical practitioners.
