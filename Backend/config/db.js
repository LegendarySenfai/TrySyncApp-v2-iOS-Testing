// config/db.js
// Single source of truth for the MySQL/Aiven connection pool.
// server.js, simulateData.js, and triggerAI.js all import THIS instead of
// each opening their own connection with their own (drifting) defaults.

const mysql = require('mysql2');

const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
    // Fail fast and loud instead of silently falling back to a real,
    // hardcoded password. Missing env vars should break the boot, not
    // quietly connect with a credential that lives in source control.
    console.error(`❌ Missing required DB env vars: ${missing.join(', ')}`);
    console.error('   Set these in your .env (local) or Render dashboard (deployed).');
    throw new Error('Database configuration incomplete — refusing to start with fallback credentials.');
}

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Required for Aiven's managed MySQL (self-signed cert chain).
    ssl: {
        rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Successfully connected to Aiven Database via Pool!');
        connection.release();
    }
});

module.exports = db;
