const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

router.post("/signup", async (req, res) => {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            message: "Name, email and password are required"
        });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const sql = `
        INSERT INTO users (name, email, password_hash, phone, role)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            name,
            email,
            passwordHash,
            phone || null,
            role || "patient"
        ],
        (err, result) => {
            if (err) {
                console.error(err);

                return res.status(500).json({
                    message: "Could not create account"
                });
            }

            res.status(201).json({
                message: "Account created successfully",
                userId: result.insertId
            });
        }
    );
});

router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Email and password are required"
        });
    }

    const sql = "SELECT * FROM users WHERE email = ?";

    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error(err);

            return res.status(500).json({
                message: "Server error"
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = results[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        req.session.user = {
            userId: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role
        };

        req.session.save((sessionError) => {
            if (sessionError) {
                console.error(
                    "Session save error:",
                    sessionError
                );

                return res.status(500).json({
                    message: "Could not create login session"
                });
            }

            res.json({
                message: "Login successful",
                userId: user.user_id,
                name: user.name,
                role: user.role
            });
        });
    });
});

router.get("/session", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            loggedIn: false
        });
    }

    res.json({
        loggedIn: true,
        user: req.session.user
    });
});

router.post("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Logout error:", error);

            return res.status(500).json({
                message: "Could not log out"
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            message: "Logout successful"
        });
    });
});

module.exports = router;