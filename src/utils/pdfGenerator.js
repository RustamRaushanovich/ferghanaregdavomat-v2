const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getUploadsDir() {
    try {
        const dir = path.join(__dirname, '../../assets/uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const testFile = path.join(dir, `.test_${Date.now()}`);
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return dir;
    } catch (e) {
        return os.tmpdir();
    }
}

function generateBildirgi(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const timestamp = Date.now();
            const fileName = `BILDIRGI_${data.district}_${data.school}_${timestamp}.pdf`.replace(/[^a-zA-Z0-9_.]/g, '_');
            const filePath = path.join(getUploadsDir(), fileName);

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
            const fontPathBold = 'C:\\Windows\\Fonts\\arialbd.ttf';
            if (fs.existsSync(fontPathBold)) {
                doc.font(fontPathBold).fontSize(14).text("Bildirishnoma", { align: 'center' });
            } else {
                doc.fontSize(14).text("Bildirishnoma", { align: 'center' }); // Fallback if no bold font
            }
            // Switch back to regular font
            if (fs.existsSync(fontPath)) {
                doc.font(fontPath);
            }

            doc.moveDown(1.5);

            // 4. Body text
            const today = new Date();
            const year = today.getFullYear();
            const monthNames = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
            const month = monthNames[today.getMonth()];
            const day = today.getDate();
            const school = data.school || "________";

            doc.fontSize(12).text(
                `      ${year} yilning «${day}» ${month} kuni, soat 10.00 ga (15.00 ga) qadar ${district} tumanidagi ${school} hisobidagi quyidagi o'quvchilar sababsiz (muntazam) darsga kelmaganliklari bois, ularni ta'limga qaytarish so'raladi:`,
                { align: 'justify', lineGap: 4 }
            );

            doc.moveDown(1);

            // 5. Students List
            const students = data.students_list || [];
            students.forEach((s, index) => {
                doc.moveDown(0.5);
                const studentText = `      ${index + 1}. ${s.class || '___'}-sinf o'quvchisi ${s.name || '__________________________'}, yashash manzili: ${s.address || '________________________________'}, ota-onasining F.I.Sh: ${s.parent_name || '________________________'}, telefon raqami: ${s.parent_phone || '________________'};`;
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
            stream.on('error', (err) => reject(err));
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = { generateBildirgi };
