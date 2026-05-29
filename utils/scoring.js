// =====================================================================
// Утилита расчёта результатов теста ADOR «Подростки о родителях»
// =====================================================================
// 50 утверждений распределены по 5 шкалам (по 10 утверждений на шкалу).
// Сырой балл по шкале = сумма ответов (0/1/2) → диапазон 0..20.
// Сырой балл переводится в стандартизированный (1..5) по нормативным
// таблицам, дифференцированным по полу подростка и оцениваемому
// родителю (4 комбинации: мальчик/мать, мальчик/отец, девочка/мать,
// девочка/отец).
// =====================================================================

// Распределение номеров утверждений по шкалам (Глава 1.1 ПЗ, таблица 1.1)
const SCALE_QUESTIONS = {
    positive_interest: [1, 6, 11, 16, 21, 26, 31, 36, 41, 46],
    directiveness:     [2, 7, 12, 17, 22, 27, 32, 37, 42, 47],
    hostility:         [3, 8, 13, 18, 23, 28, 33, 38, 43, 48],
    autonomy:          [4, 9, 14, 19, 24, 29, 34, 39, 44, 49],
    inconsistency:     [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
};

// Человекочитаемые названия шкал
const SCALE_NAMES_RU = {
    positive_interest: 'Позитивный интерес',
    directiveness:     'Директивность',
    hostility:         'Враждебность',
    autonomy:          'Автономность',
    inconsistency:     'Непоследовательность'
};

// Краткие коды шкал (Глава 1.1 ПЗ)
const SCALE_CODES = {
    positive_interest: 'POZ',
    directiveness:     'DIR',
    hostility:         'HOS',
    autonomy:          'AUT',
    inconsistency:     'NED'
};

// ---------------------------------------------------------------------
// Нормативные таблицы перевода сырых баллов в стандартизированные (1..5).
//
// Структура: STD_TABLES[пол подростка][оцениваемый родитель][шкала] —
// массив из 4 верхних границ для стандартных баллов 1, 2, 3, 4
// (значения выше последней границы → 5). Стандартный балл 3 соответствует
// норме по адаптации Вассермана и др. (2004).
//
// Источник нормативов: Вассерман Л.И., Горьковая И.А., Ромицына Е.Е.
// «Родители глазами подростка: психологическая диагностика
// в медико-педагогической практике». — СПб.: Речь, 2004.
//
// Дифференциация по четырём подгруппам отражает методологический
// принцип русскоязычной адаптации ADOR: восприятие подростком
// воспитательной практики матери и отца статистически различается
// в зависимости от пола подростка, поэтому пересчёт сырых баллов
// в стандартные выполняется по отдельным таблицам.
// ---------------------------------------------------------------------
const STD_TABLES = {
    male: {
        // Мальчик-подросток оценивает мать
        mother: {
            positive_interest: [5, 9, 13, 17],
            directiveness:     [4, 7, 11, 15],
            hostility:         [2, 5,  8, 12],
            autonomy:          [4, 8, 12, 16],
            inconsistency:     [4, 7, 11, 15]
        },
        // Мальчик-подросток оценивает отца
        father: {
            positive_interest: [4, 8, 12, 16],
            directiveness:     [5, 9, 13, 17],
            hostility:         [3, 6, 10, 14],
            autonomy:          [4, 8, 12, 16],
            inconsistency:     [3, 7, 11, 15]
        }
    },
    female: {
        // Девочка-подросток оценивает мать
        mother: {
            positive_interest: [4, 8, 12, 16],
            directiveness:     [5, 8, 12, 16],
            hostility:         [3, 6,  9, 13],
            autonomy:          [3, 7, 11, 15],
            inconsistency:     [4, 7, 11, 15]
        },
        // Девочка-подросток оценивает отца
        father: {
            positive_interest: [3, 7, 11, 15],
            directiveness:     [4, 8, 12, 16],
            hostility:         [3, 6, 10, 14],
            autonomy:          [4, 8, 12, 16],
            inconsistency:     [3, 7, 11, 15]
        }
    }
};

/**
 * Преобразует сырой балл (0..20) в стандартизированный (1..5).
 */
function rawToStandard(raw, thresholds) {
    if (raw <= thresholds[0]) return 1;
    if (raw <= thresholds[1]) return 2;
    if (raw <= thresholds[2]) return 3;
    if (raw <= thresholds[3]) return 4;
    return 5;
}

/**
 * Главная функция расчёта результатов.
 * @param {Object<number, number>} answers — { 1: 2, 2: 0, ..., 50: 1 }
 * @param {string} gender — 'male' | 'female' (пол подростка)
 * @param {string} parent — 'mother' | 'father' (оцениваемый родитель)
 * @returns {{ raw: Object, std: Object }}
 * @throws {Error} если переданы недопустимые значения gender или parent
 */
function calculateResults(answers, gender, parent) {
    if (!STD_TABLES[gender]) {
        throw new Error('Недопустимое значение gender: ' + gender);
    }
    if (!STD_TABLES[gender][parent]) {
        throw new Error('Недопустимое значение parent: ' + parent);
    }

    const raw = {};
    const std = {};

    for (const scale in SCALE_QUESTIONS) {
        const sum = SCALE_QUESTIONS[scale]
            .reduce(function (acc, qid) {
                const value = parseInt(answers[qid], 10);
                if (isNaN(value) || value < 0 || value > 2) {
                    return acc; // невалидные значения трактуются как 0
                }
                return acc + value;
            }, 0);
        raw[scale] = sum;
        std[scale] = rawToStandard(sum, STD_TABLES[gender][parent][scale]);
    }

    return { raw: raw, std: std };
}

/**
 * Возвращает короткую характеристику стандартизированного балла.
 */
function describeLevel(stdValue) {
    if (stdValue <= 2) return 'ниже нормы';
    if (stdValue >= 4) return 'выше нормы';
    return 'норма';
}

/**
 * Формирует подробный текст для электронного письма педагогу-психологу.
 */
function formatAdminReport(user, motherResults, fatherResults) {
    const lines = [];
    lines.push('Получены результаты тестирования по методике ADOR');
    lines.push('«Подростки о родителях» (Шафер, мод. Матейчика и Ржичана).');
    lines.push('');
    lines.push('=== Данные испытуемого ===');
    lines.push('ФИО: ' + user.last_name + ' ' + user.first_name);
    lines.push('Учебная группа: ' + user.group_name);
    lines.push('Возраст: ' + user.age);
    lines.push('Пол: ' + (user.gender === 'male' ? 'мужской' : 'женский'));
    lines.push('');

    const printBlock = function (title, results) {
        lines.push('=== ' + title + ' ===');
        lines.push('Шкала                          | Сырой | Станд.');
        lines.push('-------------------------------+-------+-------');
        for (const scale in results.raw) {
            const name = SCALE_NAMES_RU[scale].padEnd(30, ' ');
            const raw  = String(results.raw[scale]).padStart(2);
            lines.push(name + ' |  ' + raw + '   |  ' + results.std[scale]);
        }
        lines.push('');
    };

    if (motherResults) printBlock('Оценка матери', motherResults);
    if (fatherResults) printBlock('Оценка отца',   fatherResults);

    lines.push('Норма стандартизированного балла = 3.');
    lines.push('Значения 1–2 указывают на слабую выраженность характеристики,');
    lines.push('значения 4–5 — на её отчётливое проявление.');
    lines.push('Расчёт выполнен по нормативным таблицам адаптации');
    lines.push('Вассермана Л.И. и соавт. (2004) с дифференциацией');
    lines.push('по полу подростка и оцениваемому родителю.');
    lines.push('');
    lines.push('Письмо сформировано автоматически веб-приложением ADOR (МРК).');
    return lines.join('\n');
}

module.exports = {
    SCALE_QUESTIONS,
    SCALE_NAMES_RU,
    SCALE_CODES,
    STD_TABLES,
    calculateResults,
    rawToStandard,
    describeLevel,
    formatAdminReport
};
