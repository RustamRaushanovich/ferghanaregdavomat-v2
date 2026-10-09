const { Markup } = require('telegraf');
const { SUPER_ADMIN_IDS, SPECIALIST_IDS, RESTRICTED_IDS } = require('../config/config');
const db = require('../database/db');

function showAdminPanel(ctx) {
    const uid = Number(ctx.from.id);

    // ABYIR (HARDCORE) CHECK
    if (uid === 65002404 || SUPER_ADMIN_IDS.map(Number).includes(uid)) {
        try {
            // Safe status check
            let status = "🔴 TA'TIL: OFF";
            if (db && db.settings && db.settings.vacation_mode) status = "🟢 TA'TIL: ON";
            let payStatus = "🔴 BEPUL: OFF";
            if (db && db.settings && db.settings.bypass_payment_check) payStatus = "🟢 BEPUL: ON";

            const buttons = [
                ["💳 To'lovlar & Obunalar (Excel)", "👥 Pro Ro'yxat"],
                ["🔓 1-Kunga Bepul Davomat", `Ta'til: ${status}`],
                ["➕ Promokod Yaratish", "❌ Pro Bekor Qilish"],
                ["📢 Qarzdorlarga ABOROT", "📢 E'lon Yuborish"],
                ["🔴 Ta'tilni YOQISH", "🟢 Ta'tilni O'CHIRISH"],
                ["📢 Kiritmaganlar (Manual)", "📊 Grafika"],
                ["📥 Excel Yuklab olish", "🔄 Bazani yangilash"],
                ["🖥 Dashboard Logins", "📊 Svod va Hisobotlar"],
                ["📝 Rejalar", "⬅️ Orqaga"]
            ];

            return ctx.reply(`🔧 Super Admin Panel (Modular v2).`, Markup.keyboard(buttons).resize());
        } catch (err) {
            return ctx.reply("Admin Panel Ichki Xatolik: " + err.message);
        }
    }

    // Checking other admins...
    const allAdmins = [...SUPER_ADMIN_IDS, ...SPECIALIST_IDS, ...RESTRICTED_IDS].map(id => Number(id));
    if (!allAdmins.includes(uid)) {
        return ctx.reply("⛔️ Sizga ruxsat yo'q.");
    }

    // Other admin roles logic
    let buttons = [["⬅️ Orqaga"]];
    if (SPECIALIST_IDS.map(Number).includes(uid)) {
        buttons = [
            ["📢 Qarzdorlarga ABOROT", "📢 E'lon Yuborish"],
            ["🔴 Ta'tilni YOQISH", "🟢 Ta'tilni O'CHIRISH"],
            ["📥 Tuman hisoboti (Excel)", "⬅️ Orqaga"]
        ];
    } else if (RESTRICTED_IDS.map(Number).includes(uid)) {
        buttons = [
            ["📢 E'lon Yuborish", "📥 Tuman hisoboti (Excel)"],
            ["⬅️ Orqaga"]
        ];
    }

    ctx.reply(`🔧 Admin Panel.`, Markup.keyboard(buttons).resize());
}

function handleProList(ctx) {
    const uid = Number(ctx.from.id);
    const superAdmins = SUPER_ADMIN_IDS.map(id => Number(id));

    if (superAdmins.includes(uid)) {
        let msg = "📋 <b>PRO USERLAR:</b>\n\n";
        Object.keys(db.users_db).forEach((uid, i) => {
            const u = db.users_db[uid];
            if (u.is_pro && new Date(u.pro_expire_date) > new Date()) msg += `${i + 1}. ${u.fio} (ID: <code>${uid}</code>) - ${u.school}\n`
        });
        ctx.replyWithHTML(msg || "Pro yo'q");
    }
}

function handleDashboardLogins(ctx) {
    const uid = Number(ctx.from.id);
    const superAdmins = SUPER_ADMIN_IDS.map(id => Number(id));

    if (superAdmins.includes(uid)) {
        const { USERS } = require('../utils/auth');
        let header = "🖥 <b>DASHBOARD LOGINS (WEB):</b>\n\n";

        // Filter out system users if any
        const list = Object.entries(USERS).filter(([k, v]) => v.role !== 'system').map(([login, u]) => {
            return { login, pass: u.password, dist: u.district || (u.role === 'superadmin' ? "👑 ADMIN" : "Boshqarma") };
        });

        let text = "";
        list.forEach((u, i) => {
            text += `${i + 1}. <b>${u.dist}</b>\n👤 L: <code>${u.login}</code>\n🔑 P: <code>${u.pass}</code>\n\n`;
        });

        if (text.length > 3800) {
            const chunks = text.match(/[\s\S]{1,3800}/g) || [];
            chunks.forEach((chunk, i) => {
                ctx.replyWithHTML(i === 0 ? header + chunk : chunk);
            });
        } else {
            ctx.replyWithHTML(header + text);
        }
    }
}

module.exports = {
    showAdminPanel,
    handleProList,
    handleDashboardLogins
};
