const { Scenes, Markup } = require('telegraf');
const db = require('../database/db');

const broadcastScene = new Scenes.WizardScene(
    'broadcast_wizard',
    // 1. Ask for message
    async (ctx) => {
        await ctx.reply("📢 <b>E'lon yuborish rejimi</b>\n\nBarcha foydalanuvchilarga yubormoqchi bo'lgan xabaringizni yozing yoki rasm/video tashlang.\n\n(Bekor qilish uchun /cancel ni bosing)", { parse_mode: 'HTML' });
        return ctx.wizard.next();
    },
    // 2. Confirm message
    async (ctx) => {
        if (ctx.message.text === '/cancel') {
            await ctx.reply("Bekor qilindi.");
            return ctx.scene.leave();
        }

        // Store message info to session
        ctx.scene.session.messageToBroadcast = {
            message_id: ctx.message.message_id,
            chat_id: ctx.chat.id
        };

        const userCount = Object.keys(db.users_db).length;
        await ctx.reply(`Ushbu xabar <b>${userCount}</b> ta foydalanuvchiga yuboriladi. Tasdiqlaysizmi?`, {
            parse_mode: 'HTML',
            ...Markup.keyboard([["✅ YUBORISH", "❌ BEKOR QILISH"]]).oneTime().resize()
        });
        return ctx.wizard.next();
    },
    // 3. Send
    async (ctx) => {
        if (ctx.message.text !== "✅ YUBORISH") {
            await ctx.reply("E'lon yuborish bekor qilindi.", Markup.removeKeyboard());
            return ctx.scene.leave();
        }

        const msgInfo = ctx.scene.session.messageToBroadcast;
        const users = Object.keys(db.users_db);
        let sent = 0;
        let blocked = 0;
        let startTime = Date.now();

        await ctx.reply("🚀 Yuborish boshlandi...", Markup.removeKeyboard());

        for (const uid of users) {
            try {
                await ctx.telegram.copyMessage(uid, msgInfo.chat_id, msgInfo.message_id);
                sent++;
            } catch (e) {
                blocked++; // Usually 403 Forbidden means blocked
            }
            // Add slight delay to avoid flood limits (approx 20 msgs/sec limit, safe to do 30ms delay)
            await new Promise(r => setTimeout(r, 50));
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        await ctx.reply(`✅ <b>Hisobot:</b>\n\n🟢 Yuborildi: ${sent} ta\n🔴 Yetib bormadi (blok): ${blocked} ta\n⏱ Vaqt: ${duration} s`, { parse_mode: 'HTML' });

        return ctx.scene.leave();
    }
);

module.exports = broadcastScene;
