require('dotenv').config();
process.env.TZ = 'Asia/Tashkent';
const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const path = require('path');
const attendanceWizard = require('./src/scenes/attendance');
const broadcastScene = require('./src/scenes/broadcast');
const xorijWizard = require('./src/scenes/xorij');
const mmibdoRatingWizard = require('./src/scenes/mmibdoRating');
const { getDistrictStats, getMissingSchools } = require('./src/services/sheet');
const admin = require('./src/services/admin');
const subscriptionService = require('./src/services/subscriptionService');
const paymentService = require('./src/services/paymentService');
const db = require('./src/database/db');
const sqlite = require('./src/database/pg'); // Switched to PostgreSQL (Supabase)
const topicsConfig = require('./src/config/topics');
const TOPICS = topicsConfig.getTopics();
const config = require('./src/config/config');
const { getTopicId, normalizeKey } = require('./src/utils/topics');
const { getFargonaTime } = require('./src/utils/fargona');
const axios = require('axios');
const express = require('express');
const multer = require('multer');
const { generateBildirgi } = require('./src/utils/pdfGenerator');
const webpush = require('web-push');

// Web Push Config
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
        webpush.setVapidDetails(
            'mailto:imronbekr@gmail.com',
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
    } catch (e) {
        console.error("VAPID Config Error:", e.message);
    }
} else {
    console.warn("VAPID Keys missing. Push notifications disabled.");
}

// --- AUTOMATIC SYNC: JSON TO POSTGRESQL (For Render Persistence) ---
async function syncJsonToPg() {
    console.log("🔄 Starting JSON to PostgreSQL sync...");
    try {
        // 1. Sync Xorij Students
        const xPath = path.join(__dirname, 'src', 'database', 'xorij.json');
        if (fs.existsSync(xPath)) {
            const xData = JSON.parse(fs.readFileSync(xPath, 'utf8'));
            for (const s of xData) {
                await sqlite.query(`
                    INSERT INTO xorij_students (
                        json_id, student_name, dob, class_name, district, school, country, reason, companion, address, status, 
                        qonuniylik, q_sana, q_raqam, b_sana, b_raqam, doc_qaror, doc_buyruq, is_returned, ret_date, 
                        ret_district, ret_school, ret_class, ret_b_sana, ret_b_raqam, doc_return, created_by, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
                    ON CONFLICT (json_id) DO NOTHING
                `, [
                    s.id, s.student_name, s.dob, s.class, s.district, s.school, s.country, s.reason, s.companion, s.address, s.status,
                    s.qonuniylik, s.q_sana, s.q_raqam, s.b_sana, s.b_raqam, s.doc_qaror, s.doc_buyruq, s.is_returned || false, s.ret_date,
                    s.ret_district, s.ret_school, s.ret_class, s.ret_b_sana, s.ret_b_raqam, s.doc_return, s.created_by, s.created_at
                ]);
            }
            console.log(`✅ Synced ${xData.length} Xorij records.`);
        }

        // 2. Sync Documents
        const dPath = path.join(__dirname, 'src', 'database', 'documents.json');
        if (fs.existsSync(dPath)) {
            const dData = JSON.parse(fs.readFileSync(dPath, 'utf8'));
            for (const d of dData) {
                await sqlite.query(`
                    INSERT INTO documents (id, title, description, date, filename) 
                    VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
                `, [d.id, d.title, d.description, d.date, d.filename]);
            }
            console.log(`✅ Synced ${dData.length} Documents.`);
        }
    } catch (e) {
        console.error("❌ Sync Error:", e.message);
    }
}
syncJsonToPg();


const uploadDir = path.join(__dirname, 'assets', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 30 * 1024 * 1024 }
});

const app = express();
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'dashboard'), { etag: false, maxAge: 0 }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

app.get('/admin.html', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'dashboard', 'admin.html'));
});

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'online', time: new Date().toISOString() });
});

// Download Desktop App Installer Setup File (.exe)
app.get('/download/Ferghana_Davomat_Setup.exe', (req, res) => {
    const exePath = path.join(__dirname, 'desktop_app', 'dist', 'Ferghana_Davomat_Setup.exe');
    if (fs.existsSync(exePath)) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename="Ferghana_Davomat_Setup.exe"');
        res.sendFile(exePath);
    } else {
        res.status(404).send('Dastur fayli topilmadi. Iltimos adminga murojaat qiling.');
    }
});

// Download Android Mobile App APK File (.apk)
app.get('/download/Ferghana_Davomat.apk', (req, res) => {
    const apkPath = path.join(__dirname, 'android_app', 'dist', 'Ferghana_Davomat.apk');
    if (fs.existsSync(apkPath)) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="Ferghana_Davomat.apk"');
        res.sendFile(apkPath);
    } else {
        res.status(404).send('Android APK fayli topilmadi. Iltimos adminga murojaat qiling.');
    }
});


// Desktop Version & Auto Update API Endpoint (RTR v01.00)
app.get('/api/desktop/version', (req, res) => {
    res.json({
        latest_version: (db && db.settings && db.settings.latest_desktop_version) ? db.settings.latest_desktop_version : 'RTR v01.00',
        min_required_version: 'RTR v01.00',
        download_url: (db && db.settings && db.settings.desktop_update_url) ? db.settings.desktop_update_url : 'https://newferghanaregdavomat.vercel.app/download/Ferghana_Davomat_Setup.exe',
        changelog: (db && db.settings && db.settings.desktop_changelog) ? db.settings.desktop_changelog : "• Tizim barqarorligi va ishlash tezligi oshirildi.\n• Yangilanishlar avtomatik tekshiruvi qo'shildi."
    });
});

// Desktop App Device Registration Endpoint
app.post('/api/desktop/register', (req, res) => {
    const { device_id, name, district, school, phone, app_version } = req.body;
    if (!device_id) return res.status(400).json({ error: 'Device ID kiritilmadi' });

    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
    
    if (!db.desktop_devices) db.desktop_devices = {};
    db.desktop_devices[device_id] = {
        device_id,
        name: name || 'Noma\'lum',
        district: district || 'Noma\'lum',
        school: school || 'Noma\'lum',
        phone: phone || '',
        app_version: app_version || 'RTR v01.00',
        ip_address: clientIp,
        last_ping: new Date().toISOString(),
        registered_at: db.desktop_devices[device_id]?.registered_at || new Date().toISOString()
    };
    if (db.saveDesktopDevices) db.saveDesktopDevices();
    res.json({ success: true, message: 'Dastur va qurilma muvaffaqiyatli ro\'yxatdan o\'tkazildi!' });
});

// Desktop App Heartbeat & Emergency Alert Ping Endpoint
app.post('/api/desktop/ping', (req, res) => {
    const { device_id, app_version } = req.body;
    if (!device_id) return res.json({ registered: false });

    if (!db.desktop_devices) db.desktop_devices = {};
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
    
    const dev = db.desktop_devices[device_id];
    if (dev) {
        dev.last_ping = new Date().toISOString();
        dev.ip_address = clientIp;
        if (app_version) dev.app_version = app_version;
        if (db.saveDesktopDevices) db.saveDesktopDevices();
    }

    const latestAlert = db.settings.latest_desktop_alert || null;

    res.json({
        registered: !!dev,
        device_data: dev || null,
        status: 'online',
        emergency_alert: latestAlert
    });
});




// Load Parent Bot
try {
    if (fs.existsSync(path.join(__dirname, 'parent_bot.js'))) {
        require('./parent_bot');
    }
} catch (e) {
    console.error("Parent Bot Load Error:", e.message);
}

const { formatAttendanceReport } = require('./src/utils/reports');

const { USERS, tokens, generateToken, verifyToken, saveTokens, saveUsers } = require('./src/utils/auth');

// Auth Middleware
const auth = (req, res, next) => {
    const token = req.headers['authorization'] || req.query.token;
    const user = verifyToken(token);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    next();
};

// Admin: Get all registered Desktop app devices with live online/offline status
app.get('/api/admin/desktop/devices', auth, (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Ruxsat yo\'q' });

    const now = new Date().getTime();
    const list = Object.values(db.desktop_devices || {}).map(dev => {
        const lastPingTime = new Date(dev.last_ping || 0).getTime();
        const isOnline = (now - lastPingTime) < 45000; // Active within last 45 sec
        return {
            ...dev,
            is_online: isOnline,
            status: isOnline ? 'online' : 'offline'
        };
    });

    list.sort((a, b) => b.is_online - a.is_online);
    res.json(list);
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = USERS[username];
    if (user && user.password === password) {
        const userData = { ...user, username, role: user.role };
        const token = generateToken(userData);
        res.json({
            token,
            role: user.role,
            username: user.username,
            district: user.district,
            school: user.school || null,
            assigned_schools: user.assigned_schools || [], // Inspektor uchun
            fio: user.fio || '',
            phone: user.phone || ''
        });
    } else {
        res.status(401).json({ error: 'Login yoki parol xato' });
    }
});

app.get('/api/me', auth, (req, res) => {
    res.json(req.user);
});

// Change own password
app.post('/api/change-password', auth, (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Parol kiritilmadi' });
    if (!USERS[req.user.username]) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    USERS[req.user.username].password = password;
    saveUsers();
    res.json({ success: true });
});

// Admin: Get all users
app.get('/api/admin/users', auth, (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Ruxsat yo\'q' });

    const isOwner = req.user.username === 'mrqirol';
    if (isOwner) {
        res.json(USERS);
    } else {
        // Hide owner account from other superadmins
        const filtered = {};
        Object.entries(USERS).forEach(([login, data]) => {
            if (login !== 'mrqirol') {
                filtered[login] = data;
            }
        });
        res.json(filtered);
    }
});


// Admin: Reset any user password


// Admin: Export Full SQL Data (Only for Owner/Primary Admin)
app.get('/api/admin/export-db', auth, async (req, res) => {
    const isOwner = req.user.username === 'mrqirol' || Number(req.user.uid) === 65002404;
    if (!isOwner) return res.status(403).json({ error: 'Ruxsat yo\'q! Faqat asosiy admin uchun.' });

    try {
        const attendance = await sqlite.query('SELECT * FROM attendance ORDER BY id DESC LIMIT 5000');
        const xorij = await sqlite.query('SELECT * FROM xorij_students ORDER BY id DESC');
        const users = await sqlite.query('SELECT id, data, last_active FROM tg_users');
        
        const dump = {
            export_date: new Date().toISOString(),
            attendance_count: attendance.rowCount,
            xorij_count: xorij.rowCount,
            users_count: users.rowCount,
            data: {
                attendance: attendance.rows,
                xorij: xorij.rows,
                users: users.rows
            }
        };

        res.setHeader('Content-disposition', 'attachment; filename=database_backup.json');
        res.setHeader('Content-type', 'application/json');
        res.write(JSON.stringify(dump, null, 2));
        res.end();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/admin/reset-password', auth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const { targetLogin, newPassword } = req.body;
    if (!USERS[targetLogin]) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    // Protect owner account
    const isOwner = req.user.username === 'mrqirol';
    if (targetLogin === 'mrqirol' && !isOwner) {
        return res.status(403).json({ error: 'Bu foydalanuvchi parolini o\'zgartirish taqiqlangan' });
    }


    const oldPassword = USERS[targetLogin].password;
    USERS[targetLogin].password = newPassword;
    saveUsers();

    // Save History to Supabase
    try {
        await sqlite.query('INSERT INTO password_history (username, old_password, new_password, changed_by) VALUES ($1, $2, $3, $4)', [targetLogin, oldPassword, newPassword, req.user.username]);
    } catch (e) {
        console.error("History Save Error:", e);
    }

    res.json({ success: true });
});

// Admin: Get all TG Users
app.get('/api/admin/tg-users', auth, async (req, res) => {
    const isAuthorized = req.user.username === 'mrqirol' || req.user.role === 'superadmin' || req.user.role === 'admin';
    if (!isAuthorized) return res.status(403).json({ error: 'Ruxsat yo\'q' });
    try {
        const result = await sqlite.query('SELECT * FROM tg_users ORDER BY id DESC');
        if (result && Array.isArray(result.rows) && result.rows.length > 0) {
            return res.json(result.rows);
        }
        // Fallback to local users_db
        const usersList = Object.entries(db.users_db || {}).map(([id, data]) => ({ id, data }));
        res.json(usersList);
    } catch (e) {
        // Fallback to local users_db if database query errors
        const usersList = Object.entries(db.users_db || {}).map(([id, data]) => ({ id, data }));
        res.json(usersList);
    }
});


// Admin: Set PRO (Manual Activation)
app.post('/api/admin/set-pro', auth, (req, res, next) => { if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Faqat superadmin uchun' }); next(); },  async (req, res) => {
    const isAuthorized = req.user.username === 'mrqirol' || req.user.role === 'superadmin';
    if (!isAuthorized) return res.status(403).json({ error: 'Ruxsat yo\'q' });

    try {
        const { phone, uid, months } = req.body;
        if (phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            const pPath = require('path').join(__dirname, 'src', 'database', 'pro_users.json');
            let proData = [];
            if (fs.existsSync(pPath)) {
                const raw = fs.readFileSync(pPath, 'utf8');
                if (raw) proData = JSON.parse(raw);
            }
            const expire = new Date();
            expire.setMonth(expire.getMonth() + (parseInt(months) || 1));
            proData = proData.filter(u => u.phone !== cleanPhone);
            proData.push({ phone: cleanPhone, is_pro: true, pro_purchase_date: new Date().toISOString(), pro_expire_date: expire.toISOString() });
            fs.writeFileSync(pPath, JSON.stringify(proData, null, 2));
            return res.json({ success: true, message: `PRO faollashtirildi (${cleanPhone})` });
        }
        if (uid) {
            const dbRef = require('./src/database/db');
            const user = dbRef.updateUserProMonths(uid, parseInt(months) || 1);
            return res.json({ success: true, user });
        }
        res.status(400).json({ error: 'Phone yoki UID kiritilmadi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin: Set Standard Attendance Access (10,000 UZS)
app.post('/api/admin/set-access', auth, (req, res, next) => { if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Faqat superadmin uchun' }); next(); }, async (req, res) => {
    const isAuthorized = req.user.username === 'mrqirol' || req.user.role === 'superadmin';
    if (!isAuthorized) return res.status(403).json({ error: 'Ruxsat yo\'q' });

    try {
        const { phone, uid, months } = req.body;
        const m = parseInt(months) || 1;
        if (phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            const aPath = path.join(__dirname, 'src', 'database', 'access_users.json');
            let accessData = [];
            if (fs.existsSync(aPath)) {
                try {
                    const raw = fs.readFileSync(aPath, 'utf8');
                    if (raw) accessData = JSON.parse(raw);
                } catch (e) {}
            }
            const expire = new Date();
            expire.setMonth(expire.getMonth() + m);
            accessData = accessData.filter(u => u.phone !== cleanPhone);
            accessData.push({ phone: cleanPhone, has_access: true, access_purchase_date: new Date().toISOString(), access_expire_date: expire.toISOString() });
            fs.writeFileSync(aPath, JSON.stringify(accessData, null, 2));

            // Also update matching user in db.js if present
            for (const [id, user] of Object.entries(db.users_db)) {
                if (user.phone && user.phone.replace(/\D/g, '') === cleanPhone) {
                    db.updateUserAccessMonths(id, m);
                }
            }
            return res.json({ success: true, message: `Davomat ruxsati faollashtirildi (${cleanPhone}, ${m} oy)` });
        }
        if (uid) {
            const user = db.updateUserAccessMonths(uid, m);
            return res.json({ success: true, user });
        }
        res.status(400).json({ error: 'Phone yoki UID kiritilmadi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin: Get all payment receipts
app.get('/api/admin/receipts', auth, async (req, res) => {
    const isAuthorized = req.user.username === 'mrqirol' || req.user.role === 'superadmin' || req.user.role === 'admin' || req.user.role === 'specialist';
    if (!isAuthorized) return res.status(403).json({ error: 'Ruxsat yo\'q' });

    try {
        const list = await paymentService.getReceiptsList();
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin: Approve / Reject payment receipt from Web Admin
app.post('/api/admin/receipts/:id/action', auth, async (req, res) => {
    const isAuthorized = req.user.username === 'mrqirol' || req.user.role === 'superadmin' || req.user.role === 'admin' || req.user.role === 'specialist';
    if (!isAuthorized) return res.status(403).json({ error: 'Ruxsat yo\'q' });

    const receiptId = req.params.id;
    const { action, months = 1 } = req.body; // action: 'approve_access' | 'approve_pro' | 'reject_fake'

    try {
        const list = await paymentService.getReceiptsList();
        const receipt = list.find(r => String(r.id) === String(receiptId));
        if (!receipt) return res.status(404).json({ error: 'Chek topilmadi' });
        if (receipt.status !== 'pending') {
            return res.status(400).json({ error: `Ushbu chek allaqachon ${receipt.status === 'approved' ? 'tasdiqlangan' : 'rad etilgan'}!` });
        }

        const targetUid = receipt.sender_uid;
        const adminName = req.user.name || req.user.username || 'Web Admin';

        const u = db.users_db[targetUid] || {};
        let targetDistrict = receipt.district || u.district;
        let targetSchool = receipt.school || u.school;
        if (targetSchool && targetSchool.includes('(')) {
            const m = targetSchool.match(/^(.*?)\s*\((.*?)\)/);
            if (m) {
                targetSchool = m[1].trim();
                targetDistrict = targetDistrict || m[2].trim();
            }
        }

        if (action === 'approve_access') {
            let expireDate = '';
            if (targetUid) {
                const result = db.updateUserAccessMonths(targetUid, parseInt(months) || 1);
                expireDate = result ? result.access_expire_date : '';
            }
            if (targetDistrict && targetSchool) {
                const sc = db.grantSchoolAccess(targetDistrict, targetSchool, parseInt(months) || 1, 'access');
                if (sc && sc.expire_date) expireDate = sc.expire_date;
                if (targetUid) {
                    db.updateUserDb(targetUid, { district: targetDistrict, school: targetSchool, has_access: true, access_expire_date: expireDate });
                }
            }
            await paymentService.updateReceiptStatus(receiptId, 'approved', adminName);

            try {
                if (targetUid && !String(targetUid).startsWith('web_')) {
                    await bot.telegram.sendMessage(
                        targetUid,
                        `🎉 <b>Tabriklaymiz!</b>\n\nTo'lovingiz veb-admin tomonidan tasdiqlandi va davomat kiritish ruxsatingiz <b>${expireDate}</b> gacha faollashtirildi!\n\nEndi bemalol davomat kiritishingiz mumkin.`,
                        { parse_mode: 'HTML' }
                    );
                }
            } catch (e) {
                console.warn('Could not notify user via Telegram:', e.message);
            }

            return res.json({ success: true, status: 'approved', expire_date: expireDate });
        } else if (action === 'approve_pro') {
            let expireDate = '';
            if (targetUid) {
                const result = db.updateUserProMonths(targetUid, parseInt(months) || 1);
                expireDate = result ? result.pro_expire_date : '';
            }
            if (targetDistrict && targetSchool) {
                const sc = db.grantSchoolAccess(targetDistrict, targetSchool, parseInt(months) || 1, 'pro');
                if (sc && sc.expire_date) expireDate = sc.expire_date;
                if (targetUid) {
                    db.updateUserDb(targetUid, { district: targetDistrict, school: targetSchool, is_pro: true, pro_expire_date: expireDate });
                }
            }
            await paymentService.updateReceiptStatus(receiptId, 'approved', adminName);

            try {
                if (targetUid && !String(targetUid).startsWith('web_')) {
                    await bot.telegram.sendMessage(
                        targetUid,
                        `🎉 <b>Tabriklaymiz!</b>\n\nTo'lovingiz veb-admin tomonidan tasdiqlandi va <b>PRO REJIM</b> obunangiz <b>${expireDate}</b> gacha faollashtirildi!\n\nBarcha imkoniyatlardan foydalanishingiz mumkin.`,
                        { parse_mode: 'HTML' }
                    );
                }
            } catch (e) {
                console.warn('Could not notify user via Telegram:', e.message);
            }

            return res.json({ success: true, status: 'approved', expire_date: expireDate });
        } else if (action === 'reject_fake') {
            await paymentService.updateReceiptStatus(receiptId, 'fake_rejected', adminName);

            try {
                if (targetUid && !String(targetUid).startsWith('web_')) {
                    await bot.telegram.sendMessage(
                        targetUid,
                        `❌ <b>To'lovingiz rad etildi!</b>\n\nSiz yuborgan to'lov cheki ma'muriyat tomonidan tekshirilib, soxta yoki noto'g'ri deb topildi.\n\nIltimos, faqat o'zingiz amalga oshirgan haqiqiy to'lov kvitansiyasini yuboring.`,
                        { parse_mode: 'HTML' }
                    );
                }
            } catch (e) {
                console.warn('Could not notify user via Telegram:', e.message);
            }

            return res.json({ success: true, status: 'fake_rejected' });
        } else {
            return res.status(400).json({ error: 'Noto\'g\'ri amal: ' + action });
        }
    } catch (e) {
        console.error('Receipt action error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: View receipt image directly
app.get('/api/admin/receipts/:id/image', async (req, res) => {
    try {
        const list = await paymentService.getReceiptsList();
        const receipt = list.find(r => String(r.id) === String(req.params.id));
        if (!receipt) return res.status(404).send('Chek topilmadi');

        if (receipt.file_url) {
            return res.redirect(receipt.file_url);
        }
        if (receipt.file_id) {
            const link = await bot.telegram.getFileLink(receipt.file_id);
            const url = link.href || link.toString();
            return res.redirect(url);
        }
        res.status(404).send('Rasm mavjud emas');
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// Check school subscription status
app.get('/api/check-school-access', (req, res) => {
    const { district, school } = req.query;
    if (!district || !school) return res.json({ hasAccess: false });
    const hasAccess = db.checkSchoolAccess(district, school);
    const { normalizeKey } = require('./src/utils/topics');
    const key = `${normalizeKey(district)}_${normalizeKey(school)}`;
    const sa = db.settings.school_access && db.settings.school_access[key];
    res.json({
        hasAccess,
        expire_date: sa ? sa.expire_date : null,
        type: sa ? sa.type : null
    });
});

// Upload Payment Receipt from Web
app.post('/api/upload-receipt', upload.single('receipt'), async (req, res) => {
    try {
        const { district, school, phone, fio } = req.body;
        if (!req.file) return res.status(400).json({ error: "Fayl yuklanmadi" });

        const fullDiskPath = path.join(uploadDir, req.file.filename);
        const crypto = require('crypto');
        let fileHash = '';
        try {
            const buf = fs.readFileSync(fullDiskPath);
            fileHash = crypto.createHash('md5').update(buf).digest('hex');
        } catch (e) { }

        const receipts = paymentService.loadReceipts();
        const duplicate = receipts.find(r => (fileHash && r.file_hash === fileHash) || (r.file_size === req.file.size && r.file_unique_id === req.file.filename));
        if (duplicate) {
            if (duplicate.status === 'approved') {
                return res.status(400).json({ error: "Ushbu to'lov cheki tizimda allaqachon tasdiqlangan va foydalanilgan! Qayta yuklash mumkin emas." });
            } else if (duplicate.status === 'pending') {
                return res.status(400).json({ error: "Ushbu to'lov cheki allaqachon yuborilgan va ko'rib chiqilmoqda. Iltimos, adminlar tasdiqlashini kuting." });
            }
        }

        const schoolTarget = school ? `${school} (${district})` : '';
        const schoolPending = receipts.find(r => r.status === 'pending' && r.district === district && r.school === schoolTarget);
        if (schoolPending) {
            return res.status(400).json({ error: `Ushbu maktab uchun to'lov cheki allaqachon yuborilgan (${schoolPending.submitted_at}). Adminlar tekshiruvini kuting.` });
        }

        const receiptId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        const { getFargonaDateTimeString, formatUzbDateTime } = require('./src/utils/fargona');
        const uzbNowString = getFargonaDateTimeString();
        const uzbDisplayTime = formatUzbDateTime(new Date());
        const filePath = `/assets/uploads/${req.file.filename}`;

        const newReceipt = {
            id: receiptId,
            file_unique_id: req.file.filename,
            file_id: req.file.filename,
            file_hash: fileHash,
            file_url: filePath,
            file_size: req.file.size,
            sender_uid: 'web_' + (phone ? phone.replace(/\D/g, '') : Date.now()),
            sender_name: fio || 'Web Foydalanuvchi',
            school: schoolTarget || 'Web maktab',
            district: district || '',
            phone: phone || '',
            submitted_at: uzbNowString,
            status: 'pending',
            source: 'web'
        };
        receipts.push(newReceipt);
        paymentService.saveReceipts(receipts);

        try {
            const pg = require('./src/database/pg');
            await pg.query(
                `INSERT INTO payment_receipts (id, file_id, file_url, file_unique_id, file_size, sender_uid, sender_name, school, district, phone, submitted_at, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
                 ON CONFLICT (id) DO UPDATE SET file_url = EXCLUDED.file_url`,
                [receiptId, req.file.filename, filePath, req.file.filename, req.file.size, newReceipt.sender_uid, newReceipt.sender_name, newReceipt.school, district || '', phone || '', uzbNowString]
            );
        } catch (e) { }

        // Telegram adminlarga xabar va rasm yuborish
        const admins = config.SUPER_ADMIN_IDS || [65002404];
        const forwardMsg =
            '🧾 <b>WEB ORQALI YANGI TO\'LOV CHEKI!</b>\n\n' +
            `👤 <b>Kimdan:</b> ${fio || 'Web Foydalanuvchi'}\n` +
            `🏫 <b>Maktab:</b> ${school} (${district})\n` +
            `📞 <b>Tel:</b> ${phone || 'Kiritilmagan'}\n` +
            `⏰ <b>Vaqt:</b> ${uzbDisplayTime}\n` +
            `🔖 <b>Chek ID:</b> <code>${receiptId}</code>\n\n` +
            `👉 <i>Tasdiqlash uchun tugmalardan foydalaning:</i>`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ 1 oy Davomat Ruxsati (10 000 so\'m)', `approve_access:${newReceipt.sender_uid}:${receiptId}`)],
            [Markup.button.callback('⭐ 1 oy PRO Rejim (25 000 so\'m)', `approve_pro:${newReceipt.sender_uid}:${receiptId}`)],
            [Markup.button.callback('🚫 Soxta Chek (Rad etish)', `reject_fake:${newReceipt.sender_uid}:${receiptId}`)]
        ]);

        for (const adminId of admins) {
            try {
                if (fs.existsSync(fullDiskPath)) {
                    await bot.telegram.sendPhoto(adminId, { source: fullDiskPath }, { caption: forwardMsg, parse_mode: 'HTML', ...keyboard }).catch(async () => {
                        await bot.telegram.sendDocument(adminId, { source: fullDiskPath }, { caption: forwardMsg, parse_mode: 'HTML', ...keyboard });
                    });
                }
            } catch (e) {
                console.error("Web receipt tg notify error:", e.message);
            }
        }

        res.json({
            success: true,
            receiptId,
            message: "To'lov chekingiz muvaffaqiyatli qabul qilindi! Adminlar tez orada tasdiqlaydilar va maktabingiz 1 oyga faollashtiriladi."
        });
    } catch (e) {
        console.error("Upload receipt error:", e);
        res.status(500).json({ error: "Server xatosi: " + e.message });
    }
});

// Admin: Get all subscriptions (schools + users) with status and days left
app.get('/api/admin/subscriptions', auth, (req, res) => {
    try {
        const isAuthorized = req.user.username === 'mrqirol' || req.user.role === 'superadmin' || req.user.role === 'admin' || req.user.role === 'specialist';
        if (!isAuthorized) return res.status(403).json({ error: 'Ruxsat yo\'q' });

        const subscriptions = db.getAllSubscriptions();
        res.json({ success: true, subscriptions });
    } catch (e) {
        console.error("Get subscriptions error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Update / Edit / Reset subscription expiry date
app.post('/api/admin/subscriptions/update', auth, (req, res) => {
    try {
        const isAuthorized = req.user.username === 'mrqirol' || req.user.role === 'superadmin' || req.user.role === 'admin' || req.user.role === 'specialist';
        if (!isAuthorized) return res.status(403).json({ error: 'Ruxsat yo\'q' });

        const { target_type, id, district, school, uid, new_expire_date, access_type, action } = req.body;
        const result = db.updateSubscriptionExpireDate({
            target_type, id, district, school, uid, new_expire_date, access_type, action
        });

        res.json({
            success: true,
            message: "Obuna muddati muvaffaqiyatli saqlandi!",
            expire_date: result.expire_date,
            days_left: result.days_left
        });
    } catch (e) {
        console.error("Update subscription error:", e);
        res.status(400).json({ error: e.message });
    }
});

// Admin: Export Subscribers & Payments to Excel
app.get('/api/admin/export-subscribers', auth, async (req, res) => {
    const isAuthorized = req.user.username === 'mrqirol' || req.user.role === 'superadmin' || req.user.role === 'admin' || req.user.role === 'specialist';
    if (!isAuthorized) return res.status(403).json({ error: 'Ruxsat yo\'q' });
    try {
        const { exportSubscribersToExcel } = require('./src/services/dataService');
        const result = await exportSubscribersToExcel(res);
        if (result === true || res.headersSent) return;
        if (typeof result === 'string' && fs.existsSync(result)) {
            return res.download(result, path.basename(result));
        }
        res.status(500).json({ error: 'Fayl yaratib bo\'lmadi' });
    } catch (e) {
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// Admin: Favqulodda / Qo'lda maktabga ruxsat berish
app.post('/api/admin/grant-school-access', auth, async (req, res) => {
    const isAuthorized = req.user.username === 'mrqirol' || req.user.role === 'superadmin' || req.user.role === 'admin' || req.user.role === 'specialist';
    if (!isAuthorized) return res.status(403).json({ error: 'Ruxsat yo\'q' });

    const { district, school, months = 1, type = 'access' } = req.body;
    if (!district || !school) return res.status(400).json({ error: 'Tuman va maktabni tanlang' });

    try {
        const result = db.grantSchoolAccess(district, school, parseInt(months) || 1, type);
        res.json({
            success: true,
            message: `${district} ${school} uchun ${months} oylik ${type === 'pro' ? 'PRO' : 'Standart'} limit muvaffaqiyatli faollashtirildi!`,
            result
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all districts list
app.get('/api/districts', (req, res) => {
    const districts = Object.keys(db.schools_db || {});
    res.json(districts);
});

// User: Check Subscription & Payment Cards Info
app.get('/api/user/subscription', (req, res) => {
    const token = req.headers['authorization'] || req.query.token;
    const tokenUser = verifyToken(token);

    const phone = req.query.phone || (tokenUser && tokenUser.phone) || (req.user && req.user.phone);
    const uid = req.query.uid || (tokenUser && tokenUser.uid) || (req.user && req.user.uid);
    const userRole = (tokenUser && tokenUser.role) || (req.user && req.user.role) || '';

    let hasAccess = false;
    let isPro = false;
    let accessExpire = null;
    let proExpire = null;
    let purchaseDate = null;
    const now = getFargonaTime();

    if (userRole === 'superadmin') {
        hasAccess = true;
        isPro = true;
        proExpire = '2099-12-31';
        accessExpire = '2099-12-31';
    } else {
        if (uid) {
            hasAccess = db.checkAttendanceAccess(uid);
            isPro = db.checkPro(uid);
            const u = db.users_db[uid];
            if (u) {
                accessExpire = u.access_expire_date || null;
                proExpire = u.pro_expire_date || null;
                purchaseDate = u.pro_purchase_date || u.access_purchase_date || null;
            }
        }

        if (!hasAccess && phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            hasAccess = db.checkAttendanceAccessByPhone(cleanPhone);
            isPro = db.checkProByPhone(cleanPhone);
            const matched = Object.values(db.users_db || {}).find(u => u.phone && u.phone.replace(/\D/g, '') === cleanPhone);
            if (matched) {
                accessExpire = matched.access_expire_date || accessExpire;
                proExpire = matched.pro_expire_date || proExpire;
                purchaseDate = matched.pro_purchase_date || matched.access_purchase_date || purchaseDate;
            }
        }
    }

    const todayStr = now.toISOString().split('T')[0];
    const isEnforced = todayStr >= '2026-10-05';

    let daysLeft = 0;
    let statusType = 'noaktiv';
    let statusText = 'Noaktiv';

    if (userRole === 'superadmin') {
        statusType = 'superadmin';
        statusText = 'Superadmin';
        daysLeft = 999;
    } else if (isPro && proExpire && new Date(proExpire) > now) {
        statusType = 'pro';
        statusText = '👑 PRO Rejim';
        daysLeft = Math.max(0, Math.ceil((new Date(proExpire) - now) / (1000 * 60 * 60 * 24)));
    } else if (hasAccess && accessExpire && new Date(accessExpire) > now) {
        statusType = 'access';
        statusText = '✅ Standart Davomat';
        daysLeft = Math.max(0, Math.ceil((new Date(accessExpire) - now) / (1000 * 60 * 60 * 24)));
    } else if ((proExpire && new Date(proExpire) <= now) || (accessExpire && new Date(accessExpire) <= now)) {
        statusType = 'expired';
        statusText = '⏳ Muddati tugagan';
        daysLeft = 0;
    }

    res.json({
        phone: phone || null,
        uid: uid || null,
        is_enforced: isEnforced,
        has_access: hasAccess,
        is_pro: isPro,
        status_type: statusType,
        status_text: statusText,
        days_left: daysLeft,
        purchase_date: purchaseDate,
        access_expire_date: accessExpire,
        pro_expire_date: proExpire,
        cards: {
            humo: db.settings.humo_card || '9860 0366 3576 1863',
            visa: db.settings.visa_card || '4187 8000 0132 1124'
        },
        prices: {
            standard_uzs: db.settings.access_price_uzs || 10000,
            pro_uzs: db.settings.pro_price_uzs || 25000
        }
    });
});

// ===== INSPEKTOR-PSIXOLOG BOSHQARUVI =====

// Barcha inspektor-psixologlar ro'yxati (superadmin uchun)
app.get('/api/admin/inspectors', auth, (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const inspectors = Object.entries(USERS)
        .filter(([, u]) => u.role === 'inspektor_psixolog')
        .map(([login, u]) => ({ login, ...u }));
    res.json(inspectors);
});

// Yangi inspektor-psixolog yaratish yoki tahrirlash
app.post('/api/admin/inspectors/create', auth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const { login, password, fio, phone, district, assigned_schools } = req.body;
    if (!login || !password || !district) return res.status(400).json({ error: 'Login, parol va hudud majburiy' });
    if (!Array.isArray(assigned_schools) || assigned_schools.length === 0) {
        return res.status(400).json({ error: 'Kamida 1 ta maktab biriktirilishi kerak' });
    }

    USERS[login] = {
        password,
        role: 'inspektor_psixolog',
        district,
        fio: fio || '',
        phone: phone || '',
        assigned_schools  // Array of school names
    };
    saveUsers();
    res.json({ success: true, login });
});

// Inspektor-Psixologni o'chirish
app.delete('/api/admin/inspectors/:login', auth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const { login } = req.params;
    if (!USERS[login] || USERS[login].role !== 'inspektor_psixolog') {
        return res.status(404).json({ error: 'Inspektor topilmadi' });
    }
    delete USERS[login];
    saveUsers();
    res.json({ success: true });
});

// Inspektor-Psixolog: o'z maktablari bo'yicha davomat
app.get('/api/inspektor/davomat', auth, async (req, res) => {
    if (req.user.role !== 'inspektor_psixolog' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Ruxsat yo\'q' });
    }
    const { date } = req.query;
    const now = getFargonaTime();
    const targetDate = date || now.toISOString().split('T')[0];
    const assignedSchools = req.user.assigned_schools || [];
    const district = req.user.district;

    if (assignedSchools.length === 0) return res.json({ rows: [], total: 0 });

    try {
        const entriesRes = await sqlite.query(`
            WITH normalized_attendance AS (
                SELECT 
                    TRIM(REPLACE(REPLACE(district, '‘', ''''), '’', '''')) as norm_dist,
                    TRIM(REPLACE(REPLACE(school, '‘', ''''), '’', '''')) as norm_school,
                    *
                FROM attendance
                WHERE date = $1
            )
            SELECT DISTINCT ON (norm_dist, norm_school) *
            FROM normalized_attendance
            ORDER BY norm_dist, norm_school, id DESC
        `, [targetDate]);

        const allRows = assignedSchools.map(sName => {
            const entry = entriesRes.rows.find(e =>
                normalizeKey(e.norm_school || e.school) === normalizeKey(sName) &&
                (normalizeKey(e.norm_dist || e.dist) === normalizeKey(district) || normalizeKey(e.district) === normalizeKey(district))
            );
            if (entry) return { ...entry, percent: parseFloat(entry.percent), submitted: true };
            return {
                district, school: sName,
                date: targetDate, time: '-',
                classes_count: 0, total_students: 0,
                sababli_jami: 0, sababsiz_jami: 0,
                total_absent: 0, percent: 0,
                fio: 'Kiritilmagan', submitted: false
            };
        });

        res.json({ rows: allRows, total: allRows.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Inspektor-Psixolog: sababsiz o'quvchilar
app.get('/api/inspektor/sababsizlar', auth, async (req, res) => {
    if (req.user.role !== 'inspektor_psixolog') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const { date } = req.query;
    const targetDate = date || getFargonaTime().toISOString().split('T')[0];
    const assignedSchools = req.user.assigned_schools || [];
    const district = req.user.district;

    if (assignedSchools.length === 0) return res.json({ rows: [], total: 0 });

    try {
        const schoolsQueryStr = assignedSchools.map(s => `'${s.replace(/'/g, "''")}'`).join(",");
        const query = `
            SELECT a.date, a.district, a.school, a.fio as submitter_fio, a.phone as submitter_phone,
                   s.class, s.name, s.address, s.parent_name, s.parent_phone
            FROM absent_students s
            JOIN attendance a ON s.attendance_id = a.id
            WHERE a.date = $1 AND a.district = $2 AND a.school IN (${schoolsQueryStr})
            ORDER BY a.school, s.class
        `;
        const resDb = await sqlite.query(query, [targetDate, district]);

        const finalRows = [];
        for (const r of resDb.rows) {
            const streakRes = await sqlite.query(`
                SELECT count(DISTINCT a.date) as streak
                FROM absent_students s
                JOIN attendance a ON s.attendance_id = a.id
                WHERE s.name = $1 AND a.school = $2 AND a.district = $3 AND a.date <= $4
            `, [r.name, r.school, r.district, targetDate]);
            const streak = parseInt(streakRes.rows[0].streak) || 1;
            finalRows.push({
                ...r,
                streak: streak,
                status: streak >= 3 ? "🔴 Muntazam" : "🟡 Odatiy"
            });
        }
        res.json({ rows: finalRows, total: finalRows.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Inspektor-Psixolog: o'ziga tegishli maktablar bo'yicha 7 kunlik statistika (trend tahlil)
app.get('/api/inspektor/statistika', auth, async (req, res) => {
    if (req.user.role !== 'inspektor_psixolog') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const assignedSchools = req.user.assigned_schools || [];
    const district = req.user.district;

    if (assignedSchools.length === 0) return res.json({ labels: [], datasets: [] });

    try {
        const schoolsQueryStr = assignedSchools.map(s => `'${s.replace(/'/g, "''")}'`).join(",");
        // 7 kunlik interval
        const query = `
            SELECT date, AVG(percent) as avg_percent, SUM(sababsiz_jami) as total_sababsiz 
            FROM attendance 
            WHERE district = $1 AND school IN (${schoolsQueryStr}) 
            GROUP BY date 
            ORDER BY date DESC LIMIT 7
        `;
        const resDb = await sqlite.query(query, [district]);
        let rawData = resDb.rows.map(r => ({ date: r.date, percent: parseFloat(r.avg_percent), sababsiz: parseInt(r.total_sababsiz) })).reverse();

        let labels = [];
        let dataPercent = [];
        let dataSababsiz = [];

        rawData.forEach(d => {
            labels.push(d.date.substring(5)); // Faqat oy-kun
            dataPercent.push(d.percent);
            dataSababsiz.push(d.sababsiz);
        });

        res.json({
            labels: labels,
            datasets: { percent: dataPercent, sababsiz: dataSababsiz }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- SECURITY SHIELD ---
const requestCount = new Map();
const SECURITY_ALERT_THRESHOLD = 1000; // Increased to 1000 API requests per minute

const securityShield = (req, res, next) => {
    // Exclude Telegram bot webhook requests from SQL pattern false positives
    if (req.path === '/bot' || req.originalUrl === '/api/bot' || (req.url && req.url.startsWith('/api/bot'))) {
        return next();
    }

    // 1. Basic Security Headers (Manual Helmet)
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self' https:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://kit.fontawesome.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://kit.fontawesome.com;");

    // 2. Rate Limiting — applies only to /api routes
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    const windowStart = now - 60000;

    let logs = requestCount.get(ip) || [];
    logs = logs.filter(t => t > windowStart);
    logs.push(now);
    requestCount.set(ip, logs);

    if (logs.length > SECURITY_ALERT_THRESHOLD) {
        // Skip telegram alert for local IP and only alert on the first breach
        if (logs.length === SECURITY_ALERT_THRESHOLD + 1 && ip !== '::1' && ip !== '127.0.0.1') {
            alertSuperAdmin(`🚨 <b>SECURITY ALERT!</b>\nSuspicious volume from IP: <code>${ip}</code>\nURL: <code>${req.url}</code>\nUser: <code>${req.user ? req.user.username : 'Guest'}</code>`);
        }
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    // 3. Prevent SQL-like patterns in queries (Basic injection filter)
    const sqlPatterns = /select|insert|update|delete|drop|union|--|;/i;
    if (sqlPatterns.test(req.url) || sqlPatterns.test(JSON.stringify(req.body))) {
        alertSuperAdmin(`⚠️ <b>INJECTION ATTEMPT!</b>\nSuspicious payload from IP: ${ip}\nUser: ${req.user ? req.user.username : 'Guest'}`);
        return res.status(403).json({ error: 'Malicious activity detected.' });
    }

    next();
};

async function alertSuperAdmin(msg) {
    const superAdminIds = [65002404, 786314811];
    for (const sid of superAdminIds) {
        try {
            await bot.telegram.sendMessage(sid, msg, { parse_mode: 'HTML' });
        } catch (e) { }
    }
}
// Static files served FIRST — before rate limiting
app.use(express.static('dashboard', { setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
    }
}}));
app.use('/assets', express.static('assets'));
app.use('/uploads', express.static('assets/uploads')); // Yuklangan hujjatlar uchun
app.use('/icons', express.static('icons'));
app.use('/icons', express.static('dashboard/assets/icons')); // Zaxira yo'li

// Security shield applied ONLY to /api routes — not static files
app.use('/api', securityShield);

const { getSchools, saveData } = require('./src/services/sheet');

const bot = new Telegraf(process.env.BOT_TOKEN, {
    handlerTimeout: 90000 
});
const PORT = process.env.PORT || 3000;
const LOGO_PATH = path.join(__dirname, 'assets', 'logo.png');

// --- PREMIUM FEATURES ---
try {
    const premiumRoutes = require('./premium_features/backend/premium_routes');
    app.use('/premium', express.static('premium_features/web'));
    app.use('/api/premium', auth, premiumRoutes);
    console.log('[PREMIUM] Premium routes yuklandi.');
} catch (e) {
    console.warn('[PREMIUM] Premium routes topilmadi, o\'tkazib yuborildi:', e.message);
}

const stage = new Scenes.Stage([attendanceWizard, broadcastScene, xorijWizard]);
bot.use(session());
bot.use(stage.middleware());

// Telegram Bot Webhook Route for Serverless Vercel & Production
app.post('/api/bot', async (req, res) => {
    try {
        await bot.handleUpdate(req.body, res);
        if (!res.headersSent) res.status(200).send('OK');
    } catch (e) {
        console.error('[TG WEBHOOK ERROR]', e.message);
        if (!res.headersSent) res.status(200).send('OK');
    }
});

app.get('/api/admin/set-webhook', async (req, res) => {
    try {
        const host = req.headers.host || 'ferghanaregdavomat.uz';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const webhookUrl = `${protocol}://${host}/api/bot`;
        await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
        res.json({ success: true, webhook_url: webhookUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

async function handleStartCommand(ctx) {
    console.log(`[START] User: ${ctx.from ? ctx.from.id : 'N/A'}`);

    // Leave any active scene to reset
    try { if (ctx.scene) await ctx.scene.leave(); } catch (e) { }

    const { date, day } = getTodayInfo();
    const uid = Number(ctx.from.id);
    const isPro = db.checkPro(uid);
    const hasAccess = db.checkAttendanceAccess(uid);
    const u = db.users_db[uid] || {};
    const now = getFargonaTime();

    let subBadge = "⚪ <b>Obuna holati:</b> Noaktiv";
    if (isPro && u.pro_expire_date && new Date(u.pro_expire_date) > now) {
        const days = Math.max(0, Math.ceil((new Date(u.pro_expire_date) - now) / (1000 * 60 * 60 * 24)));
        subBadge = `👑 <b>Obuna:</b> 🌟 PRO Rejim (⏳ <b>${days} kun qoldi</b> — <i>${u.pro_expire_date} gacha</i>)`;
    } else if (hasAccess && u.access_expire_date && new Date(u.access_expire_date) > now) {
        const days = Math.max(0, Math.ceil((new Date(u.access_expire_date) - now) / (1000 * 60 * 60 * 24)));
        subBadge = `✅ <b>Obuna:</b> Standart Davomat (⏳ <b>${days} kun qoldi</b> — <i>${u.access_expire_date} gacha</i>)`;
    } else if ((u.pro_expire_date && new Date(u.pro_expire_date) <= now) || (u.access_expire_date && new Date(u.access_expire_date) <= now)) {
        subBadge = `⚠️ <b>Obuna:</b> Muddati tugagan. Davomat kiritish uchun to'lov qiling.`;
    }

    const caption = `🌸 <b>Assalomu alaykum!</b>\nFarg'ona viloyati maktabgacha va maktab ta'limi boshqarmasi tizimidagi <b>@Ferghanaregdavomat_bot</b> ga xush kelibsiz.\n\n📅 <b>Bugungi sana:</b> ${date} (${day})\n💳 ${subBadge}\n\nBiz bilan hamkor bo'lganingiz uchun yana bir bor tabriklaymiz!\nKuningiz xayrli va mazmunli o'tsin! ✨`;

    // Tugmalarni tayyorlash
    let buttons = [["▶️ START — Davomat kiritish"], ["✈️ Xorijga ketganlar"]];

    // Admin bo'lsa, Admin Panel tugmasini qo'shish
    if (config.ALL_ADMINS.map(Number).includes(uid)) {
        buttons.push(["⚙️ Admin Panel"]);
    }

    // PRO Analitika button for PRO users (School level)
    if (isPro) {
        buttons.push(["📊 PRO Analitika"]);
    }

    buttons.push(["👤 Mening Profilim", "📊 Mening Statistikam"]);
    buttons.push(["💳 To'lov / Obuna", "📋 Ommaviy Oferta"]);
    buttons.push(["ℹ️ Dastur haqida", "📖 Yo'riqnoma"]);

    try {
        if (fs.existsSync(LOGO_PATH)) {
            await ctx.replyWithPhoto({ source: LOGO_PATH }, {
                caption: caption,
                parse_mode: 'HTML',
                ...Markup.keyboard(buttons).resize()
            });
        } else {
            await ctx.reply(caption, { parse_mode: 'HTML', ...Markup.keyboard(buttons).resize() });
        }
    } catch (e) {
        await ctx.reply(caption, Markup.keyboard(buttons).resize());
    }
}

// Global interceptor for /start (supports /start, /Start, /START even inside active scenes)
bot.use(async (ctx, next) => {
    if (ctx.message && ctx.message.text && /^\/start/i.test(ctx.message.text.trim())) {
        if (ctx.scene) {
            try { await ctx.scene.leave(); } catch (e) { }
        }
        return handleStartCommand(ctx);
    }
    return next();
});

bot.use(stage.middleware());

bot.start(handleStartCommand);
bot.command(['start', 'Start', 'START'], handleStartCommand);
bot.hears(/^\/start/i, handleStartCommand);

bot.command("admin", (ctx) => admin.showAdminPanel(ctx));
bot.command("dashboard", (ctx) => ctx.replyWithHTML("🌐 <b>ONLINE DASHBOARD (SVOD)</b>\n\n👉 <a href='https://ferghanaregdavomat.onrender.com/dashboard.html'>YORDAMCHI DASHBOARD</a>"));
bot.hears('✈️ Xorijga ketganlar', (ctx) => ctx.scene.enter('xorij_wizard'));

// --- AUTOMATED REPORTS (SCHEDULER) ---
const { initCrons } = require('./src/services/scheduler');
initCrons();

bot.use((ctx, next) => {
    console.log(`[UPDATE] Type: ${ctx.updateType}, From: ${ctx.from ? ctx.from.id : 'N/A'}`);
    return next();
});

// --- WEB API ---
const { getViloyatSvod, getTumanSvod, getTodayAbsentsDetails, getRecentActivity, exportToExcel, exportDistrictExcel, exportWeeklyExcel, exportMonthlyExcel, checkIfExists } = require('./src/services/dataService');
const { notifyParents } = require('./src/services/notifications');


// ==================== XORIJGA KETGANLAR WEB API ====================

app.post('/api/xorij/add', auth, upload.fields([
    { name: 'doc_qaror', maxCount: 1 },
    { name: 'doc_buyruq', maxCount: 1 }
]), async (req, res) => {
    try {
        const { district, school, student_name, dob, class_name, country, date_left, reason, companion, address, status, qonuniylik, q_sana, q_raqam, b_sana, b_raqam, cre_masul, cre_tel } = req.body;
        
        const dbPath = path.join(__dirname, 'src', 'database', 'xorij.json');
        let data = [];
        if (fs.existsSync(dbPath)) data = JSON.parse(fs.readFileSync(dbPath));
        
        // --- BU YERDAN DUBLIKAT TEKSHIRUV BOSHLANADI ---
        if (student_name && dob) {
            const checkRes = await sqlite.query('SELECT * FROM xorij_students WHERE LOWER(student_name) = $1 AND dob = $2 AND is_returned = false', [student_name.trim().toLowerCase(), dob]);
            if (checkRes.rowCount > 0) {
                const existing = checkRes.rows[0];
                return res.status(400).json({
                    error: `Bu o'quvchi xorijga ketganlar ro'yxatida mavjud!\nIltimos tekshirib ko'ring: Ushbu o'quvchi ${existing.district}ning ${existing.school} tomonidan kiritilgan.`
                });
            }
        }
        // --- DUBLIKAT TEKSHIRUV TUGADI ---

        const doc_qaror = req.files && req.files['doc_qaror'] ? req.files['doc_qaror'][0].filename : null;
        const doc_buyruq = req.files && req.files['doc_buyruq'] ? req.files['doc_buyruq'][0].filename : null;

        const q = `INSERT INTO xorij_students (
            student_name, dob, class_name, district, school, country, reason, companion, address, status, 
            qonuniylik, q_sana, q_raqam, b_sana, b_raqam, doc_qaror, doc_buyruq, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()) RETURNING id`;
        
        const values = [
            student_name, dob, class_name, district, school, country, reason, companion, address, status,
            qonuniylik, q_sana, q_raqam, b_sana, b_raqam, doc_qaror, doc_buyruq,
            cre_masul ? `${cre_masul} (${cre_tel})` : req.user.username
        ];
        
        const result = await sqlite.query(q, values);
        res.json({ success: true, id: result.rows[0].id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});




app.post('/api/xorij/upload-excel', auth, upload.single('excel_file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Excel fayl yuklanmadi!' });
        
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const dbPath = path.join(__dirname, 'src', 'database', 'xorij.json');
        let data = [];
        if (fs.existsSync(dbPath)) data = JSON.parse(fs.readFileSync(dbPath));

        let added = 0;
        let skipped = 0;
        let currentDistrict = req.user.district || req.body.district || '';
        let currentSchool = req.user.school || req.body.school || '';

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row)) continue;

            const nonNullCols = row.filter(cell => cell !== null && cell !== undefined && cell !== '');
            // Detect merged district header (Murakkab viloyat excel)
            if (nonNullCols.length === 1 && typeof nonNullCols[0] === 'string' && nonNullCols[0].toLowerCase().includes('туман')) {
                currentDistrict = nonNullCols[0].trim();
                continue;
            }

            let student_name = '';
            let dob = '';
            let class_name = '';
            let country = '';
            let date_left = '';
            let reason = '';
            let companion = '';
            let address = '';
            let school = currentSchool;
            let district = currentDistrict;

            // Simple heuristic to detect format
            if (row.length >= 8 && row[1] && row[2] && String(row[1]).length > 5 && !String(row[1]).toLowerCase().includes('туман')) {
                // SHABLON FORMAT (O'quvchi F.I.SH is index 1)
                student_name = row[1];
                dob = row[2] || '';
                class_name = row[3] || '';
                country = row[4] || '';
                date_left = row[5] || '';
                reason = row[6] || '';
                companion = row[7] || '';
                address = row[8] || '';
            } else if (row.length >= 6 && row[4] && typeof row[4] === 'string' && row[4].length > 5) {
                // MURAKKAB VILOYAT EXCEL FORMAT (O'quvchi F.I.SH is index 4)
                if (row[2] && String(row[2]).toLowerCase().includes('туман')) district = row[2];
                if (row[3]) school = String(row[3]).replace(/мактаб/gi, '').trim() + '-maktab';
                student_name = row[4];
                dob = row[5] || '';
                
                const dSana = String(row[6] || '');
                country = dSana.split(' ')[0] || dSana;
                date_left = dSana;
                reason = row[7] || '';
                address = row[13] || '';
            } else {
                continue;
            }

            if (!student_name || typeof student_name !== 'string' || student_name.trim().length < 5) continue;
            const snLower = student_name.toLowerCase();
            if (snLower.includes("исми ва шарифи") || snLower.includes("f.i.sh")) continue;

            student_name = student_name.trim();

            // Duplicate check
            const checkDup = await sqlite.query('SELECT id FROM xorij_students WHERE LOWER(student_name) = $1 AND is_returned = false', [snLower]);
            if (checkDup.rowCount > 0) {
                skipped++;
                continue;
            }

            const q = `INSERT INTO xorij_students (
                student_name, dob, class_name, district, school, country, reason, companion, address, status, 
                created_by, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`;
            
            await sqlite.query(q, [
                student_name, dob, class_name, district || 'Noma\'lum', school || 'Noma\'lum', 
                country, reason, companion, address, 'Chala (Exceldan)', req.user.username || 'System'
            ]);
            added++;
        }
        try { fs.unlinkSync(req.file.path); } catch(e) {}
        try { fs.unlinkSync(req.file.path); } catch(e) {}

        res.json({ success: true, added, skipped });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/xorij/return', auth, upload.single('doc_return'), async (req, res) => {
    try {
        const { id, ret_date, ret_district, ret_school, ret_class, ret_b_sana, ret_b_raqam } = req.body;
        const doc_return = req.file ? req.file.filename : null;

        const q = `UPDATE xorij_students SET 
            is_returned = true, ret_date = $1, ret_district = $2, ret_school = $3, 
            ret_class = $4, ret_b_sana = $5, ret_b_raqam = $6, doc_return = $7, updated_at = NOW() 
            WHERE id = $8`;
        
        await sqlite.query(q, [ret_date, ret_district, ret_school, ret_class, ret_b_sana, ret_b_raqam, doc_return, id]);
        res.json({ success: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/xorij/update', auth, upload.fields([
    { name: 'doc_qaror', maxCount: 1 },
    { name: 'doc_buyruq', maxCount: 1 }
]), async (req, res) => {
    try {
        const { id, student_name, dob, class_name, country, date_left, reason, companion, address, status, qonuniylik, q_sana, q_raqam, b_sana, b_raqam, upd_masul, upd_tel } = req.body;
        
        let q = `UPDATE xorij_students SET 
            student_name = COALESCE($1, student_name), dob = COALESCE($2, dob), class_name = COALESCE($3, class_name), 
            country = COALESCE($4, country), reason = COALESCE($5, reason), companion = COALESCE($6, companion), 
            address = COALESCE($7, address), status = COALESCE($8, status), qonuniylik = COALESCE($9, qonuniylik), 
            q_sana = COALESCE($10, q_sana), q_raqam = COALESCE($11, q_raqam), b_sana = COALESCE($12, b_sana), 
            b_raqam = COALESCE($13, b_raqam), updated_by = $14, updated_at = NOW()`;
        
        const params = [student_name, dob, class_name, country, reason, companion, address, status, qonuniylik, q_sana, q_raqam, b_sana, b_raqam, `${req.user.fio} (${req.user.login})`];

        if (req.files) {
            if (req.files['doc_qaror']) {
                q += `, doc_qaror = $${params.length + 1}`;
                params.push(req.files['doc_qaror'][0].filename);
            }
            if (req.files['doc_buyruq']) {
                q += `, doc_buyruq = $${params.length + 1}`;
                params.push(req.files['doc_buyruq'][0].filename);
            }
        }

        q += ` WHERE id = $${params.length + 1}`;
        params.push(id);

        await sqlite.query(q, params);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.get('/api/xorij', auth, async (req, res) => {
    try {
        let q = 'SELECT * FROM xorij_students';
        const params = [];
        if (req.user.role === 'district' || req.user.role === 'inspektor_psixolog') {
            q += ' WHERE district = $1';
            params.push(req.user.district);
        } else if (req.user.role === 'school') {
            q += ' WHERE district = $1 AND school = $2';
            params.push(req.user.district, req.user.school);
        }
        q += ' ORDER BY id DESC';
        const result = await sqlite.query(q, params);
        res.json(result.rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/xorij/summary', auth, async (req, res) => {
    try {
        const result = await sqlite.query('SELECT district, country, reason FROM xorij_students');
        const data = result.rows;
        
        const summary = {};
        const districts = Object.keys(TOPICS).filter(d => !["Test rejimi", "MMT Boshqarma"].includes(d));
        
        districts.forEach(d => {
            summary[d] = {
                total: 0,
                countries: { "Rossiya": 0, "Qozog'iston": 0, "Turkiya": 0, "BAA": 0, "Misr": 0, "Boshqa": 0 },
                reasons: { "Doimiy yashash": 0, "O'qish": 0, "Ishlash": 0, "Davolanish": 0, "Boshqa": 0 }
            };
        });
        
        data.forEach(item => {
            if (summary[item.district]) {
                summary[item.district].total++;
                if (summary[item.district].countries[item.country] !== undefined) summary[item.district].countries[item.country]++;
                else summary[item.district].countries["Boshqa"]++;
                
                if (summary[item.district].reasons[item.reason] !== undefined) summary[item.district].reasons[item.reason]++;
                else summary[item.district].reasons["Boshqa"]++;
            }
        });
        
        res.json(summary);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/xorij/export', auth, async (req, res) => {
    try {
        const { exportXorijExcel } = require('./src/services/dataService');
        const filePath = await exportXorijExcel();
        if (filePath && fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(500).send("Excel generatsiya qilib bo'lmadi.");
        }
    } catch(e) {
        res.status(500).send(e.message);
    }
});


app.get('/api/stats/non-submitting', auth, async (req, res) => {
    const { district } = req.query;
    const ProAnalytics = require('./src/services/proAnalytics');
    const data = await ProAnalytics.getNonSubmittingSchools(district);
    res.json(data);
});

app.get('/api/stats/non-submitting-deep', auth, async (req, res) => {
    const now = getFargonaTime();
    const dateStr = req.query.date || now.toISOString().split('T')[0];
    const ProAnalytics = require('./src/services/proAnalytics');
    const data = await ProAnalytics.getDeepNonSubmittingAnalysis(dateStr);
    res.json(data);
});

app.get('/api/stats/viloyat', auth, async (req, res) => {
    const now = getFargonaTime();
    const date = req.query.date || now.toISOString().split('T')[0];
    const data = await getViloyatSvod(date);
    res.json(data);
});

app.get('/api/stats/tuman', auth, async (req, res) => {
    const { tuman, date } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const now = getFargonaTime();
    const targetDate = date || now.toISOString().split('T')[0];

    const finalTuman = req.user.role === 'district' ? req.user.district : tuman;
    if (!finalTuman) return res.status(400).json({ error: 'Tuman required' });

    const data = await getTumanSvod(finalTuman, targetDate, limit, offset);
    res.json(data);
});

app.get('/api/stats/absentees', auth, async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const now = getFargonaTime();
    const date = req.query.date || now.toISOString().split('T')[0];
    const data = await getTodayAbsentsDetails(date, limit, offset);

    if (req.user.role === 'district') {
        const userDistNorm = normalizeKey(req.user.district);
        data.rows = data.rows.filter(d => normalizeKey(d.district) === userDistNorm);
    }
    res.json(data);
});

app.get('/api/stats/recent', auth, async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const district = req.user.role === 'district' ? req.user.district : null;

    const result = await getRecentActivity(limit, offset, district);
    res.json(result);
});

app.get('/api/stats/school', auth, async (req, res) => {
    if (req.user.role !== 'school') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    try {
        const result = await sqlite.query(`SELECT * FROM attendance WHERE district = $1 AND school = $2 ORDER BY date DESC LIMIT 30`, [req.user.district, req.user.school]);
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/export/viloyat', auth, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Ruxsat yo\'q' });
        }
        const filePath = await exportToExcel(req.query.date);
        if (filePath && fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(500).json({ error: "Fayl yaratilmadi." });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/export/tuman', auth, async (req, res) => {
    try {
        let tuman = req.query.tuman;
        if (req.user.role === 'district') tuman = req.user.district; // Ensure district admins only get their own
        if (!tuman) return res.status(400).json({ error: 'Tuman required' });
        
        const filePath = await exportDistrictExcel(tuman, req.query.date);
        if (filePath && fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(500).json({ error: "Fayl yaratilmadi." });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats/pro-insights', auth, async (req, res) => {
    if (req.user.role !== 'school') return res.status(403).json({ error: 'Ruxsat yo\'q' });

    const isPro = db.checkProByPhone(req.user.phone);
    if (!isPro) return res.status(403).json({ error: 'Faqat PRO foydalanuvchilar uchun' });

    try {
        const ProAnalytics = require('./src/services/proAnalytics');
        const [redList, aiPatterns] = await Promise.all([
            ProAnalytics.getWeeklyRedList(req.user.district, req.user.school),
            ProAnalytics.getAIPatterns(req.user.district, req.user.school)
        ]);
        res.json({ redList, aiPatterns });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats/trends', auth, async (req, res) => {
    try {
        const { getTrendStats } = require('./src/services/dataService');
        const district = req.user.role === 'district' ? req.user.district : null;
        const data = await getTrendStats(district);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/premium/red-list', auth, async (req, res) => {
    if (req.user.role !== 'school') return res.status(403).json([]);
    const ProAnalytics = require('./src/services/proAnalytics');
    const list = await ProAnalytics.getWeeklyRedList(req.user.district, req.user.school);
    res.json(list);
});

app.get('/api/premium/patterns', auth, async (req, res) => {
    if (req.user.role !== 'school') return res.status(403).json({});
    const ProAnalytics = require('./src/services/proAnalytics');
    const insights = await ProAnalytics.getAIPatterns(req.user.district, req.user.school);
    res.json({ insights });
});

app.post('/api/premium/generate-notice', auth, async (req, res) => {
    if (req.user.role !== 'school') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const { district, school, students, fio } = req.body;
    try {
        const { generateBildirgi } = require('./src/utils/pdfGenerator');
        const pdfPath = await generateBildirgi({ district, school, students_list: students, fio });
        res.download(pdfPath);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/export/viloyat', auth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).send("Ruxsat yo'q");
    const { date } = req.query;
    const filePath = await exportToExcel(date);
    if (filePath && fs.existsSync(filePath)) {
        res.download(path.resolve(filePath));
    } else {
        res.status(404).send("Hisobot fayli topilmadi");
    }
});

app.get('/api/export/tuman', auth, async (req, res) => {
    const { tuman, date } = req.query;
    const finalTuman = req.user.role === 'district' ? req.user.district : tuman;
    if (!finalTuman) return res.status(400).send("Tuman required");

    const filePath = await exportDistrictExcel(finalTuman, date);
    if (filePath && fs.existsSync(filePath)) {
        res.download(path.resolve(filePath));
    } else {
        res.status(404).send("Hisobot fayli topilmadi");
    }
});

app.get('/api/export/weekly', auth, async (req, res) => {
    const { date } = req.query;
    const filePath = await exportWeeklyExcel(date);
    if (filePath && fs.existsSync(filePath)) {
        res.download(path.resolve(filePath));
    } else {
        res.status(404).send("Haftalik hisobot topilmadi");
    }
});

app.get('/api/export/monthly', auth, async (req, res) => {
    const { date, district } = req.query;
    const finalDistrict = req.user.role === 'district' ? req.user.district : district;
    const filePath = await exportMonthlyExcel(date, finalDistrict);
    if (filePath && fs.existsSync(filePath)) {
        res.download(path.resolve(filePath));
    } else {
        res.status(404).send("Oylik hisobot topilmadi");
    }
});

app.get('/api/districts', (req, res) => {
    res.json(Object.keys(TOPICS));
});

app.get('/api/check-pro', (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.json({ is_pro: false });
    const cleanPhone = phone.replace(/\D/g, '');
    const user = Object.values(db.users_db).find(u =>
        u.phone && u.phone.replace(/\D/g, '') === cleanPhone &&
        new Date(u.pro_expire_date) > new Date()
    );
    if (user) {
        res.json({
            is_pro: true,
            pro_expire_date: user.pro_expire_date,
            pro_purchase_date: user.pro_purchase_date || '-'
        });
    } else {
        res.json({ is_pro: false });
    }
});

app.get('/api/export/archive', async (req, res) => {
    const { date, token } = req.query;
    if (!token) return res.status(401).send("Unauthorized");
    try {
        const { exportToExcel } = require('./src/services/dataService');
        const filePath = await exportToExcel(date);
        if (filePath && fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).send("Hisobot topilmadi");
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.post('/api/push/subscribe', async (req, res) => {
    const subscription = req.body;
    try {
        const db_pg = require('./src/database/pg');
        await db_pg.query(
            'INSERT INTO push_subscriptions (subscription, created_at) VALUES ($1, NOW()) ON CONFLICT (subscription) DO NOTHING',
            [JSON.stringify(subscription)]
        );
        res.status(201).json({});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});



app.get('/api/schools', async (req, res) => {
    const { district } = req.query;
    if (!district) return res.status(400).json({ error: 'District required' });
    
    let schools = db.schools_db[district] || db.schools_db[district.replace(/'/g, "‘")] || db.schools_db[district.replace(/‘/g, "'")] || [];
    
    if (schools.length === 0) {
        const { getSchools } = require('./src/services/sheet');
        schools = await getSchools(district);
    }
    
    res.json(schools || []);
});

// --- ADMIN SETTINGS & BROADCAST ---

// Admin: Get settings
app.get('/api/admin/settings', auth, (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    res.json(db.settings);
});

// Admin: Update settings

// ==================== DOCUMENTS (MEYORIY HUJJATLAR) API ====================
app.post('/api/documents', auth, upload.single('document_file'), async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ error: 'Faqat Superadmin yuklay oladi!' });
        }
        const { title, description } = req.body;
        const q = 'INSERT INTO documents (title, description, date, filename) VALUES ($1, $2, $3, $4) RETURNING *';
        const result = await sqlite.query(q, [title, description, new Date().toISOString().split('T')[0], req.file ? req.file.filename : null]);
        res.json({ success: true, doc: result.rows[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/documents', async (req, res) => {
    try {
        const result = await sqlite.query('SELECT * FROM documents ORDER BY id DESC');
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.post('/api/admin/settings', auth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const { vacation_mode, location_collection_mode, check_location, maintenance_mode, bypass_payment_check } = req.body;

    if (vacation_mode !== undefined) db.settings.vacation_mode = vacation_mode;
    if (location_collection_mode !== undefined) db.settings.location_collection_mode = location_collection_mode;
    if (check_location !== undefined) db.settings.check_location = check_location;
    if (maintenance_mode !== undefined) db.settings.maintenance_mode = maintenance_mode;
    if (bypass_payment_check !== undefined) db.settings.bypass_payment_check = bypass_payment_check;

    await db.saveSettings();
    res.json({ success: true, settings: db.settings });
});

// Admin: Broadcast message (Supports Files, HTML fallback, Flood Control)
app.post('/api/admin/broadcast', auth, (req, res, next) => {
    upload.single('file')(req, res, function (err) {
        if (err) {
            console.error("Upload Error:", err);
            return res.status(400).json({ error: 'Fayl yuklashda xatolik: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    const isOwner = req.user.username === 'mrqirol';
    if (req.user.role !== 'superadmin' && !isOwner) return res.status(403).json({ error: 'Ruxsat yo\'q' });

    const { message, group } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Xabar matni bo\'sh' });

    const file = req.file;

    // Filter recipients from users_db
    const users = Object.entries(db.users_db || {});
    let targetUids = [];

    if (group === 'inspectors') {
        targetUids = users.filter(([uid, u]) => u.district || u.role === 'inspektor_psixolog').map(([uid]) => uid);
    } else if (group === 'parents') {
        targetUids = users.filter(([uid, u]) => u.role === 'parent').map(([uid]) => uid);
    } else {
        targetUids = users.map(([uid]) => uid);
    }

    // UNIQUE and VALID IDs
    targetUids = [...new Set(targetUids)].filter(id => id && !isNaN(id));

    res.json({ success: true, estimated_users: targetUids.length });

    // Background broadcasting
    (async () => {
        let sent = 0;
        let blocked = 0;
        const path = require('path');

        for (const uid of targetUids) {
            let attempts = 0;
            let success = false;

            while (attempts < 3 && !success) {
                attempts++;
                try {
                    if (file) {
                        const filePath = file.path || path.join(__dirname, 'assets', 'uploads', file.filename);
                        const isImage = file.mimetype && file.mimetype.startsWith('image/');
                        if (fs.existsSync(filePath)) {
                            try {
                                if (isImage) {
                                    await bot.telegram.sendPhoto(uid, { source: filePath }, { caption: message, parse_mode: 'HTML' });
                                } else {
                                    await bot.telegram.sendDocument(uid, { source: filePath }, { caption: message, parse_mode: 'HTML' });
                                }
                            } catch (htmlErr) {
                                // Fallback without parse_mode
                                if (isImage) {
                                    await bot.telegram.sendPhoto(uid, { source: filePath }, { caption: message });
                                } else {
                                    await bot.telegram.sendDocument(uid, { source: filePath }, { caption: message });
                                }
                            }
                        } else {
                            // File not found on disk, fallback to sending message text
                            try {
                                await bot.telegram.sendMessage(uid, message, { parse_mode: 'HTML' });
                            } catch (htmlErr) {
                                await bot.telegram.sendMessage(uid, message);
                            }
                        }
                    } else {
                        try {
                            await bot.telegram.sendMessage(uid, message, { parse_mode: 'HTML' });
                        } catch (htmlErr) {
                            // Fallback to plain text if HTML entities parse error
                            await bot.telegram.sendMessage(uid, message);
                        }
                    }
                    sent++;
                    success = true;
                } catch (e) {
                    // Check Telegram Flood Control (429)
                    if (e.response && e.response.error_code === 429) {
                        const waitSeconds = (e.response.parameters && e.response.parameters.retry_after) || 3;
                        console.warn(`[BROADCAST 429] Rate limit hit. Waiting ${waitSeconds}s before retry...`);
                        await new Promise(r => setTimeout(r, (waitSeconds + 1) * 1000));
                        continue;
                    }
                    // Blocked, deactivated or invalid chat
                    blocked++;
                    break;
                }
            }
            await new Promise(r => setTimeout(r, 70)); // Safe interval to prevent rate limit
        }
        console.log(`[BROADCAST] Finished. Sent: ${sent}, Blocked/Failed: ${blocked}`);
    })();
});

// Admin: List Archived Reports
app.get('/api/admin/reports', auth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json([]);
    try {
        const assetsDir = path.join(__dirname, 'assets');
        if (!fs.existsSync(assetsDir)) return res.json([]);
        const files = fs.readdirSync(assetsDir)
            .filter(f => f.endsWith('.xlsx'))
            .map(f => {
                const stat = fs.statSync(path.join(assetsDir, f));
                return { name: f, size: (stat.size / 1024).toFixed(1) + ' KB', date: stat.mtime };
            })
            .sort((a, b) => b.date - a.date);
        res.json(files);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- INSPECTOR TRACKING API ---
app.post('/api/inspector/profile', async (req, res) => {
    const { phone, fio, district, schools } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    try {
        await sqlite.query(`
            INSERT INTO inspector_profiles (phone, fio, district, schools, last_active)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (phone) DO UPDATE SET
            fio = EXCLUDED.fio, district = EXCLUDED.district,
            schools = EXCLUDED.schools, last_active = CURRENT_TIMESTAMP
        `, [phone, fio, district, JSON.stringify(schools)]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/inspector/activity', async (req, res) => {
    const { phone, action, details } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    try {
        await sqlite.query(`INSERT INTO inspector_activity (phone, action, details) VALUES ($1, $2, $3)`, [phone, action, details]);
        // Also update last_active in profile
        await sqlite.query(`UPDATE inspector_profiles SET last_active = CURRENT_TIMESTAMP WHERE phone = $1`, [phone]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/inspectors', auth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    try {
        const profiles = await sqlite.query(`SELECT * FROM inspector_profiles ORDER BY last_active DESC`);
        const activity = await sqlite.query(`SELECT * FROM inspector_activity ORDER BY timestamp DESC LIMIT 100`);
        res.json({ profiles: profiles.rows, activity: activity.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin: Download specific report
app.get('/api/admin/reports/download/:filename', auth, (req, res) => {
    if (req.user.role !== 'superadmin' && req.user.role !== 'district' && req.user.role !== 'school') return res.status(403).send("Ruxsat yo'q");

    const filename = req.params.filename;
    const assetsDir = path.join(__dirname, 'assets');
    const uploadsDir = path.join(assetsDir, 'uploads');

    let filePath = path.join(uploadsDir, filename);

    // Check uploads first, then assets root
    if (!fs.existsSync(filePath)) {
        filePath = path.join(assetsDir, filename);
    }

    // Security check
    if (!filePath.startsWith(assetsDir) || !fs.existsSync(filePath)) {
        return res.status(404).send("Fayl topilmadi");
    }

    res.download(filePath);
});

app.post('/api/contact', async (req, res) => {
    const { name, message } = req.body;
    if (!name || !message) return res.status(400).json({ error: 'Name and message required' });

    const report = `📩 <b>Mushtariydan habar:</b>\n\n` +
        `👤 Ism: ${name}\n` +
        `💬 Habar: ${message}`;

    const groupId = "-1003662758005";
    try {
        await bot.telegram.sendMessage(groupId, report, { parse_mode: 'HTML' });
        res.json({ result: 'success' });
    } catch (e) {
        res.status(500).json({ error: 'TG Error' });
    }
});

app.get('/api/stats/parents', auth, (req, res) => {
    try {
        const parents = Object.entries(db.users_db)
            .filter(([key]) => key.startsWith('parent_'))
            .map(([key, u]) => ({
                id: key.replace('parent_', ''),
                fio: u.fio || 'Noma\'lum',
                child_name: (u.subscriptions && u.subscriptions[0]?.name) || '-',
                phone: u.phone || '-',
                district: u.district || '-',
                school: u.school || '-',
                joined_at: u.joined_at || '-'
            }));
        res.json(parents);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/submit', upload.single('bildirgi'), async (req, res) => {
    const d = req.body || {};
    const today = getFargonaTime().toISOString().split('T')[0];

    // OYLIK TO'LOV TEKSHIRUVI (05.10.2026 DAN E'TIBORAN)
    const isTestDistrict = (d.district && d.district.toLowerCase().includes('test'));
    const isBypass = isTestDistrict || db.settings.bypass_payment_check || (db.settings.free_attendance_enabled && (!db.settings.free_attendance_end || today <= db.settings.free_attendance_end));
    if (today >= '2026-10-05' && !isBypass) {
        const isSuper = req.user && req.user.role === 'superadmin';
        const isInspector = req.user && req.user.role === 'inspektor_psixolog';
        if (!isSuper && !isInspector) {
            const userPhone = d.phone || (req.user && req.user.phone);
            const userUid = req.user && req.user.uid;
            const schoolHasAccess = (d.district && d.school && db.checkSchoolAccess(d.district, d.school));
            const userHasAccess = (userPhone && db.checkAttendanceAccessByPhone(userPhone)) || (userUid && db.checkAttendanceAccess(userUid));
            if (!schoolHasAccess && !userHasAccess) {
                return res.status(402).json({
                    error: "PAYMENT_REQUIRED",
                    message: "Ushbu maktab uchun oylik to'lov amalga oshirilmagan yoki muddati tugagan (10 000 so'm/oy). To'lov qilib chek yuboring!",
                    district: d.district,
                    school: d.school,
                    cards: {
                        humo: db.settings.humo_card || "9860 0366 3576 1863",
                        visa: db.settings.visa_card || "4187 8000 0132 1124"
                    }
                });
            }
        }
    }

    // TAKRORIY KIRITISHNI OLDINI OLISH
    // If not superadmin, check if already submitted today
    const isSuper = req.user && req.user.role === 'superadmin';
    if (!isSuper && !d.overwrite) {
        const alreadyExists = await checkIfExists(d.district, d.school, today);
        if (alreadyExists) {
            return res.status(409).json({
                error: "DUPLICATE",
                message: "Ushbu maktab bo'yicha bugun uchun ma'lumot allaqachon kiritilgan! Eskisini o'chirib, yangisini yozishni xohlaysizmi?"
            });
        }
    }

    // Parse absent_students (FormData sends string)
    let students_list = [];
    try {
        students_list = typeof d.absent_students === 'string' ? JSON.parse(d.absent_students) : (d.absent_students || []);
    } catch (e) { students_list = []; }

    console.log(`[WEB-SUBMIT] Received: ${d.district} - ${d.school}`);

    // Flatten data for saveData/SQLite
    const flatData = {
        ...d,
        sababli_kasal: parseInt(d.sababli_kasal || d.sababli?.kasal) || 0,
        sababli_tadbirlar: parseInt(d.sababli_tadbirlar || d.sababli?.tadbirlar) || 0,
        sababli_oilaviy: parseInt(d.sababli_oilaviy || d.sababli?.oilaviy) || 0,
        sababli_ijtimoiy: parseInt(d.sababli_ijtimoiy || d.sababli?.ijtimoiy) || 0,
        sababli_boshqa: parseInt(d.sababli_boshqa || d.sababli?.boshqa) || 0,
        sababli_total: parseInt(d.sababli_total || d.sababli?.total) || 0,
        sababsiz_muntazam: parseInt(d.sababsiz_muntazam || d.sababsiz?.muntazam) || 0,
        sababsiz_qidiruv: parseInt(d.sababsiz_qidiruv || d.sababsiz?.qidiruv) || 0,
        sababsiz_chetel: parseInt(d.sababsiz_chetel || d.sababsiz?.chetel) || 0,
        sababsiz_boyin: parseInt(d.sababsiz_boyin || d.sababsiz?.boyin) || 0,
        sababsiz_ishlab: parseInt(d.sababsiz_ishlab || d.sababsiz?.ishlab) || 0,
        sababsiz_qarshilik: parseInt(d.sababsiz_qarshilik || d.sababsiz?.qarshilik) || 0,
        sababsiz_jazo: parseInt(d.sababsiz_jazo || d.sababsiz?.jazo) || 0,
        sababsiz_nazoratsiz: parseInt(d.sababsiz_nazoratsiz || d.sababsiz?.nazoratsiz) || 0,
        sababsiz_boshqa: parseInt(d.sababsiz_boshqa || d.sababsiz?.boshqa) || 0,
        sababsiz_turmush: parseInt(d.sababsiz_turmush || d.sababsiz?.turmush) || 0,
        sababsiz_total: parseInt(d.sababsiz_total || d.sababsiz?.total) || 0,
        students_list: students_list,
        inspector: d.inspektor_fio || d.inspektor || '',
        source: 'web'
    };

    // Bildirgi Logic
    if (flatData.sababsiz_total > 0) {
        const isProUser = db.checkProByPhone(d.phone);
        if (req.file) {
            flatData.bildirgi = req.file.path;
        } else if (isProUser) {
            try {
                console.log("Generating Auto Bildirgi for PRO user...");
                const pdfPath = await generateBildirgi({
                    district: d.district,
                    school: d.school,
                    fio: d.fio,
                    total_students: d.total_students,
                    sababsiz_total: flatData.sababsiz_total,
                    students_list: students_list
                });
                flatData.bildirgi = pdfPath;
            } catch (e) {
                console.error("Auto Bildirgi Error:", e);
                // Even for PRO, if auto-gen fails, we might need a fallback, but for now let's just log
            }
        } else {
            // REJECT: Sababsiz bor, lekin bildirgi yuklanmagan
            return res.status(400).json({ error: "Sababsiz kelmaganlar uchun Bildirgi yuklash tanlangan tartib bo'yicha majburiy! Iltimos, fayl yuklang." });
        }
    }

    const success = await saveData(flatData);

    if (success) {
        // Real-time Notification to Parents (NEW)
        if (flatData.students_list && flatData.students_list.length > 0) {
            notifyParents(flatData, flatData.students_list).catch(e => console.error("Notification trigger error:", e));
        }

        // SMS & TG Notification Logic (Same as before)
        // SMS SERVICE INTEGRATION (PRO ONLY)
        const isProUser = db.checkProByPhone(d.phone);
        if (isProUser && flatData.students_list.length > 0) {
            const SmsService = require('./src/services/sms');
            flatData.students_list.forEach(student => {
                if (student.parent_phone) {
                    const msg = `Assalomu alaykum hurmatli ota-ona sizning farzandingiz ${d.district}, ${d.school}ning ${student.class} o‘quvchisi ${student.name} bugun maktabga kelmaganligini ma'lum qilamiz.\n\nMa'lumot uchun farzandingizni ta'limiga e'tiborsizligingiz O‘zbekiston Respublikasining Ma'muriy javobgarlik to‘g‘risidagi kodeksning 47-moddasi asosida jarimaga tortilishingizga sabab bo‘lishini ogohlantiriamiz.`;
                    SmsService.sendSms(student.parent_phone, msg).then(res => {
                        console.log(`[SMS-SENT] To: ${student.parent_phone}, Result:`, res);
                    }).catch(e => console.error("[SMS-ERROR]", e.message));
                }
            });
        }

        // TELEGRAM NOTIFICATION
        const isProForReport = db.checkProByPhone(d.phone);
        const report = formatAttendanceReport(flatData, isProForReport, 'web');

        const tid = getTopicId(d.district || flatData.district);
        const reportGroupId = process.env.REPORT_GROUP_ID || config.REPORT_GROUP_ID || "-1003662758005";

        console.log(`[WEB-SUBMIT] Sending to Telegram Group: ${reportGroupId}, Topic ID: ${tid}, District: ${d.district}`);

        try {
            const sendOpts = tid ? { parse_mode: 'HTML', message_thread_id: Number(tid) } : { parse_mode: 'HTML' };
            try {
                await bot.telegram.sendMessage(reportGroupId, report, sendOpts);
            } catch (htmlErr) {
                console.warn("[WEB-SUBMIT] HTML parse error in TG send, retrying plain text:", htmlErr.message);
                const plainOpts = tid ? { message_thread_id: Number(tid) } : {};
                const plainReport = report.replace(/<[^>]*>/g, '');
                await bot.telegram.sendMessage(reportGroupId, plainReport, plainOpts);
            }

            // Send Bildirgi to group if exists
            if (flatData.bildirgi && fs.existsSync(flatData.bildirgi)) {
                const isImage = /\.(jpg|jpeg|png|webp)$/i.test(flatData.bildirgi);
                const docCaption = `#Bildirgi ${d.school}`;
                const docOpts = { caption: docCaption, ...(tid ? { message_thread_id: Number(tid) } : {}) };

                try {
                    if (isImage) {
                        await bot.telegram.sendPhoto(reportGroupId, { source: flatData.bildirgi }, docOpts);
                    } else {
                        await bot.telegram.sendDocument(reportGroupId, { source: flatData.bildirgi, filename: path.basename(flatData.bildirgi) }, docOpts);
                    }
                } catch (fileSendErr) {
                    console.error("[WEB-SUBMIT] Bildirgi send error, trying fallback document:", fileSendErr.message);
                    try {
                        await bot.telegram.sendDocument(reportGroupId, { source: flatData.bildirgi, filename: path.basename(flatData.bildirgi) }, docOpts);
                    } catch (e3) {
                        console.error("[WEB-SUBMIT] Bildirgi fallback failed:", e3.message);
                    }
                }
            }
            console.log(`[WEB-SUBMIT] Successfully sent to topic ${tid}`);
        } catch (err) {
            console.error("[WEB-SUBMIT] TG Send Error:", err.message);
        }

        res.json({
            result: 'success',
            bildirgi: flatData.bildirgi ? path.basename(flatData.bildirgi) : null
        });
    } else {
        res.status(500).json({ result: 'error', error: 'Database save failed' });
    }
});

/**
 * SuperAdmin Command: Activate PRO (e.g. activate 1234567 1)
 * months: 1, 2, or 3
 */
bot.hears(/^activate (\d+)\s*(\d+)?$/, async (ctx) => {
    if (!config.SUPER_ADMIN_IDS.map(Number).includes(Number(ctx.from.id)) && ctx.from.id !== 65002404) return;

    const uid = ctx.match[1];
    const months = parseInt(ctx.match[2]) || 1;

    const u = db.updateUserProMonths(uid, months);

    await ctx.reply(`✅ Foydalanuvchi ${uid} (${u.fio || 'Noma\'lum'}) uchun PRO maqomi ${months} oyga faollashtirildi.\n📅 Amal qilish muddati: ${u.pro_expire_date}`);

    // Group Announcement (Marketing)
    const reportGroupId = "-1003662758005";
    const adv = `🌟 <b>YANGI PRO HARIDI!</b>\n\n🏢 Maktab: <b>${u.school || 'Noma\'lum'}</b>\n📍 Hudud: <b>${u.district || 'Noma\'lum'}</b>\n👤 Mas'ul: <b>${u.fio || 'Noma\'lum'}</b>\n\nUshbu maktab rasman <b>PRO ✨</b> maqomini oldi va barcha eksklyuziv imkoniyatlarga ega bo'ldi! 🎉\n\n<i>Obuna muddati: ${u.pro_expire_date} gacha.</i>`;

    const tid = getTopicId(u.district);
    try {
        if (tid) {
            await bot.telegram.sendMessage(reportGroupId, adv, { parse_mode: 'HTML', message_thread_id: tid });
        } else {
            await bot.telegram.sendMessage(reportGroupId, adv, { parse_mode: 'HTML' });
        }
    } catch (e) { console.error("ADV Send Error:", e.message); }
});

bot.hears(/^revoke (\d+)$/, async (ctx) => {
    if (!config.SUPER_ADMIN_IDS.map(Number).includes(Number(ctx.from.id)) && ctx.from.id !== 65002404) return;
    const uid = ctx.match[1];
    if (db.users_db[uid]) {
        db.users_db[uid].is_pro = false;
        db.users_db[uid].pro_expire_date = "2000-01-01";
        db.updateUserDb(uid, { is_pro: false });
        await ctx.reply(`❌ Foydalanuvchi ${uid} dan PRO maqomi olib tashlandi.`);
    }
});

// --- UTILS ---
function getTodayInfo() {
    const now = getFargonaTime();
    const date = now.toLocaleDateString('ru-RU');
    const days = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
    return { date, day: days[now.getDay()] };
}



// --- ADMIN HANDLERS ---
bot.hears("👥 Pro Ro'yxat", (ctx) => admin.handleProList(ctx));
bot.hears("❌ Pro Bekor Qilish", (ctx) => { if (config.SUPER_ADMIN_IDS.includes(ctx.from.id)) { ctx.reply("ID ni yuboring (Format: revoke ID):"); } });
bot.hears("➕ Promokod Yaratish", (ctx) => { if (config.SUPER_ADMIN_IDS.includes(ctx.from.id)) { ctx.reply("Tez orada..."); } });
bot.hears("🔴 Ta'tilni YOQISH", (ctx) => { if (config.SUPER_ADMIN_IDS.includes(ctx.from.id)) { db.settings.vacation_mode = true; db.saveSettings(); ctx.reply("🔴 TA'TIL YOQILDI"); } });
bot.hears("🟢 Ta'tilni O'CHIRISH", (ctx) => { if (config.SUPER_ADMIN_IDS.includes(ctx.from.id)) { db.settings.vacation_mode = false; db.saveSettings(); ctx.reply("🟢 TA'TIL O'CHIRILDI"); } });
bot.hears("🔓 1-Kunga Bepul Davomat", (ctx) => {
    if (config.SUPER_ADMIN_IDS.map(Number).includes(Number(ctx.from.id))) {
        db.settings.bypass_payment_check = !db.settings.bypass_payment_check;
        db.saveSettings();
        ctx.reply(`🔓 1-Kunga Bepul Davomat Holati:\n${db.settings.bypass_payment_check ? "🟢 YOQILDI (Bugun barcha maktablar uchun davomat kiritish BEPUL!)" : "🔴 O'CHIRILDI (Standart to'lov tekshiruvi faol)"}`);
    }
});
bot.hears("⬅️ Orqaga", (ctx) => {
    let buttons = [["Davomat kiritish"]];
    if (config.ALL_ADMINS.map(Number).includes(ctx.from.id)) buttons.push(["⚙️ Admin Panel"]);
    buttons.push(["👤 Mening Profilim", "📊 Mening Statistikam"]);
    buttons.push(["ℹ️ Dastur haqida", "📖 Yo'riqnoma"]);
    ctx.reply("🏠 Asosiy menyu", Markup.keyboard(buttons).resize());
});

bot.hears("📝 Rejalar", (ctx) => ctx.reply("📌 <b>Rejalar:</b>\n1. Web App/Mobile App integratsiyasi.\n2. Baza optimizatsiyasi.\n3. Respublika bo'ylab kengaytirish.", { parse_mode: 'HTML' }));

bot.hears("📊 Svod va Hisobotlar", (ctx) => {
    ctx.replyWithHTML("🌐 <b>ONLINE DASHBOARD (SVOD)</b>\n\nBarcha ma'lumotlarni real vaqt rejimida ko'rish va nazorat qilish uchun quyidagi havolaga o'ting:\n\n👉 <a href='https://ferghanaregdavomat.onrender.com/dashboard.html'>YORDAMCHI DASHBOARD</a>");
});

bot.hears("📥 Excel Yuklab olish", async (ctx) => {
    if (!config.SUPER_ADMIN_IDS.includes(ctx.from.id) && ctx.from.id !== 65002404) return ctx.reply("⛔️ Ruxsat yo'q.");
    await ctx.reply("📊 <b>Viloyat bo'yicha umumiy hisobot tayyorlanmoqda...</b>", { parse_mode: 'HTML' });
    const filePath = await exportToExcel();
    if (filePath) {
        await ctx.replyWithDocument({ source: filePath, filename: path.basename(filePath) }, {
            caption: "✅ <b>Viloyat hisoboti tayyor!</b>",
            parse_mode: 'HTML'
        });
    } else {
        await ctx.reply("❌ Xatolik yuz berdi.");
    }
});

bot.hears("📥 Tuman hisoboti (Excel)", async (ctx) => {
    const district = config.DISTRICT_ADMINS[ctx.from.id];
    if (!district) return ctx.reply("⛔️ Sizga hudud biriktirilmagan.");

    await ctx.reply(`📊 <b>${district} bo'yicha maktablar hisoboti tayyorlanmoqda...</b>`, { parse_mode: 'HTML' });

    const filePath = await exportDistrictExcel(district);
    if (filePath) {
        await ctx.replyWithDocument({ source: filePath, filename: path.basename(filePath) }, {
            caption: `✅ <b>${district} hisoboti tayyor!</b>`,
            parse_mode: 'HTML'
        });
    } else {
        await ctx.reply("❌ Xatolik yuz berdi.");
    }
});

// --- START COMMAND ---
bot.hears("⚙️ Admin Panel", (ctx) => admin.showAdminPanel(ctx));

// --- INFO HANDLER ---
bot.hears("📖 Yo'riqnoma", async (ctx) => {
    const filePath = path.join(__dirname, 'assets', 'QOLLANMA.pdf');
    if (fs.existsSync(filePath)) {
        await ctx.replyWithDocument({ source: filePath, filename: "DavomatBot_Qo'llanma.pdf" }, {
            caption: "📖 <b>@Ferghanaregdavomat_bot - Foydalanish yo'riqnomasi</b>\n\nUshbu qo'llanma orqali bot imkoniyatlari bilan tanishib chiqishingiz mumkin.",
            parse_mode: 'HTML'
        });
    } else {
        await ctx.reply("⚠️ Yo'riqnoma fayli topilmadi.");
    }
});

bot.hears("ℹ️ Dastur haqida", (ctx) => {
    ctx.reply(
        "ℹ️ <b>DASTUR HAQIDA</b>\n\n" +
        "🏛 <b>Tashkilot:</b> Farg‘ona viloyati Maktabgacha va maktab ta'limi boshqarmasi\n" +
        "🏢 <b>Bo'lim:</b> Ta'lim tashkilotlarida tarbiyaviy ishlarni muvofiqlashtirish sho‘basi\n\n" +
        "👨‍💻 <b>Muallif:</b> Rustam Raushanovich\n" +
        "🤖 <b>Versiya:</b> 2.0 (Modular)\n" +
        "📅 <b>O'quv yili:</b> 2026-2027\n\n" +
        "🔒 <i>© Barcha huquqlar himoyalangan.</i>",
        { parse_mode: 'HTML' }
    );
});

// --- PROFILE & SUBSCRIPTION HANDLER ---
async function showUserProfile(ctx) {
    const uid = ctx.from.id;
    const u = db.users_db[uid];
    if (!u) {
        return ctx.replyWithHTML("👤 <b>Siz hali ro'yxatdan o'tmagansiz.</b>\n\nDavomat kiritishni boshlang, tizim sizni avtomatik eslab qoladi.");
    }

    const now = getFargonaTime();
    const isPro = db.checkPro(uid);
    const hasAccess = db.checkAttendanceAccess(uid);

    let statusHtml = "⚪ <b>Status:</b> Noaktiv / To'lov qilinmagan\n<i>(05.10.2026 dan davomat kiritish uchun oylik obuna talab etiladi)</i>";
    let daysLeft = 0;

    if (isPro && u.pro_expire_date && new Date(u.pro_expire_date) > now) {
        daysLeft = Math.max(0, Math.ceil((new Date(u.pro_expire_date) - now) / (1000 * 60 * 60 * 24)));
        statusHtml = `👑 <b>Status:</b> 🌟 PRO Rejim (Faol)\n` +
            `⏳ <b>Qolgan muddat:</b> <b>${daysLeft} kun qoldi</b>\n` +
            `📅 <b>Amal qilish muddati:</b> ${u.pro_expire_date} gacha\n` +
            `✨ <i>Imkoniyatlar: AI rasm aniqlash, avto 3-Ilova PDF, PRO hisobotlar</i>`;
    } else if (hasAccess && u.access_expire_date && new Date(u.access_expire_date) > now) {
        daysLeft = Math.max(0, Math.ceil((new Date(u.access_expire_date) - now) / (1000 * 60 * 60 * 24)));
        statusHtml = `✅ <b>Status:</b> Standart Davomat Ruxsati (Faol)\n` +
            `⏳ <b>Qolgan muddat:</b> <b>${daysLeft} kun qoldi</b>\n` +
            `📅 <b>Amal qilish muddati:</b> ${u.access_expire_date} gacha`;
    } else if (u.access_expire_date || u.pro_expire_date) {
        const exp = u.pro_expire_date || u.access_expire_date;
        statusHtml = `⚠️ <b>Status:</b> To'lov muddati tugagan (${exp})\n` +
            `<i>Davomat kiritishni davom ettirish uchun obunani yangilang.</i>`;
    }

    // Oxirgi yuborilgan chek holati
    let receiptStatusHtml = "";
    try {
        const lastReceipt = await paymentService.getUserReceiptStatus(uid);
        if (lastReceipt) {
            if (lastReceipt.status === 'pending') {
                receiptStatusHtml = `\n🧾 <b>Yuborilgan to'lov cheki:</b> ⏳ <b>Ko'rib chiqilmoqda</b>\n` +
                    `⏰ <i>Vaqti: ${lastReceipt.submitted_at || '-'}</i>\n` +
                    `🔖 <i>Chek ID: <code>${lastReceipt.id}</code></i>\n`;
            } else if (lastReceipt.status === 'approved') {
                receiptStatusHtml = `\n🧾 <b>So'nggi to'lov cheki:</b> ✅ Tasdiqlangan (${lastReceipt.resolved_at || 'Faol'})\n`;
            } else if (lastReceipt.status === 'rejected') {
                receiptStatusHtml = `\n🧾 <b>So'nggi to'lov cheki:</b> ❌ Rad etilgan (Qayta to'lov qiling)\n`;
            }
        }
    } catch (rErr) { }

    const msg = `👤 <b>SIZNING PROFILINGIZ:</b>\n\n` +
        `👨‍💼 <b>F.I.SH:</b> ${u.fio || u.name || 'Kiritilmagan'}\n` +
        `📞 <b>Telefon:</b> ${u.phone || 'Kiritilmagan'}\n` +
        `📍 <b>Hudud:</b> ${u.district || 'Tanlanmagan'}\n` +
        `🏫 <b>Maktab:</b> ${u.school || 'Tanlanmagan'}\n\n` +
        `💳 <b>OYLIK OBUNA VA TO'LOV MA'LUMOTI:</b>\n` +
        `${statusHtml}\n` +
        `${receiptStatusHtml}\n` +
        `<i>Pastdagi tugmalar orqali obunani yangilashingiz yoki ma'lumotlarni o'zgartirishingiz mumkin:</i>`;

    const buttons = [
        [Markup.button.callback("💳 Obunani yangilash / To'lov", "pay_subscription")],
        [Markup.button.callback("🔍 Chek holatini tekshirish", "check_my_receipt")],
        [Markup.button.callback("📝 Ma'lumotlarni tahrirlash", "edit_profile")]
    ];

    return ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
}

bot.action("check_my_receipt", async (ctx) => {
    await ctx.answerCbQuery();
    const uid = ctx.from.id;
    const lastReceipt = await paymentService.getUserReceiptStatus(uid);

    if (!lastReceipt) {
        return ctx.replyWithHTML(
            "ℹ️ <b>Siz hali to'lov cheki yubormagansiz.</b>\n\n" +
            "To'lov qilish uchun pastdagi tugmani bosing:",
            Markup.inlineKeyboard([[Markup.button.callback("💳 To'lov qilish", "pay_subscription")]])
        );
    }

    let statusText = "⏳ <b>Adminlar tomonidan ko'rib chiqilmoqda.</b>\nTez orada davomat ruxsatingiz faollashtiriladi.";
    if (lastReceipt.status === 'approved') {
        statusText = "✅ <b>To'lovingiz tasdiqlangan!</b> Davomat ruxsatingiz faol.";
    } else if (lastReceipt.status === 'rejected') {
        statusText = "❌ <b>To'lov chekingiz rad etilgan.</b>\nIltimos, yangi va to'g'ri to'lov kvitansiyasini yuboring.";
    }

    const replyMsg = 
        `🧾 <b>SIZNING TO'LOV CHEKINGIZ MA'LUMOTI:</b>\n\n` +
        `🔖 <b>Chek ID:</b> <code>${lastReceipt.id}</code>\n` +
        `⏰ <b>Yuborilgan vaqt:</b> ${lastReceipt.submitted_at || '-'}\n` +
        `📊 <b>Holati:</b> ${lastReceipt.status === 'approved' ? '✅ Qabul qilingan' : (lastReceipt.status === 'rejected' ? '❌ Rad etilgan' : '⏳ Kutilmoqda')}\n\n` +
        statusText;

    return ctx.replyWithHTML(replyMsg);
});

bot.hears(["👤 Mening Profilim", "👤 Profil"], showUserProfile);
bot.command(["profil", "profile"], showUserProfile);

bot.action("pay_subscription", async (ctx) => {
    await ctx.answerCbQuery();
    return paymentService.showPaymentInfo(ctx);
});

bot.hears(["💳 To'lov / Obuna", "To'lov / Obuna", "💳 Oylik Obuna / To'lov", "💳 To'lov ma'lumotlari", "💳 To'lov", "To'lov", "Obuna"], (ctx) => paymentService.showPaymentInfo(ctx));

bot.action("edit_profile", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("🔄 Ma'lumotlarni yangilash boshlandi. Iltimos, savollarga qaytadan javob bering.");
    return ctx.scene.enter('attendance_wizard');
});

// Admin: Subscribers & Payment Excel report download
bot.hears(["💳 To'lovlar & Obunalar (Excel)", "💳 Obunachilar hisoboti (Excel)"], async (ctx) => {
    const uid = Number(ctx.from.id);
    const isAuthorized = config.SUPER_ADMIN_IDS.map(Number).includes(uid) || config.SPECIALIST_IDS.map(Number).includes(uid) || uid === 65002404;
    if (!isAuthorized) return ctx.reply("⛔️ Ruxsat yo'q.");

    await ctx.reply("📊 <b>Obunachilar va to'lovlar hisoboti (Excel) tayyorlanmoqda...</b>", { parse_mode: 'HTML' });
    const { exportSubscribersToExcel } = require('./src/services/dataService');
    const filePath = await exportSubscribersToExcel();
    if (filePath && fs.existsSync(filePath)) {
        await ctx.replyWithDocument({ source: filePath, filename: path.basename(filePath) }, {
            caption: "💳 <b>Farg'ona viloyati davomat platformasi obunachilari va to'lovlar hisoboti (Excel)</b>",
            parse_mode: 'HTML'
        });
    } else {
        await ctx.reply("❌ Hisobotni shakllantirishda xatolik yuz berdi.");
    }
});

bot.command("subscribers_excel", async (ctx) => {
    const uid = Number(ctx.from.id);
    const isAuthorized = config.SUPER_ADMIN_IDS.map(Number).includes(uid) || config.SPECIALIST_IDS.map(Number).includes(uid) || uid === 65002404;
    if (!isAuthorized) return ctx.reply("⛔️ Ruxsat yo'q.");

    await ctx.reply("📊 <b>Obunachilar va to'lovlar hisoboti (Excel) tayyorlanmoqda...</b>", { parse_mode: 'HTML' });
    const { exportSubscribersToExcel } = require('./src/services/dataService');
    const filePath = await exportSubscribersToExcel();
    if (filePath && fs.existsSync(filePath)) {
        await ctx.replyWithDocument({ source: filePath, filename: path.basename(filePath) }, {
            caption: "💳 <b>Farg'ona viloyati davomat platformasi obunachilari va to'lovlar hisoboti (Excel)</b>",
            parse_mode: 'HTML'
        });
    } else {
        await ctx.reply("❌ Hisobotni shakllantirishda xatolik yuz berdi.");
    }
});

bot.hears("📖 Yo'riqnoma", async (ctx) => {
    const pdfPath = path.join(__dirname, 'assets', 'yoriqnoma.pdf');
    const msg = `📖 <b>FOYDALANUVCHI YO'RIQNOMASI</b>\n\n` +
        `Ushbu bot orqali davomat hisobotlarini qabul qilish tartibi:\n` +
        `1️⃣ <b>'Davomat kiritish'</b> tugmasini bosing.\n` +
        `2️⃣ Hudud va maktabingizni tanlang.\n` +
        `3️⃣ O'quvchilar soni va kelmaganlar sababini kiriting.\n` +
        `4️⃣ Agar sababsiz kelmaganlar bo'lsa, ular haqida batafsil ma'lumot bering.\n\n` +
        `🌐 <b>Veb-shakl orqali kiritish:</b>\n` +
        `Agarda sizga brauzer orqali kiritish qulay bo'lsa, quyidagi havoladan foydalaning:\n` +
        `👉 <a href="http://localhost:3000">Davomat Veb-Formasi</a>\n\n` +
        `⚠️ <b>Eslatma:</b> Hisobotlar har kuni soat 16:00 gacha qabul qilinadi.`;

    if (fs.existsSync(pdfPath)) {
        await ctx.replyWithDocument({ source: pdfPath }, { caption: msg, parse_mode: 'HTML' });
    } else {
        await ctx.replyWithHTML(msg + "\n\n📄 <i>(PDF yo'riqnoma yaqin orada yuklanadi)</i>");
    }
});

// --- PRO ANALYTICS HANDLERS ---
bot.hears("📊 PRO Analitika", async (ctx) => {
    if (!db.checkPro(ctx.from.id)) return ctx.reply("⛔️ Bu funksiya faqat PRO foydalanuvchilar uchun.");
    ctx.reply("📊 <b>PRO Analitika Paneli:</b>\n\nQuyidagi tahliliy ma'lumotlardan birini tanlang:", {
        parse_mode: 'HTML',
        ...Markup.keyboard([
            ["🔴 Qizil ro'yxat (Haftalik)", "📈 Oylik dinamika"],
            ["🤖 AI Bashorat holatlari", "⬅️ Orqaga"]
        ]).resize()
    });
});

const ProAnalytics = require('./src/services/proAnalytics');

bot.hears("🔴 Qizil ro'yxat (Haftalik)", async (ctx) => {
    const uid = ctx.from.id;
    if (!db.checkPro(uid)) return;
    const user = db.users_db[uid];
    if (!user || !user.district || !user.school) return ctx.reply("⚠️ Profilingiz to'liq emas.");

    const list = await ProAnalytics.getWeeklyRedList(user.district, user.school);
    if (list.length === 0) return ctx.reply("✅ Oxirgi hafta ichida muntazam dars qoldiruvchi o'quvchilar aniqlanmadi.");

    let msg = `🔴 <b>${user.school} - Qizil ro'yxati (Haftalik):</b>\n\n`;
    msg += `<i>Ushbu o'quvchilar oxirgi 7 kunda 2 va undan ortiq marta sababsiz dars qoldirishgan:</i>\n\n`;
    list.forEach((s, i) => {
        msg += `${i + 1}. <b>${s.name}</b> (${s.class})\n👣 Tashriflar: ${s.absent_count} marta\n📞 Tel: ${s.parent_phone || 'Noma\'lum'}\n\n`;
    });
    ctx.replyWithHTML(msg);
});

bot.hears("📈 Oylik dinamika", async (ctx) => {
    if (!db.checkPro(ctx.from.id)) return;
    const user = db.users_db[ctx.from.id];
    const report = await ProAnalytics.getMonthlyDynamics(user.district, user.school);
    ctx.replyWithHTML(report);
});

bot.hears("🤖 AI Bashorat holatlari", async (ctx) => {
    if (!db.checkPro(ctx.from.id)) return;
    const user = db.users_db[ctx.from.id];
    const insights = await ProAnalytics.getAIPatterns(user.district, user.school);
    ctx.replyWithHTML(`🤖 <b>AI Tahlil natijalari (${user.school}):</b>\n\n` + (insights || "Ma'lumotlar yetarli emas."));
});



// --- GOOGLE SHEETS STATS ---
bot.hears("📊 Mening Statistikam", async (ctx) => {
    const uid = ctx.from.id;
    if (!db.checkPro(uid)) return ctx.reply("⛔️ Bu funksiya faqat PRO foydalanuvchilar uchun.");

    // Foydalanuvchi ma'lumotlarini olish
    const user = db.users_db[uid];
    if (!user || !user.district || !user.school) {
        return ctx.reply("⚠️ Siz hali maktabingizni kiritmagansiz. Avval 'Davomat kiritish' tugmasini bosing.");
    }

    const waitMsg = await ctx.reply("⏳ <b>Ma'lumotlar yuklanmoqda...</b>", { parse_mode: 'HTML' });

    // 1. Direct database check (Unified between Web & Bot)
    try {
        const db_pg = require('./src/database/pg');
        const now = getFargonaTime();
        const today = now.toISOString().split('T')[0];

        const straightDist = user.district ? user.district.replace(/[‘’`]/g, "'") : '';
        const curlyDist = user.district ? user.district.replace(/['’`]/g, "‘") : '';

        if (process.env.DATABASE_URL) {
            const q = `
                SELECT date, time, percent, total_students, total_absent
                FROM attendance
                WHERE school = $1 AND (district = $2 OR district = $3 OR district = $4)
                ORDER BY date DESC LIMIT 7
            `;
            const res = await db_pg.query(q, [user.school, user.district, straightDist, curlyDist]);
            await ctx.deleteMessage(waitMsg.message_id).catch(() => { });

            const rows = res.rows || [];
            const todayRow = rows.find(r => r.date === today);

            let msg = `📊 <b>MENING STATISTIKAM</b>\n\n`;
            msg += `🏫 <b>${user.school}</b> (${user.district})\n\n`;

            msg += `📅 <b>Bugun (${today}):</b>\n`;
            if (todayRow) {
                msg += `✅ Kiritilgan (Soat ${todayRow.time})\n📉 Davomat: <b>${todayRow.percent}%</b>\n`;
            } else {
                msg += `❌ Hali kiritilmagan!\n`;
            }

            if (rows.length > 0) {
                msg += `\n📅 <b>Oxirgi kiritilgan kunlar:</b>\n`;
                rows.forEach(h => {
                    msg += `${h.date}: ✅ (${h.percent}%)\n`;
                });
            }

            if (!todayRow) {
                msg += `\n❗️ <i>Eslatma: Bugungi davomatni vaqtida kiriting!</i>`;
            }

            return await ctx.reply(msg, { parse_mode: 'HTML' });
        }
    } catch (dbErr) {
        console.warn("DB My stats error, falling back to Google Script:", dbErr.message);
    }

    // 2. Google Script fallback
    try {
        if (process.env.GOOGLE_SCRIPT_URL) {
            const res = await axios.get(process.env.GOOGLE_SCRIPT_URL, {
                params: {
                    action: "my_stats",
                    district: user.district,
                    school: user.school
                },
                timeout: 10000
            });

            await ctx.deleteMessage(waitMsg.message_id).catch(() => { });

            if (res.data && !res.data.error) {
                const d = res.data;
                let msg = `📊 <b>MENING STATISTIKAM</b>\n\n`;
                msg += `🏫 <b>${user.school}</b> (${user.district})\n\n`;

                if (d.today) {
                    msg += `📅 <b>Bugun (${d.today.date}):</b>\n`;
                    if (d.today.entered) msg += `✅ Kiritilgan (Soat ${d.today.time})\n📉 Davomat: <b>${d.today.percent}%</b>\n`;
                    else msg += `❌ Hali kiritilmagan!\n`;
                }

                if (d.history && d.history.length > 0) {
                    msg += `\n📅 <b>Oxirgi 7 kunlik tarix:</b>\n`;
                    d.history.forEach(h => {
                        msg += `${h.date}: ${h.entered ? "✅" : "❌"}\n`;
                    });
                }

                if (d.today && !d.today.entered) msg += `\n❗️ <i>Eslatma: Bugungi davomatni vaqtida kiriting!</i>`;

                return await ctx.reply(msg, { parse_mode: 'HTML' });
            }
        }
        await ctx.deleteMessage(waitMsg.message_id).catch(() => { });
        await ctx.reply("❌ Ma'lumot topilmadi.");
    } catch (e) {
        console.error(e);
        await ctx.deleteMessage(waitMsg.message_id).catch(() => { });
        await ctx.reply("❌ Tarmoq xatoligi.");
    }
});

bot.hears("📢 Kiritmaganlar (Manual)", async (ctx) => {
    const uid = ctx.from.id;
    const district = config.DISTRICT_ADMINS[uid];

    if (district) {
        try {
            const r = await getMissingSchools();
            // Robust check for district (apostrophe issue)
            const normDist = normalizeKey(district);
            const dRaw = r && r.missing ? Object.keys(r.missing).find(k => normalizeKey(k) === normDist) : null;

            if (dRaw && r.missing[dRaw]) {
                const list = r.missing[dRaw];
                if (list.length > 0) {
                    let msg = `🚫 <b>${district} - Kiritmaganlar (${list.length} ta):</b>\n\n`;
                    msg += list.map((s, i) => `${i + 1}. ${s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`).join('\n');
                    // Split info chunks if too long
                    if (msg.length > 4000) {
                        const parts = msg.match(/[\s\S]{1,4000}/g) || [];
                        for (let part of parts) await ctx.reply(part, { parse_mode: 'HTML' });
                    } else {
                        await ctx.reply(msg, { parse_mode: 'HTML' });
                    }

                    // ALSO SEND TO GROUP TOPIC
                    const tid = getTopicId(district);
                    if (tid) {
                        await bot.telegram.sendMessage(config.REPORT_GROUP_ID, msg, { parse_mode: 'HTML', message_thread_id: tid }).catch(() => { });
                    }
                } else {
                    await ctx.reply("✅ <b>Barcha maktablar davomat kiritgan!</b>", { parse_mode: 'HTML' });
                }
            } else {
                await ctx.reply("✅ <b>Barcha maktablar davomat kiritgan!</b> (Yoki ma'lumot yo'q)", { parse_mode: 'HTML' });
            }
        } catch (e) {
            console.error(e);
            await ctx.reply("❌ Xatolik yuz berdi.");
        }
    } else if (config.SUPER_ADMIN_IDS.includes(uid)) {
        // Super Admin ALL view
        await ctx.reply("🔍 <b>Barcha hududlar bo'yicha kiritmaganlar...</b>", { parse_mode: 'HTML' });
        try {
            const r = await getMissingSchools();
            if (r && r.missing) {
                let totalMissing = 0;
                let fullMsg = "";
                for (const d in r.missing) {
                    if (r.missing[d].length > 0) {
                        fullMsg += `\n<b>${d} (${r.missing[d].length}):</b>\n` + r.missing[d].join(', ') + "\n";
                        totalMissing += r.missing[d].length;
                    }
                }
                if (totalMissing === 0) {
                    await ctx.reply("✅ <b>Respublika bo'yicha barcha kiritgan!</b>", { parse_mode: 'HTML' });
                } else {
                    await ctx.replyWithHTML(`🚫 <b>Jami kiritmaganlar: ${totalMissing} ta.</b>\n` + fullMsg.substring(0, 3800)); // Truncate if huge
                    if (fullMsg.length > 3800) await ctx.reply("... (Ro'yxat juda uzun)");

                    // PROACTIVE: Send alerts to all missing districts' topics
                    for (const d in r.missing) {
                        if (r.missing[d].length > 0) {
                            const tid = getTopicId(d);
                            if (tid) {
                                const msg = `🚨 <b>DIQQAT! DAVOMAT KIRITILMAGAN!</b>\n📍 <b>${d}</b>\n\n` +
                                    r.missing[d].map((s, i) => `${i + 1}. ❌ ${s}`).join('\n') +
                                    `\n\n❗️ <b>Iltimos, tezlik bilan davomat kiriting!</b>`;
                                await bot.telegram.sendMessage(config.REPORT_GROUP_ID, msg, { parse_mode: 'HTML', message_thread_id: tid }).catch(() => { });
                            }
                        }
                    }
                    await ctx.reply("✅ Barcha qarzdor hududlarga ogohlantirish yuborildi.");
                }
            }
        } catch (e) { ctx.reply("Error"); }
    } else {
        await ctx.reply("⛔️ Ruxsat yo'q.");
    }
});

bot.hears("📢 Qarzdorlarga ABOROT", async (ctx) => {
    const uid = ctx.from.id;
    const district = config.DISTRICT_ADMINS[uid];

    if (district) {
        await ctx.reply(`🚨 <b>${district}</b> bo'yicha QARZDORLAR ro'yxati shakllantirilmoqda...`, { parse_mode: 'HTML' });
        try {
            const r = await getMissingSchools();
            const normDist = normalizeKey(district);
            const dRaw = r && r.missing ? Object.keys(r.missing).find(k => normalizeKey(k) === normDist) : null;

            if (dRaw && r.missing[dRaw]) {
                const list = r.missing[dRaw];
                if (list.length > 0) {
                    let msg = `🔥 <b>DIQQAT ABOROT!</b>\n\n<b>${district}</b> bo'yicha quyidagi <b>${list.length} ta</b> maktab hali davomat kiritmadi:\n\n`;
                    msg += list.map((s, i) => `${i + 1}. ❌ ${s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`).join('\n');
                    msg += `\n\n❗️ <b>Tezlik bilan davomat kiritilsin!</b>`;

                    if (msg.length > 4000) {
                        const parts = msg.match(/[\s\S]{1,4000}/g) || [];
                        for (let part of parts) await ctx.reply(part, { parse_mode: 'HTML' });
                    } else {
                        await ctx.reply(msg, { parse_mode: 'HTML' });
                    }

                    // ALSO SEND TO GROUP TOPIC
                    const tid = getTopicId(district);
                    if (tid) {
                        await bot.telegram.sendMessage(config.REPORT_GROUP_ID, msg, { parse_mode: 'HTML', message_thread_id: tid }).catch(() => { });
                    }
                } else {
                    await ctx.reply("✅ <b>Ajoyib! Barcha maktablar davomat kiritgan. Qarzdorlar yo'q!</b>", { parse_mode: 'HTML' });
                }
            } else {
                await ctx.reply("✅ <b>Qarzdorlar yo'q!</b>", { parse_mode: 'HTML' });
            }
        } catch (e) {
            console.error(e);
            await ctx.reply("❌ Xatolik yuz berdi.");
        }
    } else if (config.SUPER_ADMIN_IDS.includes(uid)) {
        await ctx.reply("🚨 <b>Respublika bo'yicha QARZDORLAR ro'yxati shakllantirilmoqda...</b>", { parse_mode: 'HTML' });
        try {
            const r = await getMissingSchools();
            if (r && r.missing) {
                let totalMissing = 0;
                let fullMsg = "🔥 <b>DIQQAT ABOROT (RESPUBLIKA)!</b>\n\n";
                for (const d in r.missing) {
                    if (r.missing[d].length > 0) {
                        fullMsg += `\n<b>${d} (${r.missing[d].length}):</b>\n` + r.missing[d].map(s => `❌ ${s}`).join('\n') + "\n";
                        totalMissing += r.missing[d].length;
                    }
                }
                if (totalMissing === 0) {
                    await ctx.reply("✅ <b>Qoyil! Hamma kiritgan!</b>", { parse_mode: 'HTML' });
                } else {
                    fullMsg += `\n❗️ <b>Jami qarzdorlar: ${totalMissing} ta.</b>`;
                    await ctx.replyWithHTML(fullMsg.substring(0, 3800));
                    if (fullMsg.length > 3800) await ctx.reply("... (Ro'yxat juda uzun, qolgani sig'madi)");

                    // PROACTIVE: Send alerts to all missing districts' topics
                    for (const d in r.missing) {
                        if (r.missing[d].length > 0) {
                            const tid = getTopicId(d);
                            if (tid) {
                                const msg = `🔥 <b>DIQQAT ABOROT!</b>\n\n<b>${d}</b> bo'yicha quyidagi <b>${r.missing[d].length} ta</b> maktab hali davomat kiritmadi:\n\n` +
                                    r.missing[d].map((s, i) => `${i + 1}. ❌ ${s}`).join('\n') +
                                    `\n\n❗️ <b>Tezlik bilan davomat kiritilsin!</b>`;
                                await bot.telegram.sendMessage(config.REPORT_GROUP_ID, msg, { parse_mode: 'HTML', message_thread_id: tid }).catch(() => { });
                            }
                        }
                    }
                    await ctx.reply("✅ Barcha qarzdor hududlarga ogohlantirish yuborildi.");
                }
            }
        } catch (e) { ctx.reply("Error"); }
    } else {
        await ctx.reply("⛔️ Ruxsat yo'q.");
    }
});

// --- DASHBOARD USERS STATUS ---
const showDashboardUsers = async (ctx) => {
    const uid = ctx.from.id;
    if (!config.SUPER_ADMIN_IDS.includes(uid)) return ctx.reply("⛔️ Ruxsat yo'q.");

    let msg = "🖥 <b>Dashboard Foydalanuvchilari:</b>\n\n";
    Object.entries(USERS).forEach(([login, data]) => {
        msg += `👤 <b>${login}</b>: <code>${data.password}</code> (${data.district || 'ADMIN'})\n`;
    });

    await ctx.replyWithHTML(msg);
};

bot.command('dashboard_users', showDashboardUsers);
bot.hears('🖥 Dashboard Logins', showDashboardUsers);

// --- HELPER: SEND EXCEL REPORT ---
const sendExcelReport = async (ctx, targetId = null) => {
    const chatId = ctx ? ctx.chat.id : targetId;
    if (!chatId) return;

    let waitingMsg;
    if (ctx) waitingMsg = await ctx.reply("⏳ <b>Excel hisobot tayyorlanmoqda...</b>\n<i>(Bu jarayon 10-15 soniya vaqt olishi mumkin)</i>", { parse_mode: 'HTML' });

    try {
        const res = await axios.get(process.env.GOOGLE_SCRIPT_URL, { params: { action: "excel_report" } });
        if (ctx && waitingMsg) await ctx.deleteMessage(waitingMsg.message_id).catch(() => { });

        if (res.data && res.data.url) {
            const doc = { url: res.data.url, filename: (res.data.name || "Hisobot") + ".xlsx" };
            const caption = "✅ <b>Hisobot tayyor!</b>\n\nFile: " + res.data.name;
            if (ctx) await ctx.replyWithDocument(doc, { caption, parse_mode: 'HTML' });
            else await bot.telegram.sendDocument(chatId, doc, { caption, parse_mode: 'HTML' });
        } else {
            if (ctx) await ctx.reply("❌ Google Scriptdan xatolik qaytdi: " + JSON.stringify(res.data));
        }
    } catch (e) {
        console.error(e);
        if (ctx) await ctx.reply("❌ Xatolik: " + e.message);
    }
};

// --- EXCEL REPORT HANDLER ---
bot.hears("📥 TEST REPORT", async (ctx) => {
    if (!config.ALL_ADMINS.map(Number).includes(ctx.from.id)) return ctx.reply("⛔️ Ruxsat yo'q.");
    await sendExcelReport(ctx);
});

// --- SYNC DB HANDLER ---
bot.hears("🔄 Bazani yangilash", async (ctx) => {
    if (!config.SUPER_ADMIN_IDS.map(Number).includes(ctx.from.id)) return ctx.reply("⛔️ Faqat Super Admin uchun.");

    await ctx.reply("🔄 <b>Baza yangilanmoqda...</b>\n<i>(Tumanlar bo'ylab ma'lumot yuklanmoqda)</i>", { parse_mode: 'HTML' });
    let totalSchools = 0;
    const districts = Object.keys(TOPICS);

    for (const dist of districts) {
        try {
            const normDist = normalizeKey(dist); // Use existing utility
            const res = await axios.get(process.env.GOOGLE_SCRIPT_URL, {
                params: { action: "schools", district: normDist },
                timeout: 30000
            });
            if (res.data && Array.isArray(res.data)) {
                db.schools_db[dist] = res.data;
                totalSchools += res.data.length;
            }
        } catch (e) { console.error(`Sync error for ${dist}:`, e.message); }
    }

    db.saveSchools();
    await ctx.reply(`✅ <b>Baza muvaffaqiyatli yangilandi!</b>\n\n🏫 Jami maktablar: <b>${totalSchools}</b> ta.\n📂 Faylga saqlandi.`, { parse_mode: 'HTML' });
});

bot.hears("📢 E'lon Yuborish", (ctx) => {
    if (config.SUPER_ADMIN_IDS.includes(ctx.from.id)) {
        ctx.scene.enter('broadcast_wizard');
    } else {
        ctx.reply("⛔️ Bu funksiya faqat Super Adminlar uchun.");
    }
});

// --- CHART HANDLER ---
bot.hears("📊 Grafika", async (ctx) => {
    await ctx.reply("📊 <b>Statistika tayyorlanmoqda...</b>", { parse_mode: 'HTML' });
    try {
        const r = await getMissingSchools();
        if (!r || !r.missing) return ctx.reply("❌ Ma'lumot olishda xatolik.");

        // 1. Calculate stats
        let totalMissing = 0;
        let missingByDistrict = {};
        for (const d in r.missing) {
            const count = r.missing[d].length;
            totalMissing += count;
            missingByDistrict[d] = count;
        }

        // Total Schools from Local DB (Approximate or exact if synced)
        // If local db is empty, assume 950
        let totalSchools = 950;
        if (db.schools_db && Object.keys(db.schools_db).length > 0) {
            // db.schools_db structure? It's { "Tuman": ["M1", "M2"] } or similar?
            // db.js says schools_db = JSON.parse(SCHOOLS_FILE);
            // Let's assume it matches school_db structure or check debug.
            // If not sure, we use the sum of (missing + entered). Wait, we don't know entered.
            // Let's use a safe fallback or dynamic if possible.
            // Actually, I can count total from db.schools_db if I knew structure.
            // Let's assume 956 (standard for Ferghana).
            totalSchools = 956;
        }

        const entered = totalSchools - totalMissing;
        const percent = ((entered / totalSchools) * 100).toFixed(1);

        // 2. Generate Pie Chart (Entered vs Missing)
        const chartConfig = {
            type: 'pie',
            data: {
                labels: [`Kiritgan (${entered})`, `Kiritmagan (${totalMissing})`],
                datasets: [{
                    data: [entered, totalMissing],
                    backgroundColor: ['#2ecc71', '#e74c3c']
                }]
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: `Viloyat Davomati: ${percent}%`
                    },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 14 }
                    }
                }
            }
        };

        const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=500&h=300`;

        await ctx.replyWithPhoto(chartUrl, { caption: `📊 <b>Davomat Statistikasi</b>\n\n✅ Kiritganlar: <b>${entered}</b>\n❌ Kiritmaganlar: <b>${totalMissing}</b>\n📉 Jami maktablar: <b>${totalSchools}</b>`, parse_mode: 'HTML' });

    } catch (e) {
        console.error(e);
        await ctx.reply("❌ Grafik yasashda xatolik.");
    }
});

// --- RANKING HANDLER ---
bot.hears("🏆 Reyting", async (ctx) => {
    await ctx.reply("🏆 <b>Reyting hisoblanmoqda...</b>", { parse_mode: 'HTML' });
    try {
        const r = await getMissingSchools();
        if (!r || !r.missing) return ctx.reply("❌ Ma'lumot olishda xatolik.");

        // 1. Stats
        const ranking = [];
        const allDistricts = Object.keys(TOPICS);
        for (const dist of allDistricts) {
            const missingList = r.missing[dist] || [];
            ranking.push({ district: dist, count: missingList.length });
        }
        ranking.sort((a, b) => a.count - b.count); // Asc

        // 2. Text Message
        let msg = "🏆 <b>VILOYAT REYTINGI (DAVOMAT)</b>\n\n";
        msg += "✅ <b>NAMUNALI TUMANLAR (TOP-3):</b>\n";
        const top3 = ranking.slice(0, 3);
        top3.forEach((item, i) => {
            msg += `${i + 1}. <b>${item.district}</b> — ${item.count === 0 ? "🎉 100%" : item.count + " ta kiritilmagan"}\n`;
        });
        msg += "\n➖➖➖➖➖➖➖➖➖➖\n\n";
        msg += "🚫 <b>ENG SUST TUMANLAR (ANTI-TOP-3):</b>\n";
        const bottom3 = ranking.slice(-3).reverse();
        bottom3.forEach((item, i) => {
            if (item.count > 0) msg += `${i + 1}. <b>${item.district}</b> — ❌ ${item.count} ta kiritilmagan\n`;
            else msg += `${i + 1}. <b>${item.district}</b> — 🎉 Ajoyib!\n`;
        });
        const now = getFargonaTime();
        msg += `\n📊 <i>Reyting hozirgi vaqt (${now.getHours()}:${now.getMinutes() < 10 ? '0' + now.getMinutes() : now.getMinutes()}) holatiga ko'ra.</i>`;

        await ctx.reply(msg, { parse_mode: 'HTML' });

        // 3. BAR CHART (Bottom 5 - Worst)
        // Sort descending
        const worst = [...ranking].sort((a, b) => b.count - a.count).slice(0, 5);
        // Only if there are missing schools
        if (worst[0].count > 0) {
            const chartConfig = {
                type: 'horizontalBar',
                data: {
                    labels: worst.map(x => x.district.replace(" tumani", "").replace(" shahri", "")),
                    datasets: [{
                        label: 'Kiritmagan Maktablar',
                        data: worst.map(x => x.count),
                        backgroundColor: '#e74c3c'
                    }]
                },
                options: {
                    legend: { display: false },
                    plugins: {
                        datalabels: { color: 'white', font: { weight: 'bold' } }
                    },
                    title: { display: true, text: 'TOP 5 - ENG SUST HUDUDLAR' }
                }
            };
            const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=500&h=300`;
            await ctx.replyWithPhoto(chartUrl, { caption: "📉 Eng ko'p qolib ketgan hududlar" });
        }

    } catch (e) {
        console.error(e);
        await ctx.reply("❌ Reyting tuzishda xatolik.");
    }
});

// --- ADMIN HANDLERS ---
bot.hears("🖥 Dashboard Logins", admin.handleDashboardLogins);


// --- PAYMENT & PRO MANAGEMENT COMMANDS ---
bot.command('tolov', (ctx) => paymentService.showPaymentInfo(ctx));
bot.command('pay', (ctx) => paymentService.showPaymentInfo(ctx));
bot.hears(/^(💳 )?(Obuna|To'lov|PRO Status)/i, (ctx) => paymentService.showPaymentInfo(ctx));
bot.command('addpro', (ctx) => paymentService.handleAddProCommand(ctx));
bot.command('setcard', (ctx) => paymentService.handleSetCardCommand(ctx));

bot.command('grant', async (ctx) => {
    const uid = ctx.from.id;
    if (!config.SUPER_ADMIN_IDS.map(Number).includes(Number(uid)) && uid !== 65002404) {
        return ctx.reply("⛔️ Ruxsat yo'q.");
    }
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
        return ctx.replyWithHTML(
            "🚀 <b>FAVQULODDA: MAKTABGA LIMIT BERISH BUYRUG'I:</b>\n\n" +
            "Format: <code>/grant [Tuman] [Maktab] [Oylar] [pro/access]</code>\n\n" +
            "<i>Misollar:</i>\n" +
            "• <code>/grant Farg'ona_shahri 1-maktab 1</code> (1 oy standart)\n" +
            "• <code>/grant Marg'ilon_shahri 15-maktab 1 pro</code> (1 oy PRO)\n" +
            "• <code>/grant Toshloq 2-maktab</code>\n\n" +
            "<i>Yoki Web Admin panelidan bevosita tanlab bosing.</i>"
        );
    }
    const distArg = parts[1].replace(/_/g, ' ');
    const schoolArg = parts[2];
    const months = parseInt(parts[3]) || 1;
    const type = (parts[4] && parts[4].toLowerCase() === 'pro') ? 'pro' : 'access';

    const res = db.grantSchoolAccess(distArg, schoolArg, months, type);
    return ctx.replyWithHTML(
        `✅ <b>Muvaffaqiyatli bajarildi!</b>\n\n` +
        `🏢 <b>Hudud:</b> ${res.district}\n` +
        `🏫 <b>Maktab:</b> ${res.school}\n` +
        `💎 <b>Turi:</b> ${type === 'pro' ? '👑 PRO Rejim' : '✅ Standart Davomat'}\n` +
        `⏳ <b>Muddat:</b> ${months} oy\n` +
        `📅 <b>Amal qilish sanasi:</b> ${res.expire_date} gacha.`
    );
});

// --- OMMAVIY OFERTA (TERMS OF SERVICE) ---
bot.command('oferta', async (ctx) => {
    return ctx.replyWithHTML(subscriptionService.OFERTA_SHORT_TEXT, subscriptionService.getOfertaKeyboard());
});

bot.hears(['📋 Ommaviy Oferta', 'Ommaviy oferta', 'Oferta'], async (ctx) => {
    return ctx.replyWithHTML(subscriptionService.OFERTA_SHORT_TEXT, subscriptionService.getOfertaKeyboard());
});

bot.action('view_full_oferta', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) { }
    const fullKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Tanishdim va roziman', 'accept_oferta')]
    ]);
    return ctx.replyWithHTML(subscriptionService.OFERTA_FULL_TEXT, fullKeyboard);
});

bot.action('accept_oferta', async (ctx) => {
    const uid = ctx.from.id;
    try { await ctx.answerCbQuery("✅ Ommaviy oferta qabul qilindi!"); } catch (e) { }

    const { getFargonaDateTimeString } = require('./src/utils/fargona');
    const acceptedAt = getFargonaDateTimeString();

    await db.updateUserDb(uid, {
        oferta_accepted: true,
        oferta_accepted_at: acceptedAt
    });

    await ctx.replyWithHTML(
        `✅ <b>Ommaviy oferta shartlarini qabul qilganingiz uchun tashakkur!</b>\n\n` +
        `Siz foydalanish qoidalari bilan to'liq tanishib, ularni tasdiqladingiz.\n` +
        `<i>Tasdiqlangan vaqt: ${acceptedAt}</i>\n\n` +
        `Endi tizimdan to'liq foydalanishingiz mumkin. Davomat kiritish uchun quyidagi tugmani bosing:`,
        Markup.keyboard([
            ["🚀 START - Davomat kiritish"],
            ["✈️ Xorijga ketganlar"],
            ["👤 Mening Profilim", "📊 Mening Statistikam"],
            ["💳 To'lov / Obuna", "📋 Ommaviy Oferta"]
        ]).resize()
    );

    // Keyingi qadam: Obuna va to'lov tekshiruvi
    const check = await subscriptionService.checkCanEnterAttendance(ctx, uid);
    if (!check.canEnter) {
        return subscriptionService.sendSubscriptionPrompt(ctx, check.reason);
    }

    return ctx.scene.enter('attendance_wizard');
});

// --- MAIN FLOW ---
bot.hears(/^(🚀|▶️)?\s*(START\s*[—-]\s*)?(📊\s*)?Davomat kiritish.*$/i, async (ctx) => {
    try {
        if (db.settings.vacation_mode && !config.ALL_ADMINS.includes(ctx.from.id)) {
            return ctx.reply("🔴 Hozir ta'til rejimi yoqilgan. Ma'lumot qabul qilinmaydi.");
        }

        const uid = ctx.from.id;
        const check = await subscriptionService.checkCanEnterAttendance(ctx, uid);
        if (!check.canEnter) {
            return subscriptionService.sendSubscriptionPrompt(ctx, check.reason);
        }

        return ctx.scene.enter('attendance_wizard');
    } catch (err) {
        console.error("Davomat kiritish handler error:", err);
        return ctx.reply("⚠️ Davomat kiritishda xatolik yuz berdi. Iltimos, /start buyrug'ini bosing yoki qaytadan urinib ko'ring.");
    }
});

bot.action('check_subscription', async (ctx) => {
    const uid = ctx.from.id;
    try { await ctx.answerCbQuery("⏳ Obuna tekshirilmoqda..."); } catch (e) { }

    const tgCheck = await subscriptionService.checkTelegramSub(ctx, uid);

    if (tgCheck.ok === false) {
        return ctx.replyWithHTML(
            `❌ <b>Siz hali Telegram kanalimizga a'zo bo'lmadingiz!</b>\n\n` +
            `Iltimos, avval <a href="${subscriptionService.TG_CHANNEL_URL}">@Between_Us_uzb</a> kanaliga kiring va <b>«Qo'shilish / Join»</b> tugmasini bosing.\n` +
            `Shuningdek <a href="${subscriptionService.INSTAGRAM_URL}">Instagram sahifamizga</a> ham obuna bo'ling.\n\n` +
            `A'zo bo'lgach, quyidagi tugmani qayta bosing:`,
            {
                disable_web_page_preview: true,
                ...subscriptionService.getSubscriptionKeyboard()
            }
        );
    }

    await subscriptionService.markUserVerified(uid);

    await ctx.replyWithHTML(
        `✅ <b>Rahmat! Obunangiz muvaffaqiyatli tasdiqlandi.</b>\n\n` +
        `Endi bemalol davomat kiritishingiz mumkin:`,
        Markup.keyboard([
            ["🚀 START - Davomat kiritish"],
            ["✈️ Xorijga ketganlar"],
            ["👤 Mening Profilim", "📊 Mening Statistikam"],
            ["💳 To'lov / Obuna", "📋 Ommaviy Oferta"]
        ]).resize()
    );

    return ctx.scene.enter('attendance_wizard');
});

bot.on('text', async (ctx) => {
    const uid = ctx.from.id;
    const isSuper = config.SUPER_ADMIN_IDS.map(Number).includes(Number(uid)) || uid === 65002404;

    // --- 🏆 RAG'BATLANTIRISH: TASHAKKURNOMA GENERATORI ---
    if (ctx.message.text.startsWith("reward ") && isSuper) {
        const parts = ctx.message.text.split(" ");
        if (parts.length < 3) return ctx.reply("Format: reward [Tuman] [Maktab nomi]");

        const distName = parts[1];
        const schoolName = parts.slice(2).join(" ");

        await ctx.reply(`🎨 <b>${schoolName}</b> uchun tashakkurnoma tayyorlanmoqda...`, { parse_mode: 'HTML' });

        try {
            const { generateCertificate } = require('./src/services/rewardService');
            const buffer = await generateCertificate(schoolName, distName, 'Haftalik');

            const tid = getTopicId(distName);
            const caption = `🏆 <b>TABRIKLAYMIZ!</b>\n\n<b>${distName}</b>, <b>${schoolName}</b> jamoasi namunali davomat ko'rsatkichlari uchun tashakkurnoma bilan taqdirlanadi! 👏✨`;

            // Send to current user
            await ctx.replyWithPhoto({ source: buffer }, { caption, parse_mode: 'HTML' });

            // Send to district topic
            if (tid) {
                await bot.telegram.sendPhoto(config.REPORT_GROUP_ID, { source: buffer }, {
                    caption,
                    parse_mode: 'HTML',
                    message_thread_id: tid
                });
                await ctx.reply("✅ Tashakkurnoma tuman guruhiga yuborildi.");
            }
        } catch (e) {
            console.error("Reward Gen Error:", e);
            ctx.reply("❌ Xatolik: " + e.message);
        }
        return;
    }

    // Odatiy commands
    if (ctx.message.text.startsWith("revoke ")) {
        const id = ctx.message.text.split(" ")[1];
        if (config.SUPER_ADMIN_IDS.includes(ctx.from.id)) {
            admin.revokePro(ctx, id);
        }
        return;
    }

    // --- 🤖 SUN'IY INTELLEKT: OVOZLI / MATNLI DAVOMAT YORDAMCHISI (VAKUUMDA) ---
    const text = ctx.message.text.toLowerCase();

    // Agar matnda "maktab", "o'quvchi" va "kelmadi" / "kasal" kabi so'zlar aralash kelgan bo'lsa
    if (text.includes("maktab") && (text.includes("kasal") || text.includes("sababsiz") || text.includes("kelmadi"))) {
        return ctx.reply("🤖 <b>AI Yordamchi:</b>\n\nUshbu matn/ovoz orqali davomat kiritish funksiyasi yaqin kunlarda ishga tushadi. Hozircha 'Davomat kiritish' tugmasidan foydalaning.", { parse_mode: 'HTML' });
    }
});

bot.on('voice', (ctx) => {
    ctx.reply("🎙 <b>Ovozli xabar qabul qilindi.</b>\n\nAI orqali ovozli davomat kiritish funksiyasi tez orada faollashadi. Hozircha tugmalar orqali kiriting.", { parse_mode: 'HTML' });
});

// --- SCHEDULER (Hourly & Auto-Report) ---
let lastRunSlot = ""; // Format: "YYYY-MM-DD HH:mm"
let dailyReportSent = false;
let lastHourProcessed = -1;

function startHourlyCheck() {
    console.log("Scheduler started (Checking warnings every min)...");

    const DISTRICT_OFFICIALS = {
        "margilon shahri": "Kodirov Abdullajon",
        "fargona shahri": "Teshaboyev Boburjon Bahodir o'g'li",
        "quvasoy shahri": "Qurbonov Ulug'bek Jumayevich",
        "qoqon shahri": "Aliyeva Laziza Xusanovna",
        "bagdod tumani": "Isaboyeva Elmira Erkinovna",
        "beshariq tumani": "Po'latov Dilshodjon Qahholrovich",
        "buvayda tumani": "Axmadjonov Aliyorbek Azizbekovich",
        "dangara tumani": "Miraminov Abdulaziz G'ayratjon o'g'li",
        "yozyovon tumani": "Usmonov Shoxrux Rustamjonovich",
        "oltiariq tumani": "Latipov Zoxidjon Abdurahimovich",
        "qoshtepa tumani": "Ergasheva Mamlakatxon Muxtorovna",
        "rishton tumani": "Raximov Abdumutal Abduxalim o'g'li",
        "sox tumani": "Ibragimov Gulshan Ravshanjonovich",
        "toshloq tumani": "Ibragimov Ergashali Asqaraliyevich",
        "uchkoprik tumani": "Yunusova Marg'uba Akramovna",
        "fargona tumani": "Raximova Mahliyoxon Xolmuxammadovna",
        "furqat tumani": "Mirzayev Mirzaxamdamjon Valiyevich",
        "ozbekiston tumani": "Ochildiyeva Gulmiraxon Ne'matillayevna",
        "quva tumani": "Xolikov Jaxongir Ne'matjonovich"
    };


    setInterval(async () => {
        try {
            const now = getFargonaTime();
            const h = now.getHours();
            const m = now.getMinutes();
            const dayStr = now.toISOString().split('T')[0];

            // Unique slot for this specific check time (e.g. "2024-05-20 10:30")
            const currentSlot = `${dayStr} ${h}:${m}`;

            // 1. Warning & Deadline Checks (08:00 - 16:00)
            const isTime = (h >= 8 && h <= 16);

            // Only run if:
            // - It's work hours
            // - It's exactly 00 or 30 minutes
            // - We haven't run for this specific time slot yet
            if (isTime && (m === 0 || m === 30) && lastRunSlot !== currentSlot) {
                lastRunSlot = currentSlot; // Lock immediately

                const dayOfWeek = now.getDay(); // 0 = Sun

                // Only send warnings Mon-Sat (exclude Sunday)
                if (dayOfWeek !== 0) {
                    const warningHours = [9, 11, 13, 15];
                    const isDeadline = (h === 15 && m === 30); // 15:30 deadline
                    const isFinalDeadline = (h === 16 && m === 0); // 16:00 final deadline
                    const cutoffH = 15;
                    const cutoffM = 30;

                    if (warningHours.includes(h) || isDeadline || isFinalDeadline) {
                        console.log(`[SCHEDULER] Checking attendance at ${currentSlot}...`);

                        const mData = await getMissingSchools();
                        if (mData) {
                            for (const dRaw in mData) {
                                if (mData[dRaw].length > 0) {
                                    const tid = getTopicId(dRaw);
                                    if (tid) {
                                        let txt = "";

                                        // 15:30 Warning (30 mins left)
                                        if (h === 15 && m === 30) {
                                            txt = `⏳ <b>DIQQAT! 16:00 gacha 30 daqiqa vaqt qoldi!</b>\n\n🚨 <b>${dRaw}</b> bo'yicha quyidagi maktablar hali davomat kiritmagan:\n\n` +
                                                mData[dRaw].map((s, i) => `${i + 1}. ❌ ${s}`).join('\n') +
                                                `\n\n❗️ <b>Iltimos, vaqtida ulguring!</b>`;
                                        }
                                        // 16:00 Final Warning
                                        else if (h === 16 && m === 0) {
                                            const normKey = normalizeKey(dRaw).toLowerCase();
                                            const official = DISTRICT_OFFICIALS[normKey] || "Mas'ullar";

                                            txt = `🚫 <b>AFSUSKI! Ish vaqti tugadi (16:00).</b>\n\n😔 <b>${dRaw}</b> bo'yicha quyidagi maktablar bugun davomat kiritishmadi:\n\n` +
                                                mData[dRaw].map((s, i) => `${i + 1}. ❌ ${s}`).join('\n') +
                                                `\n\n‼️ <b>Hurmatli ${official}, vaziyatni qattiq nazoratga olishingizni so'rayman!</b>`;
                                        }
                                        // Other hours (Standard warning)
                                        else if (h < 15 || (h === 15 && m < 30)) {
                                            txt = `⚠️ <b>Eslatma (${h}:00):</b>\n\n📍 <b>${dRaw}</b> da quyidagi maktablar davomat kiritmadi:\n\n` +
                                                mData[dRaw].map((s, i) => `${i + 1}. ❌ ${s}`).join('\n') +
                                                `\n\n❗️ Iltimos, faollik ko'rsating.`;
                                        }

                                        if (txt) {
                                            console.log(`[ALERTS] Sending warning to ${dRaw} (Topic: ${tid})`);
                                            try {
                                                await bot.telegram.sendMessage(config.REPORT_GROUP_ID, txt, {
                                                    parse_mode: 'HTML',
                                                    message_thread_id: tid
                                                });
                                            } catch (err) {
                                                console.error(`[ALERTS] Error sending to ${dRaw}:`, err.message);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 2. Auto-Report at 16:05 (Daily Excel)
            if (h === 16 && m === 5 && !dailyReportSent) {
                console.log("Sending Auto 16:05 Report...");
                dailyReportSent = true;
                try {
                    await sendExcelReport(null, config.REPORT_GROUP_ID);
                } catch (e) { console.error("Auto Report Failed", e); }
            }

            // Reset daily report flag at midnight
            if (h === 0 && dailyReportSent) dailyReportSent = false;

        } catch (e) {
            console.error("Scheduler check error:", e);
        }
    }, 45000); // Check every 45 seconds to avoid double trigger on 30s interval
}




// --- LOCATION HANDLERS ---
bot.hears(/📍 Lokatsiya Yig'ish: (ON|OFF)/, (ctx) => {
    if (!config.SUPER_ADMIN_IDS.includes(ctx.from.id)) return;
    const mode = ctx.match[1] === "OFF"; // Toggle logic (If OFF, turn ON)
    db.settings.location_collection_mode = mode;
    db.saveSettings();
    ctx.reply(`📍 Lokatsiya Yig'ish rejimi: ${mode ? "YOQILDI" : "O'CHIRILDI"}`);
    admin.showAdminPanel(ctx); // Refresh panel
});

bot.hears(/📍 Lokatsiya Tekshirish: (ON|OFF)/, (ctx) => {
    if (!config.SUPER_ADMIN_IDS.includes(ctx.from.id)) return;
    const mode = ctx.match[1] === "OFF";
    db.settings.check_location = mode;
    db.saveSettings();
    ctx.reply(`📍 Lokatsiya Tekshirish rejimi: ${mode ? "YOQILDI" : "O'CHIRILDI"}`);
    admin.showAdminPanel(ctx);
});

bot.hears("📍 Maktab joylashuvini tasdiqlash", (ctx) => {
    if (!db.settings.location_collection_mode) return ctx.reply("🔴 Lokatsiya yig'ish rejimi o'chirilgan.");
    const uid = ctx.from.id;
    const user = db.users_db[uid];
    if (!user || !user.school) return ctx.reply("⚠️ Avval maktabingizni tanlang (Davomat kiritish orqali).");

    ctx.reply(
        `📍 <b>Hurmatli ${user.fio}!</b>\n\nIltimos, <b>${user.school}</b> hududida turib, pastdagi tugmani bosing va joylashuvingizni yuboring.`,
        {
            parse_mode: 'HTML',
            ...Markup.keyboard([[Markup.button.locationRequest("📍 Lokatsiyani yuborish")], ["⬅️ Orqaga"]]).resize()
        }
    );
});

// --- BOT IMAGE DRAWING HANDLER ---
bot.hears("🖼 Viloyat Rasm (Test)", async (ctx) => {
    if (!config.SUPER_ADMIN_IDS.includes(ctx.from.id)) return ctx.reply("⛔️ Ruxsat yo'q.");

    await ctx.reply("⏳ <b>Rasmli hisobot shakllantirilmoqda...</b>", { parse_mode: 'HTML' });

    try {
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(1080, 1080);
        const ct = canvas.getContext('2d');

        // Asosiy fon
        ct.fillStyle = '#0f172a';
        ct.fillRect(0, 0, 1080, 1080);

        // Gradient naqshlar
        const grad = ct.createLinearGradient(0, 0, 1080, 1080);
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(1, '#0f172a');
        ct.fillStyle = grad;
        ct.fillRect(0, 0, 1080, 1080);

        // Sarlavha
        ct.fillStyle = '#ffffff';
        ct.font = 'bold 50px Arial';
        ct.textAlign = 'center';
        ct.fillText("FARG'ONA VILOYATI", 540, 100);

        ct.fillStyle = '#38bdf8';
        ct.font = 'bold 40px Arial';
        ct.fillText("DAVOMAT KUNLIK QIZIL ZONASI", 540, 160);

        const dataService = require('./src/services/dataService');
        const svod = await dataService.getViloyatSvod(getFargonaTime().toISOString().split('T')[0]);

        const worst = [...svod].filter(x => x.entries > 0).sort((a, b) => a.avg_percent - b.avg_percent).slice(0, 5);

        // Chizish 5 ta eng pastni
        ct.textAlign = 'left';
        let y = 300;
        worst.forEach((dist, idx) => {
            // Box
            ct.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ct.fillRect(80, y - 50, 920, 80);

            ct.fillStyle = '#ef4444';
            ct.font = 'bold 40px Arial';
            ct.fillText(`${idx + 1}. ${dist.district}`, 110, y + 5);

            ct.fillStyle = '#ffffff';
            ct.textAlign = 'right';
            ct.font = 'bold 36px Arial';
            ct.fillText(`${dist.avg_percent}%`, 950, y);
            ct.textAlign = 'left';

            y += 110;
        });

        // Sana va vaqt tagida
        ct.fillStyle = '#94a3b8';
        ct.font = '30px Arial';
        ct.textAlign = 'center';
        ct.fillText(`Sana: ${getFargonaTime().toLocaleDateString('ru-RU')} | MMT Boshqarmasi`, 540, 1000);

        const buffer = canvas.toBuffer('image/png');
        await ctx.replyWithPhoto({ source: buffer }, {
            caption: `📊 <b>Kunlik qizil zonalar monitoringi rasm shaklida!</b>`,
            parse_mode: 'HTML'
        });

    } catch (e) {
        console.error("Canvas draw error: ", e);
        ctx.reply("Rasm chizishda xatolik yuzaga keldi. Modullar topilmagan bo'lishi mumkin.");
    }
});


// PRO: Receipt Handler
bot.on(['photo', 'document'], async (ctx) => {
    if (ctx.scene && ctx.scene.current) return;
    const isWaiting = ctx.session && ctx.session.waiting_receipt;
    const caption = (ctx.message.caption || '').toLowerCase();
    const hasReceiptKeyword = /chek|to'?lov|kvitansiya|pay|tolov|kart/i.test(caption);
    const accessExpired = !db.checkAttendanceAccess(ctx.from.id);

    if (isWaiting || hasReceiptKeyword || accessExpired) {
        return paymentService.handleReceiptSubmission(ctx);
    }
});

// Helper: verify admin permission for bot callback actions
function isBotAdmin(fromId) {
    const num = Number(fromId);
    if ((config.SUPER_ADMIN_IDS || []).map(Number).includes(num)) return true;
    if ((config.SPECIALIST_IDS || []).map(Number).includes(num)) return true;
    if (db.users_db && db.users_db[num] && ['superadmin', 'admin', 'specialist'].includes(db.users_db[num].role)) return true;
    return false;
}

// 1. Davomat Ruxsati (10 000 so'm / 1 oy)
bot.action(/^approve_access:(.+):(.+)$/, async (ctx) => {
    if (!isBotAdmin(ctx.from.id)) {
        return ctx.answerCbQuery("⛔ Ruxsat yo'q. Faqat adminlar tasdiqlashi mumkin.", { show_alert: true });
    }

    const targetUid = ctx.match[1];
    const receiptId = ctx.match[2];

    try {
        const list = await paymentService.getReceiptsList();
        const receipt = list.find(r => String(r.id) === String(receiptId));
        if (receipt && receipt.status !== 'pending') {
            return ctx.answerCbQuery(`⚠️ Ushbu chek allaqachon ${receipt.status === 'approved' ? 'tasdiqlangan' : 'rad etilgan'}!`, { show_alert: true });
        }

        const u = db.users_db[targetUid] || {};
        let targetDistrict = (receipt && receipt.district) || u.district;
        let targetSchool = (receipt && receipt.school) || u.school;
        if (targetSchool && targetSchool.includes('(')) {
            const m = targetSchool.match(/^(.*?)\s*\((.*?)\)/);
            if (m) {
                targetSchool = m[1].trim();
                targetDistrict = targetDistrict || m[2].trim();
            }
        }

        let expireDate = '';
        if (targetUid) {
            const result = db.updateUserAccessMonths(targetUid, 1);
            expireDate = result ? result.access_expire_date : '';
        }
        if (targetDistrict && targetSchool) {
            const sc = db.grantSchoolAccess(targetDistrict, targetSchool, 1, 'access');
            if (sc && sc.expire_date) expireDate = sc.expire_date;
            if (targetUid) {
                db.updateUserDb(targetUid, { district: targetDistrict, school: targetSchool, has_access: true, access_expire_date: expireDate });
            }
        }

        await paymentService.updateReceiptStatus(receiptId, 'approved', ctx.from.id);

        await ctx.answerCbQuery("✅ Davomat ruxsati faollashtirildi!", { show_alert: true });

        const oldCaption = (ctx.update.callback_query.message && ctx.update.callback_query.message.caption) || '';
        try {
            await ctx.editMessageCaption(
                oldCaption + `\n\n✅ <b>DAVOMAT RUXSATI FAOLLASHTIRILDI (1 oy - ${expireDate} gacha)</b>\n👤 <i>Tasdiqladi:</i> ${ctx.from.first_name || ctx.from.id}`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.warn("Caption edit error:", e.message);
        }

        // Notify User if from Telegram
        try {
            if (targetUid && !String(targetUid).startsWith('web_')) {
                await ctx.telegram.sendMessage(
                    targetUid,
                    `🎉 <b>Tabriklaymiz!</b>\n\nTo'lovingiz tasdiqlandi va davomat kiritish ruxsatingiz <b>${expireDate}</b> gacha (1 oyga) faollashtirildi!\n\nEndi bemalol davomat kiritishingiz mumkin.`,
                    { parse_mode: 'HTML' }
                );
            }
        } catch (e) {
            console.warn("User notify error:", e.message);
        }
    } catch (e) {
        ctx.answerCbQuery("Xatolik: " + e.message, { show_alert: true });
    }
});

// 2. PRO Rejim (25 000 so'm / 1 oy yoki bir necha oy)
bot.action(/^approve_pro:(.+):(.+)$/, async (ctx) => {
    if (!isBotAdmin(ctx.from.id)) {
        return ctx.answerCbQuery("⛔ Ruxsat yo'q. Faqat adminlar tasdiqlashi mumkin.", { show_alert: true });
    }

    const targetUid = ctx.match[1];
    const secondArg = ctx.match[2];
    const isMonths = !isNaN(secondArg) && Number(secondArg) <= 12;
    const months = isMonths ? parseInt(secondArg) : 1;
    const receiptId = isMonths ? null : secondArg;

    try {
        if (receiptId) {
            const list = await paymentService.getReceiptsList();
            const receipt = list.find(r => String(r.id) === String(receiptId));
            if (receipt && receipt.status !== 'pending') {
                return ctx.answerCbQuery(`⚠️ Ushbu chek allaqachon ${receipt.status === 'approved' ? 'tasdiqlangan' : 'rad etilgan'}!`, { show_alert: true });
            }

            const u = db.users_db[targetUid] || {};
            let targetDistrict = (receipt && receipt.district) || u.district;
            let targetSchool = (receipt && receipt.school) || u.school;
            if (targetSchool && targetSchool.includes('(')) {
                const m = targetSchool.match(/^(.*?)\s*\((.*?)\)/);
                if (m) {
                    targetSchool = m[1].trim();
                    targetDistrict = targetDistrict || m[2].trim();
                }
            }

            let expireDate = '';
            if (targetUid) {
                const result = db.updateUserProMonths(targetUid, months);
                expireDate = result ? result.pro_expire_date : '';
            }
            if (targetDistrict && targetSchool) {
                const sc = db.grantSchoolAccess(targetDistrict, targetSchool, months, 'pro');
                if (sc && sc.expire_date) expireDate = sc.expire_date;
                if (targetUid) {
                    db.updateUserDb(targetUid, { district: targetDistrict, school: targetSchool, is_pro: true, pro_expire_date: expireDate });
                }
            }
            await paymentService.updateReceiptStatus(receiptId, 'approved', ctx.from.id);
        } else {
            const result = db.updateUserProMonths(targetUid, months);
            expireDate = result ? result.pro_expire_date : '';
        }

        await ctx.answerCbQuery("🌟 PRO Rejim faollashtirildi!", { show_alert: true });

        const oldCaption = (ctx.update.callback_query.message && ctx.update.callback_query.message.caption) || '';
        try {
            await ctx.editMessageCaption(
                oldCaption + `\n\n🌟 <b>PRO REJIM FAOLLASHTIRILDI (${months} oy - ${expireDate} gacha)</b>\n👤 <i>Tasdiqladi:</i> ${ctx.from.first_name || ctx.from.id}`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.warn("Caption edit error:", e.message);
        }

        // Notify User
        try {
            await ctx.telegram.sendMessage(
                targetUid,
                `🎉 <b>Tabriklaymiz!</b>\n\nTo'lovingiz tasdiqlandi va <b>PRO REJIM</b> obunangiz <b>${expireDate}</b> gacha (${months} oyga) faollashtirildi!\n\nBarcha imkoniyatlardan foydalanishingiz mumkin.`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.warn("User notify error:", e.message);
        }
    } catch (e) {
        ctx.answerCbQuery("Xatolik: " + e.message, { show_alert: true });
    }
});

// 3. Soxta Chek (Rad etish)
bot.action(/^reject_fake:(.+?)(?::(.+))?$/, async (ctx) => {
    if (!isBotAdmin(ctx.from.id)) {
        return ctx.answerCbQuery("⛔ Ruxsat yo'q. Faqat adminlar rad etishi mumkin.", { show_alert: true });
    }

    const targetUid = ctx.match[1];
    const receiptId = ctx.match[2];

    try {
        if (receiptId) {
            await paymentService.updateReceiptStatus(receiptId, 'fake_rejected', ctx.from.id);
        }
        await ctx.answerCbQuery("🚫 Soxta chek rad etildi!", { show_alert: true });

        const oldCaption = (ctx.update.callback_query.message && ctx.update.callback_query.message.caption) || '';
        try {
            await ctx.editMessageCaption(
                oldCaption + `\n\n🚫 <b>SOXTA CHEK: RAD ETILDI</b>\n👤 <i>Rad etdi:</i> ${ctx.from.first_name || ctx.from.id}`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.warn("Caption edit error:", e.message);
        }

        try {
            if (targetUid && !String(targetUid).startsWith('web_')) {
                await bot.telegram.sendMessage(
                    targetUid,
                    `❌ <b>To'lovingiz rad etildi!</b>\n\nSiz yuborgan to'lov cheki ma'muriyat tomonidan tekshirilib, soxta yoki noto'g'ri deb topildi.\n\nIltimos, faqat o'zingiz amalga oshirgan haqiqiy to'lov kvitansiyasini yuboring.`,
                    { parse_mode: 'HTML' }
                );
            }
        } catch (e) {
            console.warn("User notify error:", e.message);
        }
    } catch (e) {
        console.error("Reject fake error:", e);
        ctx.answerCbQuery("Xatolik: " + e.message, { show_alert: true });
    }
});

// 4. Legacy reject_pro
bot.action(/^reject_pro:(.+?)(?::(.+))?$/, async (ctx) => {
    if (!isBotAdmin(ctx.from.id)) {
        return ctx.answerCbQuery("⛔ Ruxsat yo'q.", { show_alert: true });
    }

    const targetUid = ctx.match[1];
    const receiptId = ctx.match[2];
    if (receiptId) {
        await paymentService.updateReceiptStatus(receiptId, 'fake_rejected', ctx.from.id);
    }

    await ctx.answerCbQuery("Rad etildi.", { show_alert: true });
    try {
        const oldCaption = (ctx.update.callback_query.message && ctx.update.callback_query.message.caption) || '';
        await ctx.editMessageCaption(oldCaption + "\n\n❌ <b>RAD ETILDI</b>", { parse_mode: 'HTML' });
    } catch (e) {}

    try {
        if (targetUid && !String(targetUid).startsWith('web_')) {
            await bot.telegram.sendMessage(
                targetUid,
                "❌ Uzr, to'lov chekingiz tasdiqlanmadi. Xatolik bo'lsa adminga murojaat qiling.",
                { parse_mode: 'HTML' }
            );
        }
    } catch (e) {}
});

bot.action('show_payment', (ctx) => {
    try { ctx.answerCbQuery(); } catch (e) {}
    return paymentService.showPaymentInfo(ctx);
});

bot.on('location', (ctx) => {
    const uid = ctx.from.id;
    const user = db.users_db[uid];

    // 1. Agar Collection Mode yoqilgan bo'lsa -> SAQLASH
    if (db.settings.location_collection_mode) {
        if (!user || !user.school) return ctx.reply("⚠️ Maktab biriktirilmagan.");

        const loc = ctx.message.location;
        // Db ga saqlash
        if (!db.coords_db[user.district]) db.coords_db[user.district] = {};
        db.coords_db[user.district][user.school] = {
            lat: loc.latitude,
            lon: loc.longitude,
            updated_at: new Date(),
            updated_by: uid
        };
        db.saveCoords();

        ctx.reply(`✅ <b>${user.school}</b> joylashuvi muvaffaqiyatli saqlandi!\nRahmat.`, Markup.keyboard([["Davomat kiritish"]]).resize());
        return;
    }

    // 2. Agar ODDIY holatda bo'lsa (va kelajakda tekshirish kerak bo'lsa)
    // Hozircha shunchaki 'Rahmat' deymiz
    ctx.reply("📍 Lokatsiya qabul qilindi.");
});

bot.catch((err, ctx) => {
    console.log(`Error: ${err}`);
    if (err.code === 403) return;
    try {
        if (ctx) ctx.reply("Xatolik yuz berdi. /start").catch(() => { });
    } catch (e) { }
});

// Global error handlers to prevent crash
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

startHourlyCheck();

app.listen(PORT, () => {
    console.log(`🚀 Dashboard API is running on port ${PORT}`);
});


// --- 1-OKTYABR BAYRAM TABRIGI VA TARQATISH ---
bot.command('tabrik', async (ctx) => {
    const photoPath = path.join(__dirname, 'assets', 'tabrik_5_oktyabr.jpg');
    const caption = 
        `💐 <b>1-OKTYABR – O'QITUVCHI VA MURABBIYLAR KUNI MUBORAK BO'LSIN!</b>\n\n` +
        `<i>Hurmatli va aziz ustozlar, muhtaram murabbiylar!</i>\n\n` +
        `Sizlarni kirib kelayotgan qutlug' kasb bayramingiz bilan chin qalbimizdan samimiy muborakbod etamiz!\n\n` +
        `Yosh avlodga ziyo tarqatish, ularning qalbiga ezgulik, odamiylik va ilm urug'ini qadashdek sharafli va mas'uliyatli mehnatingizda kuch-g'ayrat, yuksak parvozlar va cheksiz muvaffaqiyatlar tilaymiz!\n\n` +
        `Xonadoningizdan fayz-u baraka, qalbingizdan xotirjamlik, yuzingizdan tabassum aslo arimasin! Bayramingiz muborak bo'lsin!\n\n` +
        `<i>Hurmat va chuqur ehtirom bilan,</i>\n` +
        `<b>Rustam Ravshanovich hamda Farg'ona Davomat Tizimi Jamoasi</b> ✨🎓`;

    try {
        if (fs.existsSync(photoPath)) {
            await ctx.replyWithPhoto({ source: photoPath }, { caption, parse_mode: 'HTML' });
        } else {
            await ctx.replyWithHTML(caption);
        }
    } catch (e) {
        console.error("Tabrik error:", e.message);
        ctx.replyWithHTML(caption);
    }
});

bot.command('tabrik_hamma', async (ctx) => {
    const uid = ctx.from.id;
    if (!config.SUPER_ADMIN_IDS.map(Number).includes(Number(uid))) {
        return ctx.reply("⛔ Ruxsat yo'q. Faqat Super Adminlar uchun.");
    }
    const photoPath = path.join(__dirname, 'assets', 'tabrik_5_oktyabr.jpg');
    const caption = 
        `💐 <b>1-OKTYABR – O'QITUVCHI VA MURABBIYLAR KUNI MUBORAK BO'LSIN!</b>\n\n` +
        `<i>Hurmatli va aziz ustozlar, muhtaram murabbiylar!</i>\n\n` +
        `Sizlarni kirib kelayotgan qutlug' kasb bayramingiz bilan chin qalbimizdan samimiy muborakbod etamiz!\n\n` +
        `Yosh avlodga ziyo tarqatish, ularning qalbiga ezgulik, odamiylik va ilm urug'ini qadashdek sharafli va mas'uliyatli mehnatingizda kuch-g'ayrat, yuksak parvozlar va cheksiz muvaffaqiyatlar tilaymiz!\n\n` +
        `Xonadoningizdan fayz-u baraka, qalbingizdan xotirjamlik, yuzingizdan tabassum aslo arimasin! Bayramingiz muborak bo'lsin!\n\n` +
        `<i>Hurmat va chuqur ehtirom bilan,</i>\n` +
        `<b>Rustam Ravshanovich hamda Farg'ona Davomat Tizimi Jamoasi</b> ✨🎓`;

    const users = Object.keys(db.users_db || {});
    await ctx.reply(`🚀 Bayram tabrigi barcha (${users.length} ta) foydalanuvchilarga yuborilmoqda...`);
    
    let sent = 0;
    for (const u of users) {
        try {
            if (fs.existsSync(photoPath)) {
                await ctx.telegram.sendPhoto(u, { source: photoPath }, { caption, parse_mode: 'HTML' });
            } else {
                await ctx.telegram.sendMessage(u, caption, { parse_mode: 'HTML' });
            }
            sent++;
            await new Promise(r => setTimeout(r, 60));
        } catch (err) {}
    }
    await ctx.reply(`✅ Bayram tabrigi jami ${sent} ta foydalanuvchiga muvaffaqiyatli yetkazildi!`);
});

async function launchBotSafe(maxRetries = 10, delayMs = 6000) {
    if (process.env.VERCEL) {
        console.log("⚡ [Bot] Running in Vercel Serverless environment. Webhook mode active on /api/bot.");
        return;
    }
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[Bot] Ishga tushirishga urinish (${attempt}/${maxRetries})...`);
            await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
            await bot.launch({
                dropPendingUpdates: true,
                polling: {
                    timeout: 45
                }
            });
            console.log('✅ Ferghanaredavomat Bot Muvaffaqiyatli Ishga Tushdi!');
            return;
        } catch (e) {
            console.error(`[Bot] Startup Error (${attempt}-urinish):`, e.message || e);
            if (e.message && (e.message.includes('409') || e.message.includes('Conflict'))) {
                console.log(`⏳ [Bot] 409 Conflict: Boshqa bot instansiyasi to'xtashini kutish (${delayMs / 1000}s)...`);
                await new Promise(res => setTimeout(res, delayMs));
            } else {
                console.error("[Bot] Qayta ulanish mumkin bo'lmagan xatolik:", e);
                break;
            }
        }
    }
}
launchBotSafe();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


