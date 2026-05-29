const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { requireAdmin, noCache, adminLoginLimiter } = require('../middleware/auth');
const settings = require('../utils/settings');

// Заглушка-хеш для защиты от тайминговых атак
const DUMMY_HASH = '$2a$10$' + 'x'.repeat(53);

// Страница входа администратора
router.get('/login', function (req, res) {
    if (req.session.admin) return res.redirect('/admin');
    res.render('admin_login', { title: 'Вход администратора' });
});

router.post('/login', adminLoginLimiter, async function (req, res) {
    const login    = (req.body.login    || '').trim();
    const password = req.body.password || '';
    if (!login || !password) {
        req.flash('error', 'Введите логин и пароль.');
        return res.redirect('/admin/login');
    }
    if (login.length > 64 || password.length > 256) {
        req.flash('error', 'Превышена допустимая длина учётных данных.');
        return res.redirect('/admin/login');
    }
    try {
        const [rows] = await db.execute(
            'SELECT id, login, password_hash, full_name FROM admins WHERE login = ?',
            [login]
        );
        // Защита от тайминговых атак: всегда выполняем bcrypt.compare,
        // даже если запись с таким логином не найдена.
        const adminRow = rows.length > 0 ? rows[0] : null;
        const ok = await bcrypt.compare(password, adminRow ? adminRow.password_hash : DUMMY_HASH);
        if (!adminRow || !ok) {
            req.flash('error', 'Неверный логин или пароль.');
            return res.redirect('/admin/login');
        }
        req.session.regenerate(function (err) {
            if (err) {
                console.error('[admin login] Ошибка регенерации сессии:', err);
                req.flash('error', 'Ошибка входа. Попробуйте позже.');
                return res.redirect('/admin/login');
            }
            req.session.admin = {
                id:        adminRow.id,
                login:     adminRow.login,
                full_name: adminRow.full_name
            };
            res.redirect('/admin');
        });
    } catch (err) {
        console.error('[admin login] Ошибка:', err);
        req.flash('error', 'Ошибка входа. Попробуйте позже.');
        res.redirect('/admin/login');
    }
});

router.post('/logout', function (req, res) {
    req.session.destroy(function (err) {
        if (err) {
            console.error('[admin logout] Ошибка уничтожения сессии:', err);
        }
        res.clearCookie('ador.sid');
        res.redirect('/admin/login');
    });
});

// Все маршруты ниже требуют авторизации администратора
router.use(requireAdmin, noCache);

// Главная панель — список последних результатов
router.get('/', async function (req, res) {
    try {
        const [rows] = await db.execute(
            'SELECT u.id, u.last_name, u.first_name, u.group_name, u.age, u.gender, ' +
            '       u.created_at, COUNT(s.id) AS sessions_count ' +
            'FROM users u ' +
            'LEFT JOIN test_sessions s ON s.user_id = u.id ' +
            'GROUP BY u.id ' +
            'ORDER BY u.created_at DESC ' +
            'LIMIT 100'
        );
        res.render('admin_dashboard', {
            title: 'Панель администратора',
            users: rows
        });
    } catch (err) {
        console.error('[admin dashboard] Ошибка:', err);
        req.flash('error', 'Ошибка загрузки данных.');
        res.render('admin_dashboard', { title: 'Панель администратора', users: [] });
    }
});

// Просмотр результатов конкретного пользователя
router.get('/users/:id', async function (req, res) {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
        req.flash('error', 'Некорректный идентификатор пользователя.');
        return res.redirect('/admin');
    }
    try {
        const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            req.flash('error', 'Запись пользователя не найдена.');
            return res.redirect('/admin');
        }
        const [sessions] = await db.execute(
            'SELECT * FROM test_sessions WHERE user_id = ? ORDER BY completed_at DESC',
            [userId]
        );
        res.render('admin_user', {
            title: 'Результаты пользователя',
            user: users[0],
            sessions: sessions
        });
    } catch (err) {
        console.error('[admin user] Ошибка:', err);
        req.flash('error', 'Ошибка загрузки результатов.');
        res.redirect('/admin');
    }
});

router.post('/users/:id/delete', async function (req, res) {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
        req.flash('error', 'Некорректный идентификатор пользователя.');
        return res.redirect('/admin');
    }
    try {
        const [result] = await db.execute('DELETE FROM users WHERE id = ?', [userId]);
        if (result.affectedRows === 0) {
            req.flash('error', 'Запись не найдена или уже была удалена.');
        } else {
            req.flash('success', 'Запись успешно удалена (затронуто строк: ' +
                                 result.affectedRows + ').');
        }
    } catch (err) {
        console.error('[admin delete] Ошибка:', err);
        req.flash('error', 'Не удалось удалить запись.');
    }
    res.redirect('/admin');
});

// Список вопросов с возможностью редактирования
router.get('/questions', async function (req, res) {
    try {
        const [questions] = await db.execute(
            'SELECT id, text, scale FROM questions ORDER BY id ASC'
        );
        res.render('admin_questions', {
            title: 'Управление утверждениями',
            questions: questions
        });
    } catch (err) {
        console.error('[admin questions] Ошибка:', err);
        req.flash('error', 'Ошибка загрузки списка вопросов.');
        res.redirect('/admin');
    }
});

router.post('/questions/:id/update', async function (req, res) {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1 || id > 50) {
        req.flash('error', 'Некорректный идентификатор утверждения.');
        return res.redirect('/admin/questions');
    }
    try {
        const text = (req.body.text || '').trim();
        if (!text) {
            req.flash('error', 'Текст утверждения не может быть пустым.');
            return res.redirect('/admin/questions');
        }
        if (text.length > 1000) {
            req.flash('error', 'Текст утверждения превышает допустимую длину.');
            return res.redirect('/admin/questions');
        }
        const [result] = await db.execute(
            'UPDATE questions SET text = ? WHERE id = ?',
            [text, id]
        );
        if (result.affectedRows === 0) {
            req.flash('error', 'Утверждение №' + id + ' не найдено.');
        } else {
            req.flash('success', 'Утверждение №' + id + ' обновлено.');
        }
    } catch (err) {
        console.error('[admin update q] Ошибка:', err);
        req.flash('error', 'Ошибка обновления текста.');
    }
    res.redirect('/admin/questions');
});

// ---------------------------------------------------------------------
// Настройки системы (Глава 1.3 ПЗ — функция администратора)
// ---------------------------------------------------------------------
router.get('/settings', async function (req, res) {
    try {
        const all = await settings.getAll();
        res.render('admin_settings', {
            title: 'Настройки системы',
            settings: all
        });
    } catch (err) {
        console.error('[admin settings] Ошибка:', err);
        req.flash('error', 'Ошибка загрузки настроек.');
        res.redirect('/admin');
    }
});

router.post('/settings', async function (req, res) {
    try {
        const email       = (req.body.psychologist_email || '').trim();
        const instruction = (req.body.instruction_text   || '').trim();
        const motivation  = (req.body.motivation_text    || '').trim();
        const advice      = (req.body.result_advice      || '').trim();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email) || email.length > 255) {
            req.flash('error', 'Введите корректный адрес электронной почты педагога-психолога.');
            return res.redirect('/admin/settings');
        }
        if (!instruction || !motivation || !advice) {
            req.flash('error', 'Все текстовые поля должны быть заполнены.');
            return res.redirect('/admin/settings');
        }
        if (instruction.length > 4000 || motivation.length > 4000 || advice.length > 1000) {
            req.flash('error', 'Превышен допустимый размер одного из текстовых полей.');
            return res.redirect('/admin/settings');
        }

        await settings.set('psychologist_email', email);
        await settings.set('instruction_text',   instruction);
        await settings.set('motivation_text',    motivation);
        await settings.set('result_advice',      advice);

        req.flash('success', 'Настройки сохранены.');
        res.redirect('/admin/settings');
    } catch (err) {
        console.error('[admin settings save] Ошибка:', err);
        req.flash('error', 'Ошибка сохранения настроек.');
        res.redirect('/admin/settings');
    }
});

// Смена пароля администратора
router.get('/password', function (req, res) {
    res.render('admin_password', { title: 'Смена пароля' });
});

router.post('/password', async function (req, res) {
    const current = req.body.current || '';
    const newPass = req.body.next    || '';
    const confirm = req.body.confirm || '';
    if (!current || !newPass || !confirm) {
        req.flash('error', 'Заполните все поля.');
        return res.redirect('/admin/password');
    }
    if (newPass.length < 8) {
        req.flash('error', 'Новый пароль должен содержать не менее 8 символов.');
        return res.redirect('/admin/password');
    }
    if (newPass.length > 256) {
        req.flash('error', 'Новый пароль превышает допустимую длину.');
        return res.redirect('/admin/password');
    }
    if (newPass !== confirm) {
        req.flash('error', 'Новый пароль и подтверждение не совпадают.');
        return res.redirect('/admin/password');
    }
    if (newPass === current) {
        req.flash('error', 'Новый пароль не должен совпадать с текущим.');
        return res.redirect('/admin/password');
    }
    try {
        const [rows] = await db.execute(
            'SELECT password_hash FROM admins WHERE id = ?',
            [req.session.admin.id]
        );
        if (rows.length === 0) {
            req.flash('error', 'Запись администратора не найдена.');
            return res.redirect('/admin/password');
        }
        const ok = await bcrypt.compare(current, rows[0].password_hash);
        if (!ok) {
            req.flash('error', 'Текущий пароль введён неверно.');
            return res.redirect('/admin/password');
        }
        const hash = await bcrypt.hash(newPass, 12);
        await db.execute('UPDATE admins SET password_hash = ? WHERE id = ?',
            [hash, req.session.admin.id]);
        req.flash('success', 'Пароль успешно изменён.');
        res.redirect('/admin');
    } catch (err) {
        console.error('[admin password] Ошибка:', err);
        req.flash('error', 'Ошибка смены пароля.');
        res.redirect('/admin/password');
    }
});

module.exports = router;
