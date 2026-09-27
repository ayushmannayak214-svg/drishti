const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "mission38#go",
  database: process.env.DB_NAME || "dire",
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0
};

const filePath = path.join(__dirname, "dire_local_data.json");

function clearLocalFallback() {
  if (!fs.existsSync(filePath)) {
    console.log("No local dataset file found.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  data.patients = [];
  data.screenings = [];
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  console.log("Local fallback dataset cleared.");
  console.log("patients:", data.patients.length);
  console.log("screenings:", data.screenings.length);
}

function clearMySql() {
  return new Promise((resolve, reject) => {
    const pool = mysql.createPool(DB_CONFIG);

    pool.getConnection((err, conn) => {
      if (err) {
        console.log("MySQL is not reachable; skipping MySQL cleanup.");
        pool.end();
        return resolve(false);
      }

      conn.beginTransaction((txErr) => {
        if (txErr) {
          conn.release();
          pool.end();
          return reject(txErr);
        }

        conn.query("DELETE FROM screenings", (screeningErr) => {
          if (screeningErr) {
            return conn.rollback(() => {
              conn.release();
              pool.end();
              reject(screeningErr);
            });
          }

          conn.query("DELETE FROM patients", (patientErr) => {
            if (patientErr) {
              return conn.rollback(() => {
                conn.release();
                pool.end();
                reject(patientErr);
              });
            }

            conn.commit((commitErr) => {
              conn.release();
              pool.end();

              if (commitErr) {
                return reject(commitErr);
              }

              console.log("MySQL patient and screening data cleared.");
              resolve(true);
            });
          });
        });
      });
    });
  });
}

(async () => {
  clearLocalFallback();

  try {
    await clearMySql();
  } catch (err) {
    console.error("MySQL cleanup failed:", err.message);
  }

  console.log("Reset complete.");
})();