const { Scenes, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const db = require('../database/db'); 
const { getFargonaTime } = require('../utils/fargona');

const dbPath = path.join(__dirname, '..', 'database', 'xorij.json');

const xorijWizard = new Scenes.WizardScene(
    'xorij_wizard',
    async (ctx) => {
        const uid = Number(ctx.from.id);
        const user = db.users_db[uid];
        if (!user) {
             await ctx.reply("Sizda tizimdan foydalanish huquqi yo'q.");
             return ctx.scene.leave();
        }
        ctx.wizard.state.userData = user;
        ctx.wizard.state.xorijData = {
            district: user.district,
            school: user.school,
            date: getFargonaTime().toISOString(),
            submitter_id: uid,
            submitter_fio: user.fio || 'Noma\'lum'
        };
        await ctx.reply("✈️ <b>O'quvchi haqida ma'lumot kiritishni boshlaymiz.</b>\n\n1. O'quvchining F.I.SH (To'liq):", { parse_mode: 'HTML' });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.fio = ctx.message.text;
        await ctx.reply("2. Tug'ilgan sanasi (yil, oy, kun):");
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.birth_date = ctx.message.text;
        await ctx.reply("3. Sinfi (masalan: 9-A):");
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.class = ctx.message.text;
        await ctx.reply("4. Qaysi davlatga ketganligi:\n(Rossiya, Qozog'iston, Turkiya, BAA, Misr yoki boshqa)", 
            Markup.keyboard([["Rossiya", "Qozog'iston"], ["Turkiya", "BAA"], ["Misr", "Boshqa"]]).resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.country = ctx.message.text;
        await ctx.reply("5. Qachon ketganligi (Yil, oy, kun):", Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.gone_date = ctx.message.text;
        await ctx.reply("6. Ketish sababi:\n(Doimiy yashash, O'qish, Ishlash, Davolanish yoki boshqa)",
            Markup.keyboard([["Doimiy yashash", "O'qish"], ["Ishlash", "Davolanish"], ["Boshqa"]]).resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.reason = ctx.message.text;
        await ctx.reply("7. Kim bilan ketganligi:", Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.with_whom = ctx.message.text;
        await ctx.reply("8. Doimiy ro'yxatda turgan manzili:");
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.address = ctx.message.text;
        await ctx.reply("9. Bugungi holati (Qaytmadi / Qaytarildi / v.h):");
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.current_state = ctx.message.text;
        
        await ctx.reply("⚖️ <b>O'quvchi xorijga qonuniy tartibda chiqib ketganmi?</b>\n(Komissiya qarori va maktab buyrug'i bormi?)",
            Markup.keyboard([["✅ Ha (Qonuniy)", "❌ Yo'q (Noqonuniy)"]]).resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        const isLegal = ctx.message.text.includes("Ha");
        ctx.wizard.state.xorijData.is_legal = isLegal;
        
        if (isLegal) {
            await ctx.reply("📄 <b>Voyaga yetmaganlar komissiyasi qarori raqami va sanasini kiriting:</b>", Markup.removeKeyboard());
            return ctx.wizard.next();
        } else {
            ctx.wizard.state.xorijData.commission_doc = "Mavjud emas";
            ctx.wizard.state.xorijData.school_order = "Mavjud emas";
            
            await ctx.reply("🖥 <b>E-maktab platformasidagi holati:</b>\n(Hali ham o'quvchilar safidami? Qaysi sinfda? Yoki chiqarib yuborilganmi?)", Markup.removeKeyboard());
            ctx.wizard.selectStep(14); // Skip doc steps
            return;
        }
    },
    async (ctx) => {
        // Only if Legal
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.commission_doc = ctx.message.text;
        await ctx.reply("📄 <b>Maktab buyrug'i raqami va sanasini kiriting:</b>");
        return ctx.wizard.next();
    },
    async (ctx) => {
        // Only if Legal
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.school_order = ctx.message.text;
        await ctx.reply("📜 <b>O'quvchi o'quvchilar safidan qonuniy tartibda chiqarilganmi?</b>",
             Markup.keyboard([["✅ Ha", "❌ Yo'q"]]).resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.removed_legally = ctx.message.text.includes("Ha");
        
        await ctx.reply("🖥 <b>E-maktab platformasidagi holati:</b>\n(O'quvchilar safida bormi? Qaysi sinfda? Yoki chiqarib yuborilganmi?)", Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.message?.text === '/cancel') { ctx.reply("Bekor qilindi"); return ctx.scene.leave(); }
        ctx.wizard.state.xorijData.emaktab_status = ctx.message.text;
        await ctx.reply("📁 <b>Asoslovchi hujjatlarni yuboring (Rasm yoki PDF):</b>\n(Komissiya qarori, buyruq, bildirgi va h.k)");
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
        
        ctx.wizard.state.xorijData.file_id = fileId;
        ctx.wizard.state.xorijData.text_proof = ctx.message.text || '';

        // Save to PG DB (For Render Persistence)
        const pg = require('../database/pg');
        try {
            const s = ctx.wizard.state.xorijData;
            await pg.query(`
                INSERT INTO xorij_students (
                    json_id, student_name, dob, class_name, district, school, country, reason, companion, address, status, 
                    qonuniylik, q_sana, b_sana, created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
            `, [
                s.id.toString(), s.fio, s.birth_date, s.class, s.district, s.school, s.country, s.reason, s.with_whom, s.address, s.current_state,
                s.is_legal ? 'legal' : 'illegal', s.commission_doc, s.school_order, s.submitter_fio
            ]);
        } catch (e) {
            console.error("Bot Xorij Save PG Error:", e.message);
        }

        // Save to JSON DB (As local cache/backup)
        let data = [];
        try {
            if(fs.existsSync(dbPath)) data = JSON.parse(fs.readFileSync(dbPath));
        } catch(e){}
        
        ctx.wizard.state.xorijData.id = Date.now();
        data.push(ctx.wizard.state.xorijData);
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

        await ctx.reply("✅ <b>Ma'lumotlar muvaffaqiyatli qabul qilindi!</b>\nO'quvchi xorijga ketganlar bazasiga qo'shildi.", { parse_mode: 'HTML' });
        return ctx.scene.leave();
    }
);

module.exports = xorijWizard;
