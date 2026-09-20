const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");

const DB_CONFIG = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "mission38#go",
    database: process.env.DB_NAME || "drishti",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let activeDriver = "mysql";
let mysqlPool = null;

// Local JSON file persistence for offline/zero-config fallback
const localDbFile = path.join(__dirname, "dire_local_data.json");

function loadLocalData() {
    if (fs.existsSync(localDbFile)) {
        try {
            return JSON.parse(fs.readFileSync(localDbFile, "utf8"));
        } catch (e) {
            console.error("Error reading local db file, reinitializing:", e.message);
        }
    }
    const initialData = {
        users: [
            {
                user_id: 1,
                name: "Dr. Ananya Sharma",
                email: "dr.ananya@dire.com",
                // Hash of 'password123'
                password_hash: "$2b$10$fYt8fRKa67zQC9sxaF.D6erorAc6J8D5JOR7StclkgHRtJuXlMro6",
                phone: "+91 98765 43210",
                role: "doctor",
                created_at: new Date().toISOString()
            }
        ],
        patients: [],
        screenings: []
    };
    saveLocalData(initialData);
    return initialData;
}

function saveLocalData(data) {
    try {
        fs.writeFileSync(localDbFile, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        console.error("Error writing to local db file:", e.message);
    }
}

// Local fallback query engine supporting the exact queries used by DRISHTI routes
function localQuery(sql, params, callback) {
    if (typeof params === "function") {
        callback = params;
        params = [];
    }
    params = params || [];

    const data = loadLocalData();
    const cleanSql = sql.replace(/\s+/g, " ").trim();

    try {
        // SELECT 1 (Health check)
        if (/^SELECT 1/i.test(cleanSql)) {
            return callback(null, [{ "1": 1 }]);
        }

        // 1. AUTH: INSERT INTO users
        if (/^INSERT INTO users/i.test(cleanSql)) {
            const [name, email, passwordHash, phone, role] = params;
            // Check if email already exists
            if (data.users.some(u => u.email.toLowerCase() === (email || "").toLowerCase())) {
                const err = new Error("Email already exists");
                err.code = "ER_DUP_ENTRY";
                return callback(err);
            }
            const newId = data.users.length > 0 ? Math.max(...data.users.map(u => u.user_id || 0)) + 1 : 1;
            const newUser = {
                user_id: newId,
                name,
                email,
                password_hash: passwordHash,
                phone: phone || null,
                role: role || "patient",
                created_at: new Date().toISOString()
            };
            data.users.push(newUser);
            saveLocalData(data);
            return callback(null, { insertId: newId, affectedRows: 1 });
        }

        // 2. AUTH: SELECT * FROM users WHERE email = ?
        if (/^SELECT \* FROM users WHERE email\s*=\s*\?/i.test(cleanSql)) {
            const email = params[0] || "";
            const matched = data.users.filter(u => u.email.toLowerCase() === email.toLowerCase());
            return callback(null, matched);
        }

        // 3. PATIENTS: SELECT patient_id FROM patients ORDER BY ... LIMIT 1
        if (/^SELECT patient_id FROM patients/i.test(cleanSql)) {
            if (/WHERE patient_id\s*=\s*\?\s*AND\s*user_id\s*=\s*\?/i.test(cleanSql) || cleanSql.includes("WHERE patient_id = ? AND user_id = ?")) {
                const [pid, uid] = params;
                const matched = data.patients.filter(p => String(p.patient_id) === String(pid) && String(p.user_id) === String(uid));
                return callback(null, matched);
            }

            // Next ID query (order by id desc limit 1)
            const sorted = [...data.patients].sort((a, b) => {
                const numA = parseInt(String(a.patient_id || "").replace(/\D/g, ""), 10) || 0;
                const numB = parseInt(String(b.patient_id || "").replace(/\D/g, ""), 10) || 0;
                return numB - numA;
            });
            return callback(null, sorted.length > 0 ? [{ patient_id: sorted[0].patient_id }] : []);
        }

        // 4. PATIENTS: SELECT * FROM patients WHERE user_id = ?
        if (/^SELECT \* FROM patients WHERE user_id\s*=\s*\?/i.test(cleanSql)) {
            const userId = params[0];
            const matched = data.patients.filter(p => String(p.user_id) === String(userId));
            matched.sort((a, b) => {
                const numA = parseInt(String(a.patient_id || "").replace(/\D/g, ""), 10) || 0;
                const numB = parseInt(String(b.patient_id || "").replace(/\D/g, ""), 10) || 0;
                return numB - numA;
            });
            return callback(null, matched);
        }

        // 5. PATIENTS: INSERT INTO patients (...) VALUES (...)
        if (/^INSERT INTO patients/i.test(cleanSql)) {
            const [
                patientId, userId, fullName, age, dateOfBirth, gender,
                contactNumber, email, address, pastIllness, chronicDiseases,
                pastSurgeries, allergies, currentMedications, symptoms,
                clinicalNotes, emergencyName, relationship, emergencyNumber,
                screeningType, priority, referredBy, notes, doctorName,
                screeningDate
            ] = params;

            const newPatient = {
                patient_id: patientId,
                user_id: userId,
                full_name: fullName,
                age,
                date_of_birth: dateOfBirth,
                gender,
                contact_number: contactNumber,
                email,
                address,
                past_illness: pastIllness,
                chronic_diseases: chronicDiseases,
                past_surgeries: pastSurgeries,
                allergies,
                current_medications: currentMedications,
                symptoms,
                clinical_notes: clinicalNotes,
                emergency_name: emergencyName,
                relationship,
                emergency_number: emergencyNumber,
                screening_type: screeningType,
                priority,
                referred_by: referredBy,
                notes,
                doctor_name: doctorName,
                screening_date: screeningDate || new Date().toISOString(),
                created_at: new Date().toISOString()
            };
            data.patients.push(newPatient);
            saveLocalData(data);
            return callback(null, { insertId: patientId, affectedRows: 1 });
        }

        // 6. SCREENINGS: SELECT ... FROM screenings INNER JOIN patients ...
        if (/FROM screenings INNER JOIN patients/i.test(cleanSql)) {
            const userId = params[0];
            const patientMap = {};
            data.patients.filter(p => p.user_id === userId).forEach(p => {
                patientMap[p.patient_id] = p;
            });

            const results = [];
            data.screenings.forEach(s => {
                const p = patientMap[s.patient_id];
                if (p) {
                    results.push({
                        screening_id: s.screening_id,
                        patient_id: s.patient_id,
                        patient_name: p.full_name,
                        doctor_name: s.doctor_name || p.doctor_name,
                        screening_type: s.screening_type || p.screening_type,
                        priority: s.priority || p.priority,
                        prediction: s.prediction,
                        confidence: s.confidence,
                        no_dr: s.no_dr,
                        mild: s.mild,
                        moderate: s.moderate,
                        severe: s.severe,
                        proliferative_dr: s.proliferative_dr,
                        screening_date: s.screening_date
                    });
                }
            });

            // Sort by date desc
            results.sort((a, b) => new Date(b.screening_date) - new Date(a.screening_date));
            return callback(null, results);
        }

        // 7. SCREENINGS: INSERT INTO screenings (...) VALUES (...)
        if (/^INSERT INTO screenings/i.test(cleanSql)) {
            const [
                patientId, doctorName, screeningType, priority,
                prediction, confidence, noDr, mild, moderate, severe, proliferativeDr
            ] = params;

            const newId = data.screenings.length > 0 ? Math.max(...data.screenings.map(s => s.screening_id || 0)) + 1 : 1;
            const newScreening = {
                screening_id: newId,
                patient_id: patientId,
                doctor_name: doctorName,
                screening_type: screeningType,
                priority,
                prediction,
                confidence,
                no_dr: noDr,
                mild,
                moderate,
                severe,
                proliferative_dr: proliferativeDr,
                screening_date: new Date().toISOString()
            };
            data.screenings.push(newScreening);
            saveLocalData(data);
            return callback(null, { insertId: newId, affectedRows: 1 });
        }

        console.warn("[LocalDB] Unhandled SQL query:", cleanSql);
        return callback(null, []);
    } catch (err) {
        console.error("[LocalDB] Query processing error:", err);
        return callback(err);
    }
}

// Bootstrap MySQL schema if connected
function initMySqlTables(pool) {
    const tableQueries = [
        `CREATE TABLE IF NOT EXISTS users (
            user_id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            role VARCHAR(50) DEFAULT 'doctor',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS patients (
            patient_id VARCHAR(50) PRIMARY KEY,
            user_id INT NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            age INT NOT NULL,
            date_of_birth DATE,
            gender VARCHAR(20) NOT NULL,
            contact_number VARCHAR(50) NOT NULL,
            email VARCHAR(255),
            address TEXT,
            past_illness TEXT,
            chronic_diseases TEXT,
            past_surgeries TEXT,
            allergies TEXT,
            current_medications TEXT,
            symptoms TEXT,
            clinical_notes TEXT,
            emergency_name VARCHAR(255),
            relationship VARCHAR(100),
            emergency_number VARCHAR(50),
            screening_type VARCHAR(100) DEFAULT 'Diabetes Screening',
            priority VARCHAR(50) DEFAULT 'Normal',
            referred_by VARCHAR(255),
            notes TEXT,
            doctor_name VARCHAR(255),
            screening_date DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS screenings (
            screening_id INT AUTO_INCREMENT PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL,
            doctor_name VARCHAR(255),
            screening_type VARCHAR(100) DEFAULT 'Diabetes Screening',
            priority VARCHAR(50) DEFAULT 'Normal',
            prediction VARCHAR(100) NOT NULL,
            confidence FLOAT DEFAULT 0,
            no_dr FLOAT DEFAULT 0,
            mild FLOAT DEFAULT 0,
            moderate FLOAT DEFAULT 0,
            severe FLOAT DEFAULT 0,
            proliferative_dr FLOAT DEFAULT 0,
            screening_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    tableQueries.forEach(q => {
        pool.query(q, (err) => {
            if (err) {
                console.warn("[MySQL Schema Bootstrap Warning]:", err.message);
            }
        });
    });

    // Seed default demo doctor account if not exists
    const seedUserSql = `
        INSERT IGNORE INTO users (name, email, password_hash, phone, role)
        VALUES (?, ?, ?, ?, ?)
    `;
    const defaultDoctorHash = "$2a$10$wNqZ/H7J2vLp1kXpLzO8nO6uVl7XQ7A7XGv4aR0D8.fQn5vN2QZ3e";
    pool.query("SELECT * FROM users WHERE email = ?", ["dr.ananya@dire.com"], (err, rows) => {
        if (!err && (!rows || rows.length === 0)) {
            pool.query(seedUserSql, [
                "Dr. Ananya Sharma",
                "dr.ananya@dire.com",
                defaultDoctorHash,
                "+91 98765 43210",
                "doctor"
            ], (seedErr) => {
                if (!seedErr) {
                    console.log("[Database Notice] Default doctor account seeded successfully.");
                }
            });
        }
    });
}

try {
    mysqlPool = mysql.createPool(DB_CONFIG);
    mysqlPool.getConnection((err, conn) => {
        if (err) {
            console.warn("[Database Notice] MySQL server is not reachable at " + DB_CONFIG.host + " (" + err.code + ").");
            console.log("[Database Notice] Seamlessly activated local persistent database engine (dire_local_data.json).");
            activeDriver = "local";
        } else {
            console.log("[Database Notice] Connected successfully to MySQL database '" + DB_CONFIG.database + "'.");
            conn.release();
            initMySqlTables(mysqlPool);
        }
    });
} catch (e) {
    console.warn("[Database Notice] MySQL initialization failed, using local storage:", e.message);
    activeDriver = "local";
}

const db = {
    query: function (sql, params, callback) {
        if (activeDriver === "mysql" && mysqlPool) {
            mysqlPool.query(sql, params, (err, results, fields) => {
                if (err) {
                    // If MySQL connection drops or errors, seamlessly fallback to local engine
                    console.warn("[MySQL Query Error - falling back to local storage]:", err.message);
                    return localQuery(sql, params, callback);
                }
                return callback(null, results, fields);
            });
        } else {
            return localQuery(sql, params, callback);
        }
    }
};

module.exports = db;