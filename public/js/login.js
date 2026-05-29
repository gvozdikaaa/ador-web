// =====================================================================
// ADOR — клиентский скрипт страницы авторизации.
// Запрещает ввод цифр в поля «Фамилия» и «Имя»: цифры удаляются прямо
// в процессе набора, в том числе при вставке текста из буфера обмена.
// Ограничение длины (20 символов) обеспечивается атрибутом maxlength,
// серверная проверка дублирует обе эти меры.
// =====================================================================
(function () {
    'use strict';

    var fields = document.querySelectorAll('.js-no-digits');
    if (!fields.length) return;

    fields.forEach(function (field) {
        field.addEventListener('input', function () {
            var cleaned = field.value.replace(/[0-9]/g, '');
            if (cleaned !== field.value) {
                var pos = field.selectionStart - 1;
                field.value = cleaned;
                // Возвращаем курсор в осмысленную позицию после фильтрации
                if (typeof pos === 'number' && pos >= 0) {
                    field.setSelectionRange(pos, pos);
                }
            }
        });
    });
})();
