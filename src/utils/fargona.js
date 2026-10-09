const moment = require('moment-timezone');

const UZB_TIMEZONE = 'Asia/Tashkent';
process.env.TZ = UZB_TIMEZONE;

/**
 * Get current moment in Uzbekistan timezone (UTC+5)
 */
function getUzbMoment() {
    return moment().tz(UZB_TIMEZONE);
}

/**
 * Helper to get Date object forced to Farg'ona / Tashkent Timezone (+05:00)
 * Patches local getters and ISO string so callers on UTC servers (Render)
 * get correct Uzbekistan local time values.
 */
function getFargonaTime() {
    const m = getUzbMoment();
    const d = m.toDate();
    d.getHours = () => m.hours();
    d.getMinutes = () => m.minutes();
    d.getSeconds = () => m.seconds();
    d.getDate = () => m.date();
    d.getMonth = () => m.month();
    d.getFullYear = () => m.year();
    d.getDay = () => m.day();
    d.toISOString = () => m.format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z';
    d.toTimeString = () => m.format('HH:mm:ss [GMT+0500]');
    d.toLocaleDateString = () => m.format('DD.MM.YYYY');
    return d;
}

/**
 * Returns ISO-like string or formatted string in Tashkent timezone: "YYYY-MM-DD HH:mm:ss"
 */
function getFargonaDateTimeString(date) {
    if (date) {
        return moment(date).tz(UZB_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    }
    return getUzbMoment().format('YYYY-MM-DD HH:mm:ss');
}

/**
 * Formatted human-readable date & time for Uzbekistan: "DD.MM.YYYY HH:mm"
 */
function formatUzbDateTime(date) {
    if (!date) return '';
    return moment(date).tz(UZB_TIMEZONE).format('DD.MM.YYYY HH:mm');
}

/**
 * Formatted date: "YYYY-MM-DD"
 */
function getFargonaDateString() {
    return getUzbMoment().format('YYYY-MM-DD');
}

module.exports = {
    getFargonaTime,
    getTashkentTime: getFargonaTime,
    getUzbMoment,
    getFargonaDateTimeString,
    formatUzbDateTime,
    getFargonaDateString,
    UZB_TIMEZONE
};
