const { Scenes, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const db = require('../database/db'); 
const { getFargonaTime } = require('../utils/fargona');
const { analyzeMMIBDOWork } = require('../services/aiService');

const dbPath = path.join(__dirname, '..', 'database', 'mmibdo_rating.json');

const mmibdoRatingWizard = new Scenes.WizardScene(
    'mmibdo_rating_wizard',
    async (ctx) => {
        const uid = Number(ctx.from.id);
        const user = db.users_db[uid];
        if (!user) {
             await ctx.reply("Sizda tizimdan foydalanish huquqi yo'q.");
             return ctx.scene.leave();
        }
        ctx.wizard.state.userData = user;
        ctx.wizard.state.subData = {
            district: user.district,
            school: user.school,
            date: getFargonaTime().toISOString(),
            uid: uid,
            fio: user.fio || 'Noma\'lum'
        };
        await ctx.reply("🏅 <b>MMIBDO' Baholash Tizimi (AI)</b>\n\nIltimos, ish turini tanlang:", 
            Markup.keyboard([["📸 Tadbirlar", "📄 Hujjatlar"], ["👥 Profilaktika", "❌ Bekor qilish"]]).resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(!ctx.message?.text || ctx.message.text === '❌ Bekor qilish') { 
            await ctx.reply("Bekor qilindi", Markup.removeKeyboard()); 
            return ctx.scene.leave(); 
        }
        
        let type = 'tadbirlar';
        if (ctx.message.text.includes("Hujjatlar")) type = 'hujjatlar';
        else if (ctx.message.text.includes("Profilaktika")) type = 'profilaktika';
        
        ctx.wizard.state.subData.type = type;
        await ctx.reply(`✍️ <b>${ctx.message.text[0]} kiritayotgan ishingiz haqida to'liq matn / ma'lumot yuboring.</b>\n\nAI ushbu matnni tahlil qilib sizga ball beradi.`, Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.subData.description = ctx.message.text;
        await ctx.reply("📁 <b>Asoslovchi hujjatni (Rasm yoki PDF) yuboring:</b>\n\n(Bu bosqichni 'O'tkazib yuborish' mumkin emas, chunki tahlil uchun rasm/fayl muhim)",
            Markup.keyboard([["Skipping is not allowed"]]).removeKeyboard());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        
        let fileId = null;
        if (ctx.message?.photo) {
            fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else if (ctx.message?.document) {
            fileId = ctx.message.document.file_id;
        }
        
        if (!fileId) return ctx.reply("Iltimos, rasm yoki fayl ko'rinishida asoslovchi ma'lumot yuboring!");
        
        ctx.wizard.state.subData.file_id = fileId;
        
        await ctx.reply("⏳ <b>Sun'iy Intellekt ma'lumotlaringizni tahlil qilmoqda...</b>\nBu bir necha soniya vaqt olishi mumkin.");
        
        // AI ANALYZING
        const analysis = await analyzeMMIBDOWork(
            ctx.wizard.state.subData.type, 
            ctx.wizard.state.subData.description
        );
        
        ctx.wizard.state.subData.ai_score = analysis.score;
        ctx.wizard.state.subData.ai_feedback = analysis.feedback;
        ctx.wizard.state.subData.ai_strengths = analysis.strengths;
        ctx.wizard.state.subData.ai_weaknesses = analysis.weaknesses;

        // Save to JSON DB
        let data = [];
        try { if(fs.existsSync(dbPath)) data = JSON.parse(fs.readFileSync(dbPath)); } catch(e){}
        
        ctx.wizard.state.subData.id = Date.now();
        data.push(ctx.wizard.state.subData);
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

        const msg = `✅ <b>Ishingiz qabul qilindi!</b>\n\n` +
            `📊 <b>AI Bahosi:</b> ${analysis.score} ball\n` +
            `📝 <b>Izoh:</b> ${analysis.feedback}\n` +
            `🔹 <b>Yutuqlar:</b> ${analysis.strengths}\n` +
            `🚩 <b>Kamchiliklar:</b> ${analysis.weaknesses}\n\n` +
            `✨ <i>Reytingingizni Web Dashboardda kuzatib boring.</i>`;

        await ctx.replyWithHTML(msg);
        return ctx.scene.leave();
    }
);

module.exports = mmibdoRatingWizard;
