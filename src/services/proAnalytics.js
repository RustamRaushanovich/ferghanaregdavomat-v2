const db = require('../database/pg');
const { getFargonaTime } = require('../utils/fargona');

const ProAnalytics = {
    /**
     * "Qizil ro'yxat" - Weekly frequent absentees
     * Students who missed school 2 or more times (sababsiz) in the last 7 days.
     */
    async getWeeklyRedList(district, school) {
        try {
            const sql = `
                SELECT s.name, s.class, COUNT(s.id) as absent_count, s.parent_phone
                FROM absent_students s
                JOIN attendance a ON s.attendance_id = a.id
                WHERE a.district = $1 AND a.school = $2
                AND a.date >= (CURRENT_DATE - INTERVAL '7 days')
                GROUP BY s.name, s.class, s.parent_phone
                HAVING COUNT(s.id) >= 2
                ORDER BY absent_count DESC
            `;
            const res = await db.query(sql, [district, school]);
            return res.rows;
        } catch (e) {
            console.error("Weekly Red List Error:", e.message);
            return [];
        }
    },

    /**
     * Monthly Dynamics for the bot
     * Returns a 30-day attendance trend as text/emojis
     */
    async getMonthlyDynamics(district, school) {
        try {
            const sql = `
                SELECT date, percent
                FROM attendance
                WHERE district = $1 AND school = $2
                AND date >= (CURRENT_DATE - INTERVAL '30 days')
                ORDER BY date ASC
            `;
            const res = await db.query(sql, [district, school]);

            if (res.rows.length === 0) return "Tahlil uchun ma'lumot yetarli emas.";

            let report = `📊 <b>Oxirgi 30 kunlik tahlil (${school}):</b>\n\n`;
            let chart = "";
            let avg = 0;

            res.rows.forEach(r => {
                const dateShort = r.date.split('-').slice(1).join('.'); // MM.DD
                const p = parseFloat(r.percent);
                avg += p;

                // Simple emoji chart
                let bar = "🟥";
                if (p >= 95) bar = "🟩";
                else if (p >= 90) bar = "🟨";
                else if (p >= 85) bar = "🟧";

                chart += `📅 ${dateShort}: ${bar} <b>${p}%</b>\n`;
            });

            avg = (avg / res.rows.length).toFixed(1);
            report += chart;
            report += `\n📈 <b>O'rtacha davomat: ${avg}%</b>`;

            return report;
        } catch (e) {
            console.error("Monthly Dynamics Error:", e.message);
            return "Xatolik yuz berdi.";
        }
    },

    /**
     * AI Pattern Recognition
     * Identifies if a student misses specific days consistently
     */
    async getAIPatterns(district, school) {
        try {
            const sql = `
                SELECT s.name, s.class, a.date
                FROM absent_students s
                JOIN attendance a ON s.attendance_id = a.id
                WHERE a.district = $1 AND a.school = $2
                AND a.date >= (CURRENT_DATE - INTERVAL '60 days')
            `;
            const res = await db.query(sql, [district, school]);

            if (res.rows.length === 0) return null;

            const studentAbsents = {};
            res.rows.forEach(r => {
                const key = `${r.name} (${r.class}-sinf)`;
                const day = new Date(r.date).getDay(); // 0-6
                if (!studentAbsents[key]) studentAbsents[key] = [];
                studentAbsents[key].push(day);
            });

            const dayNames = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
            let insights = [];

            for (const [student, days] of Object.entries(studentAbsents)) {
                if (days.length < 3) continue;

                // Count occurrences of each day
                const counts = {};
                days.forEach(d => counts[d] = (counts[d] || 0) + 1);

                for (const [day, count] of Object.entries(counts)) {
                    if (count >= 3) {
                        insights.push(`⚠️ <b>${student}</b> oxirgi vaqtlarda asosan <b>${dayNames[day]}</b> kunlari dars qoldirgan (${count} marta). Bunga e'tibor qaratish kerak.`);
                    }
                }
            }

            return insights.length > 0 ? insights.join('\n\n') : "Hozircha shubhali takroriy holatlar aniqlanmadi.";
        } catch (e) {
            console.error("AI Pattern Error:", e.message);
            return "AI tahlilida xatolik.";
        }
    },

    /**
     * Non-submitting schools analysis
     * Finds schools that missed attendance submission for more than 5 days in the last 30 days
     */
    async getNonSubmittingSchools(district = null) {
        try {
            const schoolsDb = require('../database/db').schools_db;
            const districts = district ? [district] : Object.keys(schoolsDb).filter(d => !["Test rejimi", "MMT Boshqarma"].includes(d));
            const last30DaysRes = await db.query(`
                SELECT district, school, count(DISTINCT date) as submissions
                FROM attendance
                WHERE date >= (CURRENT_DATE - INTERVAL '30 days')
                GROUP BY district, school
            `);
            const submissions = last30DaysRes.rows;
            const totalWorkDays = 26; // Mon-Sat in 30 days

            const problematic = [];
            districts.forEach(d => {
                const districtSchools = schoolsDb[d] || [];
                districtSchools.forEach(s => {
                    const sub = submissions.find(row => row.district === d && row.school === s);
                    const count = sub ? parseInt(sub.submissions) : 0;
                    if (count < 20) { // Missed 6+ days
                         problematic.push({ district: d, school: s, submissions: count, missed: (totalWorkDays - count) > 0 ? (totalWorkDays - count) : 0 });
                    }
                });
            });
            return problematic.sort((a,b) => a.submissions - b.submissions);
        } catch (e) {
            console.error("Non-submitting schools error:", e);
            return [];
        }
    },

    /**
     * Deep Analysis for Dashboard:
     * Groups missing schools by: Today, 3 days, 1 week, 2 weeks, 3 weeks, Never
     */
    async getDeepNonSubmittingAnalysis(dateStr) {
        try {
            const schoolsDb = require('../database/db').schools_db;
            const districts = Object.keys(schoolsDb).filter(d => !["Test rejimi", "MMT Boshqarma"].includes(d));

            // Fetch the LAST submission date for all schools
            const res = await db.query(`
                SELECT district, school, MAX(date) as last_date
                FROM attendance
                GROUP BY district, school
            `);
            
            const lastSubmissions = {};
            res.rows.forEach(r => {
                if (!lastSubmissions[r.district]) lastSubmissions[r.district] = {};
                lastSubmissions[r.district][r.school] = r.last_date;
            });

            const today = new Date(dateStr);
            today.setHours(0,0,0,0);

            const result = {
                districtsData: {},
                categories: {
                    today: [],
                    days3: [],
                    week1: [],
                    week2: [],
                    week3: [],
                    never: []
                }
            };

            districts.forEach(d => {
                result.districtsData[d] = {
                    totalSchools: schoolsDb[d]?.length || 0,
                    missingToday: []
                };

                const dSchools = schoolsDb[d] || [];
                dSchools.forEach(s => {
                    const lastDateStr = lastSubmissions[d] && lastSubmissions[d][s];
                    
                    if (!lastDateStr) {
                        result.categories.never.push({ district: d, school: s });
                        result.districtsData[d].missingToday.push(s);
                    } else {
                        const lastDate = new Date(lastDateStr);
                        lastDate.setHours(0,0,0,0);
                        
                        const diffTime = Math.abs(today - lastDate);
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays >= 1) result.districtsData[d].missingToday.push(s);

                        if (diffDays === 1 || diffDays === 2) result.categories.today.push({ district: d, school: s, days: diffDays });
                        else if (diffDays >= 3 && diffDays < 7) result.categories.days3.push({ district: d, school: s, days: diffDays });
                        else if (diffDays >= 7 && diffDays < 14) result.categories.week1.push({ district: d, school: s, days: diffDays });
                        else if (diffDays >= 14 && diffDays < 21) result.categories.week2.push({ district: d, school: s, days: diffDays });
                        else if (diffDays >= 21) result.categories.week3.push({ district: d, school: s, days: diffDays });
                    }
                });
            });

            return result;
        } catch (e) {
            console.error("Deep analysis error:", e);
            return null;
        }
    }
};

module.exports = ProAnalytics;
