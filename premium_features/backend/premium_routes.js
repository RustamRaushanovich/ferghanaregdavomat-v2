const express = require('express');
const router = express.Router();
const db = require('../../src/database/db');
const sqlite = require('../../src/database/pg');

// GET /api/premium/insights 
router.get('/insights', async (req, res) => {
    // Check if the user is PRO
    if (req.user.role !== 'superadmin' && !req.user.is_pro && !db.users_db[req.user.uid]?.is_pro) {
        return res.status(403).json({ error: 'Faqat PRO foydalanuvchilar uchun' });
    }

    try {
        const district = req.user.district;
        const school = req.user.school;

        // Mock AI Insights 
        const insights = {
            patterns: [
                "Dushanba kunlari davomat o'rtacha 5% ga pastroq",
                "Yuqori sinflarda (10-11) sababsiz dars qoldirish ko'p kuzatilmoqda",
                "Yomg'irli ob-havoda davomat pasayishi aniqlangan"
            ],
            red_students: [
                { name: "Azizov Akmal", class: "9-B", reason: "Muntazam", days: 4 },
                { name: "Tursunova Gulbahor", class: "11-A", reason: "Chet elda", days: 120 }
            ]
        };

        res.json(insights);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/premium/leaderboard
router.get('/leaderboard', async (req, res) => {
    try {
        // Return some top schools from DB for the leaderboard
        const ranking = {
            viloyat: [
                { school: "1-IDUM", district: "Farg‘ona shahar", avg_p: 99.2 },
                { school: "15-maktab", district: "Marg‘ilon shahar", avg_p: 98.8 },
                { school: "41-maktab", district: "Oltiariq tumani", avg_p: 98.5 }
            ],
            districts: [
                { district: "Farg‘ona shahar", school: "1-IDUM", avg_p: 99.2 },
                { district: "Marg‘ilon shahar", school: "15-maktab", avg_p: 98.8 }
            ]
        };
        res.json(ranking);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
