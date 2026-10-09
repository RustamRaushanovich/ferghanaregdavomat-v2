
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Formats the attendance report for Telegram group topics exactly as requested:
 * 📍 Farg‘ona tumani, 1-maktab
 * 📊 Davomat ko'rsatkichi: 89.7 %
 * 🎒 Jami sinflar soni: 15
 * 👥 Jami o'quvchilar: 725
 * ✅ Sababli kelmaganlar: 
 * 🚫 Sababsiz kelmaganlar: 0
 * 📉 Jami kelmaganlar: 9
 * ☎️ Tel: 998*****0986
 * 👤 Mas'ul: Sidiqova Farida Umarovna 
 * Tolov: Amalga oshirilgan (Amalga oshirilmagan)
 */
function formatAttendanceReport(d, isPro, source) {
    const sababli = (d.sababli_total !== undefined && d.sababli_total !== null && d.sababli_total !== '') ? d.sababli_total : (d.sababli_jami !== undefined ? d.sababli_jami : '');
    const sababsiz = (d.sababsiz_total !== undefined && d.sababsiz_total !== null) ? d.sababsiz_total : (d.sababsiz_jami !== undefined ? d.sababsiz_jami : 0);
    const totalAbsent = d.total_absent !== undefined ? d.total_absent : (parseInt(sababli || 0) + parseInt(sababsiz || 0));
    const totalStudents = parseInt(d.total_students) || 0;
    const percent = totalStudents > 0 ? (((totalStudents - totalAbsent) / totalStudents) * 100).toFixed(1) : 0;

    // Mask phone logic: 998*****0986
    const clean = (d.phone || '').replace(/\D/g, '');
    let maskedPhone = '998*****0000';
    if (clean.length >= 4) {
        maskedPhone = `998*****${clean.slice(-4)}`;
    } else if (clean.length > 0) {
        maskedPhone = `998*****${clean}`;
    }

    const district = escapeHtml(d.district);
    const school = escapeHtml(d.school);
    const fio = escapeHtml(d.fio);
    const tolovStatus = (isPro || d.has_access || d.tolov_status === 'Amalga oshirilgan' || d.tolov === true) ? 'Amalga oshirilgan' : 'Amalga oshirilmagan';

    return `📍 ${district}, ${school}\n` +
        `📊 Davomat ko'rsatkichi: ${percent} %\n` +
        `🎒 Jami sinflar soni: ${d.classes_count || 0}\n` +
        `👥 Jami o'quvchilar: ${totalStudents}\n` +
        `✅ Sababli kelmaganlar: ${sababli}\n` +
        `🚫 Sababsiz kelmaganlar: ${sababsiz}\n` +
        `📉 Jami kelmaganlar: ${totalAbsent}\n` +
        `☎️ Tel: ${maskedPhone}\n` +
        `👤 Mas'ul: ${fio}\n` +
        `Tolov: ${tolovStatus}`;
}

module.exports = { formatAttendanceReport, escapeHtml };