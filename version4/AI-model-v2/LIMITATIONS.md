# LIMITATIONS & CLINICAL SAFETY GUIDELINES (SIH26038)
**Standard**: Medical-AI Safety, Governance & Regulatory Compliance (Phase 32)

---

## 1. Scope of the System
This software system is an **advanced medical machine learning research prototype** engineered for decision-support and screening workflow optimization. 

### Prohibited Claims:
The system, its documentation, APIs, and interfaces must **NEVER** claim:
* ❌ *"Doctor replacement"* or *"Fully automated clinical diagnosis"*
* ❌ *"100% diagnostic accuracy"*
* ❌ *"Clinically certified as a standalone medical device"*

### Approved Terminology:
* ✔ *"AI-assisted diabetic retinopathy screening"*
* ✔ *"Clinical decision-support prototype"*
* ✔ *"Model risk stratification & triage recommendation"*

---

## 2. Known Technical & Clinical Limitations

### 2.1 Single-Center Dataset Provenance
* The primary supervised model was developed and validated on images from the APTOS 2019 dataset collected at Aravind Eye Hospital in India.
* **Camera Bias**: While APTOS represents a wide variety of rural clinic cameras, real-world deployment on uncalibrated handheld fundus cameras or non-mydriatic desktop cameras from other manufacturers (e.g., Canon, Topcon, Zeiss) may exhibit mild domain shift.
* **External Validation Requirement**: Formal clinical clearance requires testing on independent external datasets (e.g., Messidor-2 or IDRiD).

### 2.2 Boundary Subjectivity Between Adjacent Grades
* Diabetic retinopathy is a continuous biological spectrum. Distinguishing between **Mild vs. Moderate** and **Moderate vs. Severe** involves human grader variability.
* The system mitigates this via **Uncertainty Abstention**: when confidence between adjacent grades is low (margin $<12\%$), the system explicitly requests a physician second look rather than making an arbitrary prediction.

### 2.3 Diabetic Macular Edema (DME)
* This classifier grades diabetic retinopathy lesions on 2D color fundus photography.
* It does not replace Optical Coherence Tomography (OCT) for the sub-micrometer assessment of central-involved macular edema.

---

## 3. Recommended Clinical Workflow
1. **Camera Image Capture** $\to$
2. **Automated Image Quality Assessment (IQA)**: Rejects ungradeable/blurred photos $\to$
3. **AI Cascade Triage**:
   * Confident Normal $\to$ Routine annual checkup.
   * Confident Referable $\to$ Expedited specialist referral.
   * Sight-Threatening $\to$ Fast-tracked urgent intervention.
   * Ambiguous / Low Confidence $\to$ Routed to physician review queue.
4. **Physician Verification & Sign-Off**.
