const rateLimit = require('express-rate-limit');

function requireUser(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.redirect('/');
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    return res.redirect('/admin/login');
}

function noCache(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
}

// Ограничитель частоты для формы входа администратора:
// не более 10 попыток с одного IP за 15 минут.
const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: function (req, res) {
        res.status(429).render('error', {
            title: 'Слишком много попыток входа',
            message: 'Превышено допустимое число попыток входа. Повторите попытку через 15 минут.'
        });
    }
});

// Ограничитель частоты для регистрации обучающихся:
// не более 30 регистраций с одного IP за час.
const userLoginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: function (req, res) {
        res.status(429).render('error', {
            title: 'Слишком много регистраций',
            message: 'Превышено допустимое число регистраций. Повторите попытку через час.'
        });
    }
});

module.exports = {
    requireUser,
    requireAdmin,
    noCache,
    adminLoginLimiter,
    userLoginLimiter
};
