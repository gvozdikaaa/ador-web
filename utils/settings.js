// =====================================================================
// Модуль работы с настройками системы (таблица settings).
// Настройки кэшируются в памяти процесса для уменьшения количества
// обращений к базе данных. Кэш сбрасывается при обновлении значения
// через административную панель.
// =====================================================================

const db = require('../config/database');

let cache = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 минута

async function loadAll() {
    const [rows] = await db.execute(
        'SELECT setting_key, setting_value, description FROM settings'
    );
    const map = {};
    rows.forEach(function (row) {
        map[row.setting_key] = {
            value: row.setting_value,
            description: row.description
        };
    });
    cache = map;
    cacheLoadedAt = Date.now();
    return map;
}

async function getAll() {
    if (!cache || (Date.now() - cacheLoadedAt) > CACHE_TTL_MS) {
        await loadAll();
    }
    return cache;
}

async function get(key, fallback) {
    const all = await getAll();
    if (all[key] && all[key].value !== undefined) return all[key].value;
    return fallback !== undefined ? fallback : '';
}

async function set(key, value) {
    await db.execute(
        `INSERT INTO settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value]
    );
    cache = null; // сброс кэша
}

function invalidate() {
    cache = null;
}

module.exports = { getAll, get, set, invalidate };
