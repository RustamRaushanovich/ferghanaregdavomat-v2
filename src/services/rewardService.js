const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

async function generateCertificate(schoolName, districtName, period = 'Haftalik') {
    const width = 1200;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Background (Premium Slate)
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#020617');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Load the REAL GOLD LOGO
    try {
        const logoPath = path.join(__dirname, '../../assets/logo_final_real.png');
        if (fs.existsSync(logoPath)) {
            const logo = await loadImage(logoPath);

            // Faded watermark logo in the center
            ctx.save();
            ctx.globalAlpha = 0.08;
            const waterSize = 650;
            ctx.drawImage(logo, (width - waterSize) / 2, (height - waterSize) / 2 + 50, waterSize, waterSize);
            ctx.restore();

            // Official Header Logo
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 15;
            const logoSize = 180;
            ctx.drawImage(logo, (width - logoSize) / 2, 60, logoSize, logoSize);
            ctx.restore();
        }
    } catch (e) {
        console.error("Logo Loading Error:", e);
    }

    // 3. Premium Gold Double Border
    const gold = '#c5a059';
    ctx.strokeStyle = gold;
    ctx.lineWidth = 15;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    // Thin line
    ctx.strokeStyle = 'rgba(197, 160, 89, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(50, 50, width - 100, height - 100);

    // 4. Content
    ctx.textAlign = 'center';

    // Sarlavha
    ctx.fillStyle = gold;
    ctx.font = 'bold 85px serif';
    ctx.fillText('TASHAKKURNOMA', width / 2, 340);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 28px Arial';
    ctx.fillText('NAMUNALI DAVOMAT UCHUN', width / 2, 385);

    // Recipient (School Name)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 70px Arial';
    ctx.fillText(schoolName.toUpperCase(), width / 2, 530);

    // Dynamic Grammar Implementation
    let suffix = 'tumanidagi'; // default
    let cleanDist = districtName;

    if (districtName.toLowerCase().includes('shahri')) {
        suffix = 'shahridagi';
        cleanDist = districtName.replace(/shahri/gi, '').trim();
    } else {
        cleanDist = districtName.replace(/tumani/gi, '').trim();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '34px Arial';
    const lines = [
        `Ushbu tashakkurnoma ${cleanDist} ${suffix} ${schoolName} jamoasiga`,
        `${period.toLowerCase()} davomat ko'rsatkichlarini namunali darajaga`,
        `ko'targanligi munosabati bilan MMT Boshqarmasi tomonidan taqdim etiladi.`
    ];
    lines.forEach((line, i) => {
        ctx.fillText(line, width / 2, 620 + (i * 45));
    });

    // 5. Official Footnote
    ctx.fillStyle = gold;
    ctx.font = 'bold 28px Arial';
    ctx.fillText('Farg‘ona viloyati MMTB', width / 2, 800);

    ctx.fillStyle = '#64748b';
    ctx.font = '22px Arial';
    ctx.fillText('R.R. Turdiyev', width / 2, 840);

    return canvas.toBuffer('image/png');
}

module.exports = { generateCertificate };
