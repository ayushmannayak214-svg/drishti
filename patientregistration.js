document.addEventListener("DOMContentLoaded", async () => {

    try {
        const response = await fetch(
            "/api/auth/session",
            {
                credentials: "include"
            }
        );

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


    const doctorName =
        localStorage.getItem("doctorName") || "Doctor";

    const doctorNameElement =
        document.getElementById("doctorName");

    if (doctorNameElement) {
        doctorNameElement.textContent =
            doctorName;
    }


    const patientIdElement =
        document.getElementById("patient-id");

    if (patientIdElement) {

        fetch(
            "/api/patients/next-id",
            {
                credentials: "include"
            }
        )
            .then(response => response.json())
            .then(data => {

                if (data.patientId) {
                    patientIdElement.value =
                        data.patientId;
                }

            })
            .catch(error => {

                console.error(
                    "PATIENT ID ERROR:",
                    error
                );

            });
    }


    const screeningTypeElement =
        document.getElementById("screening-type");

    if (screeningTypeElement) {

        screeningTypeElement.value =
            "diabetes";

        screeningTypeElement.disabled =
            true;
    }


    const form =
        document.querySelector(
            ".registration-form"
        );

    if (!form) {
        return;
    }


    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const requiredFields = [
                "full-name",
                "age",
                "gender",
                "contact-number"
            ];


            const missing =
                requiredFields.some(id => {

                    const element =
                        document.getElementById(id);

                    return (
                        !element ||
                        !element.value.trim()
                    );

                });


            if (missing) {

                alert(
                    "Please fill in the required patient registration fields before continuing."
                );

                return;
            }


            const patient = {

                patientName:
                    document
                        .getElementById("full-name")
                        .value
                        .trim(),

                age:
                    document
                        .getElementById("age")
                        .value,

                dateOfBirth:
                    document
                        .getElementById("date-of-birth")
                        .value,

                gender:
                    document
                        .getElementById("gender")
                        .value,

                contactNumber:
                    document
                        .getElementById("contact-number")
                        .value
                        .trim(),

                email:
                    document
                        .getElementById("email")
                        .value
                        .trim(),

                address:
                    document
                        .getElementById("address")
                        .value
                        .trim(),

                pastIllness:
                    document
                        .getElementById("past-illness")
                        .value,

                chronicDiseases:
                    document
                        .getElementById("chronic-diseases")
                        .value,

                pastSurgeries:
                    document
                        .getElementById("past-surgeries")
                        .value,

                allergies:
                    document
                        .getElementById("allergies")
                        .value,

                currentMedications:
                    document
                        .getElementById("current-medications")
                        .value
                        .trim(),

                symptoms:
                    document
                        .getElementById("symptoms")
                        .value
                        .trim(),

                clinicalNotes:
                    document
                        .getElementById("clinical-notes")
                        .value
                        .trim(),

                emergencyName:
                    document
                        .getElementById("emergency-name")
                        .value
                        .trim(),

                relationship:
                    document
                        .getElementById("relationship")
                        .value
                        .trim(),

                emergencyNumber:
                    document
                        .getElementById("emergency-number")
                        .value
                        .trim(),

                screeningType:
                    "Diabetes Screening",

                priority:
                    document
                        .getElementById("priority")
                        .value,

                referredBy:
                    document
                        .getElementById("referred-by")
                        .value
                        .trim(),

                notes:
                    document
                        .getElementById("notes")
                        .value
                        .trim(),

                doctorName:
                    doctorName,

                screeningDate:
                    new Date().toISOString()
            };


            try {

                const response =
                    await fetch(
                        "/api/patients",
                        {
                            method: "POST",

                            credentials: "include",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    patient
                                )
                        }
                    );


                const result =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        result.error ||
                        "Failed to save patient"
                    );
                }


                patient.patientId =
                    result.patientId;


                const patientIdElement =
                    document.getElementById(
                        "patient-id"
                    );


                if (patientIdElement) {

                    patientIdElement.value =
                        result.patientId;
                }


                sessionStorage.setItem(
                    "patientData",
                    JSON.stringify(patient)
                );


                sessionStorage.removeItem(
                    "screeningResult"
                );


                window.location.href =
                    "retinalupload.html";


            } catch (error) {

                console.error(
                    "PATIENT SAVE ERROR:",
                    error
                );


                alert(
                    "Unable to save patient information. Please try again."
                );
            }
        }
    );


    const dobElement =
        document.getElementById(
            "date-of-birth"
        );

    const ageElement =
        document.getElementById(
            "age"
        );


    if (dobElement && ageElement) {

        dobElement.addEventListener(
            "change",
            () => {

                const dob =
                    new Date(
                        dobElement.value
                    );

                const today =
                    new Date();


                if (
                    isNaN(dob.getTime()) ||
                    dob > today
                ) {

                    ageElement.value =
                        "";

                    return;
                }


                let age =
                    today.getFullYear() -
                    dob.getFullYear();


                const monthDifference =
                    today.getMonth() -
                    dob.getMonth();


                if (
                    monthDifference < 0 ||
                    (
                        monthDifference === 0 &&
                        today.getDate() <
                            dob.getDate()
                    )
                ) {

                    age--;
                }


                ageElement.value =
                    age;
            }
        );
    }

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