const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

// Возвращает учётные данные SMTP, очищенные от случайных пробелов.
// Особенно важно для Gmail: пароль приложения отображается в настройках
// Google четырьмя группами по 4 символа, разделёнными пробелами
// (вида «abcd efgh ijkl mnop»). При копировании пробелы часто
// попадают в .env и приводят к ошибке аутентификации, хотя «всё
// настроено по инструкции». Здесь они автоматически удаляются.
function getCredentials() {
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
    return { user: user, pass: pass };
}

function getTransporter() {
    if (transporter) return transporter;

    const { user, pass } = getCredentials();
    if (!user || !pass) {
        return null;
    }

    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    // secure=true только для порта 465 (SSL). Для 587 используется STARTTLS
    // (secure=false). Если в .env значение SMTP_SECURE указано неверно,
    // оно автоматически приводится в соответствие порту — это устраняет
    // распространённую причину «зависания» отправки письма.
    const secure = port === 465;

    transporter = nodemailer.createTransport({
    service: 'gmail',

    auth: {
        user: user,
        pass: pass
    },

    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
});
    return transporter;
}

/**
 * Отправляет результаты тестирования педагогу-психологу.
 * @param {Object} user — регистрационные данные обучающегося
 * @param {string} reportText — готовый текст письма
 * @param {string} recipientEmail — адрес педагога-психолога
 */
async function sendResultsToPsychologist(user, reportText, recipientEmail) {
    const t = getTransporter();
    if (!t) {
        throw new Error('SMTP не настроен: задайте SMTP_USER и SMTP_PASS в файле .env');
    }
    if (!recipientEmail) {
        throw new Error('Не задан адрес педагога-психолога');
    }
    const { user: smtpUser } = getCredentials();
    const subject = 'Результаты ADOR: ' + user.last_name + ' ' +
                    user.first_name + ' (гр. ' + user.group_name + ')';
    const mailOptions = {
        from: '"' + (process.env.SENDER_NAME || 'ADOR (МРК)') + '" <' +
              smtpUser + '>',
        to:      recipientEmail,
        subject: subject,
        text:    reportText
    };
    return t.sendMail(mailOptions);
}

async function verifyConnection() {
    const t = getTransporter();
    if (!t) {
        console.warn('[mailer] SMTP не настроен: проверьте SMTP_USER и SMTP_PASS в .env');
        return false;
    }
    try {
        await t.verify();
        return true;
    } catch (err) {
        // Подробное сообщение помогает быстро понять причину
        // (неверный пароль приложения, закрытый порт, нет сети и т.п.).
        console.warn('[mailer] SMTP-соединение не установлено:',
            err && err.code ? '[' + err.code + '] ' : '', err.message);
        return false;
    }
}

module.exports = { sendResultsToPsychologist, verifyConnection };
