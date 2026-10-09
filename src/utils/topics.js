const topicsConfig = require('../config/topics');
const TOPICS = topicsConfig.getTopics();

/**
 * Normalizes string for comparison (removes all apostrophe variants: ', curly, modifier marks, etc.)
 */
function normalizeKey(str) {
    if (!str) return '';
    return str.toString()
        .replace(/[\u0027\u2019\u2018\u0060\u02bb\u02bc\u201c\u201d\ufffd\?]/g, '')
        .replace(/['’‘`ʻʼ"”]/g, '')
        .replace(/[-\s_]/g, '')
        .trim()
        .toLowerCase()
        .replace(/shahri$/, 'shahar')
        .replace(/tumani$/, 'tuman');
}

/**
 * Finds topic ID by district name (robust matching)
 */
function getTopicId(districtName) {
    if (!districtName) return null;

    const normName = normalizeKey(districtName);
    const keys = Object.keys(TOPICS);

    // 1. Direct match
    if (TOPICS[districtName]) return TOPICS[districtName];

    // 2. Normalized match (ignores all apostrophe types, hyphens, spaces)
    const foundKey = keys.find(k => normalizeKey(k) === normName);
    if (foundKey) return TOPICS[foundKey];

    // 3. Partial match (Backup)
    const partialKey = keys.find(k => normalizeKey(k).includes(normName) || normName.includes(normalizeKey(k)));
    if (partialKey) return TOPICS[partialKey];

    return null;
}

module.exports = {
    normalizeKey,
    getTopicId,
    TOPICS
};