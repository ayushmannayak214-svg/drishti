const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {

    if (!req.session.user) {
        return res.status(401).json({
            error: "Not authenticated"
        });
    }

    const userId = req.session.user.userId;

    const sql = `
        SELECT
            screenings.screening_id,
            screenings.patient_id,
            patients.full_name AS patient_name,
            screenings.doctor_name,
            screenings.screening_type,
            screenings.priority,
            screenings.prediction,
            screenings.confidence,
            screenings.no_dr,
            screenings.mild,
            screenings.moderate,
            screenings.severe,
            screenings.proliferative_dr,
            screenings.screening_date
        FROM screenings
        INNER JOIN patients
            ON screenings.patient_id = patients.patient_id
        WHERE patients.user_id = ?
        ORDER BY screenings.screening_date DESC
    `;

    db.query(sql, [userId], (err, results) => {

        if (err) {
            console.error(
                "Screening fetch error:",
                err
            );

            return res.status(500).json({
                error: "Failed to fetch screenings"
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

    const screening = req.body;
    const probabilities =
        screening.probabilities || {};

    const userId =
        req.session.user.userId;

    const patientCheckSql = `
        SELECT patient_id
        FROM patients
        WHERE patient_id = ?
        AND user_id = ?
        LIMIT 1
    `;

    db.query(
        patientCheckSql,
        [
            screening.patientId,
            userId
        ],
        (patientErr, patientResults) => {

            if (patientErr) {
                console.error(
                    "Patient ownership check error:",
                    patientErr
                );

                return res.status(500).json({
                    error: "Failed to verify patient"
                });
            }

            if (patientResults.length === 0) {
                return res.status(403).json({
                    error:
                        "You are not authorized to save a screening for this patient"
                });
            }

            const sql = `
                INSERT INTO screenings (
                    patient_id,
                    doctor_name,
                    screening_type,
                    priority,
                    prediction,
                    confidence,
                    no_dr,
                    mild,
                    moderate,
                    severe,
                    proliferative_dr
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                screening.patientId,
                screening.doctorName || null,
                screening.screeningType || null,
                screening.priority || null,
                screening.prediction || null,
                screening.confidence ?? null,
                probabilities.No_DR ?? 0,
                probabilities.Mild ?? 0,
                probabilities.Moderate ?? 0,
                probabilities.Severe ?? 0,
                probabilities.Proliferative_DR ?? 0
            ];

            db.query(
                sql,
                values,
                (err, result) => {

                    if (err) {
                        console.error(
                            "Screening save error:",
                            err
                        );

                        return res.status(500).json({
                            error:
                                "Failed to save screening"
                        });
                    }

                    res.status(201).json({
                        message:
                            "Screening saved successfully",
                        screeningId:
                            result.insertId
                    });
                }
            );
        }
    );
});


module.exports = router;