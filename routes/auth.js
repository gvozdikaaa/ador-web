const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { userLoginLimiter } = require('../middleware/auth');

// Главная страница — форма входа пользователя
router.get('/', function (req, res) {
    if (req.session.user) return res.redirect('/test/instruction');
    res.render('login', { title: 'Вход в систему' });
});

// Обработка входа пользователя
router.post('/login', userLoginLimiter, async function (req, res) {
    try {
        const last_name  = (req.body.last_name  || '').trim();
        const first_name = (req.body.first_name || '').trim();
        const group_name = (req.body.group_name || '').trim();
        const ageRaw     = req.body.age;
        const gender     = req.body.gender;

        if (!last_name || !first_name || !group_name || !ageRaw || !gender) {
            req.flash('error', 'Пожалуйста, заполните все обязательные поля.');
            return res.redirect('/');
        }
        // Максимальная длина каждого текстового поля — 20 символов.
        if (last_name.length > 20 || first_name.length > 20 || group_name.length > 20) {
            req.flash('error', 'В каждое поле можно ввести не более 20 символов.');
            return res.redirect('/');
        }
        // В фамилии и имени не допускаются цифры.
        if (/\d/.test(last_name) || /\d/.test(first_name)) {
            req.flash('error', 'Фамилия и имя не должны содержать цифр.');
            return res.redirect('/');
        }
        const ageNum = parseInt(ageRaw, 10);
        if (isNaN(ageNum) || ageNum < 11 || ageNum > 25) {
            req.flash('error', 'Укажите корректный возраст (11–25 лет).');
            return res.redirect('/');
        }
        if (gender !== 'male' && gender !== 'female') {
            req.flash('error', 'Укажите корректный пол.');
            return res.redirect('/');
        }

        const [result] = await db.execute(
            'INSERT INTO users (last_name, first_name, group_name, age, gender) ' +
            'VALUES (?, ?, ?, ?, ?)',
            [last_name, first_name, group_name, ageNum, gender]
        );

        // Регенерация идентификатора сессии после успешной регистрации
        // (защита от session fixation)
        req.session.regenerate(function (err) {
            if (err) {
                console.error('[login] Ошибка регенерации сессии:', err);
                req.flash('error', 'Ошибка инициализации сессии.');
                return res.redirect('/');
            }
            req.session.user = {
                id:         result.insertId,
                last_name:  last_name,
                first_name: first_name,
                group_name: group_name,
                age:        ageNum,
                gender:     gender
            };
            req.session.testProgress = {
                mother: { answers: {}, completed: false },
                father: { answers: {}, completed: false }
            };
            res.redirect('/test/instruction');
        });
    } catch (err) {
        console.error('[login] Ошибка:', err);
        req.flash('error', 'Ошибка при сохранении данных. Попробуйте ещё раз.');
        res.redirect('/');
    }
});

// Выход пользователя.
// Основной способ — POST-форма с CSRF-токеном (кнопки «Выйти» и
// «Завершить работу»). Обработчик GET добавлен как страховка: если на
// адрес /logout придёт обычный переход по ссылке, из закладки или со
// старой закэшированной страницы, пользователь всё равно будет
// корректно перенаправлен на страницу авторизации, а не на «404».
function performLogout(req, res) {
    req.session.destroy(function (err) {
        if (err) {
            console.error('[logout] Ошибка уничтожения сессии:', err);
        }
        res.clearCookie('ador.sid');
        res.redirect('/');
    });
}

router.post('/logout', performLogout);
router.get('/logout', performLogout);

module.exports = router;
