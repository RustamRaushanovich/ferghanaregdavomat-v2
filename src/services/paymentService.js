const { Markup } = require('telegraf');
const db = require('../database/db');
const config = require('../config/config');
const { getFargonaTime, getFargonaDateTimeString, formatUzbDateTime } = require('../utils/fargona');
const fs = require('fs');
const path = require('path');

const RECEIPTS_FILE = path.join(__dirname, '../database/payment_receipts.json');

function loadReceipts() {
    try {
        if (fs.existsSync(RECEIPTS_FILE)) {
            return JSON.parse(fs.readFileSync(RECEIPTS_FILE, 'utf8') || '[]');
        }
    } catch (e) {
        console.error("Error loading receipts:", e.message);
    }
    return [];
}

function saveReceipts(receipts) {
    try {
        fs.writeFileSync(RECEIPTS_FILE, JSON.stringify(receipts, null, 2), 'utf8');
    } catch (e) {
        console.error("Error saving receipts:", e.message);
    }
}

function getHumoCard() {
    return db.settings.humo_card || '9860 0366 3576 1863';
}

function getVisaCard() {
    return db.settings.visa_card || '4187 8000 0132 1124';
}

function getAccessPrice() {
    return db.settings.access_price_uzs || 10000;
}

function getProPrice() {
    return db.settings.pro_price_uzs || 25000;
}

/**
 * Show Payment info to user with HUMO and VISA cards and tier choices
 */
async function showPaymentInfo(ctx) {
    const humoCard = getHumoCard();
    const visaCard = getVisaCard();
    const accessPrice = getAccessPrice();
    const proPrice = getProPrice();
    const uid = ctx.from.id;

    if (!ctx.session) ctx.session = {};
    ctx.session.waiting_receipt = true;

    const u = db.users_db[uid] || {};
    let statusText = '⚠️ <b>Davomat kiritish ruxsati faol emas.</b>';
    if (u.is_pro && new Date(u.pro_expire_date) > new Date()) {
        statusText = '🌟 <b>PRO Rejmingiz faol!</b> (' + u.pro_expire_date + ' gacha)';
    } else if (u.has_access && new Date(u.access_expire_date) > new Date()) {
        statusText = '✅ <b>Davomat kiritish ruxsatingiz faol!</b> (' + u.access_expire_date + ' gacha)';
    }

    const text = 
        '💳 <b>OYLIK DAVOMAT OBUNASI VA TO\'LOV MA\'LUMOTLARI</b>\n\n' +
        statusText + '\n\n' +
        '📌 <b>Standart Davomat Obunasi:</b> <code>' + accessPrice.toLocaleString() + ' so\'m / oy</code>\n' +
        '<i>(05.10.2026 dan e\'tiboran 1 oy davomat kiritish ruxsati)</i>\n\n' +
        '⭐ <b>PRO Rejim Obunasi:</b> <code>' + proPrice.toLocaleString() + ' so\'m / oy</code>\n' +
        '<i>(AI rasm aniqlash, avto 3-Ilova PDF, PRO Analitika)</i>\n\n' +
        '🏦 <b>TO\'LOV UCHUN KARTALAR:</b>\n\n' +
        '🔹 <b>HUMO Karta:</b>\n<code>' + humoCard + '</code>\n\n' +
        '🔹 <b>VISA Karta:</b>\n<code>' + visaCard + '</code>\n\n' +
        '📝 <b>TO\'LOV QILISH TARTIBI:</b>\n' +
        '1️⃣ Yuqoridagi kartalardan biriga mablag\' o\'tkazing (yoki pastdagi Click/Payme tugmasini bosing).\n' +
        '2️⃣ To\'lov cheki (skrinshot yoki kvitansiya)ni <b>to\'g\'ridan-to\'g\'ri ushbu botga rasm sifatida yuboring</b>.\n' +
        '3️⃣ Chekingiz adminlarga yuboriladi va 1 oy muddatga davomat ruxsati faollashtiriladi!\n\n' +
        'ℹ️ <i>Xizmatlar Davlat soliq qo\'mitasining QR-kodli Ma\'lumotnomasi № 0006296129 («Dasturiy ta\'minot ishlab chiqish») asosida ko\'rsatiladi.</i>\n\n' +
        '📲 <i>Iltimos, to\'lov qilgach, chekni (rasm/skrinshot) shu botga yuboring:</i>';

    const paymentKeyboard = Markup.inlineKeyboard([
        [
            Markup.button.url('📲 Click ilovasini ochish', 'https://my.click.uz'),
            Markup.button.url('📲 Payme ilovasini ochish', 'https://payme.uz')
        ],
        [
            Markup.button.callback('🔍 Yuborgan chekim holati', 'check_my_receipt')
        ]
    ]);

    return ctx.replyWithHTML(text, paymentKeyboard);
}

/**
 * Foydalanuvchining so'nggi cheki statusini olish (tasdiqlangan yoki kutilayotgan)
 */
async function getUserReceiptStatus(uid, phone) {
    const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
    try {
        const pg = require('../database/pg');
        let query = 'SELECT * FROM payment_receipts WHERE sender_uid = $1';
        let params = [String(uid)];
        if (cleanPhone) {
            query += ' OR regexp_replace(phone, \'\\D\', \'\', \'g\') = $2';
            params.push(cleanPhone);
        }
        query += ' ORDER BY submitted_at DESC LIMIT 10';
        const res = await pg.query(query, params);
        if (res && res.rows && res.rows.length > 0) {
            const approved = res.rows.find(r => r.status === 'approved');
            if (approved) return approved;
            const pending = res.rows.find(r => r.status === 'pending');
            if (pending) return pending;
            return res.rows[0];
        }
    } catch (e) { }

    const receipts = loadReceipts();
    const userReceipts = receipts.filter(r => {
        if (String(r.sender_uid) === String(uid)) return true;
        if (cleanPhone && r.phone && String(r.phone).replace(/\D/g, '') === cleanPhone) return true;
        return false;
    });
    if (userReceipts.length > 0) {
        const reversed = userReceipts.slice().reverse();
        const approved = reversed.find(r => r.status === 'approved');
        if (approved) return approved;
        const pending = reversed.find(r => r.status === 'pending');
        if (pending) return pending;
        return reversed[0];
    }
    return null;
}

/**
 * Handle Receipt Photo/Document submission with Anti-Fraud Protection
 */
async function handleReceiptSubmission(ctx) {
    if (!ctx.session || !ctx.session.waiting_receipt) {
        ctx.session = ctx.session || {};
    }

    const uid = ctx.from.id;
    const u = db.users_db[uid] || {};
    const name = u.fio || ctx.from.first_name || 'Foydalanuvchi';
    const phone = u.phone || 'Kiritilmagan';
    const school = u.school ? (u.school + ' (' + u.district + ')') : 'Noma\'lum maktab';
    const userName = ctx.from.username ? '@' + ctx.from.username : 'NoUsername';

    // Extract file info
    let fileId = null;
    let fileUniqueId = null;
    let fileSize = 0;

    if (ctx.message.photo && ctx.message.photo.length > 0) {
        const p = ctx.message.photo[ctx.message.photo.length - 1];
        fileId = p.file_id;
        fileUniqueId = p.file_unique_id;
        fileSize = p.file_size || 0;
    } else if (ctx.message.document) {
        fileId = ctx.message.document.file_id;
        fileUniqueId = ctx.message.document.file_unique_id;
        fileSize = ctx.message.document.file_size || 0;
    }

    if (!fileId) return;

    // --- ANTI-FRAUD: DUPLICATE CHECK CHECKING ---
    const receipts = loadReceipts();
    const duplicate = receipts.find(r => r.file_unique_id === fileUniqueId);

    if (duplicate) {
        ctx.session.waiting_receipt = false;
        const timeInfo = duplicate.submitted_at || duplicate.resolved_at || 'avval';
        const firstSender = duplicate.sender_name || 'Noma\'lum';
        const firstSchool = duplicate.school || 'Maktab';

        if (duplicate.status === 'approved') {
            await ctx.replyWithHTML(
                '❌ <b>DIQQAT: TO\'LOV CHEKI QABUL QILINMADI!</b>\n\n' +
                `Ushbu to'lov cheki <b>${timeInfo}</b> vaqtida tizimda allaqachon ro'yxatga olingan va tasdiqlangan!\n\n` +
                `👤 <b>Birinchi marta topshirgan:</b> ${firstSender} (${firstSchool})\n\n` +
                '⚠️ <i>Qayta ishlatilgan yoki o\'zganing cheki qabul qilinmaydi. Iltimos, faqat o\'zingiz amalga oshirgan yangi va haqiqiy to\'lov kvitansiyasini yuboring.</i>'
            );

            // Alert superadmins about suspected fake check
            const alertMsg = 
                '🚨 <b>SOXTA / QAYTA ISHLATILGAN CHEK ANIQLANDI!</b>\n\n' +
                '👤 <b>Qayta yuborgan:</b> ' + name + ' (' + userName + ')\n' +
                '🆔 <b>Telegram ID:</b> <code>' + uid + '</code>\n' +
                '🏫 <b>Maktab:</b> ' + school + '\n' +
                '📞 <b>Tel:</b> ' + phone + '\n\n' +
                '⚠️ <b>Asl to\'lovchi:</b> ' + duplicate.sender_name + ' (' + duplicate.school + ')\n' +
                '📅 <b>Tasdiqlangan vaqti:</b> ' + timeInfo;

            for (const adminId of (config.SUPER_ADMIN_IDS || [65002404])) {
                try {
                    if (ctx.message.photo) {
                        await ctx.telegram.sendPhoto(adminId, fileId, { caption: alertMsg, parse_mode: 'HTML' });
                    } else {
                        await ctx.telegram.sendDocument(adminId, fileId, { caption: alertMsg, parse_mode: 'HTML' });
                    }
                } catch (e) {}
            }
            return;
        } else if (duplicate.status === 'fake_rejected') {
            await ctx.replyWithHTML(
                '❌ <b>DIQQAT: USHBU CHEK ILGARI RAD ETILGAN!</b>\n\n' +
                `Ushbu to'lov kvitansiyasi <b>${timeInfo}</b> vaqtida yuborilgan va ma'muriyat tomonidan rad etilgan (soxta chek).\n\n` +
                '⚠️ <i>Iltimos, faqat o\'zingiz amalga oshirgan yangi va haqiqiy to\'lov kvitansiyasini yuboring.</i>'
            );
            return;
        } else if (duplicate.status === 'pending') {
            await ctx.replyWithHTML(
                '⏳ <b>DIQQAT: USHBU CHEK ALLAQACHON YUBORILGAN!</b>\n\n' +
                `Siz yoki boshqa foydalanuvchi ushbu chekni <b>${timeInfo}</b> vaqtida topshirgan. Hozirda adminlar tomonidan ko'rib chiqilmoqda.\n\n` +
                '⚠️ <i>Qayta-qayta yuborishingiz shart emas. Chek tasdiqlanguniga qadar bugungi davomatni erkin kiritishingiz mumkin.</i>'
            );
            return;
        }
    }

    // Check if user already has an active pending receipt
    const userPending = receipts.find(r => String(r.sender_uid) === String(uid) && r.status === 'pending');
    if (userPending) {
        ctx.session.waiting_receipt = false;
        await ctx.replyWithHTML(
            '⏳ <b>Sizning avvalgi to\'lov chekingiz hali tekshirilmoqda!</b>\n\n' +
            `Yuborilgan vaqti: <b>${userPending.submitted_at}</b>\n\n` +
            'Adminlar tez orada tasdiqlaydilar. Tasdiqlanishini kutmasdan bugungi davomatni bemalol kiritishingiz mumkin.'
        );
        return;
    }

    const receiptId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    let fileUrl = '';
    try {
        const link = await ctx.telegram.getFileLink(fileId);
        fileUrl = link.href || link.toString();
    } catch (e) {
        console.warn('Could not get telegram file link:', e.message);
    }

    const uzbNowString = getFargonaDateTimeString();
    const uzbDisplayTime = formatUzbDateTime(new Date());

    const newReceipt = {
        id: receiptId,
        file_unique_id: fileUniqueId,
        file_id: fileId,
        file_url: fileUrl,
        file_size: fileSize,
        sender_uid: uid,
        sender_name: name,
        school: school,
        district: u.district || '',
        phone: phone,
        submitted_at: uzbNowString,
        status: 'pending'
    };
    receipts.push(newReceipt);
    saveReceipts(receipts);

    try {
        const pg = require('../database/pg');
        await pg.query(
            `INSERT INTO payment_receipts (id, file_id, file_url, file_unique_id, file_size, sender_uid, sender_name, school, district, phone, submitted_at, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
             ON CONFLICT (id) DO UPDATE SET file_url = EXCLUDED.file_url`,
            [receiptId, fileId, fileUrl, fileUniqueId, fileSize, String(uid), name, school, u.district || '', phone, uzbNowString]
        );
    } catch (e) {
        console.error('Save receipt to PG error:', e.message);
    }

    const admins = config.SUPER_ADMIN_IDS || [65002404];

    const forwardMsg = 
        '🧾 <b>YANGI TO\'LOV CHEKI!</b>\n\n' +
        '👤 <b>Kimdan:</b> ' + name + ' (' + userName + ')\n' +
        '🆔 <b>Telegram ID:</b> <code>' + uid + '</code>\n' +
        '🏫 <b>Maktab:</b> ' + school + '\n' +
        '📞 <b>Tel:</b> ' + phone + '\n' +
        '⏰ <b>Yuborilgan vaqt:</b> ' + uzbDisplayTime + ' (O\'zbekiston vaqti)\n' +
        '🔖 <b>Chek ID:</b> <code>' + receiptId + '</code>\n\n' +
        '👉 <i>Faollashtirish uchun mos tugmani bosing:</i>';

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ 1 oy Davomat Ruxsati (10 000 so\'m)', 'approve_access:' + uid + ':' + receiptId)],
        [Markup.button.callback('⭐ 1 oy PRO Rejim (25 000 so\'m)', 'approve_pro:' + uid + ':' + receiptId)],
        [Markup.button.callback('🚫 Soxta Chek (Rad etish)', 'reject_fake:' + uid + ':' + receiptId)]
    ]);

    let sentCount = 0;
    for (const adminId of admins) {
        try {
            if (ctx.message.photo) {
                await ctx.telegram.sendPhoto(adminId, fileId, { caption: forwardMsg, parse_mode: 'HTML', ...keyboard });
                sentCount++;
            } else if (ctx.message.document) {
                await ctx.telegram.sendDocument(adminId, fileId, { caption: forwardMsg, parse_mode: 'HTML', ...keyboard });
                sentCount++;
            }
        } catch (e) {
            console.error('Admin forward error:', e.message);
        }
    }

    ctx.session.waiting_receipt = false;

    if (sentCount > 0) {
        return ctx.replyWithHTML('✅ <b>To\'lov cheki adminlarga yuborildi!</b>\n\nAdminlar tekshirib, 1 oy muddatga ruxsatni faollashtiradilar va sizga tasdiq xabari keladi.');
    } else {
        return ctx.replyWithHTML('⚠️ Chek qabul qilindi, lekin adminlarga yetkazishda texnik muammo bo\'ldi. Iltimos, admin @qirol ga murojaat qiling.');
    }
}

async function updateReceiptStatus(receiptId, status, adminId) {
    try {
        const pg = require('../database/pg');
        await pg.query(
            `UPDATE payment_receipts SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2 WHERE id = $3`,
            [status, String(adminId), receiptId]
        );
    } catch (e) {
        console.error('Update receipt status in PG error:', e.message);
    }
    const receipts = loadReceipts();
    const r = receipts.find(item => item.id === receiptId);
    if (r) {
        r.status = status;
        r.resolved_at = new Date().toISOString();
        r.resolved_by = String(adminId);
        saveReceipts(receipts);
    }
}

async function getReceiptsList() {
    try {
        const pg = require('../database/pg');
        const res = await pg.query('SELECT * FROM payment_receipts ORDER BY submitted_at DESC LIMIT 200');
        if (res && res.rows && res.rows.length > 0) {
            return res.rows;
        }
    } catch (e) {
        console.error('Get receipts from PG error:', e.message);
    }
    return loadReceipts().slice().reverse();
}

async function handleAddAccessCommand(ctx) {
    const uid = ctx.from.id;
    if (!config.SUPER_ADMIN_IDS.map(Number).includes(Number(uid))) {
        return ctx.reply('⛔ Ruxsat yo\'q. Faqat Super Adminlar uchun.');
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2 || parts[1] === 'help') {
        return ctx.replyWithHTML(
            '📖 <b>DAVOMAT RUXSATI FAOLLASHTIRISH BUYRUG\'I (ADMIN):</b>\n\n' +
            '<code>/addaccess [Telegram ID yoki Telefon] [oylar soni]</code>\n\n' +
            '<i>Misollar:</i>\n' +
            '  <code>/addaccess 65002404 1</code> (1 oyga Davomat ruxsati)\n' +
            '  <code>/addaccess +998901234567 1</code> (Telefon bo\'yicha 1 oyga)'
        );
    }

    const targetInput = parts[1];
    const months = parseInt(parts[2]) || 1;

    let targetUid = null;
    if (/^\d+$/.test(targetInput)) {
        targetUid = targetInput;
    } else {
        const cleanPhone = targetInput.replace(/\D/g, '');
        for (const [id, user] of Object.entries(db.users_db)) {
            if (user.phone && user.phone.replace(/\D/g, '') === cleanPhone) {
                targetUid = id;
                break;
            }
        }
    }

    if (!targetUid) {
        return ctx.replyWithHTML('❌ <b>Foydalanuvchi topilmadi!</b> (' + targetInput + ')');
    }

    try {
        const user = db.updateUserAccessMonths(targetUid, months);
        const expireDate = user.access_expire_date;

        await ctx.replyWithHTML(
            '✅ <b>DAVOMAT RUXSATI FAOLLASHTIRILDI!</b>\n\n' +
            '👤 Foydalanuvchi: <b>' + (user.fio || targetUid) + '</b>\n' +
            '🆔 Telegram ID: <code>' + targetUid + '</code>\n' +
            '📅 Muddati: <b>' + expireDate + '</b> gacha (' + months + ' oy)'
        );

        try {
            await ctx.telegram.sendMessage(
                targetUid,
                '🎉 <b>Tabriklaymiz!</b>\n\nTo\'lovingiz tasdiqlandi va davomat kiritish ruxsatingiz <b>' + expireDate + '</b> gacha (' + months + ' oyga) faollashtirildi!\n\nEndi bemalol davomat kiritishingiz mumkin.',
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.log('Could not notify user:', e.message);
        }
    } catch (e) {
        return ctx.reply('❌ Xatolik: ' + e.message);
    }
}

async function handleAddProCommand(ctx) {
    const uid = ctx.from.id;
    if (!config.SUPER_ADMIN_IDS.map(Number).includes(Number(uid))) {
        return ctx.reply('⛔ Ruxsat yo\'q. Faqat Super Adminlar uchun.');
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2 || parts[1] === 'help') {
        return ctx.replyWithHTML(
            '👑 <b>PRO REJIM FAOLLASHTIRISH BUYRUG\'I (ADMIN):</b>\n\n' +
            '<code>/addpro [Telegram ID yoki Telefon] [oylar soni]</code>\n\n' +
            '<i>Misollar:</i>\n' +
            '  <code>/addpro 65002404 1</code> (1 oyga PRO Rejim)\n' +
            '  <code>/addpro +998901234567 1</code> (Telefon bo\'yicha 1 oyga)'
        );
    }

    const targetInput = parts[1];
    const months = parseInt(parts[2]) || 1;

    let targetUid = null;
    if (/^\d+$/.test(targetInput)) {
        targetUid = targetInput;
    } else {
        const cleanPhone = targetInput.replace(/\D/g, '');
        for (const [id, user] of Object.entries(db.users_db)) {
            if (user.phone && user.phone.replace(/\D/g, '') === cleanPhone) {
                targetUid = id;
                break;
            }
        }
    }

    if (!targetUid) {
        return ctx.replyWithHTML('❌ <b>Foydalanuvchi topilmadi!</b> (' + targetInput + ')');
    }

    try {
        const user = db.updateUserProMonths(targetUid, months);
        const expireDate = user.pro_expire_date;

        await ctx.replyWithHTML(
            '🌟 <b>PRO REJIM FAOLLASHTIRILDI!</b>\n\n' +
            '👤 Foydalanuvchi: <b>' + (user.fio || targetUid) + '</b>\n' +
            '🆔 Telegram ID: <code>' + targetUid + '</code>\n' +
            '📅 Muddati: <b>' + expireDate + '</b> gacha (' + months + ' oy)'
        );

        try {
            await ctx.telegram.sendMessage(
                targetUid,
                '🎉 <b>Tabriklaymiz!</b>\n\nTo\'lovingiz tasdiqlandi va <b>PRO REJIM</b> obunangiz <b>' + expireDate + '</b> gacha (' + months + ' oy) faollashtirildi!\n\nBarcha imkoniyatlardan foydalanishingiz mumkin.',
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.log('Could not notify user:', e.message);
        }
    } catch (e) {
        return ctx.reply('❌ Xatolik: ' + e.message);
    }
}

async function handleSetCardCommand(ctx) {
    const uid = ctx.from.id;
    if (!config.SUPER_ADMIN_IDS.map(Number).includes(Number(uid))) {
        return ctx.reply('⛔ Ruxsat yo\'q.');
    }

    const text = ctx.message.text.replace(/^\/setcard\s*/, '').trim();
    if (!text) {
        return ctx.replyWithHTML(
            '💳 <b>KARTA RAQAMLARINI O\'ZGARTIRISH (ADMIN):</b>\n\n' +
            '<code>/setcard humo 9860036635761863</code>\n' +
            '<code>/setcard visa 4187800001321124</code>\n\n' +
            '<i>Joriy HUMO:</i> <code>' + getHumoCard() + '</code>\n' +
            '<i>Joriy VISA:</i> <code>' + getVisaCard() + '</code>'
        );
    }

    const parts = text.split(/\s+/);
    const type = parts[0].toLowerCase();
    const newCard = parts.slice(1).join(' ');

    if (type === 'humo') {
        db.settings.humo_card = newCard;
        db.saveSettings();
        return ctx.replyWithHTML('✅ <b>HUMO Karta yangilandi:</b> <code>' + newCard + '</code>');
    } else if (type === 'visa') {
        db.settings.visa_card = newCard;
        db.saveSettings();
        return ctx.replyWithHTML('✅ <b>VISA Karta yangilandi:</b> <code>' + newCard + '</code>');
    } else {
        db.settings.humo_card = text;
        db.saveSettings();
        return ctx.replyWithHTML('✅ <b>Karta yangilandi:</b> <code>' + text + '</code>');
    }
}

module.exports = {
    getHumoCard,
    getVisaCard,
    getAccessPrice,
    getProPrice,
    showPaymentInfo,
    handleReceiptSubmission,
    handleAddAccessCommand,
    handleAddProCommand,
    handleSetCardCommand,
    updateReceiptStatus,
    getReceiptsList,
    getUserReceiptStatus,
    loadReceipts,
    saveReceipts
};
