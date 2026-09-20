document.addEventListener("DOMContentLoaded", async () => {
    // 1. Session check
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

    const doctorName = localStorage.getItem("doctorName") || "Doctor";
    const doctorNameElement = document.getElementById("doctorName");
    if (doctorNameElement) doctorNameElement.textContent = doctorName;

    const historyTableBody = document.getElementById("historyTableBody");
    const notificationCount = document.getElementById("notificationCount");
    const searchInput = document.getElementById("historySearchInput");
    const filterSelect = document.getElementById("historyFilterSelect");

    let allScreenings = [];

    // Parse URL params for pre-applied filter (e.g. ?filter=critical)
    const urlParams = new URLSearchParams(window.location.search);
    const preFilter = urlParams.get("filter");
    if (preFilter && filterSelect) {
        filterSelect.value = preFilter;
    }

    function getPillStyle(prediction) {
        const styles = {
            No_DR: "background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;",
            Mild: "background: #fef9c3; color: #854d0e; border: 1px solid #fef08a;",
            Moderate: "background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa;",
            Severe: "background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;",
            Proliferative_DR: "background: #fdf2f8; color: #9d174d; border: 1px solid #fbcfe8;"
        };
        return styles[prediction] || "background: #f3f4f6; color: #374151;";
    }

    function renderScreeningsTable(screenings) {
        if (!historyTableBody) return;
        historyTableBody.innerHTML = "";

        if (!screenings || screenings.length === 0) {
            historyTableBody.innerHTML = `
                <tr id="noHistoryRow">
                    <td colspan="8" class="no-history" style="text-align: center; padding: 40px;">
                        <div class="empty-icon" style="font-size: 36px; color: #888aa0; margin-bottom: 12px;">
                            <i class="fa-solid fa-clock-rotate-left"></i>
                        </div>
                        <h3 style="color: #2e2c5f; margin-bottom: 6px;">No Screening Records Match</h3>
                        <p style="color: #65677a;">Try changing your search term or stage filter criteria.</p>
                    </td>
                </tr>
            `;
            return;
        }

        screenings.forEach((s) => {
            const tr = document.createElement("tr");
            const dateStr = s.screening_date ? new Date(s.screening_date).toLocaleDateString() : "—";
            const stageName = (s.prediction || "Normal").replace(/_/g, " ");
            const confStr = s.confidence !== null && s.confidence !== undefined ? s.confidence + "%" : "—";

            tr.innerHTML = `
                <td><strong>${s.patient_id}</strong></td>
                <td>${s.patient_name || 'Patient ' + s.patient_id}</td>
                <td>${dateStr}</td>
                <td>${s.screening_type || 'Diabetes Screening'}</td>
                <td>
                    <span style="padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block; ${getPillStyle(s.prediction)}">
                        ${stageName}
                    </span>
                </td>
                <td><strong>${confStr}</strong></td>
                <td>
                    <span style="padding: 3px 8px; border-radius: 6px; font-size: 12px; background: #e0f2fe; color: #0369a1;">
                        Reviewed
                    </span>
                </td>
                <td>
                    <button class="view-history-btn" style="padding: 6px 12px; background: #363775; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        <i class="fa-solid fa-eye"></i> Details
                    </button>
                </td>
            `;

            tr.querySelector(".view-history-btn").addEventListener("click", () => {
                sessionStorage.setItem("historyScreening", JSON.stringify(s));
                sessionStorage.setItem("historyMode", "true");
                window.location.href = "screeningresult.html";
            });

            historyTableBody.appendChild(tr);
        });
    }

    function applyFilterAndSearch() {
        const query = (searchInput ? searchInput.value : "").toLowerCase().trim();
        const stageFilter = filterSelect ? filterSelect.value : "all";

        let filtered = allScreenings.filter(s => {
            // Search query matches patient ID or Name
            const idMatch = s.patient_id && s.patient_id.toLowerCase().includes(query);
            const nameMatch = s.patient_name && s.patient_name.toLowerCase().includes(query);
            const matchesSearch = !query || idMatch || nameMatch;

            // Stage filter
            let matchesStage = true;
            if (stageFilter === "critical") {
                matchesStage = s.prediction === "Severe" || s.prediction === "Proliferative_DR";
            } else if (stageFilter !== "all") {
                matchesStage = s.prediction === stageFilter;
            }

            return matchesSearch && matchesStage;
        });

        renderScreeningsTable(filtered);
    }

    if (searchInput) {
        searchInput.addEventListener("input", applyFilterAndSearch);
    }
    if (filterSelect) {
        filterSelect.addEventListener("change", applyFilterAndSearch);
    }

    // Fetch screenings from database
    try {
        const response = await fetch("/api/screenings", {
            credentials: "include"
        });
        const screenings = await response.json();

        if (response.ok && Array.isArray(screenings)) {
            allScreenings = screenings;
            if (notificationCount) {
                notificationCount.textContent = screenings.length;
            }
            applyFilterAndSearch();
        } else {
            renderScreeningsTable([]);
        }
    } catch (err) {
        console.error("Screening history fetch error:", err);
        renderScreeningsTable([]);
    }

    // Logout
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await fetch("/api/auth/logout", {
                    method: "POST",
                    credentials: "include"
                });
            } catch (e) {}
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("index.html");
        });
    }
});