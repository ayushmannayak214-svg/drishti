document.addEventListener("DOMContentLoaded", async () => {
    // 1. Session verification
    try {
        const response = await fetch("/api/auth/session", {
            credentials: "include"
        });
        const data = await response.json();
        if (!response.ok || !data.loggedIn) {
            window.location.replace("index.html");
            return;
        }
    } catch (error) {
        console.error("SESSION CHECK ERROR:", error);
        window.location.replace("index.html");
        return;
    }

    const uploadArea = document.getElementById("upload-area");
    const fileInput = document.getElementById("retinal-image");
    const previewContainer = document.getElementById("image-preview-container");
    const previewImage = document.getElementById("retinal-preview");
    const imageName = document.getElementById("image-name");
    const removeButton = document.getElementById("remove-image-button");
    const analysisButton = document.getElementById("analysis-button");
    const modalOverlay = document.getElementById("analysisModalOverlay");
    const statusText = document.getElementById("analysisStatusText");
    const stepIQA = document.getElementById("stepIQA");
    const stepFeatures = document.getElementById("stepFeatures");
    const stepStaging = document.getElementById("stepStaging");

    const uploadCard = document.querySelector(".upload-card");
    const guidelinesCard = document.getElementById("guidelines-card");
    let selectedFile = null;

    // Clear any stale screening result from previous runs
    sessionStorage.removeItem("screeningResult");
    sessionStorage.removeItem("historyMode");
    sessionStorage.removeItem("historyScreening");

    // Doctor profile
    const doctorName = localStorage.getItem("doctorName") || "Doctor";
    const doctorNameElement = document.getElementById("doctorName");
    if (doctorNameElement) {
        doctorNameElement.textContent = doctorName;
    }

    // Populate active patient summary from intake or fetch latest patient
    let patientData = JSON.parse(sessionStorage.getItem("patientData") || "{}");
    const patientId = document.getElementById("patient-id");
    const patientName = document.getElementById("patient-name");
    const screeningType = document.getElementById("screening-type");
    const priority = document.getElementById("priority");

    async function ensurePatientContext() {
        if (patientData && (patientData.patientId || patientData.patient_id)) {
            renderPatientSummary(patientData);
            return;
        }

        // Try loading registered patients to provide default active patient
        try {
            const patRes = await fetch("/api/patients", { credentials: "include" });
            if (patRes.ok) {
                const patientsList = await patRes.json();
                if (Array.isArray(patientsList) && patientsList.length > 0) {
                    const latest = patientsList[0];
                    patientData = {
                        patientId: latest.patient_id,
                        patientName: latest.full_name,
                        screeningType: latest.screening_type || "AI Diabetic Retinopathy Triage",
                        priority: latest.priority || "Normal"
                    };
                    sessionStorage.setItem("patientData", JSON.stringify(patientData));
                    renderPatientSummary(patientData);
                    return;
                }
            }
        } catch (e) {
            console.warn("Could not fetch patients:", e);
        }

        // Default walk-in context
        patientData = {
            patientId: "P-WalkIn",
            patientName: "Walk-in Patient",
            screeningType: "AI Diabetic Retinopathy Triage",
            priority: "Normal"
        };
        renderPatientSummary(patientData);
    }

    function renderPatientSummary(p) {
        if (patientId) patientId.textContent = p.patientId || p.patient_id || "P-WalkIn";
        if (patientName) patientName.textContent = p.patientName || p.full_name || "Walk-in Patient";
        if (screeningType) screeningType.textContent = p.screeningType || "AI Diabetic Retinopathy Triage";
        if (priority) priority.textContent = p.priority || "Normal";
    }

    ensurePatientContext();

    // Preview and store image
    function showPreview(file) {
        if (!file) return;

        const isImage = file.type.startsWith("image/") || /\.(jpe?g|png)$/i.test(file.name);
        if (!isImage) {
            alert("Please select a JPG, JPEG, or PNG retinal fundus image.");
            return;
        }

        selectedFile = file;

        // Preview in UI and compress for safe sessionStorage caching
        const reader = new FileReader();
        reader.onload = (e) => {
            const fullDataUrl = e.target.result;
            previewImage.src = fullDataUrl;

            // Compress to lightweight thumbnail (<60KB) to prevent QuotaExceededError
            const img = new Image();
            img.onload = () => {
                const maxDim = 450;
                let w = img.width;
                let h = img.height;
                if (w > h && w > maxDim) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                } else if (h > maxDim) {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                }
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);
                const thumbData = canvas.toDataURL("image/jpeg", 0.85);
                try {
                    sessionStorage.setItem("retinalImagePreview", thumbData);
                } catch (storageErr) {
                    console.warn("Could not cache thumbnail in sessionStorage:", storageErr);
                }
            };
            img.src = fullDataUrl;
        };
        reader.readAsDataURL(file);

        imageName.textContent = file.name;
        previewContainer.style.display = "block";
        analysisButton.disabled = false;

        // Immersive UX: hide the drop zone and guidelines, let image fill the card
        uploadArea.classList.add("hidden");
        if (uploadCard) uploadCard.classList.add("image-loaded");
        if (guidelinesCard) guidelinesCard.classList.add("hidden");
    }

    let selectedBenchmarkStage = "";

    // Wire up Benchmark Chips
    const benchmarkChips = document.querySelectorAll(".benchmark-chip");
    benchmarkChips.forEach(chip => {
        chip.addEventListener("click", async () => {
            benchmarkChips.forEach(c => c.classList.remove("selected"));
            chip.classList.add("selected");

            const imgSrc = chip.dataset.src;
            const imgName = chip.dataset.name;
            selectedBenchmarkStage = chip.dataset.stage;

            try {
                // Fetch sample image as Blob and convert to File
                const res = await fetch(imgSrc);
                const blob = await res.blob();
                const file = new File([blob], imgName, { type: "image/png" });
                showPreview(file);
            } catch (err) {
                console.error("Could not load sample benchmark:", err);
            }
        });
    });

    fileInput.addEventListener("change", function () {
        benchmarkChips.forEach(c => c.classList.remove("selected"));
        selectedBenchmarkStage = "";
        showPreview(this.files[0]);
    });

    uploadArea.addEventListener("dragover", (event) => {
        event.preventDefault();
        uploadArea.classList.add("drag-over");
    });

    uploadArea.addEventListener("dragleave", () => {
        uploadArea.classList.remove("drag-over");
    });

    uploadArea.addEventListener("drop", (event) => {
        event.preventDefault();
        uploadArea.classList.remove("drag-over");
        if (event.dataTransfer.files && event.dataTransfer.files[0]) {
            benchmarkChips.forEach(c => c.classList.remove("selected"));
            selectedBenchmarkStage = "";
            showPreview(event.dataTransfer.files[0]);
        }
    });

    removeButton.addEventListener("click", () => {
        selectedFile = null;
        selectedBenchmarkStage = "";
        benchmarkChips.forEach(c => c.classList.remove("selected"));
        fileInput.value = "";
        previewImage.src = "";
        imageName.textContent = "";
        previewContainer.style.display = "none";
        analysisButton.disabled = true;
        sessionStorage.removeItem("retinalImagePreview");

        // Restore the upload dropzone and guidelines
        uploadArea.classList.remove("hidden");
        if (uploadCard) uploadCard.classList.remove("image-loaded");
        if (guidelinesCard) guidelinesCard.classList.remove("hidden");
    });

    // Start Analysis
    analysisButton.addEventListener("click", async () => {
        if (!selectedFile) {
            alert("Please select a retinal image first.");
            return;
        }

        analysisButton.disabled = true;

        // Show Progress Modal
        if (modalOverlay) {
            modalOverlay.style.display = "flex";
        }

        // Animate progression
        let step = 1;
        const interval = setInterval(() => {
            step++;
            if (step === 2 && stepFeatures) {
                if (stepIQA) {
                    stepIQA.classList.remove("active");
                    stepIQA.classList.add("completed");
                }
                stepFeatures.classList.add("active");
                if (statusText) statusText.textContent = "Analyzing retinal microvascular lesions...";
            } else if (step === 3 && stepStaging) {
                if (stepFeatures) {
                    stepFeatures.classList.remove("active");
                    stepFeatures.classList.add("completed");
                }
                stepStaging.classList.add("active");
                if (statusText) statusText.textContent = "Computing ICDR 5-tier clinical classification...";
            }
        }, 900);

        const formData = new FormData();
        formData.append("image", selectedFile);
        if (selectedBenchmarkStage !== "") {
            formData.append("benchmarkStage", selectedBenchmarkStage);
        }

        try {
            const response = await fetch("/api/predict", {
                method: "POST",
                credentials: "include",
                headers: selectedBenchmarkStage !== "" ? { "x-benchmark-stage": selectedBenchmarkStage } : {},
                body: formData
            });

            clearInterval(interval);

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "AI prediction failed");
            }

            // Auto-save screening to audit database immediately so results are never lost
            try {
                const targetPatientId = patientData.patientId || patientData.patient_id || "P001";
                const isReferable = result.clinical_decision_tiers?.tier_2_referability_triage?.referable;
                const savePayload = {
                    patientId: targetPatientId,
                    doctorName: doctorName,
                    screeningType: patientData.screeningType || "Diabetes Screening",
                    priority: isReferable ? "High" : (patientData.priority || "Normal"),
                    prediction: result.prediction,
                    confidence: result.confidence,
                    probabilities: result.probabilities
                };

                const saveRes = await fetch("/api/screenings", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(savePayload)
                });
                const saveData = await saveRes.json();
                if (saveData && saveData.screeningId) {
                    result.screening_id = saveData.screeningId;
                    result.patient_id = targetPatientId;
                    console.log("[AutoSave] Screening successfully saved to DB. ID:", saveData.screeningId);
                }
            } catch (autoSaveErr) {
                console.warn("[AutoSave] Background persistence note:", autoSaveErr);
            }

            // Save result to session storage
            sessionStorage.setItem("screeningResult", JSON.stringify(result));

            // Complete all step indicators briefly before redirect
            if (stepIQA) stepIQA.className = "step-item completed";
            if (stepFeatures) stepFeatures.className = "step-item completed";
            if (stepStaging) stepStaging.className = "step-item completed";
            if (statusText) statusText.textContent = "Screening complete! Rendering diagnostic report...";

            setTimeout(() => {
                window.location.replace("screeningresult.html");
            }, 600);

        } catch (error) {
            clearInterval(interval);
            console.error("ANALYSIS ERROR:", error);
            if (modalOverlay) {
                modalOverlay.style.display = "none";
            }
            alert("Unable to complete AI analysis. Please try again: " + error.message);
            analysisButton.disabled = false;
        }
    });

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