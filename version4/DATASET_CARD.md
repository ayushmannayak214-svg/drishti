# DATASET CARD: APTOS 2019 Blindness Detection
**Audit & Governance Documentation (Phase 31)** | **SIH26038**

---

## 1. Dataset Overview
* **Dataset Name**: Kaggle APTOS 2019 Blindness Detection
* **Clinical Setting**: Retinal screening images collected at Aravind Eye Hospital, Tamil Nadu, India.
* **Imaging Modality**: Digital Color Fundus Photography (CFP) under varied clinic lighting conditions.
* **Total Supervised Images**: 3,662 labeled images.
* **Unlabeled Images**: 1,928 test images.

---

## 2. Class Composition & Imbalance Analysis

| Class Index | Clinical Diagnosis | Train Count (80%) | Val Count (20%) | Total Count | % of Dataset |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **0** | **No DR** | 1,444 | 361 | 1,805 | **49.29%** |
| **1** | **Mild NPDR** | 296 | 74 | 370 | **10.10%** |
| **2** | **Moderate NPDR** | 799 | 200 | 999 | **27.28%** |
| **3** | **Severe NPDR** | **154** | **39** | **193** | **5.27%** |
| **4** | **Proliferative DR** | 236 | 59 | 295 | **8.06%** |
| **Total** | — | **2,929** | **733** | **3,662** | **100.0%** |

---

## 3. Data Governance Audit Findings

### 3.1 Cryptographic Hash Verification
* **Train internal duplicates**: 77 image pairs share identical MD5 hashes.
* **Validation internal duplicates**: 6 image pairs share identical MD5 hashes.
* **Cross-split duplicate hashes**: 41 identical image hashes exist in both train and validation splits.

### 3.2 Discovery of Human Grader Label Discordance
Investigating the identical MD5 hashes revealed that byte-for-byte identical images carry **conflicting diagnostic labels** in the original Kaggle dataset:
* *Example*: Hash `ece61abc...` is labeled **Moderate (Class 2)** in training, but labeled **Mild (Class 1)** in validation.
* *Clinical Significance*: Subjectivity between human ophthalmologist graders on borderline eyes is an established reality in diabetic eye grading. Models must account for this boundary noise via calibrated decision manifolds and uncertainty abstention.

### 3.3 Anonymization & Demographic Limitations
* **Patient Identifiers**: Withheld by the competition organizers. Images are identified solely by 12-character hex hashes (e.g., `000c1434d8d7.png`).
* **Demographics**: Age, sex, diabetic duration, and systemic HbA1c levels were not provided.
