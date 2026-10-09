const { Markup } = require('telegraf');
const db = require('../database/db');
const config = require('../config/config');
const { getFargonaTime } = require('../utils/fargona');
const paymentService = require('./paymentService');
const { OFERTA_SHORT_TEXT, OFERTA_FULL_TEXT } = require('../utils/oferta');

const TG_CHANNEL_ID = '@Between_Us_uzb';
const TG_CHANNEL_URL = 'https://t.me/Between_Us_uzb';
const INSTAGRAM_URL = 'https://www.instagram.com/betweenusuzb/';

function getTodayStr() {
    return getFargonaTime().toISOString().split('T')[0];
}

function getOfertaKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('✅ Tanishdim va roziman', 'accept_oferta')],
        [Markup.button.callback('📜 To\'liq Ofertani o\'qish', 'view_full_oferta')]
    ]);
}

async function sendOfertaPrompt(ctx) {
    return ctx.replyWithHTML(OFERTA_SHORT_TEXT, getOfertaKeyboard());
}

/**
 * Kanal va Instagram tugmalarini inline yaratish
 */
function getSubscriptionKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.url('📢 1. Telegram kanalga a\'zo bo\'lish', TG_CHANNEL_URL)],
        [Markup.button.url('📸 2. Instagram sahifaga obuna bo\'lish', INSTAGRAM_URL)],
        [Markup.button.callback('✅ Obunani tasdiqlash / Tekshirish', 'check_subscription')]
    ]);
}

/**
 * Telegram kanal a'zoligini real-time API orqali tekshirish
 */
async function checkTelegramSub(ctx, uid) {
    try {
        const member = await ctx.telegram.getChatMember(TG_CHANNEL_ID, uid);
        const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
        if (validStatuses.includes(member.status)) {
            return { ok: true, status: member.status };
        } else {
            return { ok: false, reason: 'left_or_kicked', status: member.status };
        }
    } catch (e) {
        console.warn(`[SUB_CHECK] getChatMember for user ${uid}: ${e.message}`);
        if (e.message && e.message.includes('user not found')) {
            return { ok: false, reason: 'not_found' };
        }
        return { ok: null, error: e.message };
    }
}

/**
 * Davomat kiritishdan oldin obuna va to'lov statusini avtomatik tekshirish:
 * 0. Ommaviy oferta qabul qilinganligini tekshiradi (Huquqiy himoya).
 * 1. Telegram a'zoligini real-time tekshiradi.
 * 2. 05.10.2026 sanasidan boshlab 10 000 so'mlik oylik PRO to'lovni tekshiradi.
 * 3. Ertasi kuni kelganda ham har kuni avtomatik tekshirib, statusni yangilaydi.
 */
async function checkCanEnterAttendance(ctx, uid) {
    // Adminlar uchun cheklov yo'q
    if (config.ALL_ADMINS && config.ALL_ADMINS.map(Number).includes(Number(uid))) {
        return { canEnter: true };
    }

    const todayStr = getTodayStr();
    const u = db.users_db[uid] || {};

    // 0. OMMAVIY OFERTA TASDIQLANGANMI?
    if (!u.oferta_accepted) {
        return {
            canEnter: false,
            reason: 'oferta_required'
        };
    }

    // 1. Real-time Telegram tekshiruvi
    const tgCheck = await checkTelegramSub(ctx, uid);

    if (tgCheck.ok === false) {
        // Obunasi bekor bo'lgan yoki hali a'zo bo'lmagan
        const wasSubscribed = !!u.channels_subscribed;
        await db.updateUserDb(uid, {
            channels_subscribed: false,
            last_verified_date: null
        });
        return {
            canEnter: false,
            reason: wasSubscribed ? 'unsubscribed' : 'not_subscribed'
        };
    }

    // 2. Instagram tasdiqlanganmi?
    if (!u.instagram_confirmed && !u.channels_subscribed) {
        return {
            canEnter: false,
            reason: 'not_subscribed'
        };
    }

    // 3. 05.10.2026 SANASIDAN E'TIBORAN OYLIK TO'LOV / PRO STATUS TEKSHIRUVI
    const isPaidPeriod = todayStr >= '2026-10-05';
    if (isPaidPeriod) {
        let isPro = db.checkAttendanceAccess(uid);

        // Fallback 1: Agar foydalanuvchining maktabi to'lov qilgan bo'lsa
        if (!isPro && u.district && u.school) {
            if (db.checkSchoolAccess(u.district, u.school)) {
                isPro = true;
                db.updateUserAccessMonths(uid, 1);
            }
        }

        // Fallback 2: Telefon raqami bo'yicha to'lov tekshirish
        if (!isPro && u.phone) {
            if (db.checkAttendanceAccessByPhone(u.phone)) {
                isPro = true;
                db.updateUserAccessMonths(uid, 1);
            }
        }

        // Fallback 3: So'nggi chek holatini tekshirish (Approved yoki Pending)
        if (!isPro) {
            const lastReceipt = await paymentService.getUserReceiptStatus(uid, u.phone);
            if (lastReceipt) {
                if (lastReceipt.status === 'approved') {
                    // Agar chek tasdiqlangan bo'lsa (oxirgi 35 kun ichida), to'lov so'ralmaydi va ruxsat tiklanadi!
                    const rawDate = lastReceipt.submitted_at || lastReceipt.resolved_at;
                    const subDate = rawDate ? new Date(String(rawDate).replace(' ', 'T')) : new Date();
                    const diffDays = (new Date() - subDate) / (1000 * 60 * 60 * 24);
                    if (isNaN(diffDays) || diffDays <= 35) {
                        isPro = true;
                        db.updateUserAccessMonths(uid, 1);
                        if (lastReceipt.district && lastReceipt.school) {
                            db.grantSchoolAccess(lastReceipt.district, lastReceipt.school, 1, 'access');
                            db.updateUserDb(uid, { district: lastReceipt.district, school: lastReceipt.school, has_access: true });
                        }
                    }
                } else if (lastReceipt.status === 'pending') {
                    // Agar chek kutilayotgan bo'lsa, bugun uchun kiritishga ruxsat beriladi
                    return {
                        canEnter: true,
                        isPendingGrace: true,
                        receiptId: lastReceipt.id
                    };
                }
            }
        }

        if (!isPro) {
            return {
                canEnter: false,
                reason: 'pro_expired'
            };
        }
    }

    // 4. Ertasi kuni ko'rib chiqish:
    if (u.last_verified_date !== todayStr || !u.channels_subscribed) {
        await db.updateUserDb(uid, {
            channels_subscribed: true,
            instagram_confirmed: true,
            last_verified_date: todayStr
        });
    }

    return { canEnter: true };
}

/**
 * Foydalanuvchini muvaffaqiyatli obuna bo'ldi deb belgilash
 */
async function markUserVerified(uid) {
    const todayStr = getTodayStr();
    await db.updateUserDb(uid, {
        channels_subscribed: true,
        instagram_confirmed: true,
        last_verified_date: todayStr,
        subscribed_at: new Date().toISOString()
    });
}

/**
 * Obuna bo'lish, qayta obuna bo'lish yoki To'lov qilish talabini yuborish
 */
async function sendSubscriptionPrompt(ctx, reason = 'not_subscribed') {
    if (reason === 'oferta_required') {
        return sendOfertaPrompt(ctx);
    }

    if (reason === 'pro_expired') {
        return paymentService.showPaymentInfo(ctx);
    }

    let titleText = `⚠️ <b>Davomat kiritish uchun majburiy a'zolik:</b>`;
    let bodyText = `Hurmatli foydalanuvchi! Davomat kiritishdan oldin quyidagi 2 ta rasmiy sahifamizga a'zo bo'lishingiz lozim:`;

    if (reason === 'unsubscribed') {
        titleText = `⚠️ <b>Obunangiz bekor qilingan yoki a'zolik topilmadi!</b>`;
        bodyText = `Davomat kiritishni davom ettirish uchun quyidagi rasmiy sahifalarimizga qaytadan obuna bo'lishingiz va tasdiqlashingiz shart:`;
    }

    const text = 
        `${titleText}\n\n` +
        `${bodyText}\n\n` +
        `1️⃣ 📢 <b>Telegram kanal:</b> <a href="${TG_CHANNEL_URL}">Between Us (@Between_Us_uzb)</a>\n` +
        `2️⃣ 📸 <b>Instagram sahifa:</b> <a href="${INSTAGRAM_URL}">betweenusuzb</a>\n\n` +
        `👉 <i>Ikkala sahifaga ham obuna bo'lgach, pastdagi <b>«✅ Obunani tasdiqlash / Tekshirish»</b> tugmasini bosing.</i>`;

    return ctx.replyWithHTML(text, {
        disable_web_page_preview: true,
        ...getSubscriptionKeyboard()
    });
}

module.exports = {
    TG_CHANNEL_ID,
    TG_CHANNEL_URL,
    INSTAGRAM_URL,
    getSubscriptionKeyboard,
    checkTelegramSub,
    checkCanEnterAttendance,
    markUserVerified,
    sendSubscriptionPrompt,
    sendOfertaPrompt,
    getOfertaKeyboard,
    OFERTA_SHORT_TEXT,
    OFERTA_FULL_TEXT
};
