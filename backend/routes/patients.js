const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/next-id", (req, res) => {

    if (!req.session.user) {
        return res.status(401).json({
            error: "Not authenticated"
        });
    }

    const sql = `
        SELECT patient_id
        FROM patients
        ORDER BY CAST(SUBSTRING(patient_id, 2) AS UNSIGNED) DESC
        LIMIT 1
    `;

    db.query(sql, (err, results) => {

        if (err) {
            console.error("Next patient ID error:", err);

            return res.status(500).json({
                error: "Failed to generate next patient ID"
            });
        }

        let nextNumber = 1;

        if (
            results.length > 0 &&
            results[0].patient_id
        ) {

            const lastNumber =
                parseInt(
                    results[0].patient_id.substring(1),
                    10
                );

            if (!isNaN(lastNumber)) {
                nextNumber = lastNumber + 1;
            }
        }

        const patientId =
            "P" +
            String(nextNumber).padStart(3, "0");

        res.json({
            patientId: patientId
        });
    });
});


router.get("/", (req, res) => {

    if (!req.session.user) {
        return res.status(401).json({
            error: "Not authenticated"
        });
    }

    const userId = req.session.user.userId;

    const sql = `
        SELECT *
        FROM patients
        WHERE user_id = ?
        ORDER BY CAST(SUBSTRING(patient_id, 2) AS UNSIGNED) DESC
    `;

    db.query(sql, [userId], (err, results) => {

        if (err) {
            console.error("Fetch patients error:", err);

            return res.status(500).json({
                error: "Failed to fetch patients"
            });
        }

        res.json(results);
    });
});


router.post("/", (req, res) => {

    if (!req.session.user) {
        return res.status(401).json({
            error: "Not authenticated"
        });
    }

    const patient = req.body;
    const userId = req.session.user.userId;

    const idSql = `
        SELECT patient_id
        FROM patients
        ORDER BY CAST(SUBSTRING(patient_id, 2) AS UNSIGNED) DESC
        LIMIT 1
    `;

    db.query(idSql, (idErr, idResult) => {

        if (idErr) {
            console.error("Patient ID error:", idErr);

            return res.status(500).json({
                error: "Failed to generate patient ID"
            });
        }

        let nextNumber = 1;

        if (
            idResult.length > 0 &&
            idResult[0].patient_id
        ) {

            const lastId =
                idResult[0].patient_id;

            const lastNumber =
                parseInt(
                    lastId.substring(1),
                    10
                );

            if (!isNaN(lastNumber)) {
                nextNumber = lastNumber + 1;
            }
        }

        const patientId =
            "P" +
            String(nextNumber).padStart(3, "0");

        const sql = `
            INSERT INTO patients (
                patient_id,
                user_id,
                full_name,
                age,
                date_of_birth,
                gender,
                contact_number,
                email,
                address,
                past_illness,
                chronic_diseases,
                past_surgeries,
                allergies,
                current_medications,
                symptoms,
                clinical_notes,
                emergency_name,
                relationship,
                emergency_number,
                screening_type,
                priority,
                referred_by,
                notes,
                doctor_name,
                screening_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            patientId,
            userId,
            patient.patientName,
            patient.age,
            patient.dateOfBirth || null,
            patient.gender,
            patient.contactNumber,
            patient.email || null,
            patient.address || null,
            patient.pastIllness || null,
            patient.chronicDiseases || null,
            patient.pastSurgeries || null,
            patient.allergies || null,
            patient.currentMedications || null,
            patient.symptoms || null,
            patient.clinicalNotes || null,
            patient.emergencyName || null,
            patient.relationship || null,
            patient.emergencyNumber || null,
            "Diabetes Screening",
            patient.priority || "Normal",
            patient.referredBy || null,
            patient.notes || null,
            patient.doctorName || null,
            patient.screeningDate
                ? new Date(patient.screeningDate)
                : null
        ];

        db.query(sql, values, (err) => {

            if (err) {
                console.error(
                    "Patient save error:",
                    err
                );

                return res.status(500).json({
                    error: "Failed to save patient"
                });
            }

            res.status(201).json({
                message: "Patient saved successfully",
                patientId: patientId
            });
        });
    });
});


module.exports = router;