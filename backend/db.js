const mysql = require("mysql2");

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "mission38#go",
    database: "dire"
});

module.exports = db;