document.addEventListener("DOMContentLoaded", async () => {
    // 1. Session verification
    try {
        const sessionResponse = await fetch("/api/auth/session", {
            credentials: "include"
        });
        const sessionData = await sessionResponse.json();
        if (!sessionResponse.ok || !sessionData.loggedIn) {
            window.location.replace("index.html");
            return;
        }
    } catch (error) {
        console.error("SESSION CHECK ERROR:", error);
        window.location.replace("index.html");
        return;
    }

    const newResult = JSON.parse(sessionStorage.getItem("screeningResult") || "{}");
    const newPatient = JSON.parse(sessionStorage.getItem("patientData") || "{}");
    const historyScreening = JSON.parse(sessionStorage.getItem("historyScreening") || "null");
    const isHistoryView = sessionStorage.getItem("historyMode") === "true" && historyScreening !== null;

    const result = isHistoryView
        ? {
            prediction: historyScreening.prediction,
            confidence: historyScreening.confidence,
            probabilities: {
                No_DR: historyScreening.no_dr,
                Mild: historyScreening.mild,
                Moderate: historyScreening.moderate,
                Severe: historyScreening.severe,
                Proliferative_DR: historyScreening.proliferative_dr
            }
        }
        : newResult;

    const patient = isHistoryView
        ? {
            patientId: historyScreening.patient_id,
            patientName: historyScreening.patient_name,
            screeningType: historyScreening.screening_type,
            priority: historyScreening.priority,
            doctorName: historyScreening.doctor_name
        }
        : newPatient;

    // Doctor profile
    const doctorName = isHistoryView
        ? (historyScreening.doctor_name || "Doctor")
        : (localStorage.getItem("doctorName") || "Doctor");

    const doctorNameElement = document.getElementById("doctorName");
    if (doctorNameElement) doctorNameElement.textContent = doctorName;

    // Patient info fields
    const patientIdElement = document.getElementById("patient-id");
    const patientNameElement = document.getElementById("patient-name");
    const screeningTypeElement = document.getElementById("screening-type");
    const predictionElement = document.getElementById("prediction");
    const confidenceElement = document.getElementById("confidence");
    const retinalPreviewImg = document.getElementById("result-retinal-preview");
    const screeningStatusElement = document.getElementById("screening-status");

    // Format patient details
    if (patientIdElement) {
        patientIdElement.textContent = patient.patientId || patient.patient_id || "P001";
    }
    if (patientNameElement) {
        patientNameElement.textContent = patient.patientName || patient.patient_name || patient.full_name || "Screening Patient";
    }
    if (screeningTypeElement) {
        screeningTypeElement.textContent = patient.screeningType || patient.screening_type || "AI Diabetic Retinopathy Triage";
    }
    if (screeningStatusElement && result.prediction) {
        screeningStatusElement.textContent = result.prediction.replace("_", " ");
    }

    // Render Retinal Scan Image with multi-layer fallback and onerror protection
    const cachedScan = sessionStorage.getItem("retinalImagePreview");
    if (retinalPreviewImg) {
        retinalPreviewImg.onerror = () => {
            retinalPreviewImg.onerror = null;
            retinalPreviewImg.src = "version4/moderate_wikimedia.png";
        };

        if (!isHistoryView && cachedScan) {
            retinalPreviewImg.src = cachedScan;
        } else if (!isHistoryView && result.imageUrl) {
            retinalPreviewImg.src = result.imageUrl;
        } else {
            // High-resolution clinical fundus images from version4 directory
            const stageImageMap = {
                No_DR: "version4/paper_stage0_no_dr.png",
                Mild: "version4/paper_stage1_mild_dr.png",
                Moderate: "version4/paper_stage2_moderate_dr.png",
                Severe: "version4/paper_stage3_severe_dr.png",
                Proliferative_DR: "version4/paper_stage4_proliferative_dr.png"
            };
            const mappedImg = stageImageMap[result.prediction] || "version4/moderate_wikimedia.png";
            retinalPreviewImg.src = mappedImg;
        }
    }

    // Prediction Value & Severity Color
    if (predictionElement && result.prediction) {
        const readableNames = {
            No_DR: "No DR (Grade 0)",
            Mild: "Mild NPDR (Grade 1)",
            Moderate: "Moderate NPDR (Grade 2)",
            Severe: "Severe NPDR (Grade 3)",
            Proliferative_DR: "Proliferative DR (Grade 4)"
        };
        predictionElement.textContent = readableNames[result.prediction] || result.prediction;
    }

    if (confidenceElement && result.confidence !== undefined && result.confidence !== null) {
        confidenceElement.textContent = result.confidence + "%";
    }

    // Determine Stage Severity for Tiers
    const stageRank = {
        No_DR: 0,
        Mild: 1,
        Moderate: 2,
        Severe: 3,
        Proliferative_DR: 4
    }[result.prediction] || 0;

    // Triage Badges (WHO Guidelines)
    const tier2Badge = document.getElementById("tier2Badge");
    const tier2Text = document.getElementById("tier2Text");
    const tier3Badge = document.getElementById("tier3Badge");
    const tier3Text = document.getElementById("tier3Text");

    if (tier2Badge && tier2Text) {
        const isReferable = stageRank >= 2;
        if (isReferable) {
            tier2Badge.style.background = "#fee2e2";
            tier2Badge.style.color = "#b91c1c";
            tier2Badge.style.borderColor = "#fca5a5";
            tier2Text.textContent = "Referable DR: YES (Specialist visit in 4-8 wks)";
        } else {
            tier2Badge.style.background = "#dcfce7";
            tier2Badge.style.color = "#15803d";
            tier2Badge.style.borderColor = "#bbf7d0";
            tier2Text.textContent = "Referable DR: NO (Annual Routine Screening)";
        }
    }

    if (tier3Badge && tier3Text) {
        const isStdr = stageRank >= 3;
        if (isStdr) {
            tier3Badge.style.background = "#fef2f2";
            tier3Badge.style.color = "#991b1b";
            tier3Badge.style.borderColor = "#f87171";
            tier3Text.textContent = "Sight Threatening: HIGH RISK (Prompt Laser/Anti-VEGF)";
        } else {
            tier3Badge.style.background = "#f3f4f6";
            tier3Badge.style.color = "#4b5563";
            tier3Badge.style.borderColor = "#e5e7eb";
            tier3Text.textContent = "Sight Threatening: LOW RISK";
        }
    }

    // AI Engine Mode Badge
    const engineModeText = document.getElementById("engineModeText");
    const engineModeBadge = document.getElementById("engineModeBadge");
    if (engineModeText && engineModeBadge) {
        const mode = result.engine_mode || "cv_biomarker_fallback";
        if (mode === "neural_network") {
            engineModeText.textContent = "Engine: EfficientNetV2-S Neural Network";
            engineModeBadge.style.background = "#f0fdf4";
            engineModeBadge.style.color = "#15803d";
            engineModeBadge.style.borderColor = "#bbf7d0";
        } else {
            engineModeText.textContent = "Engine: Clinical CV Biomarker Analysis";
            engineModeBadge.style.background = "#f8fafc";
            engineModeBadge.style.color = "#64748b";
            engineModeBadge.style.borderColor = "#e2e8f0";
        }
    }

    // Probability Bars
    if (result.probabilities) {
        const probabilityMap = {
            No_DR: ["prob-no-dr", "bar-no-dr", "#16a34a"],
            Mild: ["prob-mild", "bar-mild", "#ca8a04"],
            Moderate: ["prob-moderate", "bar-moderate", "#ea580c"],
            Severe: ["prob-severe", "bar-severe", "#dc2626"],
            Proliferative_DR: ["prob-proliferative", "bar-proliferative", "#991b1b"]
        };

        Object.entries(probabilityMap).forEach(([name, [textId, barId, color]]) => {
            const value = result.probabilities[name] ?? 0;
            const textElement = document.getElementById(textId);
            const barElement = document.getElementById(barId);

            if (textElement) textElement.textContent = value + "%";
            if (barElement) {
                barElement.style.width = Math.min(100, Math.max(0, value)) + "%";
                barElement.style.backgroundColor = color;
            }
        });
    }

    // Interpretations
    const interpretationTitle = document.getElementById("interpretation-title");
    const interpretationDescription = document.getElementById("interpretation-description");
    const screeningStatus = document.getElementById("screening-status");

    const interpretations = {
        No_DR: {
            title: "Grade 0: No Diabetic Retinopathy Detected",
            description: "The AI analysis indicates a healthy retinal fundus without visible microvascular abnormalities. Continue annual dilated retinal exams and maintain glycemic and blood pressure control.",
            status: "Normal"
        },
        Mild: {
            title: "Grade 1: Mild Non-Proliferative Diabetic Retinopathy (NPDR)",
            description: "Microaneurysms detected in the retinal vasculature. Recommend routine follow-up with comprehensive eye exam within 6 to 12 months, and review glycemic management.",
            status: "Mild"
        },
        Moderate: {
            title: "Grade 2: Moderate Non-Proliferative Diabetic Retinopathy (NPDR)",
            description: "Notable microaneurysms, dot/blot retinal hemorrhages, and potential hard exudates observed. Clinical dilated ophthalmologic referral within 4 to 8 weeks is strongly recommended.",
            status: "Moderate"
        },
        Severe: {
            title: "Grade 3: Severe Non-Proliferative Diabetic Retinopathy (NPDR)",
            description: "High-risk retinal changes identified (extensive hemorrhages, venous beading). Urgent consultation with a retinal specialist is advised to prevent progression to proliferative disease.",
            status: "Severe"
        },
        Proliferative_DR: {
            title: "Grade 4: Proliferative Diabetic Retinopathy (PDR)",
            description: "Advanced disease features with suspected neovascularization. Immediate retinal specialist intervention (panretinal photocoagulation or anti-VEGF therapy) is urgently indicated.",
            status: "Proliferative"
        }
    };

    const interp = interpretations[result.prediction];
    if (interp) {
        if (interpretationTitle) interpretationTitle.textContent = interp.title;
        if (interpretationDescription) interpretationDescription.textContent = interp.description;
        if (screeningStatus) screeningStatus.textContent = interp.status;
    }

    // Navigation buttons
    const backResultButton = document.getElementById("back-result-button");
    if (backResultButton) {
        backResultButton.addEventListener("click", () => {
            if (isHistoryView) {
                sessionStorage.removeItem("historyScreening");
                sessionStorage.removeItem("historyMode");
                window.location.href = "screeninghistory.html";
            } else {
                window.location.href = "retinalupload.html";
            }
        });
    }

    // Print Button
    const printButton = document.getElementById("print-button");
    if (printButton) {
        printButton.addEventListener("click", () => {
            window.print();
        });
    }

    // Finish / Return Button
    const finishButton = document.getElementById("finish-screening-button");
    if (finishButton) {
        if (isHistoryView) {
            const finishText = finishButton.querySelector("span");
            const finishIcon = finishButton.querySelector("i");
            if (finishText) finishText.textContent = "Back to Dashboard";
            if (finishIcon) finishIcon.className = "fa-solid fa-house";

            finishButton.addEventListener("click", () => {
                sessionStorage.removeItem("historyScreening");
                sessionStorage.removeItem("historyMode");
                window.location.href = "dashboard.html";
            });
        } else {
            finishButton.addEventListener("click", async () => {
                // If already auto-saved by retinalupload.js, simply return to Dashboard
                if (result.screening_id) {
                    sessionStorage.removeItem("retinalImagePreview");
                    sessionStorage.removeItem("screeningResult");
                    sessionStorage.removeItem("patientData");
                    window.location.href = "dashboard.html";
                    return;
                }

                const targetPid = patient.patientId || patient.patient_id || "P001";
                const isReferable = stageRank >= 2;
                const screeningData = {
                    patientId: targetPid,
                    doctorName: patient.doctorName || doctorName,
                    screeningType: patient.screeningType || "Diabetes Screening",
                    priority: isReferable ? "High" : (patient.priority || "Normal"),
                    prediction: result.prediction,
                    confidence: result.confidence,
                    probabilities: result.probabilities
                };

                finishButton.disabled = true;
                const finishText = finishButton.querySelector("span");
                if (finishText) finishText.textContent = "Saving...";

                try {
                    const response = await fetch("/api/screenings", {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(screeningData)
                    });

                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.error || "Failed to save screening");
                    }

                    console.log("SCREENING SAVED SUCCESSFULLY:", data);
                    // Clear cached scan and patient data
                    sessionStorage.removeItem("retinalImagePreview");
                    sessionStorage.removeItem("patientData");
                    sessionStorage.removeItem("screeningResult");

                    window.location.href = "dashboard.html";
                } catch (error) {
                    console.error("SCREENING SAVE ERROR:", error);
                    // Even if network failed, allow returning to dashboard
                    sessionStorage.removeItem("retinalImagePreview");
                    sessionStorage.removeItem("patientData");
                    sessionStorage.removeItem("screeningResult");
                    window.location.href = "dashboard.html";
                }
            });
        }
    }

    // Sidebar Logout
    const logoutBtn = document.getElementById("logoutSidebarBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                await fetch("/api/auth/logout", {
                    method: "POST",
                    credentials: "include"
                });
            } catch (err) {}
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("index.html");
        });
    }
});