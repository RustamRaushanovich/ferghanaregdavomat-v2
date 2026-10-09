const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'davomat.db');
const db = new Database(dbPath);

// Create tables
function initDb() {
    // Attendance Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            date TEXT,
            time TEXT,
            district TEXT,
            school TEXT,
            classes_count INTEGER,
            total_students INTEGER,
            sababli_kasal INTEGER DEFAULT 0,
            sababli_tadbirlar INTEGER DEFAULT 0,
            sababli_oilaviy INTEGER DEFAULT 0,
            sababli_ijtimoiy INTEGER DEFAULT 0,
            sababli_boshqa INTEGER DEFAULT 0,
            sababli_jami INTEGER DEFAULT 0,
            sababsiz_muntazam INTEGER DEFAULT 0,
            sababsiz_qidiruv INTEGER DEFAULT 0,
            sababsiz_chetel INTEGER DEFAULT 0,
            sababsiz_boyin INTEGER DEFAULT 0,
            sababsiz_ishlab INTEGER DEFAULT 0,
            sababsiz_qarshilik INTEGER DEFAULT 0,
            sababsiz_jazo INTEGER DEFAULT 0,
            sababsiz_nazoratsiz INTEGER DEFAULT 0,
            sababsiz_boshqa INTEGER DEFAULT 0,
            sababsiz_turmush INTEGER DEFAULT 0,
            sababsiz_jami INTEGER DEFAULT 0,
            total_absent INTEGER DEFAULT 0,
            percent REAL DEFAULT 0,
            fio TEXT,
            phone TEXT,
            inspector TEXT,
            user_id UNSIGNED BIG INT,
            source TEXT DEFAULT 'bot'
        )
    `).run();

    // Migration: add source column if it doesn't exist
    try { db.prepare(`ALTER TABLE attendance ADD COLUMN source TEXT DEFAULT 'bot'`).run(); } catch (e) { }
    try { db.prepare(`ALTER TABLE attendance ADD COLUMN bildirgi TEXT`).run(); } catch (e) { }
    try { db.prepare(`ALTER TABLE attendance ADD COLUMN academic_year TEXT DEFAULT '2026-2027'`).run(); } catch (e) { }

    // Absent Students Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS absent_students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attendance_id INTEGER,
            class TEXT,
            name TEXT,
            address TEXT,
            parent_name TEXT,
            parent_phone TEXT,
            FOREIGN KEY (attendance_id) REFERENCES attendance (id)
        )
    `).run();

    // Password History Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS password_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            old_password TEXT,
            new_password TEXT,
            changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            changed_by TEXT
        )
    `).run();

    console.log("SQLite Database initialized at:", dbPath);
}

initDb();

module.exports = db;
