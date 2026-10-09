const { Telegraf } = require('telegraf');
const db = require('../database/db');
require('dotenv').config();

const parentBot = new Telegraf(process.env.PARENT_BOT_TOKEN || process.env.BOT_TOKEN);

/**
 * Notifies all parents subscribed to a school about the absentee list.
 * @param {Object} reportData - The attendance report data.
 * @param {Array} studentsList - List of absent students.
 */
async function notifyParents(reportData, studentsList) {
    if (!studentsList || studentsList.length === 0) return;

    const district = reportData.district;
    const school = reportData.school;
    const allUsers = db.users_db;

    console.log(`📡 [Notification] Broadcasting alerts for ${district}, ${school}...`);

    const parentsToNotify = Object.values(allUsers).filter(user =>
        user.role === 'parent' &&
        user.subscriptions &&
        user.subscriptions.some(s => s.district === district && s.school === school)
    );

    if (parentsToNotify.length === 0) return;

    const date = new Date().toLocaleDateString('uz-UZ');

    for (const parent of parentsToNotify) {
        let listText = studentsList.map((s, i) => `${i + 1}. <b>${s.name}</b> (${s.class}-sinf)`).join('\n');

        const msgs = {
            uz_lat: `🔔 <b>DIQQAT: Maktabda dars qoldirganlar ro'yxati!</b>\n\n` +
                `🏫 Maktab: <b>${school}</b>\n` +
                `📅 Sana: ${date}\n\n` +
                `📖 <b>Bugun darsga kelmagan o'quvchilar:</b>\n${listText}\n\n` +
                `⚠️ Farzandingiz ushbu ro'yxatda bo'lsa, iltimos maktab bilan bog'laning.`,
            uz_cyr: `🔔 <b>ДИҚҚАТ: Мактабда дарс қолдирганлар рўйхати!</b>\n\n` +
                `🏫 Мактаб: <b>${school}</b>\n` +
                `📅 Сана: ${date}\n\n` +
                `📖 <b>Бугун дарсга келмаган ўқувчилар:</b>\n${listText}\n\n` +
                `⚠️ Фарзандингиз ушбу рўйхатда бўлса, илтимос мактаб билан боғланинг.`,
            ru: `🔔 <b>ВНИМАНИЕ: Список отсутствующих в школе!</b>\n\n` +
                `🏫 Школа: <b>${school}</b>\n` +
                `📅 Дата: ${date}\n\n` +
                `📖 <b>Ученики, не пришедшие сегодня:</b>\n${listText}\n\n` +
                `⚠️ Если ваш ребенок есть в этом списке, пожалуйста, свяжитесь со школой.`
        };

        const text = msgs[parent.lang || 'uz_lat'] || msgs.uz_lat;
        try {
            await parentBot.telegram.sendMessage(parent.chat_id, text, { parse_mode: 'HTML' });
        } catch (e) {
            console.error(`❌ [Notification] Failed to send to parent ${parent.chat_id}:`, e.message);
        }
    }
}

module.exports = { notifyParents };
