// =====================================================================
// ADOR — клиентский скрипт страницы прохождения теста
// Отслеживает заполненные ответы и обновляет индикатор прогресса
// =====================================================================
(function () {
    'use strict';

    const form = document.getElementById('testForm');
    if (!form) return;

    const fillBar = document.getElementById('progressFill');
    const counter = document.getElementById('answeredCount');
    const totalQuestions = 50;

    function updateProgress() {
        const answered = new Set();
        const inputs = form.querySelectorAll('input[type="radio"]:checked');
        inputs.forEach(function (input) {
            answered.add(input.name);
        });
        const count = answered.size;
        const percent = Math.round((count / totalQuestions) * 100);
        fillBar.style.width = percent + '%';
        counter.textContent = count;
    }

    form.addEventListener('change', updateProgress);
    updateProgress();

    // Подтверждение ухода со страницы при наличии незаполненных ответов
    let formSubmitting = false;
    form.addEventListener('submit', function () { formSubmitting = true; });
    window.addEventListener('beforeunload', function (e) {
        if (formSubmitting) return;
        const inputs = form.querySelectorAll('input[type="radio"]:checked');
        if (inputs.length > 0 && inputs.length < totalQuestions) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
})();
