const db = require('../database/pg');
const { getFargonaTime } = require('../utils/fargona');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { normalizeKey } = require('../utils/topics');

const os = require('os');
const memCache = {
    viloyat: {},
    tuman: {}
};
const CACHE_TTL = 15000;

function getExportDir() {
    try {
        const dir = path.resolve(__dirname, '../../assets');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const testFile = path.join(dir, `.test_${Date.now()}`);
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return dir;
    } catch (e) {
        return os.tmpdir();
    }
}

async function getRawAttendanceRecords(date) {
    if (process.env.DATABASE_URL) {
        try {
            const res = await db.query(`
                WITH latest_attendance AS (
                    SELECT DISTINCT ON (district, school) *
                    FROM attendance
                    WHERE date = $1
                    ORDER BY district, school, id DESC
                )
                SELECT * FROM latest_attendance
            `, [date]);
            if (res.rows && res.rows.length > 0) return res.rows;
        } catch (e) {
            console.warn("PostgreSQL getRawAttendanceRecords error, using SQLite:", e.message);
        }
    }
    try {
        const sqliteDb = require('../database/sqlite');
        const rows = sqliteDb.prepare("SELECT * FROM attendance WHERE date = ? ORDER BY id DESC").all(date);
        const map = new Map();
        for (const r of rows) {
            const k = `${normalizeKey(r.district)}_${normalizeKey(r.school)}`;
            if (!map.has(k)) map.set(k, r);
        }
        return Array.from(map.values());
    } catch (e) {
        console.error("SQLite getRawAttendanceRecords error:", e.message);
        return [];
    }
}
 // 15 soniya davomida keshda saqlash (dashboard tezligi uchun)


async function saveAttendance(data) {
    const time = getFargonaTime().toTimeString().split(' ')[0].substring(0, 5);
    const date = getFargonaTime().toISOString().split('T')[0];

    const total_students = parseInt(data.total_students) || 1;
    const sababli_total = parseInt(data.sababli_total !== undefined ? data.sababli_total : data.sababli_jami) || 0;
    const sababsiz_total = parseInt(data.sababsiz_total !== undefined ? data.sababsiz_total : data.sababsiz_jami) || 0;
    const total_absent = (data.total_absent !== undefined && !isNaN(parseInt(data.total_absent)))
        ? parseInt(data.total_absent)
        : (sababli_total + sababsiz_total);
    let percent = ((total_students - total_absent) / total_students * 100);
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    const academic_year = require('../database/db').settings.academic_year || '2026-2027';

    // Invalidate cache so changes reflect instantly
    if (memCache.viloyat) delete memCache.viloyat[date];
    memCache.tuman = {};

    // ── PostgreSQL yo'lida ──────────────────────────────────────────
    if (process.env.DATABASE_URL) {
        try {
            await db.query(
                `DELETE FROM absent_students WHERE attendance_id IN (SELECT id FROM attendance WHERE district=$1 AND school=$2 AND date=$3)`,
                [data.district, data.school, date]);
            await db.query(
                `DELETE FROM attendance WHERE district=$1 AND school=$2 AND date=$3`,
                [data.district, data.school, date]);

            const query = `
                INSERT INTO attendance (
                    date, time, district, school, classes_count, total_students,
                    sababli_kasal, sababli_tadbirlar, sababli_oilaviy, sababli_ijtimoiy, sababli_boshqa, sababli_jami,
                    sababsiz_muntazam, sababsiz_qidiruv, sababsiz_chetel, sababsiz_boyin, sababsiz_ishlab,
                    sababsiz_qarshilik, sababsiz_jazo, sababsiz_nazoratsiz, sababsiz_boshqa, sababsiz_turmush, sababsiz_jami,
                    total_absent, percent, fio, phone, inspector, user_id, source, bildirgi, academic_year
                ) VALUES (
                    $1,$2,$3,$4,$5,$6, $7,$8,$9,$10,$11,$12,
                    $13,$14,$15,$16,$17, $18,$19,$20,$21,$22,$23,
                    $24,$25,$26,$27,$28,$29,$30,$31,$32
                ) RETURNING id;
            `;
            const values = [
                date, time, data.district || '', data.school || '', parseInt(data.classes_count) || 0, total_students,
                parseInt(data.sababli_kasal) || 0, parseInt(data.sababli_tadbirlar) || 0, parseInt(data.sababli_oilaviy) || 0, parseInt(data.sababli_ijtimoiy) || 0, parseInt(data.sababli_boshqa) || 0, sababli_total,
                parseInt(data.sababsiz_muntazam) || 0, parseInt(data.sababsiz_qidiruv) || 0, parseInt(data.sababsiz_chetel) || 0, parseInt(data.sababsiz_boyin) || 0, parseInt(data.sababsiz_ishlab) || 0,
                parseInt(data.sababsiz_qarshilik) || 0, parseInt(data.sababsiz_jazo) || 0, parseInt(data.sababsiz_nazoratsiz) || 0, parseInt(data.sababsiz_boshqa) || 0, parseInt(data.sababsiz_turmush) || 0, sababsiz_total,
                total_absent, parseFloat(percent.toFixed(1)),
                data.fio || '', data.phone || '', data.inspector || '', parseInt(data.user_id) || 0, data.source || 'bot', data.bildirgi || null,
                academic_year
            ];
            const res = await db.query(query, values);
            const attId = res.rows[0].id;

            if (data.students_list && data.students_list.length > 0) {
                for (const s of data.students_list) {
                    const student = typeof s === 'string' ? JSON.parse(s) : s;
                    await db.query(
                        `INSERT INTO absent_students (attendance_id, class, name, address, parent_name, parent_phone) VALUES ($1,$2,$3,$4,$5,$6)`,
                        [attId, student.class || '', student.name || '', student.address || '', student.parent_name || '', student.parent_phone || '']
                    );
                }
            }
            return true;
        } catch (e) {
            console.error("Save Attendance PostgreSQL Error:", e.message, "→ SQLite fallback...");
        }
    }

    // ── SQLite fallback (mahalliy ishlash uchun) ────────────────────
    try {
        const sqliteDb = require('../database/sqlite');

        // Delete existing entry for overwrite
        const existing = sqliteDb.prepare(
            `SELECT id FROM attendance WHERE district=? AND school=? AND date=?`
        ).get(data.district, data.school, date);
        if (existing) {
            sqliteDb.prepare(`DELETE FROM absent_students WHERE attendance_id=?`).run(existing.id);
            sqliteDb.prepare(`DELETE FROM attendance WHERE id=?`).run(existing.id);
        }

        const ins = sqliteDb.prepare(`
            INSERT INTO attendance (
                date, time, district, school, classes_count, total_students,
                sababli_kasal, sababli_tadbirlar, sababli_oilaviy, sababli_ijtimoiy, sababli_boshqa, sababli_jami,
                sababsiz_muntazam, sababsiz_qidiruv, sababsiz_chetel, sababsiz_boyin, sababsiz_ishlab,
                sababsiz_qarshilik, sababsiz_jazo, sababsiz_nazoratsiz, sababsiz_boshqa, sababsiz_turmush, sababsiz_jami,
                total_absent, percent, fio, phone, inspector, user_id, source, bildirgi, academic_year
            ) VALUES (?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?)
        `);

        const result = ins.run(
            date, time, data.district || '', data.school || '', parseInt(data.classes_count) || 0, total_students,
            parseInt(data.sababli_kasal) || 0, parseInt(data.sababli_tadbirlar) || 0, parseInt(data.sababli_oilaviy) || 0, parseInt(data.sababli_ijtimoiy) || 0, parseInt(data.sababli_boshqa) || 0, sababli_total,
            parseInt(data.sababsiz_muntazam) || 0, parseInt(data.sababsiz_qidiruv) || 0, parseInt(data.sababsiz_chetel) || 0, parseInt(data.sababsiz_boyin) || 0, parseInt(data.sababsiz_ishlab) || 0,
            parseInt(data.sababsiz_qarshilik) || 0, parseInt(data.sababsiz_jazo) || 0, parseInt(data.sababsiz_nazoratsiz) || 0, parseInt(data.sababsiz_boshqa) || 0, parseInt(data.sababsiz_turmush) || 0, sababsiz_total,
            total_absent, parseFloat(percent.toFixed(1)),
            data.fio || '', data.phone || '', data.inspector || '', parseInt(data.user_id) || 0, data.source || 'bot', data.bildirgi || null,
            academic_year
        );
        const attId = result.lastInsertRowid;

        if (data.students_list && data.students_list.length > 0) {
            const insStudent = sqliteDb.prepare(`
                INSERT INTO absent_students (attendance_id, class, name, address, parent_name, parent_phone)
                VALUES (?,?,?,?,?,?)
            `);
            for (const s of data.students_list) {
                const student = typeof s === 'string' ? JSON.parse(s) : s;
                insStudent.run(attId, student.class, student.name, student.address, student.parent_name, student.parent_phone);
            }
        }

        console.log(`[SQLite] Davomat saqlandi: ${data.district} – ${data.school}`);
        return true;
    } catch (e) {
        console.error("Save Attendance SQLite Error:", e);
        return false;
    }
}


async function checkIfExists(district, school, date) {
    try {
        const straightDist = district ? district.replace(/[‘’`]/g, "'") : '';
        const curlyDist = district ? district.replace(/['’`]/g, "‘") : '';
        if (process.env.DATABASE_URL) {
            const res = await db.query(
                'SELECT id FROM attendance WHERE (district = $1 OR district = $2 OR district = $3) AND school = $4 AND date = $5 LIMIT 1',
                [district, straightDist, curlyDist, school, date]
            );
            return res.rows.length > 0;
        }
        // SQLite fallback
        const sqliteDb = require('../database/sqlite');
        const row = sqliteDb.prepare('SELECT id FROM attendance WHERE (district=? OR district=? OR district=?) AND school=? AND date=? LIMIT 1')
            .get(district, straightDist, curlyDist, school, date);
        return !!row;
    } catch (e) {
        return false;
    }
}

const setStyle = (cell, options = {}) => {
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    if (options.bold) cell.font = { bold: true, size: options.size || 10 };
    if (options.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fill } };
};

async function exportToExcel(date) {
    try {
        const targetDate = date || getFargonaTime().toISOString().split('T')[0];
        const schoolsDb = require('../database/db').schools_db;
        const allDistricts = ["Farg'ona shahri", "Marg'ilon shahri", "Qo'qon shahri", "Quvasoy shahri", "Beshariq tumani", "Bag'dod tumani", "Uchko'prik tumani", "Qo'shtepa tumani", "Farg'ona tumani", "O'zbekiston tumani", "Dang'ara tumani", "Rishton tumani", "So'x tumani", "Toshloq tumani", "Oltiariq tumani", "Furqat tumani", "Buvayda tumani", "Quva tumani", "Yozyovon tumani"];

        const workbook = new ExcelJS.Workbook();
        const sheet1 = workbook.addWorksheet('Viloyat Svod');

        sheet1.mergeCells('A1:X1'); sheet1.getCell('A1').value = `Farg'ona viloyati maktablari kunlik davomati (Sana: ${targetDate})`;
        sheet1.getCell('A1').font = { bold: true, size: 14 }; sheet1.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
        sheet1.getRow(1).height = 30;

        sheet1.mergeCells('A2:A3'); sheet1.getCell('A2').value = "№";
        sheet1.mergeCells('B2:B3'); sheet1.getCell('B2').value = "Tuman (shahar) nomi";
        sheet1.mergeCells('C2:C3'); sheet1.getCell('C2').value = "Jami maktablar";
        sheet1.mergeCells('D2:D3'); sheet1.getCell('D2').value = "Bugun kiritganlar";
        sheet1.mergeCells('E2:E3'); sheet1.getCell('E2').value = "Sinflar soni";
        sheet1.mergeCells('F2:F3'); sheet1.getCell('F2').value = "Jami o'quvchilar";
        sheet1.mergeCells('G2:G3'); sheet1.getCell('G2').value = "Davomat %";
        sheet1.mergeCells('H2:H3'); sheet1.getCell('H2').value = "Jami kelmaganlar";
        sheet1.mergeCells('I2:M2'); sheet1.getCell('I2').value = "Sababli kelmaganlar";
        ["Kasalligi", "Tadbirlar", "Oilaviy", "Ijtimoiy", "Boshqa"].forEach((v, i) => sheet1.getCell(3, 9 + i).value = v);
        sheet1.mergeCells('N2:N3'); sheet1.getCell('N2').value = "Sababsiz jami";
        sheet1.mergeCells('O2:X2'); sheet1.getCell('O2').value = "Shundan Sababsizlar:";
        ["Muntazam", "Qidiruv", "Chet el", "Bo'yin tovlagan", "Ishlab yurgan", "Qarshilik", "Jazo/Tergov", "Nazoratsiz", "Boshqa", "Turmushga chiqqan"].forEach((v, i) => sheet1.getCell(3, 15 + i).value = v);

        for (let r = 2; r <= 3; r++) {
            sheet1.getRow(r).height = 40;
            for (let c = 1; c <= 24; c++) {
                setStyle(sheet1.getCell(r, c), { bold: true, fill: c >= 14 ? 'FFF8CBAD' : 'FFC6E0B4', size: 9 });
            }
        }

        const rawRows = await getRawAttendanceRecords(targetDate);
        const entriesByDist = {};
        for (const r of rawRows) {
            const nd = normalizeKey(r.district);
            if (!entriesByDist[nd]) {
                entriesByDist[nd] = {
                    entries: 0, classes: 0, students: 0,
                    sk: 0, st: 0, so: 0, si: 0, sb: 0,
                    sm: 0, sq: 0, sc: 0, sboy: 0, si_ish: 0,
                    sqar: 0, sj: 0, sn: 0, sb_ss: 0, stur: 0,
                    ss_jami: 0, t_absent: 0
                };
            }
            const agg = entriesByDist[nd];
            agg.entries += 1;
            agg.classes += (parseInt(r.classes_count) || 0);
            agg.students += (parseInt(r.total_students) || 0);
            agg.sk += (parseInt(r.sababli_kasal) || 0);
            agg.st += (parseInt(r.sababli_tadbirlar) || 0);
            agg.so += (parseInt(r.sababli_oilaviy) || 0);
            agg.si += (parseInt(r.sababli_ijtimoiy) || 0);
            agg.sb += (parseInt(r.sababli_boshqa) || 0);
            agg.sm += (parseInt(r.sababsiz_muntazam) || 0);
            agg.sq += (parseInt(r.sababsiz_qidiruv) || 0);
            agg.sc += (parseInt(r.sababsiz_chetel) || 0);
            agg.sboy += (parseInt(r.sababsiz_boyin) || 0);
            agg.si_ish += (parseInt(r.sababsiz_ishlab) || 0);
            agg.sqar += (parseInt(r.sababsiz_qarshilik) || 0);
            agg.sj += (parseInt(r.sababsiz_jazo) || 0);
            agg.sn += (parseInt(r.sababsiz_nazoratsiz) || 0);
            agg.sb_ss += (parseInt(r.sababsiz_boshqa) || 0);
            agg.stur += (parseInt(r.sababsiz_turmush) || 0);
            agg.ss_jami += (parseInt(r.sababsiz_jami) || 0);
            agg.t_absent += (parseInt(r.total_absent) || 0);
        }

        let v_schools = 0, v_entries = 0, v_classes = 0, v_students = 0, v_tabsent = 0;
        let v_sababli = Array(5).fill(0), v_sababsiz = Array(11).fill(0);

        allDistricts.forEach((dName, i) => {
            const d = entriesByDist[normalizeKey(dName)] || {};
            const totalSchools = schoolsDb[dName] ? schoolsDb[dName].length : 0;
            const students = parseInt(d.students) || 0;
            const tabsent = parseInt(d.t_absent) || 0;
            const perc = students > 0 ? ((students - tabsent) / students * 100).toFixed(1) : 0;

            const row = sheet1.addRow([
                i + 1, dName, totalSchools, parseInt(d.entries) || 0, parseInt(d.classes) || 0, students, perc + '%', tabsent,
                parseInt(d.sk) || 0, parseInt(d.st) || 0, parseInt(d.so) || 0, parseInt(d.si) || 0, parseInt(d.sb) || 0, parseInt(d.ss_jami) || 0,
                parseInt(d.sm) || 0, parseInt(d.sq) || 0, parseInt(d.sc) || 0, parseInt(d.sboy) || 0, parseInt(d.si_ish) || 0, parseInt(d.sqar) || 0, parseInt(d.sj) || 0, parseInt(d.sn) || 0, parseInt(d.sb_ss) || 0, parseInt(d.stur) || 0
            ]);
            row.eachCell(cell => setStyle(cell));

            v_schools += totalSchools; v_entries += (parseInt(d.entries) || 0); v_classes += (parseInt(d.classes) || 0); v_students += students; v_tabsent += tabsent;
            v_sababli[0] += (parseInt(d.sk) || 0); v_sababli[1] += (parseInt(d.st) || 0); v_sababli[2] += (parseInt(d.so) || 0); v_sababli[3] += (parseInt(d.si) || 0); v_sababli[4] += (parseInt(d.sb) || 0);
            v_sababsiz[0] += (parseInt(d.ss_jami) || 0); v_sababsiz[1] += (parseInt(d.sm) || 0); v_sababsiz[2] += (parseInt(d.sq) || 0); v_sababsiz[3] += (parseInt(d.sc) || 0); v_sababsiz[4] += (parseInt(d.sboy) || 0); v_sababsiz[5] += (parseInt(d.si_ish) || 0); v_sababsiz[6] += (parseInt(d.sqar) || 0); v_sababsiz[7] += (parseInt(d.sj) || 0); v_sababsiz[8] += (parseInt(d.sn) || 0); v_sababsiz[9] += (parseInt(d.sb_ss) || 0); v_sababsiz[10] += (parseInt(d.stur) || 0);
        });

        const totalPerc = v_students > 0 ? ((v_students - v_tabsent) / v_students * 100).toFixed(1) : 0;
        const sumRow = sheet1.addRow(["", "VILOYAT JAMI", v_schools, v_entries, v_classes, v_students, totalPerc + '%', v_tabsent, ...v_sababli, ...v_sababsiz]);
        sumRow.eachCell(cell => setStyle(cell, { bold: true, fill: 'FFFFFF00' }));

        const logoPath = path.join(__dirname, '../../assets/logo.png');
        if (fs.existsSync(logoPath)) {
            const logo = workbook.addImage({ filename: logoPath, extension: 'png' });
            sheet1.addImage(logo, { tl: { col: 1, row: sheet1.lastRow.number + 1 }, ext: { width: 120, height: 120 } });
        }

        sheet1.getColumn(1).width = 5; sheet1.getColumn(2).width = 25; for (let c = 3; c <= 24; c++) sheet1.getColumn(c).width = 11;

        const sheet2 = workbook.addWorksheet("Sababsiz O'quvchilar");
        sheet2.columns = [
            { header: '№', key: 'id', width: 5 },
            { header: 'Sana', key: 'date', width: 12 },
            { header: 'Tuman', key: 'district', width: 25 },
            { header: 'Maktab', key: 'school', width: 20 },
            { header: 'Sinf', key: 'class', width: 10 },
            { header: 'F.I.SH', key: 'name', width: 35 },
            { header: 'Manzil', key: 'address', width: 40 },
            { header: 'Ota-onasi', key: 'parent', width: 25 },
            { header: 'Tel', key: 'phone', width: 15 },
            { header: 'Inspektor', key: 'inspector', width: 25 },
            { header: 'Holat', key: 'status', width: 15 }
        ];
        sheet2.getRow(1).font = { bold: true }; sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

        const absentsRes = await db.query(`
            SELECT a.date, a.district, a.school, s.class, s.name, s.address, s.parent_name, s.parent_phone, a.inspector 
            FROM absent_students s 
            JOIN attendance a ON s.attendance_id = a.id 
            WHERE a.date = $1`, [targetDate]);

        for (let i = 0; i < absentsRes.rows.length; i++) {
            const r = absentsRes.rows[i];
            // Calculate consecutive days
            const streakRes = await db.query(`
                SELECT count(DISTINCT a.date) as streak
                FROM absent_students s
                JOIN attendance a ON s.attendance_id = a.id
                WHERE s.name = $1 AND a.school = $2 AND a.district = $3 AND a.date <= $4
            `, [r.name, r.school, r.district, targetDate]);
            const streak = parseInt(streakRes.rows[0].streak) || 1;
            const status = streak >= 3 ? "🔴 Muntazam" : "🟡 Odatiy";

            sheet2.addRow({
                id: i + 1,
                date: r.date,
                district: r.district,
                school: r.school,
                class: r.class,
                name: r.name,
                address: r.address,
                parent: r.parent_name,
                phone: r.parent_phone,
                inspector: r.inspector,
                status: status
            });
        }

        const assetsDir = getExportDir();
        const filePath = path.join(assetsDir, `HISOBOT_VILOYAT_${targetDate}.xlsx`);
        await workbook.xlsx.writeFile(filePath); return filePath;
    } catch (e) { console.error("Excel Error:", e); return null; }
}

async function exportDistrictExcel(district, date) {
    try {
        const targetDate = date || getFargonaTime().toISOString().split('T')[0];
        const schoolsDb = require('../database/db').schools_db;
        const normD = normalizeKey(district);
        const dbKey = Object.keys(schoolsDb).find(k => normalizeKey(k) === normD);
        const districtSchools = schoolsDb[dbKey || district] || [];

        const workbook = new ExcelJS.Workbook();
        const sheet1 = workbook.addWorksheet('Tuman Svod');
        sheet1.mergeCells('A1:V1'); sheet1.getCell('A1').value = `${district} maktablari kunlik davomati (Sana: ${targetDate})`;
        sheet1.getCell('A1').font = { bold: true, size: 14 }; sheet1.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
        sheet1.getRow(1).height = 30;

        ["№", "Maktab nomi", "Sinflar", "O'quvchilar", "Davomat %", "Kelmaganlar"].forEach((v, i) => { sheet1.mergeCells(2, i + 1, 3, i + 1); sheet1.getCell(2, i + 1).value = v; });
        sheet1.mergeCells('G2:K2'); sheet1.getCell('G2').value = "Sababli";
        ["Kasalligi", "Tadbirlar", "Oilaviy", "Ijtimoiy", "Boshqa"].forEach((v, i) => sheet1.getCell(3, 7 + i).value = v);
        sheet1.mergeCells('L2:L3'); sheet1.getCell('L2').value = "Sababsiz jami";
        sheet1.mergeCells('M2:V2'); sheet1.getCell('M2').value = "Shundan Sababsizlar:";
        ["Muntazam", "Qidiruv", "Chet el", "Bo'yin", "Ish", "Qarshilik", "Jazo", "Nazoratsiz", "Boshqa", "Turmush"].forEach((v, i) => sheet1.getCell(3, 13 + i).value = v);

        for (let r = 2; r <= 3; r++) { sheet1.getRow(r).height = 40; for (let c = 1; c <= 22; c++) setStyle(sheet1.getCell(r, c), { bold: true, fill: c >= 12 ? 'FFF8CBAD' : 'FFC6E0B4', size: 9 }); }

        const entriesRes = await db.query(`
            SELECT DISTINCT ON (district, school) *
            FROM attendance
            WHERE date = $1
            ORDER BY district, school, id DESC`, [targetDate]);
        const tumanEntries = entriesRes.rows.filter(e => normalizeKey(e.district) === normD);

        let v_cl = 0, v_st = 0, v_tab = 0;
        let v_sab = Array(5).fill(0), v_ss = Array(11).fill(0);

        districtSchools.forEach((sName, i) => {
            const d = tumanEntries.find(e => normalizeKey(e.school) === normalizeKey(sName)) || {};
            const st = parseInt(d.total_students) || 0; const tab = parseInt(d.total_absent) || 0; const perc = st > 0 ? ((st - tab) / st * 100).toFixed(1) : 0;
            const row = sheet1.addRow([i + 1, sName, d.classes_count || 0, st, perc + '%', tab, d.sababli_kasal || 0, d.sababli_tadbirlar || 0, d.sababli_oilaviy || 0, d.sababli_ijtimoiy || 0, d.sababli_boshqa || 0, d.sababsiz_jami || 0, d.sababsiz_muntazam || 0, d.sababsiz_qidiruv || 0, d.sababsiz_chetel || 0, d.sababsiz_boyin || 0, d.sababsiz_ishlab || 0, d.sababsiz_qarshilik || 0, d.sababsiz_jazo || 0, d.sababsiz_nazoratsiz || 0, d.sababsiz_boshqa || 0, d.sababsiz_turmush || 0]);
            row.eachCell(c => setStyle(c));
            v_cl += (d.classes_count || 0); v_st += st; v_tab += tab;
            v_sab[0] += (d.sababli_kasal || 0); v_sab[1] += (d.sababli_tadbirlar || 0); v_sab[2] += (d.sababli_oilaviy || 0); v_sab[3] += (d.sababli_ijtimoiy || 0); v_sab[4] += (d.sababli_boshqa || 0);
            v_ss[0] += (d.sababsiz_jami || 0); v_ss[1] += (d.sababsiz_muntazam || 0); v_ss[2] += (d.sababsiz_qidiruv || 0); v_ss[3] += (d.sababsiz_chetel || 0); v_ss[4] += (d.sababsiz_boyin || 0); v_ss[5] += (d.sababsiz_ishlab || 0); v_ss[6] += (d.sababsiz_qarshilik || 0); v_ss[7] += (d.sababsiz_jazo || 0); v_ss[8] += (d.sababsiz_nazoratsiz || 0); v_ss[9] += (d.sababsiz_boshqa || 0); v_ss[10] += (d.sababsiz_turmush || 0);
        });

        const totalPerc = v_st > 0 ? ((v_st - v_tab) / v_st * 100).toFixed(1) : 0;
        const sumRow = sheet1.addRow(["", "TUMAN JAMI", v_cl, v_st, totalPerc + '%', v_tab, ...v_sab, ...v_ss]);
        sumRow.eachCell(c => setStyle(c, { bold: true, fill: 'FFFFFF00' }));

        sheet1.getColumn(2).width = 30; for (let c = 3; c <= 22; c++) sheet1.getColumn(c).width = 11;
        const filePath = path.join(getExportDir(), `HISOBOT_${district.replace(/[^a-zA-Z0-9]/g, '_')}_${targetDate}.xlsx`);
        await workbook.xlsx.writeFile(filePath); return filePath;
    } catch (e) { console.error("District Excel Error:", e); return null; }
}

async function getViloyatSvod(date) {
    const nowStamp = Date.now();
    if (memCache.viloyat[date] && (nowStamp - memCache.viloyat[date].timestamp < CACHE_TTL)) {
        return memCache.viloyat[date].data; // Return from cache
    }

    try {
        const topics = require('../config/topics').getTopics();
        const { DISTRICT_HEADS } = require('../config/config');
        const allDistricts = Object.keys(topics).filter(d => d !== "Test rejimi" && d !== "MMT Boshqarma");
        const targetDate = date;
        const yesterday = new Date(targetDate); yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const [rawEntries, yestEntries] = await Promise.all([
            getRawAttendanceRecords(targetDate),
            getRawAttendanceRecords(yesterdayStr)
        ]);

        const schoolsDb = require('../database/db').schools_db;

        const result = allDistricts.map(dName => {
            const normD = normalizeKey(dName);
            const dbKey = Object.keys(schoolsDb).find(k => normalizeKey(k) === normD);
            const districtOfficialSchools = (dbKey ? schoolsDb[dbKey] : []).map(s => normalizeKey(s));
            const totalSchools = districtOfficialSchools.length;

            const tumanRows = rawEntries.filter(r => normalizeKey(r.district) === normD);
            const yestRows = yestEntries.filter(r => normalizeKey(r.district) === normD);

            const head = DISTRICT_HEADS[dName] || { name: "-", phone: "-" };

            if (tumanRows.length > 0) {
                const uniqueEntries = {};
                tumanRows.forEach(r => { uniqueEntries[normalizeKey(r.school)] = r; });
                const uniqueRows = Object.values(uniqueEntries);

                const sums = uniqueRows.reduce((acc, r) => ({
                    classes: acc.classes + (parseInt(r.classes_count) || 0),
                    students: acc.students + (parseInt(r.total_students) || 0),
                    sk: acc.sk + (parseInt(r.sababli_kasal) || 0),
                    st: acc.st + (parseInt(r.sababli_tadbirlar) || 0),
                    so: acc.so + (parseInt(r.sababli_oilaviy) || 0),
                    si: acc.si + (parseInt(r.sababli_ijtimoiy) || 0),
                    sb: acc.sb + (parseInt(r.sababli_boshqa) || 0),
                    sm: acc.sm + (parseInt(r.sababsiz_muntazam) || 0),
                    sq: acc.sq + (parseInt(r.sababsiz_qidiruv) || 0),
                    sc: acc.sc + (parseInt(r.sababsiz_chetel) || 0),
                    sbt: acc.sbt + (parseInt(r.sababsiz_boyin) || 0),
                    si_ish: acc.si_ish + (parseInt(r.sababsiz_ishlab) || 0),
                    sqar: acc.sqar + (parseInt(r.sababsiz_qarshilik) || 0),
                    sjaz: acc.sjaz + (parseInt(r.sababsiz_jazo) || 0),
                    snaz: acc.snaz + (parseInt(r.sababsiz_nazoratsiz) || 0),
                    stur: acc.stur + (parseInt(r.sababsiz_turmush) || 0),
                    ssb: acc.ssb + (parseInt(r.sababsiz_boshqa) || 0),
                    sababli: acc.sababli + (parseInt(r.sababli_jami) || 0),
                    sababsiz: acc.sababsiz + (parseInt(r.sababsiz_jami) || 0),
                    total_absent: acc.total_absent + (parseInt(r.total_absent) || 0),
                    sumPerc: acc.sumPerc + (parseFloat(r.percent) || 0)
                }), { classes: 0, students: 0, sk: 0, st: 0, so: 0, si: 0, sb: 0, sm: 0, sq: 0, sc: 0, sbt: 0, si_ish: 0, sqar: 0, sjaz: 0, snaz: 0, stur: 0, ssb: 0, sababli: 0, sababsiz: 0, total_absent: 0, sumPerc: 0 });

                const yestUnique = {};
                yestRows.forEach(r => { yestUnique[normalizeKey(r.school)] = parseFloat(r.percent) || 0; });
                const yestPercs = Object.values(yestUnique);
                const yestAvg = yestPercs.length > 0 ? (yestPercs.reduce((a, b) => a + b, 0) / yestPercs.length) : 0;

                return {
                    district: dName, entries: uniqueRows.length, total_schools: totalSchools,
                    ...sums, avg_percent: parseFloat((sums.sumPerc / uniqueRows.length).toFixed(1)),
                    yesterday_percent: parseFloat(yestAvg.toFixed(1)), head_name: head.name, head_phone: head.phone
                };
            }

            const yestAvgOnly = yestRows.length > 0 ? (yestRows.reduce((a, b) => a + (parseFloat(b.percent) || 0), 0) / yestRows.length) : 0;
            return {
                district: dName, entries: 0, total_schools: totalSchools, classes: 0, students: 0,
                sk: 0, st: 0, so: 0, si: 0, sb: 0, sababli: 0,
                sm: 0, sq: 0, sc: 0, sbt: 0, si_ish: 0, sqar: 0, sjaz: 0, snaz: 0, stur: 0, ssb: 0, sababsiz: 0,
                total_absent: 0, avg_percent: 0, yesterday_percent: parseFloat(yestAvgOnly.toFixed(1)),
                head_name: head.name, head_phone: head.phone
            };
        });

        memCache.viloyat[date] = { data: result, timestamp: nowStamp };
        return result;
    } catch (e) { console.error("Viloyat Svod Error:", e); return []; }
}

async function getTumanSvod(district, date, limit = 50, offset = 0) {
    const cacheKey = `${district}_${date}`;
    const nowStamp = Date.now();
    if (memCache.tuman[cacheKey] && (nowStamp - memCache.tuman[cacheKey].timestamp < CACHE_TTL)) {
        const fullRows = memCache.tuman[cacheKey].data;
        return { rows: fullRows.slice(offset, offset + limit), total: fullRows.length };
    }
    try {
        const schoolsDb = require('../database/db').schools_db;
        const normDist = normalizeKey(district);
        const dbKey = Object.keys(schoolsDb).find(k => normalizeKey(k) === normDist);
        const districtSchools = schoolsDb[dbKey || district] || [];
        const allRecords = await getRawAttendanceRecords(date);
        const tumanEntries = allRecords.filter(e => normalizeKey(e.district) === normDist);
        const allRows = districtSchools.map(sName => {
            const entry = tumanEntries.find(e => normalizeKey(e.school) === normalizeKey(sName));
            if (entry) return { ...entry, percent: parseFloat(entry.percent) };
            return { district: district, school: sName, time: '-', classes_count: 0, total_students: 0, sababli_jami: 0, sababsiz_jami: 0, total_absent: 0, percent: 0, fio: 'Kiritilmagan' };
        });
        memCache.tuman[cacheKey] = { data: allRows, timestamp: nowStamp };
        return { rows: allRows.slice(offset, offset + limit), total: allRows.length };
    } catch (e) { console.error("Tuman Svod Error:", e); return { rows: [], total: 0 }; }
}

async function getTodayAbsentsDetails(date, limit = 50, offset = 0) {
    if (!process.env.DATABASE_URL) {
        try {
            const sqliteDb = require('../database/sqlite');
            const totalRow = sqliteDb.prepare("SELECT count(*) as count FROM absent_students s JOIN attendance a ON s.attendance_id = a.id WHERE a.date = ?").get(date);
            const total = totalRow ? totalRow.count : 0;
            const rows = sqliteDb.prepare("SELECT a.date, a.district, a.school, s.class, s.name, s.address, s.parent_name, s.parent_phone, a.inspector, a.fio as submitter_fio, a.phone as submitter_phone FROM absent_students s JOIN attendance a ON s.attendance_id = a.id WHERE a.date = ? ORDER BY a.district, a.school, s.class LIMIT ? OFFSET ?").all(date, limit, offset);
            return { rows: rows.map(r => ({ ...r, streak: 1, status: 'Odatiy' })), total };
        } catch (e) { return { rows: [], total: 0 }; }
    }
    try {
        const countRes = await db.query(`SELECT count(*) FROM absent_students s JOIN attendance a ON s.attendance_id = a.id WHERE a.date = $1`, [date]);
        const total = parseInt(countRes.rows[0].count);
        const res = await db.query(`SELECT a.date, a.district, a.school, s.class, s.name, s.address, s.parent_name, s.parent_phone, a.inspector, a.fio as submitter_fio, a.phone as submitter_phone FROM absent_students s JOIN attendance a ON s.attendance_id = a.id WHERE a.date = $1 ORDER BY a.district, a.school, s.class LIMIT $2 OFFSET $3`, [date, limit, offset]);
        const finalRows = [];
        for (const r of res.rows) {
            const streakRes = await db.query(`SELECT count(DISTINCT a.date) as streak FROM absent_students s JOIN attendance a ON s.attendance_id = a.id WHERE s.name = $1 AND a.school = $2 AND a.district = $3 AND a.date <= $4`, [r.name, r.school, r.district, date]);
            const streak = parseInt(streakRes.rows[0].streak) || 1;
            finalRows.push({ ...r, streak: streak, status: streak >= 3 ? "Muntazam" : "Odatiy" });
        }
        return { rows: finalRows, total };
    } catch (e) { return { rows: [], total: 0 }; }
}

async function getTrendStats(district = null) {
    try {
        let sql = `SELECT date, AVG(percent) as avg_percent FROM attendance `;
        let params = [];
        if (district) { sql += ` WHERE district = $1 `; params.push(district); }
        sql += ` GROUP BY date ORDER BY date DESC LIMIT 30`;
        const res = await db.query(sql, params);
        return res.rows.map(r => ({ ...r, avg_percent: parseFloat(r.avg_percent) })).reverse();
    } catch (e) { console.error("Trend Stats Error:", e); return []; }
}

async function getRecentActivity(limit = 20, offset = 0, district = null) {
    try {
        let query = 'SELECT * FROM attendance ';
        let countQuery = 'SELECT count(*) as count FROM attendance ';
        let params = [limit, offset];
        if (district) {
            query += 'WHERE district ILIKE $3 ORDER BY id DESC LIMIT $1 OFFSET $2';
            countQuery += 'WHERE district ILIKE $1 ';
            params.push(`%${district}%`);
            const [rowsRes, countRes] = await Promise.all([db.query(query, params), db.query(countQuery, [`%${district}%`])]);
            return { rows: rowsRes.rows, total: parseInt(countRes.rows[0].count) };
        } else {
            query += 'ORDER BY id DESC LIMIT $1 OFFSET $2';
            const [rowsRes, countRes] = await Promise.all([db.query(query, params), db.query(countQuery)]);
            return { rows: rowsRes.rows, total: parseInt(countRes.rows[0].count) };
        }
    } catch (e) { console.error("Recent Activity Error:", e); return { rows: [], total: 0 }; }
}

async function exportWeeklyExcel(baseDate) {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Haftalik Hisobot');
        const endDate = baseDate || getFargonaTime().toISOString().split('T')[0];
        const startDate = new Date(new Date(endDate).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        sheet.mergeCells('A1:H1');
        sheet.getCell('A1').value = `Haftalik Davomat Hisoboti (${startDate} - ${endDate})`;
        sheet.getCell('A1').font = { bold: true, size: 14 }; sheet.getCell('A1').alignment = { horizontal: 'center' };
        const headerRow = ["Tuman/Shahar", "Maktablar", "O'quvchilar", "Sababli", "Sababsiz", "Jami Kelmagan", "O'rtacha %"];
        const header = sheet.addRow(headerRow); header.eachCell(c => setStyle(c, { bold: true, fill: 'FFC6E0B4' }));
        const res = await db.query(`SELECT district, count(DISTINCT school) as schools, sum(total_students)/count(DISTINCT date) as avg_students, sum(sababli_jami) as sababli, sum(sababsiz_jami) as sababsiz, sum(total_absent) as total_absent, avg(percent) as avg_p FROM attendance WHERE date >= $1 AND date <= $2 GROUP BY district ORDER BY avg_p DESC`, [startDate, endDate]);
        res.rows.forEach(r => { sheet.addRow([r.district, r.schools, Math.round(r.avg_students), r.sababli, r.sababsiz, r.total_absent, parseFloat(r.avg_p).toFixed(1) + '%']).eachCell(c => setStyle(c)); });
        const assetsDir = getExportDir();
        const filePath = path.join(assetsDir, `HAFTALIK_HISOBOT_${endDate}.xlsx`);
        await workbook.xlsx.writeFile(filePath); return filePath;
    } catch (e) { console.error("Weekly Excel Error:", e); return null; }
}

async function exportMonthlyExcel(baseDate, district = null) {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Oylik Hisobot');
        const d = baseDate ? new Date(baseDate) : getFargonaTime();
        const year = d.getFullYear(); const month = d.getMonth();
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
        const title = district ? `${district} - ${year}-${month + 1} Oylik Hisobot` : `Viloyat - ${year}-${month + 1} Oylik Hisobot`;
        sheet.mergeCells('A1:J1'); sheet.getCell('A1').value = title; sheet.getCell('A1').font = { bold: true, size: 14 }; sheet.getCell('A1').alignment = { horizontal: 'center' };
        const headerRow = district ? ["Maktab", "Kiritilgan kunlar", "O'quvchilar", "Sababli", "Sababsiz", "O'rtacha %"] : ["Tuman", "Maktablar", "O'quvchilar", "Sababli", "Sababsiz", "O'rtacha %"];
        const header = sheet.addRow(headerRow); header.eachCell(c => setStyle(c, { bold: true, fill: 'FFF8CBAD' }));
        let query, params;
        if (district) {
            query = `SELECT school, count(date) as days, avg(total_students) as avg_students, sum(sababli_jami) as sababli, sum(sababsiz_jami) as sababsiz, avg(percent) as avg_p FROM attendance WHERE date >= $1 AND date <= $2 AND district = $3 GROUP BY school ORDER BY avg_p DESC`;
            params = [startDate, endDate, district];
        } else {
            query = `SELECT district, count(DISTINCT school) as schools, sum(total_students)/count(DISTINCT date) as avg_students, sum(sababli_jami) as sababli, sum(sababsiz_jami) as sababsiz, avg(percent) as avg_p FROM attendance WHERE date >= $1 AND date <= $2 GROUP BY district ORDER BY avg_p DESC`;
            params = [startDate, endDate];
        }
        const res = await db.query(query, params);
        res.rows.forEach(r => {
            const rowData = district ? [r.school, r.days, Math.round(r.avg_students), r.sababli, r.sababsiz, parseFloat(r.avg_p).toFixed(1) + '%'] : [r.district, r.schools, Math.round(r.avg_students), r.sababli, r.sababsiz, parseFloat(r.avg_p).toFixed(1) + '%'];
            sheet.addRow(rowData).eachCell(c => setStyle(c));
        });
        const assetsDir = getExportDir();
        const fileName = district ? `OYLIK_HISOBOT_${district.replace(/[^a-z0-9]/gi, '_')}_${year}_${month + 1}.xlsx` : `OYLIK_HISOBOT_VILOYAT_${year}_${month + 1}.xlsx`;
        const filePath = path.join(assetsDir, fileName); await workbook.xlsx.writeFile(filePath); return filePath;
    } catch (e) { console.error("Monthly Excel Error:", e); return null; }
}

async function exportXorijExcel() {
    try {
        const result = await db.query('SELECT * FROM xorij_students ORDER BY district, school, student_name');
        const data = result.rows;

        const workbook = new ExcelJS.Workbook();
        const sheet1 = workbook.addWorksheet('Umumiy Svod');
        sheet1.mergeCells('A1:P1');
        sheet1.getCell('A1').value = "Maktabgacha va maktab ta'limi vazirligi tasarrufidagi umumta'lim maktablaridagi chet elga ketgan o'quvchilar haqida MA'LUMOT";
        sheet1.getCell('A1').font = { bold: true, size: 12 }; sheet1.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        sheet1.getRow(1).height = 40;

        const headers1 = [["№", "A2:A4"], ["Tuman nomi", "B2:B4"], ["Jami chet elga ketgan o'quvchilar", "C2:C4"], ["Shundan", "D2:I2"], ["Chet elga ketish sababi", "J2:O2"]];
        headers1.forEach(h => { sheet1.mergeCells(h[1]); sheet1.getCell(h[1].split(':')[0]).value = h[0]; });

        const subHeaders = ["Rossiya", "Qozog'iston", "Turkiya", "BAA", "Misr davlatiga", "Boshqa davlatlarga", "Doimiy yashash", "O'qishga", "Ishlashga", "Davolanishga", "Noma'lum", "Boshqa sabablarga"];
        ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"].forEach(col => sheet1.mergeCells(`${col}3:${col}4`));
        subHeaders.forEach((h, i) => { const cell = sheet1.getCell(3, 4 + i); cell.value = h; });

        for (let r = 2; r <= 4; r++) { for (let c = 1; c <= 15; c++) { setStyle(sheet1.getCell(r, c), { bold: true, size: 9, fill: 'FFD9E1F2' }); } }

        const topics = require('../config/topics').getTopics();
        const districts = Object.keys(topics).filter(d => !["Test rejimi", "MMT Boshqarma"].includes(d));

        districts.forEach((d, i) => {
            const dData = data.filter(item => item.district === d);
            const total = dData.length;
            const c_ros = dData.filter(x => x.country === "Rossiya").length;
            const c_qoz = dData.filter(x => x.country === "Qozog'iston").length;
            const c_tur = dData.filter(x => x.country === "Turkiya").length;
            const c_baa = dData.filter(x => x.country === "BAA").length;
            const c_mis = dData.filter(x => x.country === "Misr").length;
            const c_bos = total - (c_ros + c_qoz + c_tur + c_baa + c_mis);

            const s_doi = dData.filter(x => x.reason === "Doimiy yashash").length;
            const s_oqi = dData.filter(x => x.reason === "O'qish").length;
            const s_ish = dData.filter(x => x.reason === "Ishlash").length;
            const s_dav = dData.filter(x => x.reason === "Davolanish").length;
            const s_bos = total - (s_doi + s_oqi + s_ish + s_dav);

            const row = sheet1.addRow([i + 1, d, total, c_ros, c_qoz, c_tur, c_baa, c_mis, c_bos, s_doi, s_oqi, s_ish, s_dav, 0, s_bos]);
            row.eachCell(cell => setStyle(cell));
        });

        const sheet2 = workbook.addWorksheet('Batafsil Ro\'yxat');
        const headers2 = ["t/r", "Tuman (shahar)", "Maktab va Sinf", "O'quvchi F.I.SH", "Tug'ilgan sanasi", "Davlati", "Ketgan sanasi", "Sababi / Kim bilan", "Bugungi holat", "Qonuniylik", "Hujjatlar (Qaror/Buyruq)", "Doimiy manzili"];
        const h2 = sheet2.addRow(headers2); h2.eachCell(c => setStyle(c, { bold: true, fill: 'FFE2EFDA' }));

        data.forEach((item, i) => {
            const row = sheet2.addRow([
                i + 1,
                item.district,
                `${item.school}, ${item.class_name || ''}`,
                item.student_name,
                item.dob,
                item.country,
                item.q_sana || '-',
                `${item.reason} / ${item.companion || ''}`,
                item.status,
                item.qonuniylik === 'legal' ? "Qonuniy" : "Noqonuniy",
                `Q:${item.q_raqam || '-'}; B:${item.b_raqam || '-'}`,
                item.address
            ]);
            row.eachCell(cell => setStyle(cell));
        });

        sheet2.getColumn(2).width = 20; sheet2.getColumn(3).width = 20; sheet2.getColumn(4).width = 35;
        sheet2.getColumn(6).width = 15; sheet2.getColumn(7).width = 15; sheet2.getColumn(8).width = 30;
        sheet2.getColumn(9).width = 20; sheet2.getColumn(11).width = 25; sheet2.getColumn(12).width = 40;

        const assetsDir = getExportDir();
        const filePath = path.join(assetsDir, `XORIJGA_KETGANLAR_${getFargonaTime().toISOString().split('T')[0]}.xlsx`);
        await workbook.xlsx.writeFile(filePath);
        return filePath;
    } catch (e) {
        console.error("Xorij Export Error:", e);
        return null;
    }
}

async function exportSubscribersToExcel(streamRes = null) {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Obunachilar va To\'lovlar');

        const now = getFargonaTime();
        const todayStr = now.toISOString().split('T')[0];

        // Gather all users
        const dbLocal = require('../database/db');
        let users = { ...dbLocal.users_db };

        // Attempt to sync / fetch from PostgreSQL
        try {
            const pg = require('../database/pg');
            const res = await pg.query('SELECT id, data FROM tg_users');
            if (res && res.rows) {
                res.rows.forEach(r => {
                    users[r.id] = { ...users[r.id], ...r.data };
                });
            }
        } catch (e) {
            console.warn("exportSubscribersToExcel PG query fallback:", e.message);
        }

        const userList = Object.entries(users).map(([id, u]) => {
            const isPro = !!(u.is_pro && u.pro_expire_date && new Date(u.pro_expire_date) > now);
            const hasAccess = !!(u.has_access && u.access_expire_date && new Date(u.access_expire_date) > now);

            let statusType = 'noaktiv'; // 'pro' | 'access' | 'expired' | 'noaktiv'
            let statusText = 'Noaktiv';
            let expireDate = '-';
            let purchaseDate = '-';
            let daysLeft = 0;

            if (isPro) {
                statusType = 'pro';
                statusText = '👑 PRO Obunachi';
                expireDate = u.pro_expire_date;
                purchaseDate = u.pro_purchase_date || '-';
                daysLeft = Math.max(0, Math.ceil((new Date(expireDate) - now) / (1000 * 60 * 60 * 24)));
            } else if (hasAccess) {
                statusType = 'access';
                statusText = '✅ Standart Davomat';
                expireDate = u.access_expire_date;
                purchaseDate = u.access_purchase_date || '-';
                daysLeft = Math.max(0, Math.ceil((new Date(expireDate) - now) / (1000 * 60 * 60 * 24)));
            } else if ((u.pro_expire_date && new Date(u.pro_expire_date) <= now) || (u.access_expire_date && new Date(u.access_expire_date) <= now)) {
                statusType = 'expired';
                statusText = '⏳ Muddati tugagan';
                expireDate = u.pro_expire_date || u.access_expire_date;
                purchaseDate = u.pro_purchase_date || u.access_purchase_date || '-';
                daysLeft = 0;
            }

            return {
                id,
                fio: u.fio || u.name || '-',
                phone: u.phone || '-',
                district: u.district || '-',
                school: u.school || '-',
                username: u.username ? `@${u.username}` : '-',
                statusType,
                statusText,
                purchaseDate,
                expireDate,
                daysLeft
            };
        });

        // Sort: Active PRO first, then Active Standart, then Expired, then Noaktiv
        const priority = { 'pro': 1, 'access': 2, 'expired': 3, 'noaktiv': 4 };
        userList.sort((a, b) => {
            if (priority[a.statusType] !== priority[b.statusType]) {
                return priority[a.statusType] - priority[b.statusType];
            }
            return b.daysLeft - a.daysLeft;
        });

        // Summary counts
        const totalUsers = userList.length;
        const totalPro = userList.filter(u => u.statusType === 'pro').length;
        const totalAccess = userList.filter(u => u.statusType === 'access').length;
        const totalExpired = userList.filter(u => u.statusType === 'expired').length;

        // Title Row
        sheet.mergeCells('A1:K1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = "FARG'ONA VILOYATI — DAVOMAT PLATFORMASI OBUNACHILARI VA TO'LOVLAR HISOBOTI";
        titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(1).height = 35;

        // Summary Rows
        sheet.mergeCells('A2:K2');
        const sumCell = sheet.getCell('A2');
        sumCell.value = `Sana: ${todayStr} | Jami foydalanuvchilar: ${totalUsers} ta | 👑 PRO: ${totalPro} ta | ✅ Standart Davomat: ${totalAccess} ta | ⏳ Muddati tugaganlar: ${totalExpired} ta`;
        sumCell.font = { italic: true, size: 10, color: { argb: 'FF334155' } };
        sumCell.alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(2).height = 24;

        // Table Header
        const headers = [
            "№", "Telegram ID", "F.I.SH (Mas'ul)", "Telefon",
            "Tuman / Shahar", "Maktab", "Telegram Login",
            "Obuna Turi", "Faollashgan Sana", "Tugash Sanasi", "Qolgan Muddat"
        ];
        const hRow = sheet.addRow(headers);
        hRow.height = 28;
        hRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });

        // Add Data Rows
        userList.forEach((u, idx) => {
            const daysText = (u.statusType === 'pro' || u.statusType === 'access')
                ? `${u.daysLeft} kun`
                : (u.statusType === 'expired' ? 'Muddati tugagan' : '-');

            const row = sheet.addRow([
                idx + 1,
                u.id,
                u.fio,
                u.phone,
                u.district,
                u.school,
                u.username,
                u.statusText,
                u.purchaseDate,
                u.expireDate,
                daysText
            ]);
            row.height = 22;

            row.eachCell((cell, colNum) => {
                cell.font = { size: 9, color: { argb: 'FF1E293B' } };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
                cell.alignment = { vertical: 'middle', horizontal: colNum === 1 || colNum === 2 || colNum >= 8 ? 'center' : 'left' };

                // Color code Obuna Turi & Days
                if (colNum === 8 || colNum === 11) {
                    if (u.statusType === 'pro') {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Light amber
                        cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 9 };
                    } else if (u.statusType === 'access') {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Light emerald
                        cell.font = { bold: true, color: { argb: 'FF065F46' }, size: 9 };
                    } else if (u.statusType === 'expired') {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Light rose
                        cell.font = { color: { argb: 'FF991B1B' }, size: 9 };
                    }
                }
            });
        });

        // Set column widths
        sheet.getColumn(1).width = 6;
        sheet.getColumn(2).width = 16;
        sheet.getColumn(3).width = 28;
        sheet.getColumn(4).width = 18;
        sheet.getColumn(5).width = 20;
        sheet.getColumn(6).width = 24;
        sheet.getColumn(7).width = 18;
        sheet.getColumn(8).width = 22;
        sheet.getColumn(9).width = 16;
        sheet.getColumn(10).width = 16;
        sheet.getColumn(11).width = 16;

        // ==================== 2-VAROQ: TO'LOV CHEKLARI (KVITANSIYALAR) ====================
        const receiptsSheet = workbook.addWorksheet("To'lov Cheklari (Kvitansiyalar)");
        const paymentService = require('./paymentService');
        const receiptsList = await paymentService.getReceiptsList();

        receiptsSheet.mergeCells('A1:J1');
        const recTitle = receiptsSheet.getCell('A1');
        recTitle.value = "FARG'ONA VILOYATI — BARCHA YUBORILGAN TO'LOV CHEKLARI VA KVITANSIYALAR";
        recTitle.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        recTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
        recTitle.alignment = { vertical: 'middle', horizontal: 'center' };
        receiptsSheet.getRow(1).height = 35;

        receiptsSheet.mergeCells('A2:J2');
        const recSubTitle = receiptsSheet.getCell('A2');
        const approvedCount = receiptsList.filter(r => r.status === 'approved').length;
        const pendingCount = receiptsList.filter(r => r.status === 'pending').length;
        const rejectedCount = receiptsList.filter(r => r.status === 'rejected').length;
        recSubTitle.value = `Sana: ${todayStr} | Jami cheklar: ${receiptsList.length} ta | ✅ Tasdiqlangan: ${approvedCount} ta | ⏳ Kutilmoqda: ${pendingCount} ta | ❌ Rad etilgan: ${rejectedCount} ta`;
        recSubTitle.font = { italic: true, size: 10, color: { argb: 'FF334155' } };
        recSubTitle.alignment = { vertical: 'middle', horizontal: 'center' };
        receiptsSheet.getRow(2).height = 24;

        const recHeaders = [
            "№", "Chek ID", "Yuborilgan sana va vaqt", "Kimdan (F.I.SH)",
            "Telegram ID", "Tuman / Shahar", "Maktab", "Telefon",
            "Holati", "Tasdiqlagan Admin"
        ];
        const recHeaderRow = receiptsSheet.addRow(recHeaders);
        recHeaderRow.height = 28;
        recHeaderRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });

        receiptsList.forEach((r, idx) => {
            let statusText = '⏳ Kutilmoqda';
            if (r.status === 'approved') statusText = '✅ Tasdiqlangan';
            else if (r.status === 'rejected') statusText = '❌ Rad etilgan';

            const row = receiptsSheet.addRow([
                idx + 1,
                r.id,
                r.submitted_at || '-',
                r.sender_name || '-',
                r.sender_uid || '-',
                r.district || '-',
                r.school || '-',
                r.phone || '-',
                statusText,
                r.resolved_by || '-'
            ]);
            row.height = 22;

            row.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
                if (colNumber === 1 || colNumber === 2 || colNumber === 5 || colNumber === 8 || colNumber === 9 || colNumber === 10) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else {
                    cell.alignment = { vertical: 'middle', horizontal: 'left' };
                }

                if (colNumber === 9) {
                    if (r.status === 'approved') {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
                        cell.font = { bold: true, color: { argb: 'FF065F46' }, size: 9 };
                    } else if (r.status === 'rejected') {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                        cell.font = { bold: true, color: { argb: 'FF991B1B' }, size: 9 };
                    } else {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
                        cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 9 };
                    }
                }
            });
        });

        receiptsSheet.getColumn(1).width = 6;
        receiptsSheet.getColumn(2).width = 16;
        receiptsSheet.getColumn(3).width = 22;
        receiptsSheet.getColumn(4).width = 24;
        receiptsSheet.getColumn(5).width = 16;
        receiptsSheet.getColumn(6).width = 20;
        receiptsSheet.getColumn(7).width = 22;
        receiptsSheet.getColumn(8).width = 18;
        receiptsSheet.getColumn(9).width = 18;
        receiptsSheet.getColumn(10).width = 20;

        if (streamRes) {
            const fileName = `OBUNACHILAR_TOLOVLAR_${todayStr}.xlsx`;
            streamRes.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            streamRes.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            await workbook.xlsx.write(streamRes);
            return true;
        }

        const assetsDir = getExportDir();
        const filePath = path.join(assetsDir, `OBUNACHILAR_TOLOVLAR_${todayStr}.xlsx`);
        await workbook.xlsx.writeFile(filePath);
        return filePath;
    } catch (e) {
        console.error("Export Subscribers Excel Error:", e);
        return null;
    }
}

module.exports = {
    saveAttendance, exportToExcel, exportDistrictExcel, exportWeeklyExcel, exportMonthlyExcel,
    getViloyatSvod, getTumanSvod, getTodayAbsentsDetails, getRecentActivity, getTrendStats, checkIfExists,
    exportXorijExcel, exportSubscribersToExcel
};
