const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generates Annex 3 (Bildirishnoma) PDF
 * @param {Object} data 
 * @returns {Promise<string>} Path to generated PDF
 */
async function generateBildirishnoma(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const fileName = `Bildirishnoma_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '../../temp', fileName);

            // Ensure temp dir exists
            if (!fs.existsSync(path.join(__dirname, '../../temp'))) {
                fs.mkdirSync(path.join(__dirname, '../../temp'));
            }

            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            // Use Arial font for Uzbek characters support
            const fontPath = 'C:\\Windows\\Fonts\\arial.ttf';
            if (fs.existsSync(fontPath)) {
                doc.font(fontPath);
            }

            // 1. Header (Top Right)
            doc.fontSize(10).text(
                "Umumiy o'rta ta'lim maktablarida axloqiy-psixologik\nmuhitni yaxshilash, huquqbuzarliklar profilaktikasini amalga\noshirish, o'quvchilarni vatanparvarlik ruhida tarbiyalash va\ndavomatni yuritish chora-tadbirlarini takomillashtirish\nto'g'risida Nizomga",
                { align: 'right' }
            );
            doc.fontSize(10).text("3-ILOVA", { align: 'right', bold: true });

            doc.moveDown(2);

            // 2. Addressee (Right side)
            const district = data.district || "_________";
            const inspector = data.inspector || "__________________";
            doc.fontSize(12).text(
                `${district} tuman (shahar) inspektor-`,
                { align: 'right' }
            );
            doc.text(`psixologi ${inspector}ga`, { align: 'right' });
            doc.fontSize(10).text("(unvoni, F.I.Sh.)", { align: 'right' });

            doc.moveDown(2);

            // 3. Title
            doc.fontSize(14).text("Bildirishnoma", { align: 'center', bold: true });
            doc.moveDown(1.5);

            // 4. Body text
            const today = new Date();
            const year = today.getFullYear();
            const monthNames = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
            const month = monthNames[today.getMonth()];
            const day = today.getDate();
            const school = data.school || "________";

            doc.fontSize(12).text(
                `      ${year} yilning «${day}» ${month} kuni, soat 10.00 ga (15.00 ga) qadar ${district} tumanidagi ${school}-sonli umumiy o'rta ta'lim maktabi hisobidagi quyidagi o'quvchilar sababsiz (muntazam) darsga kelmaganliklari bois, ularni ta'limga qaytarish so'raladi:`,
                { align: 'justify', lineGap: 4 }
            );

            doc.moveDown(1);

            // 5. Students List
            const students = data.students || [];
            students.forEach((s, index) => {
                doc.moveDown(0.5);
                const studentText = `      ${index + 1}. ${s.class || '___'}-sinf o'quvchisi ${s.name || '__________________________'}, yashash manzili: ${s.address || '________________________________'}, ota-onasining telefon raqami: ${s.parent_phone || '________________'};`;
                doc.text(studentText, { align: 'justify', lineGap: 3 });
            });

            doc.moveDown(4);

            // 6. Footer (Signature)
            const fio = data.fio || "____________________";

            doc.fontSize(12);
            doc.text("Ma'naviy-ma'rifiy ishlar bo'yicha", { align: 'left' });
            doc.text("direktor o'rinbosari", { continued: true });

            doc.text(`          __________             ${fio}`, { align: 'right' });
            doc.fontSize(10);
            doc.text(`(imzo)                   (F.I.Sh.)`, { align: 'right' });

            doc.end();

            stream.on('finish', () => resolve(filePath));
            stream.on('error', reject);
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = { generateBildirishnoma };
