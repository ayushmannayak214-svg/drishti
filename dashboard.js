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

    const doctorName = localStorage.getItem("doctorName") || "Dr. Ananya Sharma";
    const doctorNameElement = document.getElementById("doctorName");
    const welcomeDoctorName = document.getElementById("welcomeDoctorName");
    if (doctorNameElement) doctorNameElement.textContent = doctorName;
    if (welcomeDoctorName) welcomeDoctorName.textContent = doctorName;

    // Dynamic time-based greeting
    const greetingEl = document.getElementById("greetingText");
    if (greetingEl) {
        const hour = new Date().getHours();
        if (hour < 12) greetingEl.textContent = "Good Morning";
        else if (hour < 17) greetingEl.textContent = "Good Afternoon";
        else greetingEl.textContent = "Good Evening";
    }

    let dashboardData = {
        totalPatients: 0,
        totalScreenings: 0,
        pendingReviews: 0,
        reportsGenerated: 0,
        criticalResults: 0,
        screenings: [],
        rawPatients: [],
        rawScreenings: []
    };

    const totalPatients = document.getElementById("totalPatients");
    const totalScreenings = document.getElementById("totalScreenings");
    const pendingReviews = document.getElementById("pendingReviews");
    const reportsGenerated = document.getElementById("reportsGenerated");
    const alertPendingCount = document.getElementById("alertPendingCount");
    const criticalResultCount = document.getElementById("criticalResultCount");
    const notificationCount = document.getElementById("notificationCount");
    const screeningTableBody = document.getElementById("screeningTableBody");

    function updateStatistics() {
        if (totalPatients) totalPatients.textContent = dashboardData.totalPatients;
        if (totalScreenings) totalScreenings.textContent = dashboardData.totalScreenings;
        if (pendingReviews) pendingReviews.textContent = dashboardData.pendingReviews;
        if (reportsGenerated) reportsGenerated.textContent = dashboardData.reportsGenerated;
        if (alertPendingCount) alertPendingCount.textContent = dashboardData.pendingReviews;
        if (criticalResultCount) criticalResultCount.textContent = dashboardData.criticalResults;
        if (notificationCount) notificationCount.textContent = dashboardData.pendingReviews;
    }

    function renderScreenings() {
        if (!screeningTableBody) return;
        screeningTableBody.innerHTML = "";

        if (dashboardData.screenings.length === 0) {
            screeningTableBody.innerHTML = `
                <tr id="noScreeningsRow">
                    <td colspan="7" class="no-screenings">
                        <div class="empty-icon">
                            <i class="fa-solid fa-folder-open"></i>
                        </div>
                        <h3>No Screenings Found</h3>
                        <p>Register a patient and analyze their retinal scan to see reports here.</p>
                        <button class="empty-screening-btn" id="emptyScreeningBtn">
                            <i class="fa-solid fa-plus"></i> Start New Screening
                        </button>
                    </td>
                </tr>
            `;
            const emptyButton = document.getElementById("emptyScreeningBtn");
            if (emptyButton) {
                emptyButton.addEventListener("click", () => {
                    window.location.href = "patientregistration.html";
                });
            }
            return;
        }

        function getResultBadge(item) {
            if (!item.isCompleted || !item.prediction) {
                return `<span class="status-pill" style="padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; background: #f1f5f9; color: #64748b; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-clock-rotate-left"></i> Pending Scan
                </span>`;
            }

            const stage = item.prediction;
            const confText = item.confidence ? ` (${item.confidence}%)` : '';
            if (stage === "No_DR") {
                return `<span class="status-pill" style="padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; background: #dcfce7; color: #15803d;">
                    No DR${confText}
                </span>`;
            }
            if (stage === "Mild") {
                return `<span class="status-pill" style="padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; background: #e0f2fe; color: #0369a1;">
                    Mild NPDR${confText}
                </span>`;
            }
            if (stage === "Moderate") {
                return `<span class="status-pill" style="padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; background: #fef3c7; color: #b45309;">
                    Moderate NPDR${confText}
                </span>`;
            }
            if (stage === "Severe") {
                return `<span class="status-pill" style="padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; background: #ffedd5; color: #c2410c;">
                    Severe NPDR${confText}
                </span>`;
            }
            return `<span class="status-pill" style="padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; background: #fee2e2; color: #b91c1c;">
                ${stage.replace(/_/g, " ")}${confText}
            </span>`;
        }

        dashboardData.screenings.slice(0, 15).forEach((item) => {
            const row = document.createElement("tr");

            const statusCell = item.isCompleted
                ? `<span style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #e0f2fe; color: #0369a1; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-check"></i> Reviewed
                   </span>`
                : `<span style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #fef3c7; color: #92400e; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-hourglass-start"></i> Awaiting Scan
                   </span>`;

            const actionCell = item.isCompleted
                ? `<button class="view-btn" data-id="${item.id}" style="padding: 6px 14px; background: #363775; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-eye"></i> View
                   </button>`
                : `<button class="screen-btn" data-id="${item.patientId}" style="padding: 6px 14px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-camera"></i> Screen
                   </button>`;

            row.innerHTML = `
                <td><strong>${item.patientId}</strong></td>
                <td>${item.name}</td>
                <td>${item.date}</td>
                <td>${item.screeningType}</td>
                <td>${getResultBadge(item)}</td>
                <td>${statusCell}</td>
                <td>${actionCell}</td>
            `;

            // View handler for completed screenings
            const viewBtn = row.querySelector(".view-btn");
            if (viewBtn) {
                viewBtn.addEventListener("click", () => {
                    if (item.screeningRaw) {
                        sessionStorage.setItem("historyScreening", JSON.stringify(item.screeningRaw));
                        sessionStorage.setItem("historyMode", "true");
                        sessionStorage.setItem("patientData", JSON.stringify({
                            patientId: item.patientId,
                            patientName: item.name,
                            screeningType: item.screeningType
                        }));
                        window.location.href = "screeningresult.html";
                    }
                });
            }

            // Screen handler for pending patients
            const screenBtn = row.querySelector(".screen-btn");
            if (screenBtn) {
                screenBtn.addEventListener("click", () => {
                    sessionStorage.setItem("patientData", JSON.stringify({
                        patientId: item.patientId,
                        patientName: item.name,
                        screeningType: item.screeningType,
                        priority: "Normal"
                    }));
                    sessionStorage.removeItem("screeningResult");
                    sessionStorage.removeItem("historyMode");
                    sessionStorage.removeItem("historyScreening");
                    window.location.href = "retinalupload.html";
                });
            }

            screeningTableBody.appendChild(row);
        });
    }

    // Modal helpers
    const patientsModal = document.getElementById("patientsModal");
    const closePatientsModal = document.getElementById("closePatientsModal");
    const patientsModalTableBody = document.getElementById("patientsModalTableBody");
    const patientSearchInput = document.getElementById("patientSearchInput");

    function openPatientsDirectory() {
        if (!patientsModal) return;
        renderPatientsModalTable(dashboardData.rawPatients);
        patientsModal.style.display = "flex";
    }

    function renderPatientsModalTable(patientList) {
        if (!patientsModalTableBody) return;
        patientsModalTableBody.innerHTML = "";

        if (patientList.length === 0) {
            patientsModalTableBody.innerHTML = `
                <tr><td colspan="6" style="text-align: center; padding: 24px; color: #888;">No patients registered yet.</td></tr>
            `;
            return;
        }

        patientList.forEach(p => {
            const hasScreening = dashboardData.rawScreenings.some(s => s.patient_id === p.patient_id);
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${p.patient_id}</strong></td>
                <td>${p.full_name}</td>
                <td>${p.age || '—'} / ${p.gender || '—'}</td>
                <td>${p.contact_number || '—'}</td>
                <td>
                    <span style="padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: ${hasScreening ? '#dcfce7; color: #15803d;' : '#fef3c7; color: #b45309;'}">
                        ${hasScreening ? 'Screened' : 'Awaiting Scan'}
                    </span>
                </td>
                <td>
                    <button class="primary-btn" style="padding: 4px 10px; font-size: 12px;" data-pid="${p.patient_id}">
                        <i class="fa-solid fa-camera"></i> Screen
                    </button>
                </td>
            `;

            tr.querySelector("button").addEventListener("click", () => {
                sessionStorage.setItem("patientData", JSON.stringify({
                    patientId: p.patient_id,
                    patientName: p.full_name,
                    screeningType: p.screening_type || "Diabetes Screening",
                    priority: p.priority || "Normal"
                }));
                window.location.href = "retinalupload.html";
            });

            patientsModalTableBody.appendChild(tr);
        });
    }

    if (patientSearchInput) {
        patientSearchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = dashboardData.rawPatients.filter(p =>
                (p.patient_id && p.patient_id.toLowerCase().includes(query)) ||
                (p.full_name && p.full_name.toLowerCase().includes(query)) ||
                (p.contact_number && p.contact_number.toLowerCase().includes(query))
            );
            renderPatientsModalTable(filtered);
        });
    }

    if (closePatientsModal) {
        closePatientsModal.addEventListener("click", () => {
            patientsModal.style.display = "none";
        });
    }

    // Reports Modal
    const reportsModal = document.getElementById("reportsModal");
    const closeReportsModal = document.getElementById("closeReportsModal");

    function openReportsSummary() {
        if (!reportsModal) return;
        const total = dashboardData.rawScreenings.length;
        const normal = dashboardData.rawScreenings.filter(s => s.prediction === "No_DR").length;
        const referable = dashboardData.rawScreenings.filter(s => ["Moderate", "Severe", "Proliferative_DR"].includes(s.prediction)).length;
        const critical = dashboardData.rawScreenings.filter(s => ["Severe", "Proliferative_DR"].includes(s.prediction)).length;

        document.getElementById("repTotalCases").textContent = total;
        document.getElementById("repNormalCases").textContent = normal;
        document.getElementById("repReferableCases").textContent = referable;
        document.getElementById("repCriticalCases").textContent = critical;

        const insightText = document.getElementById("reportInsightText");
        if (insightText) {
            if (total === 0) {
                insightText.textContent = "No screenings completed yet. Complete patient screenings to populate epidemiological analytics.";
            } else {
                const refPct = ((referable / total) * 100).toFixed(1);
                insightText.textContent = `${refPct}% of screened patients demonstrate referable diabetic eye disease requiring dilated specialist intervention. Timely screening prevents severe vision loss in up to 90% of diabetic patients.`;
            }
        }

        reportsModal.style.display = "flex";
    }

    if (closeReportsModal) {
        closeReportsModal.addEventListener("click", () => {
            reportsModal.style.display = "none";
        });
    }

    // Connect Navigation & Buttons
    const patientsBtn = document.getElementById("patientsBtn");
    if (patientsBtn) patientsBtn.addEventListener("click", (e) => { e.preventDefault(); openPatientsDirectory(); });

    const quickPatientsBtn = document.getElementById("quickPatientsBtn");
    if (quickPatientsBtn) quickPatientsBtn.addEventListener("click", () => openPatientsDirectory());

    const reportsBtn = document.getElementById("reportsBtn");
    if (reportsBtn) reportsBtn.addEventListener("click", (e) => { e.preventDefault(); openReportsSummary(); });

    const quickReportsBtn = document.getElementById("quickReportsBtn");
    if (quickReportsBtn) quickReportsBtn.addEventListener("click", () => openReportsSummary());

    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) {
        settingsBtn.addEventListener("click", (e) => {
            e.preventDefault();
            alert(`DRISHTI Clinical Portal v1.0\nLogged in Clinician: ${doctorName}\nInstitution: Diabetic Retinopathy Outreach Program\nConnected AI Model: EfficientNetV2 Retinex-DR Multi-Tier Engine`);
        });
    }

    const pendingAlert = document.getElementById("pendingAlert");
    if (pendingAlert) {
        pendingAlert.addEventListener("click", () => {
            window.location.href = "screeninghistory.html";
        });
    }

    const criticalAlert = document.getElementById("criticalAlert");
    if (criticalAlert) {
        criticalAlert.addEventListener("click", () => {
            window.location.href = "screeninghistory.html?filter=critical";
        });
    }

    const startScreeningBtn = document.getElementById("startScreeningBtn");
    if (startScreeningBtn) startScreeningBtn.addEventListener("click", () => window.location.href = "patientregistration.html");

    const newScreeningBtn = document.getElementById("newScreeningBtn");
    if (newScreeningBtn) newScreeningBtn.addEventListener("click", (e) => { e.preventDefault(); window.location.href = "patientregistration.html"; });

    const viewAllBtn = document.getElementById("viewAllBtn");
    if (viewAllBtn) viewAllBtn.addEventListener("click", () => window.location.href = "screeninghistory.html");

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
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

    // Check URL hash for modal deep-linking (e.g. #patients, #reports)
    if (window.location.hash === "#patients") {
        setTimeout(openPatientsDirectory, 300);
    } else if (window.location.hash === "#reports") {
        setTimeout(openReportsSummary, 300);
    }

    // Fetch live data from backend
    try {
        const [patientsRes, screeningsRes] = await Promise.all([
            fetch("/api/patients", { credentials: "include" }),
            fetch("/api/screenings", { credentials: "include" })
        ]);

        const patients = patientsRes.ok ? await patientsRes.json() : [];
        const screenings = screeningsRes.ok ? await screeningsRes.json() : [];

        dashboardData.rawPatients = patients;
        dashboardData.rawScreenings = screenings;

        // 1. All completed screenings (sorted newest first)
        const completedList = screenings.map((screening) => ({
            id: String(screening.screening_id),
            patientId: screening.patient_id,
            name: screening.patient_name || ("Patient " + screening.patient_id),
            date: screening.screening_date ? new Date(screening.screening_date).toLocaleDateString() : "—",
            screeningType: screening.screening_type || "Diabetes Screening",
            prediction: screening.prediction,
            confidence: screening.confidence,
            isCompleted: true,
            status: "reviewed",
            screeningRaw: screening
        }));

        // 2. Unscreened patients awaiting scan
        const screenedPatientIds = new Set(screenings.map(s => String(s.patient_id)));
        const pendingList = patients
            .filter(p => !screenedPatientIds.has(String(p.patient_id)))
            .map(patient => ({
                id: "patient-" + patient.patient_id,
                patientId: patient.patient_id,
                name: patient.full_name,
                date: patient.created_at ? new Date(patient.created_at).toLocaleDateString() : (patient.screening_date ? new Date(patient.screening_date).toLocaleDateString() : "—"),
                screeningType: patient.screening_type || "Diabetes Screening",
                prediction: null,
                confidence: null,
                isCompleted: false,
                status: "pending",
                screeningRaw: null
            }));

        // Combine: Real screenings first, then pending patients
        dashboardData.screenings = [...completedList, ...pendingList];

        dashboardData.totalPatients = patients.length;
        dashboardData.totalScreenings = screenings.length;
        dashboardData.pendingReviews = pendingList.length;
        dashboardData.reportsGenerated = screenings.length;
        dashboardData.criticalResults = screenings.filter(s => s.prediction === "Severe" || s.prediction === "Proliferative_DR").length;

        updateStatistics();
        renderScreenings();
    } catch (error) {
        console.error("Dashboard data load error:", error);
        updateStatistics();
        renderScreenings();
    }
});