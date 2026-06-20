const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireUser, noCache } = require('../middleware/auth');
const {
    calculateResults,
    formatAdminReport,
    SCALE_NAMES_RU
} = require('../utils/scoring');
const { sendResultsToPsychologist } = require('../utils/mailer');
const settings = require('../utils/settings');

router.use(requireUser, noCache);

// Страница с инструкцией
router.get('/instruction', async function (req, res) {
    const instructionText = await settings.get(
        'instruction_text',
        'Внимательно прочитайте каждое утверждение и оцените его в отношении Вашего родителя.'
    );
    res.render('instruction', {
        title: 'Инструкция к выполнению',
        instructionText: instructionText
    });
});

// Страница теста (parent = mother | father)
router.get('/take/:parent', async function (req, res) {
    const parent = req.params.parent;
    if (parent !== 'mother' && parent !== 'father') {
        return res.redirect('/test/instruction');
    }
    try {
        const [questions] = await db.execute(
            'SELECT id, text FROM questions ORDER BY id ASC'
        );
        const parentRu = parent === 'mother' ? 'мать' : 'отец';
        const parentRuSubject = parent === 'mother' ? 'Моя мать' : 'Мой отец';
        res.render('test', {
            title: 'Оценка: ' + parentRu,
            questions: questions,
            parent: parent,
            parentRuSubject: parentRuSubject,
            previousAnswers:
                req.session.testProgress &&
                req.session.testProgress[parent]
                   ? req.session.testProgress[parent].answers
                   : {}
        });
    } catch (err) {
        console.error('[test] Ошибка загрузки вопросов:', err);
        req.flash('error', 'Ошибка загрузки вопросов теста.');
        res.redirect('/test/instruction');
    }
});

// Обработка отправки бланка одного из родителей
router.post('/submit/:parent', function (req, res) {
    const parent = req.params.parent;
    if (parent !== 'mother' && parent !== 'father') {
        return res.redirect('/test/instruction');
    }
    const answers = {};
    for (let i = 1; i <= 50; i++) {
        const value = req.body['q_' + i];
        const intValue = parseInt(value, 10);
        if (value === undefined || (intValue !== 0 && intValue !== 1 && intValue !== 2)) {
            req.flash(
                'error',
                'Не отмечен ответ на утверждение №' + i +
                '. Пожалуйста, заполните все 50 утверждений.'
            );
            req.session.testProgress[parent].answers = collectPartialAnswers(req.body);
            return res.redirect('/test/take/' + parent);
        }
        answers[i] = intValue;
    }
    req.session.testProgress[parent].answers   = answers;
    req.session.testProgress[parent].completed = true;

    if (parent === 'mother' && !req.session.testProgress.father.completed) {
        return res.redirect('/test/take/father');
    }
    if (parent === 'father' && !req.session.testProgress.mother.completed) {
        return res.redirect('/test/take/mother');
    }
    return res.redirect('/test/finish');
});

// Финал — расчёт, сохранение и отправка письма
router.get('/finish', async function (req, res) {
    const user = req.session.user;
    const progress = req.session.testProgress;
    if (!progress || !progress.mother.completed || !progress.father.completed) {
        return res.redirect('/test/instruction');
    }

    try {
        const motherResults = calculateResults(progress.mother.answers, user.gender, 'mother');
        const fatherResults = calculateResults(progress.father.answers, user.gender, 'father');

        await saveSession(user.id, 'mother', progress.mother.answers, motherResults);
        await saveSession(user.id, 'father', progress.father.answers, fatherResults);

        const reportText = formatAdminReport(user, motherResults, fatherResults);
        const recipientEmail = await settings.get('psychologist_email',
            process.env.PSYCHOLOGIST_EMAIL || 'psychologist.mrk@gmail.com');

        let emailSent = false;
        let emailError = null;
        try {
            await sendResultsToPsychologist(user, reportText, recipientEmail);
            emailSent = true;
        } catch (err) {
            console.error('[mailer] Ошибка отправки письма:', err.message);
            emailError = err.message;
        }

        const motivationText = await settings.get('motivation_text', '');
        const resultAdvice   = await settings.get('result_advice', '');

        req.session.testProgress = null;

        res.render('result', {
            title: 'Ваши результаты',
            user: user,
            motherResults: motherResults,
            fatherResults: fatherResults,
            scaleNames: SCALE_NAMES_RU,
            motivationText: motivationText,
            resultAdvice: resultAdvice,
            emailSent: emailSent,
            emailError: emailError
        });
    } catch (err) {
        console.error('[finish] Ошибка обработки результатов:', err);
        req.flash('error', 'Ошибка при обработке результатов. Обратитесь к администратору.');
        res.redirect('/test/instruction');
    }
});

// ---------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------
function collectPartialAnswers(body) {
    const acc = {};
    for (let i = 1; i <= 50; i++) {
        if (body['q_' + i] !== undefined) {
            acc[i] = parseInt(body['q_' + i], 10);
        }
    }
    return acc;
}

async function saveSession(userId, parent, answers, results) {
    const [sessRes] = await db.execute(
        'INSERT INTO test_sessions ' +
        '(user_id, parent, ' +
        ' raw_positive, raw_directive, raw_hostile, raw_autonomy, raw_inconsist, ' +
        ' std_positive, std_directive, std_hostile, std_autonomy, std_inconsist) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            userId, parent,
            results.raw.positive_interest, results.raw.directiveness,
            results.raw.hostility,         results.raw.autonomy,
            results.raw.inconsistency,
            results.std.positive_interest, results.std.directiveness,
            results.std.hostility,         results.std.autonomy,
            results.std.inconsistency
        ]
    );
    const sessionId = sessRes.insertId;
    const values = [];
    const placeholders = [];
    for (const qid in answers) {
        placeholders.push('(?, ?, ?)');
        values.push(sessionId, parseInt(qid, 10), answers[qid]);
    }
    if (placeholders.length > 0) {
        await db.query(
            'INSERT INTO answers (session_id, question_id, score) VALUES ' +
            placeholders.join(', '),
            values
        );
    }
    return sessionId;
}

module.exports = router;
