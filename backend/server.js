const cors = require("cors");
const db = require("./db");
const express = require("express");
const authRoutes = require("./routes/auth");

const app = express();

const PORT = 5000;

app.use(express.json());

app.use(cors());

app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
    res.send("DIRE backend is running!");
});

db.query("SELECT 1", (err, result) => {
    if (err) {
        console.error("MySQL connection failed:", err);
    } else {
        console.log("MySQL connection successful!");
    }
});

app.listen(PORT, () => {
    console.log(`DIRE backend running on http://localhost:${PORT}`);
});