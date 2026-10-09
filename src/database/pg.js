const { Pool } = require('pg');
require('dotenv').config();

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres.mdziwsdtktyspyuwtvov:Imron6512323@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres';

let pool = null;
if (DB_URL) {
    const isLocal = DB_URL.includes('localhost') || DB_URL.includes('127.0.0.1');
    pool = new Pool({
        connectionString: DB_URL,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 4000,
        statement_timeout: 6000,
        query_timeout: 6000
    });
}

async function initDb() {
    if (!process.env.DATABASE_URL || !pool) {
        console.warn("⚠️ [PostgreSQL] DATABASE_URL .env faylida ko'rsatilmagan. Local / SQLite режимида ёки Supabase уланиши кутилмоқда.");
        return;
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS xorij_students (
                id SERIAL PRIMARY KEY,
                json_id TEXT UNIQUE,
                student_name TEXT,
                dob TEXT,
                class_name TEXT,
                district TEXT,
                school TEXT,
                country TEXT,
                reason TEXT,
                companion TEXT,
                address TEXT,
                status TEXT,
                qonuniylik TEXT,
                q_sana TEXT,
                q_raqam TEXT,
                b_sana TEXT,
                b_raqam TEXT,
                doc_qaror TEXT,
                doc_buyruq TEXT,
                is_returned BOOLEAN DEFAULT FALSE,
                ret_date TEXT,
                ret_district TEXT,
                ret_school TEXT,
                ret_class TEXT,
                ret_b_sana TEXT,
                ret_b_raqam TEXT,
                doc_return TEXT,
                created_by TEXT,
                updated_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                title TEXT,
                description TEXT,
                date TEXT,
                filename TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                date DATE,
                time TEXT,
                district TEXT,
                school TEXT,
                classes_count INTEGER,
                total_students INTEGER,
                sababli_kasal INTEGER,
                sababli_tadbirlar INTEGER,
                sababli_oilaviy INTEGER,
                sababli_ijtimoiy INTEGER,
                sababli_boshqa INTEGER,
                sababli_jami INTEGER,
                sababsiz_muntazam INTEGER,
                sababsiz_qidiruv INTEGER,
                sababsiz_chetel INTEGER,
                sababsiz_boyin INTEGER,
                sababsiz_ishlab INTEGER,
                sababsiz_qarshilik INTEGER,
                sababsiz_jazo INTEGER,
                sababsiz_nazoratsiz INTEGER,
                sababsiz_boshqa INTEGER,
                sababsiz_turmush INTEGER,
                sababsiz_jami INTEGER,
                total_absent INTEGER,
                percent NUMERIC,
                fio TEXT,
                phone TEXT,
                inspector TEXT,
                user_id BIGINT,
                source TEXT,
                bildirgi TEXT,
                academic_year TEXT DEFAULT '2026-2027'
            );

            CREATE TABLE IF NOT EXISTS absent_students (
                id SERIAL PRIMARY KEY,
                attendance_id INTEGER REFERENCES attendance(id),
                class TEXT,
                name TEXT,
                address TEXT,
                parent_name TEXT,
                parent_phone TEXT
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id TEXT,
                action TEXT,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS password_history (
                id SERIAL PRIMARY KEY,
                username TEXT,
                old_password TEXT,
                new_password TEXT,
                changed_by TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tg_users (
                id TEXT PRIMARY KEY,
                data JSONB,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value JSONB
            );

            CREATE TABLE IF NOT EXISTS dashboard_users (
                login TEXT PRIMARY KEY,
                data JSONB
            );

            CREATE TABLE IF NOT EXISTS inspector_profiles (
                phone TEXT PRIMARY KEY,
                fio TEXT,
                district TEXT,
                schools JSONB,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS inspector_activity (
                id SERIAL PRIMARY KEY,
                phone TEXT,
                action TEXT,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                subscription JSONB PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS payment_receipts (
                id TEXT PRIMARY KEY,
                file_id TEXT,
                file_url TEXT,
                file_unique_id TEXT,
                file_size INTEGER,
                sender_uid TEXT,
                sender_name TEXT,
                school TEXT,
                district TEXT,
                phone TEXT,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'pending',
                resolved_at TIMESTAMP,
                resolved_by TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
            CREATE INDEX IF NOT EXISTS idx_attendance_district ON attendance(district);
            CREATE INDEX IF NOT EXISTS idx_attendance_school ON attendance(school);
            CREATE INDEX IF NOT EXISTS idx_attendance_date_district_school ON attendance(date, district, school, id DESC);
            CREATE INDEX IF NOT EXISTS idx_absent_students_attendance_id ON absent_students(attendance_id);
            CREATE INDEX IF NOT EXISTS idx_absent_students_name ON absent_students(name);
            CREATE INDEX IF NOT EXISTS idx_payment_receipts_status ON payment_receipts(status);
            CREATE INDEX IF NOT EXISTS idx_payment_receipts_sender_uid ON payment_receipts(sender_uid);

            ALTER TABLE attendance ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2026-2027';
            ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS file_url TEXT;
        `);

        // Migratsiya: Uchko'prik 2-IDUM / 2-IDUMI ni 18-maktabga o'tkazish
        try {
            await pool.query(`
                UPDATE attendance 
                SET school = '18-maktab' 
                WHERE (district ILIKE '%Uchko%' OR district ILIKE '%Uchko''prik%') 
                  AND (school = '2-IDUM' OR school = '2-IDUMI' OR school = '2 IDUM' OR school = '2 IDUMI')
            `);
            await pool.query(`
                UPDATE tg_users 
                SET data = jsonb_set(data, '{school}', '"18-maktab"')
                WHERE (data->>'district' ILIKE '%Uchko%') 
                  AND (data->>'school' = '2-IDUM' OR data->>'school' = '2-IDUMI' OR data->>'school' = '2 IDUM' OR data->>'school' = '2 IDUMI')
            `);
        } catch (mErr) {}

        console.log("🐘 PostgreSQL tables initialized successfully.");
    } catch (e) {
        console.error("🐘 PostgreSQL Init Error:", e.message);
    }
}

initDb();

module.exports = {
    query: (text, params) => {
        if (!process.env.DATABASE_URL || !pool) {
            return Promise.resolve({ rows: [], rowCount: 0 });
        }
        return pool.query(text, params);
    },
    pool
};

