const mysql = require("mysql2");

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "delon_store_new"
});

db.connect((err) => {
    if (err) {
        console.log("Database error:", err);
    } else {
        console.log("Database connected!");
    }
});

module.exports = db;
