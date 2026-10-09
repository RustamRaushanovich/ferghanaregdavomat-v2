const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { getViloyatSvod, exportToExcel, getTumanSvod } = require('./dataService');
const { getFargonaTime } = require('../utils/fargona');
const topicsConfig = require('../config/topics');
const { getTopicId, normalizeKey } = require('../utils/topics');
const db = require('../database/db');
const config = require('../config/config');
const { DISTRICT_HEADS } = require('../config/config');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const REPORT_GROUP_ID = process.env.REPORT_GROUP_ID || (config && config.REPORT_GROUP_ID) || '-1003662758005';

function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getDistrictSchools(distName, schoolsDb) {
    if (!distName || !schoolsDb) return [];
    if (schoolsDb[distName] && schoolsDb[distName].length > 0) return schoolsDb[distName];
    const straight = distName.replace(/[‘’`]/g, "'");
    if (schoolsDb[straight] && schoolsDb[straight].length > 0) return schoolsDb[straight];
    const curly = distName.replace(/['’`]/g, "‘");
    if (schoolsDb[curly] && schoolsDb[curly].length > 0) return schoolsDb[curly];
    const norm = normalizeKey(distName);
    const dbKey = Object.keys(schoolsDb).find(k => normalizeKey(k) === norm);
    if (dbKey && schoolsDb[dbKey]) return schoolsDb[dbKey];
    return [];
}

/**
 * Daily Summary (Svod) at 16:30
 */
async function sendDailySummary() {
    console.log("🕒 [CRON] Starting daily summary at 16:30...");
    if (db.settings.vacation_mode) return console.log("⏸ Vacation mode ON, skipping.");
    const now = getFargonaTime();
    const dateStr = now.toISOString().split('T')[0];

    try {
        // 1. Generate Excel Viloyat
        const filePath = await exportToExcel(dateStr);

        // 2. Get Viloyat Summary Data
        const svod = await getViloyatSvod(dateStr);

        let enteredSchools = 0;
        let vStudents = 0;
        let vAbsents = 0;

        svod.forEach(d => {
            enteredSchools += d.entries;
            vStudents += d.students;
            vAbsents += d.total_absent;
        });

        const vPercent = vStudents > 0 ? ((vStudents - vAbsents) / vStudents * 100).toFixed(1) : 0;

        let mainMsg = `📊 <b>KUNLIK YAKUNIY HISOBOT (SVOD)</b>\n\n`;
        mainMsg += `📅 Sana: <b>${dateStr}</b>\n`;
        mainMsg += `🕒 Vaqt: <b>16:30</b>\n\n`;
        mainMsg += `🏢 Kiritgan maktablar: <b>${enteredSchools} ta</b>\n`;
        mainMsg += `👥 Jami o'quvchilar: <b>${vStudents.toLocaleString()}</b>\n`;
        mainMsg += `📉 Davomat ko'rsatkichi: <b>${vPercent}%</b>\n\n`;
        mainMsg += `👇 Batafsil hududlar kesimida Excel hisobotda:`;

        // Send to Main Topic (MMT Boshqarma)
        const mainTopicId = getTopicId("MMT Boshqarma");
        if (filePath) {
            try {
                await bot.telegram.sendDocument(REPORT_GROUP_ID, { source: filePath }, {
                    caption: mainMsg,
                    parse_mode: 'HTML',
                    message_thread_id: mainTopicId
                });
            } catch (docErr) {
                console.warn("[CRON] Main topic document send error:", docErr.message);
                try {
                    await bot.telegram.sendMessage(REPORT_GROUP_ID, mainMsg.replace(/<[^>]*>/g, ''), {
                        message_thread_id: mainTopicId
                    });
                } catch (mErr) {}
            }

            // 3. Send Individual District Summaries to their Topics
            for (const d of svod) {
                try {
                    const topicId = getTopicId(d.district);
                    if (!topicId || topicId === mainTopicId) continue;

                    let distMsg = `📊 <b>KUNLIK YAKUNIY HISOBOT</b>\n`;
                    distMsg += `📍 Hudud: <b>${escapeHtml(d.district)}</b>\n`;
                    distMsg += `📅 Sana: <b>${dateStr}</b>\n\n`;
                    distMsg += `🏢 Kiritgan maktablar: <b>${d.entries} / ${d.total_schools}</b>\n`;
                    distMsg += `👥 Jami o'quvchilar: <b>${(d.students || 0).toLocaleString()}</b>\n`;
                    distMsg += `✅ Sababli kelmaganlar: <b>${d.sababli || 0}</b>\n`;
                    distMsg += `🚫 Sababsiz kelmaganlar: <b>${d.sababsiz || 0}</b>\n`;
                    distMsg += `📉 Davomat ko'rsatkichi: <b>${(d.avg_percent || 0).toFixed(1)}%</b>\n\n`;
                    distMsg += `👉 <a href="https://ferghanaregdavomat.uz/dashboard.html">Batafsil dashboardda</a>`;

                    try {
                        await bot.telegram.sendMessage(REPORT_GROUP_ID, distMsg, {
                            parse_mode: 'HTML',
                            message_thread_id: topicId,
                            disable_web_page_preview: true
                        });
                    } catch (err) {
                        console.error(`Error sending individual report to ${d.district}:`, err.message);
                        const plainDistMsg = distMsg.replace(/<[^>]*>/g, '');
                        await bot.telegram.sendMessage(REPORT_GROUP_ID, plainDistMsg, {
                            message_thread_id: topicId,
                            disable_web_page_preview: true
                        });
                    }

                    await new Promise(r => setTimeout(r, 350));
                } catch (loopErr) {
                    console.error(`Error in daily summary loop for ${d.district}:`, loopErr.message);
                }
            }

            console.log("✅ [CRON] Daily summaries sent successfully to all topics.");

            // 4. Web Push Notification
            await sendPushNotifications("Bugungi kun uchun yakuniy hisobotlar tayyor! Ularni dashboardda va Telegram kanallarda ko'rishingiz mumkin.");
        }
    } catch (e) {
        console.error("❌ [CRON] Daily summary error:", e);
    }
}

async function sendPushNotifications(message) {
    const webpush = require('web-push');
    const db_pg = require('../database/pg');

    webpush.setVapidDetails(
        'mailto:imronbekr@gmail.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );

    try {
        const res = await db_pg.query('SELECT subscription FROM push_subscriptions');
        const subscriptions = res.rows.map(r => JSON.parse(r.subscription));

        const payload = JSON.stringify({
            title: 'Ferghana Davomat',
            body: message,
            icon: '/logo.png'
        });

        const promises = subscriptions.map(sub =>
            webpush.sendNotification(sub, payload).catch(e => {
                if (e.statusCode === 410) {
                    db_pg.query('DELETE FROM push_subscriptions WHERE subscription = $1', [JSON.stringify(sub)]);
                }
            })
        );
        await Promise.all(promises);
        console.log(`✅ [Push] Sent to ${promises.length} devices.`);
    } catch (e) {
        console.error("❌ [Push] Error:", e);
    }
}


/**
 * Sunday Best Schools Report at 09:00
 */
async function sendWeeklyBestSchools() {
    console.log("🕒 [CRON] Starting weekly best schools report (Sunday 09:00)...");
    if (db.settings.vacation_mode) return;
    const topics = topicsConfig.getTopics();
    const districts = Object.keys(topics).filter(d => d !== "Test rejimi" && d !== "MMT Boshqarma");

    // Last 6 days (Mon-Sat)
    const now = getFargonaTime();
    const dateRange = [];
    for (let i = 1; i <= 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dateRange.push(d.toISOString().split('T')[0]);
    }

    try {
        const db = require('../database/pg');

        for (const distName of districts) {
            try {
                const topicId = getTopicId(distName);
                if (!topicId) continue;

                const straightDist = distName.replace(/[‘’`]/g, "'");
                const curlyDist = distName.replace(/['’`]/g, "‘");

                const q = `
                    SELECT school, AVG(percent) as avg_p 
                    FROM attendance 
                    WHERE (district = $1 OR district = $2 OR district = $3) AND date = ANY($4) 
                    GROUP BY school 
                    ORDER BY avg_p DESC LIMIT 5
                `;
                const res = await db.query(q, [distName, straightDist, curlyDist, dateRange]);

                if (res.rows && res.rows.length > 0) {
                    let msg = `🏆 <b>HAFTALIK ENG NAMUNALI MAKTABLAR</b> (TOP-5)\n`;
                    msg += `📍 Hudud: <b>${escapeHtml(distName)}</b>\n`;
                    msg += `📅 Davr: ${dateRange[dateRange.length - 1]} dan ${dateRange[0]} gacha\n\n`;

                    res.rows.forEach((r, i) => {
                        msg += `${getMedal(i + 1)} <b>${escapeHtml(r.school)}</b> — ${parseFloat(r.avg_p).toFixed(1)}%\n`;
                    });

                    msg += `\n👏 <i>Tabriklaymiz! Davomatni namunali saqlashda davom eting.</i>`;

                    // --- 🎖 NEW: Generate Image Certificate for #1 school ---
                    try {
                        const topSchool = res.rows[0];
                        if (parseFloat(topSchool.avg_p) >= 90) { // Faqat 90% dan yuqori bo'lsa
                            const { generateCertificate } = require('./rewardService');
                            const buffer = await generateCertificate(topSchool.school, distName, 'Haftalik');

                            await bot.telegram.sendPhoto(REPORT_GROUP_ID, { source: buffer }, {
                                caption: `🏆 <b>HAFTANING ENG YAXSHI MAKTABI!</b>\n\n<b>${escapeHtml(distName)}</b> bo'yicha eng yuqori ko'rsatkich: <b>${escapeHtml(topSchool.school)}</b> (${parseFloat(topSchool.avg_p).toFixed(1)}%)`,
                                parse_mode: 'HTML',
                                message_thread_id: topicId
                            });
                        }
                    } catch (imgErr) {
                        console.error("Reward Image Error:", imgErr.message);
                    }

                    try {
                        await bot.telegram.sendMessage(REPORT_GROUP_ID, msg, {
                            parse_mode: 'HTML',
                            message_thread_id: topicId
                        });
                    } catch (sendErr) {
                        const plainMsg = msg.replace(/<[^>]*>/g, '');
                        await bot.telegram.sendMessage(REPORT_GROUP_ID, plainMsg, {
                            message_thread_id: topicId
                        });
                    }

                    await new Promise(r => setTimeout(r, 350));
                }
            } catch (distErr) {
                console.error(`❌ [CRON] Error for district ${distName} in weekly best schools:`, distErr.message);
            }
        }
        console.log("✅ [CRON] Weekly best schools report sent.");
    } catch (e) {
        console.error("❌ [CRON] Weekly best schools error:", e);
    }
}

function getMedal(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '🔹';
}

/**
 * Flash Report for SuperAdmin at 16:45
 */
async function sendFlashReport() {
    console.log("🕒 [CRON] Starting flash report at 16:45...");
    if (db.settings.vacation_mode) return;
    const now = getFargonaTime();
    const dateStr = now.toISOString().split('T')[0];

    try {
        const svod = await getViloyatSvod(dateStr);
        if (!svod || svod.length === 0) return;

        // Sort for best and worst
        const sorted = [...svod].sort((a, b) => b.avg_percent - a.avg_percent);
        const top3 = sorted.slice(0, 3);
        const bottom3 = sorted.filter(d => d.entries > 0).slice(-3).reverse();

        let msg = `⚡️ <b>FARG'ONA VILOYATI: KUNLIK TEZKOR HISOBOT</b>\n`;
        msg += `📅 Sana: <b>${dateStr}</b> | 🕒 <b>16:45</b>\n\n`;

        msg += `✅ <b>ENG YAXSHI 3 HUDUD:</b>\n`;
        top3.forEach((d, i) => {
            msg += `${i + 1}. ${escapeHtml(d.district)} — <b>${parseFloat(d.avg_percent).toFixed(1)}%</b>\n`;
        });

        msg += `\n⚠️ <b>DIQQAT TALAB 3 HUDUD:</b>\n`;
        bottom3.forEach((d, i) => {
            msg += `${i + 1}. ${escapeHtml(d.district)} — <b>${parseFloat(d.avg_percent).toFixed(1)}%</b>\n`;
        });

        msg += `\n📊 <b>VILOYAT O'RTACHA:</b> <b>${(svod.reduce((acc, curr) => acc + curr.avg_percent, 0) / svod.length).toFixed(1)}%</b>\n`;
        msg += `🏢 Jami maktablar: ${svod.reduce((acc, curr) => acc + curr.entries, 0)} ta`;

        const superAdminIds = [65002404, 786314811];
        for (const sid of superAdminIds) {
            try {
                await bot.telegram.sendMessage(sid, msg, { parse_mode: 'HTML' });
            } catch (err) {
                const plainMsg = msg.replace(/<[^>]*>/g, '');
                await bot.telegram.sendMessage(sid, plainMsg);
            }
        }
        console.log("✅ [CRON] Flash report sent.");
    } catch (e) {
        console.error("❌ [CRON] Flash report error:", e);
    }
}

/**
 * Warn non-reporting schools every 2 hours
 */
async function sendPendingReportsWarning() {
    console.log("🕒 [CRON] Starting non-reporting schools warning...");
    if (db.settings.vacation_mode) return;
    const now = getFargonaTime();
    const dateStr = now.toISOString().split('T')[0];
    const hour = now.getHours();

    try {
        const db_pg = require('../database/pg');
        const { schools_db } = require('../database/db');
        const topics = topicsConfig.getTopics();
        const districts = Object.keys(topics).filter(d => d !== "Test rejimi" && d !== "MMT Boshqarma");

        for (const distName of districts) {
            try {
                const topicId = getTopicId(distName);
                if (!topicId) continue;

                const straightDist = distName.replace(/[‘’`]/g, "'");
                const curlyDist = distName.replace(/['’`]/g, "‘");

                const reportedRes = await db_pg.query(
                    `SELECT school FROM attendance WHERE (district = $1 OR district = $2 OR district = $3) AND date = $4`,
                    [distName, straightDist, curlyDist, dateStr]
                );
                const reportedSchoolsNorm = (reportedRes.rows || []).map(r => normalizeKey(r.school));

                const allSchoolsInDist = getDistrictSchools(distName, schools_db);
                if (allSchoolsInDist.length === 0) continue;

                const missingSchools = allSchoolsInDist.filter(s => !reportedSchoolsNorm.includes(normalizeKey(s)));

                if (missingSchools.length > 0) {
                    let msg = `⚠️ <b>DIQQAT: HISOBOT TOPSHIRMAGAN MAKTABLAR</b>\n`;
                    msg += `📍 Hudud: <b>${escapeHtml(distName)}</b>\n`;
                    msg += `⏰ Vaqt: <b>${hour}:00</b>\n`;
                    msg += `📅 Sana: <b>${dateStr}</b>\n\n`;
                    msg += `🛑 <b>Topshirmadi: ${missingSchools.length} ta maktab</b>\n`;

                    // Show first 30 schools to avoid message length limits
                    const list = missingSchools.slice(0, 30);
                    list.forEach(s => {
                        msg += `• ${escapeHtml(s)}\n`;
                    });

                    if (missingSchools.length > 30) msg += `...va yana ${missingSchools.length - 30} ta maktab.\n`;

                    msg += `\n❗ <i>Iltimos, hisobotlarni zudlik bilan kiritishingizni so'raymiz!</i>`;

                    try {
                        await bot.telegram.sendMessage(REPORT_GROUP_ID, msg, {
                            parse_mode: 'HTML',
                            message_thread_id: topicId
                        });
                    } catch (tgErr) {
                        console.warn(`[CRON] HTML sendMessage failed for ${distName}, retrying plain text:`, tgErr.message);
                        const plainMsg = msg.replace(/<[^>]*>/g, '');
                        await bot.telegram.sendMessage(REPORT_GROUP_ID, plainMsg, {
                            message_thread_id: topicId
                        });
                    }

                    // Rate limit protection: 350ms delay between sending to supergroup topics
                    await new Promise(r => setTimeout(r, 350));
                }
            } catch (distErr) {
                console.error(`❌ [CRON] Error for district ${distName} in pending reports warning:`, distErr.message);
            }
        }
        console.log("✅ [CRON] Non-reporting warnings sent.");
    } catch (e) {
        console.error("❌ [CRON] Pending reports warning error:", e);
    }
}

/**
 * Final Report Summary for Districts at 15:30 and 16:30
 */
async function sendFinalReportsSummary(timeStr) {
    console.log(`🕒 [CRON] Starting final reports summary at ${timeStr}...`);
    if (db.settings.vacation_mode) return;
    const now = getFargonaTime();
    const dateStr = now.toISOString().split('T')[0];

    try {
        const db_pg = require('../database/pg');
        const { schools_db } = require('../database/db');
        const topics = topicsConfig.getTopics();
        const districts = Object.keys(topics).filter(d => d !== "Test rejimi" && d !== "MMT Boshqarma");

        for (const distName of districts) {
            try {
                const topicId = getTopicId(distName);
                if (!topicId) continue;

                const straightDist = distName.replace(/[‘’`]/g, "'");
                const curlyDist = distName.replace(/['’`]/g, "‘");

                const reportedRes = await db_pg.query(
                    `SELECT school FROM attendance WHERE (district = $1 OR district = $2 OR district = $3) AND date = $4`,
                    [distName, straightDist, curlyDist, dateStr]
                );
                const reportedSchoolsNorm = (reportedRes.rows || []).map(r => normalizeKey(r.school));

                const allSchoolsInDist = getDistrictSchools(distName, schools_db);
                if (allSchoolsInDist.length === 0) continue;

                const missingSchools = allSchoolsInDist.filter(s => !reportedSchoolsNorm.includes(normalizeKey(s)));

                let msg = "";
                if (missingSchools.length === 0) {
                    // ALL SCHOOLS REPORTED!
                    const head = DISTRICT_HEADS[distName] || DISTRICT_HEADS[straightDist] || { name: "tuman mas'uli" };
                    msg = `✅ <b>HAMMAGA RAHMAT!</b>\n\n`;
                    msg += `📍 Hudud: <b>${escapeHtml(distName)}</b>\n`;
                    msg += `👤 Hurmatli <b>${escapeHtml(head.name)}</b>,\n\n`;
                    msg += `Tizimingizdagi barcha maktablar <b>100%</b> o‘quvchilar davomatini kiritishdi.\n`;
                    msg += `Barcha maktab mas'ullariga ham o'z minnatdorchiligimizni bildiramiz! 👏\n\n`;
                    msg += `📅 Sana: <b>${dateStr}</b>\n`;
                    msg += `🏁 Holat: <b>YAKUNLANDI</b>`;
                } else {
                    // SOME SCHOOLS MISSING
                    msg = `⚠️ <b>KUNLIK YAKUNIY OGOHLANTIRISH</b>\n`;
                    msg += `📍 Hudud: <b>${escapeHtml(distName)}</b>\n`;
                    msg += `🕒 Vaqt: <b>${timeStr}</b>\n`;
                    msg += `📅 Sana: <b>${dateStr}</b>\n\n`;
                    msg += `🛑 <b>Hali ham topshirmadi: ${missingSchools.length} ta maktab</b>\n`;

                    const list = missingSchools.slice(0, 40);
                    list.forEach((s, i) => {
                        msg += `${i+1}. ${escapeHtml(s)}\n`;
                    });

                    if (missingSchools.length > 40) msg += `...va yana ${missingSchools.length - 40} ta maktab.\n`;

                    msg += `\n❗ <i>Iltimos, ish kunini yakunlashdan oldin hisobotlarni zudlik bilan kiritishingizni so'raymiz!</i>`;
                }

                try {
                    await bot.telegram.sendMessage(REPORT_GROUP_ID, msg, {
                        parse_mode: 'HTML',
                        message_thread_id: topicId
                    });
                } catch (tgErr) {
                    console.warn(`[CRON] HTML sendMessage failed for ${distName}, retrying plain text:`, tgErr.message);
                    const plainMsg = msg.replace(/<[^>]*>/g, '');
                    await bot.telegram.sendMessage(REPORT_GROUP_ID, plainMsg, {
                        message_thread_id: topicId
                    });
                }

                await new Promise(r => setTimeout(r, 350));
            } catch (distErr) {
                console.error(`❌ [CRON] Error for district ${distName} in final summary:`, distErr.message);
            }
        }
        console.log(`✅ [CRON] Final summary for ${timeStr} sent.`);
    } catch (e) {
        console.error(`❌ [CRON] Final summary error at ${timeStr}:`, e);
    }
}

/**
 * ⏰ Obuna tugashidan 3 kun va 1 kun oldin avtomatik eslatma yuborish
 */
async function sendSubscriptionReminders() {
    console.log("🕒 [CRON] Checking subscription expiries for reminders...");
    const now = getFargonaTime();
    const todayStr = now.toISOString().split('T')[0];

    const users = db.users_db || {};
    const paymentService = require('./paymentService');
    const humoCard = (paymentService.getHumoCard() || '').replace(/\s+/g, '');
    const price = paymentService.getAccessPrice() || 10000;

    const clickUrl = `https://my.click.uz/services/pay?service_id=-1&receiver_card=${humoCard}&amount=${price}`;
    const paymeUrl = `https://payme.uz/fallback/pay/transfer?card=${humoCard}&amount=${price * 100}`;

    const reminderKeyboard = {
        inline_keyboard: [
            [
                { text: "📲 Click orqali to'lash", url: clickUrl },
                { text: "📲 Payme orqali to'lash", url: paymeUrl }
            ]
        ]
    };

    let sent3d = 0;
    let sent1d = 0;

    for (const [uid, u] of Object.entries(users)) {
        if (!u || !uid) continue;
        const expDateStr = u.pro_expire_date || u.access_expire_date;
        if (!expDateStr) continue;

        const expDate = new Date(expDateStr);
        if (isNaN(expDate.getTime())) continue;

        // Qolgan kunlar
        const diffMs = expDate - now;
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        try {
            // 3 kun qolgan eslatmasi
            if (daysLeft === 3 && u.last_reminder_3d !== todayStr) {
                const msg = 
                    `⏰ <b>DIQQAT: DAVOMAT OBUNASI TUGAMOQDA!</b>\n\n` +
                    `Hurmatli mas'ul! Maktabingiz (<b>${escapeHtml(u.school || 'Maktab')}</b>) uchun davomat kiritish ruxsati <b>3 kundan so'ng (${expDateStr})</b> tugaydi.\n\n` +
                    `Ertalab davomat topshirishda uzilish bo'lmasligi uchun oldindan to'lovni amalga oshirib qo'yishingizni tavsiya qilamiz.\n\n` +
                    `<i>To'lov chekini rasm sifatida ushbu botga yuboring.</i>`;

                await bot.telegram.sendMessage(uid, msg, { parse_mode: 'HTML', reply_markup: reminderKeyboard });
                u.last_reminder_3d = todayStr;
                await db.updateUserDb(uid, { last_reminder_3d: todayStr });
                sent3d++;
                await new Promise(r => setTimeout(r, 200));
            }
            // 1 kun qolgan eslatmasi
            else if (daysLeft === 1 && u.last_reminder_1d !== todayStr) {
                const msg = 
                    `⚠️ <b>DIQQAT: DAVOMAT OBUNASI ERTAGA TUGAYDI!</b>\n\n` +
                    `Hurmatli mas'ul! Maktabingiz (<b>${escapeHtml(u.school || 'Maktab')}</b>) uchun oylik davomat ruxsati <b>ertaga (${expDateStr})</b> o'z nihoyasiga yetadi.\n\n` +
                    `Davomat kiritish to'xtab qolmasligi uchun to'lovni amalga oshirishingizni so'raymiz.\n\n` +
                    `<i>To'lov chekini rasm sifatida ushbu botga yuboring.</i>`;

                await bot.telegram.sendMessage(uid, msg, { parse_mode: 'HTML', reply_markup: reminderKeyboard });
                u.last_reminder_1d = todayStr;
                await db.updateUserDb(uid, { last_reminder_1d: todayStr });
                sent1d++;
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (err) {
            // Foydalanuvchi botni bloklagan bo'lishi mumkin
        }
    }
    console.log(`✅ [CRON] Subscription reminders sent: ${sent3d} (3-day), ${sent1d} (1-day).`);
}

// Initialize Cron Jobs
function initCrons() {
    // 0. Subscription Expiry Reminders (Every day at 08:30)
    cron.schedule('30 8 * * *', () => {
        sendSubscriptionReminders();
    }, { timezone: "Asia/Tashkent" });

    // 1. Daily Summary at 16:30 (Monday-Saturday)
    cron.schedule('30 16 * * 1-6', () => {
        sendDailySummary();
    }, { timezone: "Asia/Tashkent" });

    // 2. Flash Report at 16:45 (Monday-Saturday)
    cron.schedule('45 16 * * 1-6', () => {
        sendFlashReport();
    }, { timezone: "Asia/Tashkent" });

    // 3. Weekly Best Schools (Sunday at 09:00)
    cron.schedule('0 9 * * 0', () => {
        sendWeeklyBestSchools();
    }, { timezone: "Asia/Tashkent" });

    // 4. Pending Reports Warning (Every 2 hours from 10:00 to 14:00, Monday-Saturday)
    cron.schedule('0 10,12,14 * * 1-6', () => {
        sendPendingReportsWarning();
    }, { timezone: "Asia/Tashkent" });

    // 5. Final Report Summary (15:30 and 16:30, Monday-Saturday)
    cron.schedule('30 15,16 * * 1-6', () => {
        const now = getFargonaTime();
        const timeStr = `${now.getHours()}:30`;
        sendFinalReportsSummary(timeStr);
    }, { timezone: "Asia/Tashkent" });

    console.log("🚀 [Scheduler] Automated reports and subscription reminders initialized.");
}

module.exports = { initCrons, sendSubscriptionReminders };
