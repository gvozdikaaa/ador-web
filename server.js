const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const authRoutes  = require('./routes/auth');
const testRoutes  = require('./routes/test');
const adminRoutes = require('./routes/admin');
const { verifyConnection } = require('./utils/mailer');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Проверка обязательных переменных окружения в production
if (isProduction && !process.env.SESSION_SECRET) {
    console.error('[server] SESSION_SECRET обязателен в production-режиме');
    process.exit(1);
}

// Настройки шаблонизатора
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Доверять обратному прокси (nginx) для корректной работы secure-cookie
if (isProduction) {
    app.set('trust proxy', 1);
}

// Middleware для парсинга форм и JSON с ограничением размера тела запроса
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(express.json({ limit: '256kb' }));

// Статические файлы (CSS, клиентский JS)
app.use(express.static(path.join(__dirname, 'public')));

// Сессии
app.use(session({
    secret: process.env.SESSION_SECRET ||
            'ador_dev_secret_' + crypto.randomBytes(8).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure:   isProduction,
        sameSite: 'lax',
        maxAge:   1000 * 60 * 60 * 2 // 2 часа
    },
    name: 'ador.sid'
}));

// Flash-сообщения
app.use(flash());

// Защита от CSRF: токен на сессию, передаётся в шаблоны через res.locals
app.use(function (req, res, next) {
    if (!req.session) return next();
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
});

// Проверка CSRF-токена для всех POST-запросов
app.use(function (req, res, next) {
    if (req.method !== 'POST') return next();
    if (req.path === '/login') return next(); // первая POST-форма (токен ещё не виден клиенту)
    const submitted = req.body && req.body._csrf;
    if (!submitted || submitted !== req.session.csrfToken) {
        console.warn('[security] Отвергнут запрос без действительного CSRF-токена:', req.path);
        return res.status(403).render('error', {
            title: 'Ошибка безопасности',
            message: 'Сессия устарела или нарушена. Откройте страницу заново.'
        });
    }
    next();
});

// Передача общих переменных во все шаблоны
app.use((req, res, next) => {
    res.locals.user  = req.session.user  || null;
    res.locals.admin = req.session.admin || null;
    res.locals.errorMessages   = req.flash('error');
    res.locals.successMessages = req.flash('success');
    next();
});

// Маршруты
app.use('/',      authRoutes);
app.use('/test',  testRoutes);
app.use('/admin', adminRoutes);

// 404
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Страница не найдена',
        message: 'Запрошенная страница не существует.'
    });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
    console.error('[server] Ошибка:', err);
    res.status(500).render('error', {
        title: 'Внутренняя ошибка сервера',
        message: 'Произошла внутренняя ошибка. Попробуйте позже или обратитесь к администратору.'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`[server] Веб-приложение ADOR запущено на http://localhost:${PORT}`);
    console.log(`[server] Режим: ${isProduction ? 'production' : 'development'}`);
    const ok = await verifyConnection();
    if (ok) {
        console.log('[server] SMTP-соединение установлено успешно');
    } else {
        console.log('[server] Внимание: проверьте настройки SMTP в файле .env');
    }
});
