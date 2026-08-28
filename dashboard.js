document.addEventListener("DOMContentLoaded", () => {
    const doctorName = localStorage.getItem("doctorName") || "Dr. Ananya";

    document.getElementById("doctorName").textContent = doctorName;
    document.getElementById("welcomeDoctorName").textContent = doctorName;

    let dashboardData = JSON.parse(localStorage.getItem("dashboardData")) || {
        totalPatients: 0,
        totalScreenings: 0,
        pendingReviews: 0,
        reportsGenerated: 0,
        criticalResults: 0,
        screenings: []
    };

    const totalPatients = document.getElementById("totalPatients");
    const totalScreenings = document.getElementById("totalScreenings");
    const pendingReviews = document.getElementById("pendingReviews");
    const reportsGenerated = document.getElementById("reportsGenerated");
    const alertPendingCount = document.getElementById("alertPendingCount");
    const criticalResultCount = document.getElementById("criticalResultCount");
    const notificationCount = document.getElementById("notificationCount");
    const screeningTableBody = document.getElementById("screeningTableBody");

    function saveDashboardData() {
        localStorage.setItem("dashboardData", JSON.stringify(dashboardData));
    }

    function updateStatistics() {
        totalPatients.textContent = dashboardData.totalPatients;
        totalScreenings.textContent = dashboardData.totalScreenings;
        pendingReviews.textContent = dashboardData.pendingReviews;
        reportsGenerated.textContent = dashboardData.reportsGenerated;
        alertPendingCount.textContent = dashboardData.pendingReviews;
        criticalResultCount.textContent = dashboardData.criticalResults;
        notificationCount.textContent = dashboardData.pendingReviews;
    }

    function renderScreenings() {
        screeningTableBody.innerHTML = "";

        if (dashboardData.screenings.length === 0) {
            screeningTableBody.innerHTML = `
                <tr id="noScreeningsRow">
                    <td colspan="6" class="no-screenings">
                        <div class="empty-icon">
                            <i class="fa-solid fa-folder-open"></i>
                        </div>
                        <h3>No Recent Screenings</h3>
                        <p>Start a new screening to see patient reports here.</p>
                        <button class="empty-screening-btn" id="emptyScreeningBtn">
                            <i class="fa-solid fa-plus"></i>
                            Start New Screening
                        </button>
                    </td>
                </tr>
            `;

            document.getElementById("emptyScreeningBtn").addEventListener("click", startNewScreening);
            return;
        }

        dashboardData.screenings.forEach((patient) => {
            const row = document.createElement("tr");

            row.dataset.patientId = patient.id;

            row.innerHTML = `
                <td>${patient.name}</td>
                <td>${patient.date}</td>
                <td>${patient.screeningType}</td>
                <td>
                    <select class="result-select ${patient.result}" data-patient="${patient.id}">
                        <option value="normal" ${patient.result === "normal" ? "selected" : ""}>
                            Normal
                        </option>
                        <option value="abnormal" ${patient.result === "abnormal" ? "selected" : ""}>
                            Abnormal
                        </option>
                    </select>
                </td>
                <td>
                    <select class="status-select ${patient.status}" data-patient="${patient.id}">
                        <option value="reviewed" ${patient.status === "reviewed" ? "selected" : ""}>
                            Reviewed
                        </option>
                        <option value="pending" ${patient.status === "pending" ? "selected" : ""}>
                            Pending
                        </option>
                    </select>
                </td>
                <td>
                    <button class="view-btn" data-patient-id="${patient.id}">
                        <i class="fa-solid fa-eye"></i>
                        View
                    </button>
                </td>
            `;

            screeningTableBody.appendChild(row);
        });

        addTableEvents();
    }

    function addTableEvents() {
        const resultSelects = document.querySelectorAll(".result-select");
        const statusSelects = document.querySelectorAll(".status-select");
        const viewButtons = document.querySelectorAll(".view-btn");

        resultSelects.forEach((select) => {
            select.addEventListener("change", () => {
                const patientId = select.dataset.patient;
                const patient = dashboardData.screenings.find(
                    (item) => item.id === patientId
                );

                if (!patient) {
                    return;
                }

                patient.result = select.value;

                select.classList.remove("normal", "abnormal");
                select.classList.add(select.value);

                updateStatistics();
                saveDashboardData();
            });
        });

        statusSelects.forEach((select) => {
            select.addEventListener("change", () => {
                const patientId = select.dataset.patient;
                const patient = dashboardData.screenings.find(
                    (item) => item.id === patientId
                );

                if (!patient) {
                    return;
                }

                patient.status = select.value;

                select.classList.remove("reviewed", "pending");
                select.classList.add(select.value);

                dashboardData.pendingReviews =
                    dashboardData.screenings.filter(
                        (item) => item.status === "pending"
                    ).length;

                updateStatistics();
                saveDashboardData();
            });
        });

        viewButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const patientId = button.dataset.patientId;

                const patient = dashboardData.screenings.find(
                    (item) => item.id === patientId
                );

                if (!patient) {
                    return;
                }

                localStorage.setItem(
                    "selectedPatient",
                    JSON.stringify(patient)
                );

                console.log("Selected patient:", patient);

                alert(
                    `Patient: ${patient.name}\n` +
                    `Date: ${patient.date}\n` +
                    `Screening: ${patient.screeningType}\n` +
                    `Result: ${patient.result}\n` +
                    `Status: ${patient.status}`
                );

                // Later:
                // window.location.href = "results.html";
            });
        });
    }

    function startNewScreening() {
        window.location.href = "new-screening.html";
    }

    document
        .getElementById("startScreeningBtn")
        .addEventListener("click", startNewScreening);

    document
        .getElementById("newScreeningBtn")
        .addEventListener("click", (event) => {
            event.preventDefault();
            startNewScreening();
        });

    document
        .getElementById("quickScreeningBtn")
        .addEventListener("click", startNewScreening);

    document
        .getElementById("emptyScreeningBtn")
        ?.addEventListener("click", startNewScreening);

    document
        .getElementById("viewAllBtn")
        .addEventListener("click", () => {
            console.log("View all screenings clicked");

            // Later:
            // window.location.href = "screening-history.html";
        });

    document
        .getElementById("patientsBtn")
        .addEventListener("click", (event) => {
            event.preventDefault();
            console.log("Patients page clicked");

            // Later:
            // window.location.href = "patients.html";
        });

    document
        .getElementById("quickPatientsBtn")
        .addEventListener("click", () => {
            console.log("Patients page clicked");

            // Later:
            // window.location.href = "patients.html";
        });

    document
        .getElementById("historyBtn")
        .addEventListener("click", (event) => {
            event.preventDefault();
            console.log("Screening history clicked");

            // Later:
            // window.location.href = "screening-history.html";
        });

    document
        .getElementById("reportsBtn")
        .addEventListener("click", (event) => {
            event.preventDefault();
            console.log("Reports page clicked");

            // Later:
            // window.location.href = "reports.html";
        });

    document
        .getElementById("quickReportsBtn")
        .addEventListener("click", () => {
            console.log("Reports page clicked");

            // Later:
            // window.location.href = "reports.html";
        });

    document
        .getElementById("settingsBtn")
        .addEventListener("click", (event) => {
            event.preventDefault();
            console.log("Settings clicked");

            // Later:
            // window.location.href = "settings.html";
        });

    document
        .getElementById("pendingAlert")
        .addEventListener("click", () => {
            console.log("Pending reviews clicked");

            // Later:
            // window.location.href = "doctor-review.html";
        });

    document
        .getElementById("criticalAlert")
        .addEventListener("click", () => {
            console.log("Critical results clicked");

            // Later:
            // window.location.href = "doctor-review.html";
        });

    document
        .getElementById("notificationBtn")
        .addEventListener("click", () => {
            console.log("Notifications clicked");
        });

    document
        .getElementById("profileDropdown")
        .addEventListener("click", () => {
            console.log("Profile menu clicked");
        });

    document
        .getElementById("logoutBtn")
        .addEventListener("click", () => {
            localStorage.removeItem("doctorName");
            localStorage.removeItem("selectedPatient");
            localStorage.removeItem("dashboardData");

            window.location.href = "index.html";
        });

    updateStatistics();
    renderScreenings();
});