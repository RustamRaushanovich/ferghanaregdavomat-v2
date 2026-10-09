const fs = require('fs');
const path = require('path');
const pg = require('./pg');

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const USERS_DB_FILE = path.join(__dirname, 'users_db.json');
const PROMO_FILE = path.join(__dirname, 'promocodes.json');
const SCHOOLS_FILE = path.join(__dirname, 'schools.json');
const COORDS_FILE = path.join(__dirname, 'coords.json');

let settings = { vacation_mode: false, location_collection_mode: false, check_location: false, maintenance_mode: false, bypass_payment_check: false, academic_year: '2026-2027' };
let users_db = {};
let promocodes = {};
let schools_db = {};
let coords_db = {};

async function loadAll() {
    try { if (fs.existsSync(SETTINGS_FILE)) settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE)) }; } catch (e) { }
    try { if (fs.existsSync(USERS_DB_FILE)) users_db = JSON.parse(fs.readFileSync(USERS_DB_FILE)); } catch (e) { }
    try { if (fs.existsSync(PROMO_FILE)) promocodes = JSON.parse(fs.readFileSync(PROMO_FILE)); } catch (e) { }
    try { if (fs.existsSync(SCHOOLS_FILE)) schools_db = JSON.parse(fs.readFileSync(SCHOOLS_FILE)); } catch (e) { }
    try { if (fs.existsSync(COORDS_FILE)) coords_db = JSON.parse(fs.readFileSync(COORDS_FILE)); } catch (e) { }

    // Backup from PostgreSQL
    try {
        const res = await pg.query('SELECT id, data FROM tg_users');
        res.rows.forEach(row => {
            users_db[row.id] = { ...users_db[row.id], ...row.data };
        });
        const sRes = await pg.query('SELECT value FROM settings WHERE key = $1', ['global']);
        if (sRes.rows.length > 0) settings = { ...settings, ...sRes.rows[0].value };
        console.log(`📡 Synced ${res.rows.length} users from Supabase.`);

        // Auto-heal active subscriptions from approved payment receipts
        try {
            const { normalizeKey } = require('../utils/topics');
            const rRes = await pg.query("SELECT * FROM payment_receipts WHERE status = 'approved' ORDER BY submitted_at ASC");
            if (rRes && rRes.rows && rRes.rows.length > 0) {
                const now = new Date();
                rRes.rows.forEach(r => {
                    const rawDate = r.submitted_at || r.resolved_at;
                    const subDate = rawDate ? new Date(String(rawDate).replace(' ', 'T')) : now;
                    const diffDays = (now - subDate) / (1000 * 60 * 60 * 24);
                    if (isNaN(diffDays) || diffDays <= 35) {
                        const expD = new Date(subDate);
                        expD.setDate(expD.getDate() + 30);
                        const expStr = expD.toISOString().split('T')[0];

                        if (r.sender_uid && users_db[r.sender_uid]) {
                            users_db[r.sender_uid].has_access = true;
                            if (!users_db[r.sender_uid].access_expire_date || new Date(users_db[r.sender_uid].access_expire_date) < expD) {
                                users_db[r.sender_uid].access_expire_date = expStr;
                            }
                        }
                        if (r.district && r.school) {
                            const k = `${normalizeKey(r.district)}_${normalizeKey(r.school)}`;
                            if (!settings.school_access) settings.school_access = {};
                            if (!settings.school_access[k] || new Date(settings.school_access[k].expire_date) < expD) {
                                settings.school_access[k] = {
                                    district: r.district,
                                    school: r.school,
                                    type: 'access',
                                    purchase_date: r.submitted_at ? r.submitted_at.split(' ')[0] : now.toISOString().split('T')[0],
                                    expire_date: expStr
                                };
                            }
                        }
                    }
                });
                console.log(`✅ Auto-healed subscriptions from ${rRes.rows.length} receipts.`);
            }
        } catch (e) {
            console.warn("Auto-heal receipts warning:", e.message);
        }
    } catch (e) {
        console.warn("📡 Supabase Sync Warning (Postgres might be empty):", e.message);
    }
}

async function saveSettings() {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings));
        await pg.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['global', settings]);
    } catch (e) { }
}

function savePromos() { try { fs.writeFileSync(PROMO_FILE, JSON.stringify(promocodes)); } catch (e) { } }
function saveCoords() { try { fs.writeFileSync(COORDS_FILE, JSON.stringify(coords_db)); } catch (e) { } }

async function saveUser(ctx, data) {
    if (!ctx.from) return;
    const uid = ctx.from.id;
    users_db[uid] = { ...users_db[uid], ...data, name: ctx.from.first_name, username: ctx.from.username };
    try {
        fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users_db, null, 2));
        await pg.query('INSERT INTO tg_users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, last_active = NOW()', [String(uid), users_db[uid]]);
    } catch (e) { }
}

async function updateUserDb(uid, data) {
    if (!users_db[uid]) users_db[uid] = {};
    users_db[uid] = { ...users_db[uid], ...data };
    try {
        fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users_db, null, 2));
        await pg.query('INSERT INTO tg_users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, last_active = NOW()', [String(uid), users_db[uid]]);
    } catch (e) { }
}

function updateUserProMonths(uid, months = 1) {
    if (!users_db[uid]) users_db[uid] = {};

    let now = new Date();
    let baseDate = (users_db[uid].is_pro && new Date(users_db[uid].pro_expire_date) > now)
        ? new Date(users_db[uid].pro_expire_date)
        : now;

    let expireDate = new Date(baseDate);
    expireDate.setMonth(expireDate.getMonth() + months);

    users_db[uid].is_pro = true;
    users_db[uid].pro_expire_date = expireDate.toISOString().split('T')[0];
    users_db[uid].pro_purchase_date = now.toISOString().split('T')[0];

    try {
        fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users_db, null, 2));
        pg.query('INSERT INTO tg_users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, last_active = NOW()', [String(uid), users_db[uid]]);
    } catch (e) { }
    return users_db[uid];
}

const { SUPER_ADMIN_IDS, SPECIALIST_IDS } = require('../config/config');


function updateUserAccessMonths(uid, months = 1) {
    if (!users_db[uid]) users_db[uid] = {};

    let now = new Date();
    let baseDate = (users_db[uid].has_access && new Date(users_db[uid].access_expire_date) > now)
        ? new Date(users_db[uid].access_expire_date)
        : now;

    let expireDate = new Date(baseDate);
    expireDate.setMonth(expireDate.getMonth() + months);

    users_db[uid].has_access = true;
    users_db[uid].access_expire_date = expireDate.toISOString().split('T')[0];
    users_db[uid].access_purchase_date = now.toISOString().split('T')[0];

    try {
        fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users_db, null, 2));
        pg.query('INSERT INTO tg_users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, last_active = NOW()', [String(uid), users_db[uid]]);
    } catch (e) { }
    return users_db[uid];
}

function grantSchoolAccess(district, school, months = 1, type = 'access', customExpireDate = null) {
    const { normalizeKey } = require('../utils/topics');
    const key = `${normalizeKey(district)}_${normalizeKey(school)}`;
    if (!settings.school_access) settings.school_access = {};

    let now = new Date();
    let expireDate;
    if (customExpireDate) {
        expireDate = new Date(customExpireDate);
    } else {
        let currentExp = settings.school_access[key] && settings.school_access[key].expire_date;
        let baseDate = now;
        if (currentExp) {
            let expD = new Date(currentExp);
            let diffDays = (expD - now) / (1000 * 60 * 60 * 24);
            if (diffDays > 0 && diffDays <= 35) {
                baseDate = expD;
            } else if (diffDays > 35) {
                expireDate = expD;
            }
        }
        if (!expireDate) {
            expireDate = new Date(baseDate);
            expireDate.setMonth(expireDate.getMonth() + Number(months));
        }
    }

    const expStr = expireDate.toISOString().split('T')[0];
    settings.school_access[key] = {
        district,
        school,
        type, // 'access' or 'pro'
        purchase_date: (settings.school_access[key] && settings.school_access[key].purchase_date) || now.toISOString().split('T')[0],
        expire_date: expStr
    };
    saveSettings();

    // Directly synchronize matching users to the exact school expire date
    const normD = normalizeKey(district);
    const normS = normalizeKey(school);
    Object.keys(users_db).forEach(uid => {
        const u = users_db[uid];
        if (u && u.district && u.school) {
            const uNormD = normalizeKey(u.district);
            const uNormS = normalizeKey(u.school);
            const distMatch = uNormD === normD || uNormD.includes(normD) || normD.includes(uNormD);
            if (uNormS === normS && distMatch) {
                u.has_access = true;
                u.access_expire_date = expStr;
                u.access_purchase_date = now.toISOString().split('T')[0];
                if (type === 'pro') {
                    u.is_pro = true;
                    u.pro_expire_date = expStr;
                }
                try {
                    pg.query('INSERT INTO tg_users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, last_active = NOW()', [String(uid), users_db[uid]]);
                } catch (e) { }
            }
        }
    });
    try {
        fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users_db, null, 2));
    } catch (e) { }

    return settings.school_access[key];
}

function checkSchoolAccess(district, school) {
    if (settings.bypass_payment_check) return true;
    if (!district || !school) return false;
    const { normalizeKey } = require('../utils/topics');
    const normD = normalizeKey(district);
    if (normD.includes('test')) return true;
    if (!settings.school_access) return false;
    const normS = normalizeKey(school);
    const key = `${normD}_${normS}`;
    const now = new Date();

    // 1. To'g'ridan-to'g'ri kalit bo'yicha
    if (settings.school_access[key] && new Date(settings.school_access[key].expire_date) > now) {
        return true;
    }

    // 2. Qidiruv bo'yicha (tuman yoki maktab nomi formatida kichik farq bo'lsa)
    const found = Object.values(settings.school_access).find(sa => {
        if (!sa || !sa.school || !sa.district) return false;
        const saNormS = normalizeKey(sa.school);
        const saNormD = normalizeKey(sa.district);
        const schoolMatches = saNormS === normS;
        const distMatches = saNormD === normD || saNormD.includes(normD) || normD.includes(saNormD);
        return schoolMatches && distMatches && new Date(sa.expire_date) > now;
    });

    return !!found;
}

function getAllSubscriptions() {
    const list = [];
    const now = new Date();
    const { normalizeKey } = require('../utils/topics');

    // 1. Maktablar ruxsati (school_access)
    if (settings.school_access) {
        Object.entries(settings.school_access).forEach(([key, val]) => {
            if (!val || !val.school) return;
            const expDate = val.expire_date ? new Date(val.expire_date) : null;
            const daysLeft = expDate ? Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)) : 0;
            const isActive = daysLeft > 0;

            const normD = normalizeKey(val.district || '');
            const normS = normalizeKey(val.school || '');
            const matchedUsers = [];
            Object.entries(users_db).forEach(([uid, u]) => {
                if (u && u.district && u.school && normalizeKey(u.district) === normD && normalizeKey(u.school) === normS) {
                    matchedUsers.push({
                        uid,
                        fio: u.fio || u.first_name || 'Noma\'lum',
                        phone: u.phone || ''
                    });
                }
            });

            list.push({
                id: key,
                target_type: 'school',
                district: val.district || '',
                school: val.school || '',
                access_type: val.type || 'access',
                purchase_date: val.purchase_date || '',
                expire_date: val.expire_date || '',
                days_left: daysLeft,
                is_active: isActive,
                is_excessive: daysLeft > 35,
                users: matchedUsers
            });
        });
    }

    // 2. Individual users in users_db (not yet covered by school_access)
    Object.entries(users_db).forEach(([uid, u]) => {
        if (!u) return;
        const hasAccess = u.has_access && u.access_expire_date;
        const hasPro = u.is_pro && u.pro_expire_date;
        if (hasAccess || hasPro) {
            const expStr = (hasPro && new Date(u.pro_expire_date) > new Date(u.access_expire_date || 0)) 
                ? u.pro_expire_date 
                : u.access_expire_date;
            const accessType = hasPro ? 'pro' : 'access';
            const expDate = new Date(expStr);
            const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

            const normD = normalizeKey(u.district || '');
            const normS = normalizeKey(u.school || '');
            const schoolKey = `${normD}_${normS}`;
            const coveredBySchool = settings.school_access && settings.school_access[schoolKey];

            if (!coveredBySchool) {
                list.push({
                    id: 'user_' + uid,
                    target_type: 'user',
                    district: u.district || '',
                    school: u.school || '',
                    user_fio: u.fio || u.first_name || 'Noma\'lum',
                    phone: u.phone || '',
                    uid: uid,
                    access_type: accessType,
                    purchase_date: u.access_purchase_date || u.pro_purchase_date || '',
                    expire_date: expStr,
                    days_left: daysLeft,
                    is_active: daysLeft > 0,
                    is_excessive: daysLeft > 35,
                    users: [{ uid, fio: u.fio || u.first_name || 'Noma\'lum', phone: u.phone || '' }]
                });
            }
        }
    });

    return list;
}

function updateSubscriptionExpireDate(params) {
    const { normalizeKey } = require('../utils/topics');
    let { target_type, district, school, uid, new_expire_date, access_type, action } = params;

    const now = new Date();

    if (action === 'reset_30_days') {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        new_expire_date = d.toISOString().split('T')[0];
    } else if (action === 'revoke') {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        new_expire_date = d.toISOString().split('T')[0];
    }

    if (!new_expire_date) {
        throw new Error("Yangi tugash sanasi belgilanmagan!");
    }

    const isActive = new Date(new_expire_date) > now;

    if (target_type === 'school' || (district && school)) {
        const key = `${normalizeKey(district)}_${normalizeKey(school)}`;
        if (!settings.school_access) settings.school_access = {};

        settings.school_access[key] = {
            district,
            school,
            type: access_type || 'access',
            purchase_date: (settings.school_access[key] && settings.school_access[key].purchase_date) || now.toISOString().split('T')[0],
            expire_date: new_expire_date
        };
        saveSettings();

        // Sync all users of this school
        const normD = normalizeKey(district);
        const normS = normalizeKey(school);
        Object.keys(users_db).forEach(uId => {
            const u = users_db[uId];
            if (u && u.district && u.school && normalizeKey(u.district) === normD && normalizeKey(u.school) === normS) {
                u.has_access = isActive;
                u.access_expire_date = new_expire_date;
                if (access_type === 'pro') {
                    u.is_pro = isActive;
                    u.pro_expire_date = new_expire_date;
                }
                try {
                    pg.query('INSERT INTO tg_users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, last_active = NOW()', [String(uId), u]);
                } catch (e) { }
            }
        });
        try {
            fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users_db, null, 2));
        } catch (e) { }

        return { success: true, expire_date: new_expire_date, days_left: Math.ceil((new Date(new_expire_date) - now) / (1000 * 60 * 60 * 24)) };
    } else if (target_type === 'user' || uid) {
        const cleanUid = String(uid).replace(/^user_/, '');
        if (users_db[cleanUid]) {
            users_db[cleanUid].has_access = isActive;
            users_db[cleanUid].access_expire_date = new_expire_date;
            if (access_type === 'pro') {
                users_db[cleanUid].is_pro = isActive;
                users_db[cleanUid].pro_expire_date = new_expire_date;
            }
            try {
                fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users_db, null, 2));
                pg.query('INSERT INTO tg_users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, last_active = NOW()', [cleanUid, users_db[cleanUid]]);
            } catch (e) { }
            return { success: true, expire_date: new_expire_date, days_left: Math.ceil((new Date(new_expire_date) - now) / (1000 * 60 * 60 * 24)) };
        }
    }
    throw new Error("Tahrirlanuvchi maktab yoki foydalanuvchi topilmadi!");
}

function checkAttendanceAccess(uid) {
    if (settings.bypass_payment_check) return true;
    if (SUPER_ADMIN_IDS.map(Number).includes(Number(uid))) return true;
    if (SPECIALIST_IDS.map(Number).includes(Number(uid))) return true;

    const u = users_db[uid];
    if (!u) return false;
    if (u.is_pro && new Date(u.pro_expire_date) > new Date()) return true;
    if (u.has_access && new Date(u.access_expire_date) > new Date()) return true;

    if (u.district && u.school && checkSchoolAccess(u.district, u.school)) return true;

    return false;
}

function checkPro(uid) {
    if (SUPER_ADMIN_IDS.map(Number).includes(Number(uid))) return true;
    if (SPECIALIST_IDS.map(Number).includes(Number(uid))) return true;

    const u = users_db[uid];
    if (u && u.is_pro && new Date(u.pro_expire_date) > new Date()) return true;
    if (u && u.district && u.school) {
        const { normalizeKey } = require('../utils/topics');
        const key = `${normalizeKey(u.district)}_${normalizeKey(u.school)}`;
        const sa = settings.school_access && settings.school_access[key];
        if (sa && sa.type === 'pro' && new Date(sa.expire_date) > new Date()) return true;
    }
    return false;
}

function checkProByPhone(phone) {
    if (!phone) return false;
    const cleanPhone = phone.replace(/\D/g, '');
    return Object.values(users_db).some(u =>
        u.phone && u.phone.replace(/\D/g, '') === cleanPhone &&
        new Date(u.pro_expire_date) > new Date()
    );
}

function checkAttendanceAccessByPhone(phone) {
    if (settings.bypass_payment_check) return true;
    if (!phone) return false;
    const cleanPhone = phone.replace(/\D/g, '');

    const userMatch = Object.values(users_db).some(u => {
        if (!u.phone) return false;
        if (u.phone.replace(/\D/g, '') !== cleanPhone) return false;
        if (u.uid && (SUPER_ADMIN_IDS.map(Number).includes(Number(u.uid)) || SPECIALIST_IDS.map(Number).includes(Number(u.uid)))) return true;
        if (u.is_pro && new Date(u.pro_expire_date) > new Date()) return true;
        if (u.has_access && new Date(u.access_expire_date) > new Date()) return true;
        return false;
    });
    if (userMatch) return true;

    try {
        const pPath = path.join(__dirname, 'pro_users.json');
        if (fs.existsSync(pPath)) {
            const proData = JSON.parse(fs.readFileSync(pPath, 'utf8') || '[]');
            const match = proData.find(u => u.phone === cleanPhone && new Date(u.pro_expire_date) > new Date());
            if (match) return true;
        }
    } catch (e) {}

    try {
        const aPath = path.join(__dirname, 'access_users.json');
        if (fs.existsSync(aPath)) {
            const accessData = JSON.parse(fs.readFileSync(aPath, 'utf8') || '[]');
            const match = accessData.find(u => u.phone === cleanPhone && new Date(u.access_expire_date) > new Date());
            if (match) return true;
        }
    } catch (e) {}

    return false;
}

// Initial load
loadAll();

module.exports = {
    get settings() { return settings; },
    get users_db() { return users_db; },
    get promocodes() { return promocodes; },
    get schools_db() { return schools_db; },
    get coords_db() { return coords_db; },
    saveSettings,
    savePromos,
    saveUser,
    updateUserDb,
    updateUserProMonths,
    updateUserAccessMonths,
    checkAttendanceAccess,
    checkAttendanceAccessByPhone,
    checkPro,
    checkProByPhone,
    grantSchoolAccess,
    checkSchoolAccess,
    getAllSubscriptions,
    updateSubscriptionExpireDate,
    saveCoords,
    loadAll, // Export for manual sync
    saveSchools: () => { try { fs.writeFileSync(SCHOOLS_FILE, JSON.stringify(schools_db)); } catch (e) { } }
};
