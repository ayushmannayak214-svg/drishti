const path = require("path");
const cors = require("cors");
const db = require("./db");
const express = require("express");
const session = require("express-session");

const authRoutes = require("./routes/auth");
const predictRoutes = require("./routes/predict");
const patientRoutes = require("./routes/patients");
const screeningRoutes = require("./routes/screenings");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Skip ngrok browser warning interstitial for all responses
app.use((req, res, next) => {
    res.setHeader("ngrok-skip-browser-warning", "true");
    next();
});
app.use(express.urlencoded({ extended: true }));

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

app.set("trust proxy", 1);

app.use(
    session({
        secret: "drishti-session-secret",
        resave: false,
        saveUninitialized: false,
        proxy: true,
        cookie: {
            httpOnly: true,
            secure: "auto",
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/predict", predictRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/screenings", screeningRoutes);

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        platform: "DRISHTI Retinal Screening Platform",
        timestamp: new Date().toISOString()
    });
});

// Serve frontend web files directly with no-cache headers for instant updates
const frontendDir = path.join(__dirname, "..");
app.use(express.static(frontendDir, {
    setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
    }
}));

// Fallback to index.html for root navigation
app.get("/", (req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
});

db.query("SELECT 1", (err, result) => {
    if (err) {
        console.error("Database connection check failed:", err.message);
    } else {
        console.log("Database connection ready!");
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`DRISHTI server running on port ${PORT}`);
});