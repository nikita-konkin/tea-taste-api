// Messages the API sends back to a client, in three languages.
//
// Kept apart from utils/messages.js on purpose: that file is a byte-for-byte
// mirror of the frontend's catalogue, and these keys exist only here. Nothing
// in the app renders them from a key — they arrive already translated in the
// response body, because that is where the client shows them.
//
// The language comes from `req.locale` (middlewares/locale.js), which the app
// sets explicitly from the URL it is being read at. Russian is the default and
// the fallback, so a client that says nothing keeps the behaviour it had before
// any of this existed.

const MESSAGES = {
  ru: {
    'api.default': 'Ошибка по умолчанию.',
    'api.notFound': 'Запись не найдена.',
    'api.badData': 'Переданы некорректные данные.',
    'api.badId': 'Невалидный id.',
    'api.authRequired': 'Необходима авторизация.',
    'api.adminOnly': 'Доступ только для администратора.',
    'api.noFileAccess': 'Нет доступа к этому файлу.',
    'api.wrongCredentials': 'Неправильные почта или пароль',
    'api.emailTaken': 'Пользователь уже зарегистрирован по данному email.',
    'api.wrongCurrentPassword': 'Неверный текущий пароль.',
    'api.passwordChanged': 'Пароль изменён.',
    'api.passwordChangedSignIn': 'Пароль изменён. Теперь вы можете войти.',
    'api.resetLinkSent': 'Если такой email зарегистрирован, ссылка отправлена.',
    'api.resetLinkInvalid': 'Ссылка недействительна или устарела. Запросите восстановление заново.',
    'api.avatarUrlInvalid': 'Некорректная ссылка на аватар.',
    'api.noFileAvatar': 'Файл не получен: отправьте изображение в поле "avatar".',
    'api.noFilePhoto': 'Файл не получен: отправьте изображение в поле "photo".',
    'api.noFileAudio': 'Файл не получен: отправьте запись в поле "audio".',
    'api.audioUnavailable': 'Обработка аудио на сервере недоступна.',
    'api.audioFailed': 'Не удалось обработать запись. Попробуйте записать ещё раз.',
    'api.suggestionThanks': 'Спасибо! Предложение отправлено.',
    'api.suggestionNotFound': 'Предложение не найдено.',
    'api.formDeleted': 'Запись удалена.',
    'api.userDeleted': 'Пользователь и его данные удалены.',
    'api.vkNotConfigured': 'Вход через VK не настроен.',
    'api.tooManyRequests': 'Слишком много запросов с этого IP-адреса. Повторите попытку позже.',
    'api.tooManyLogins': 'Слишком много попыток входа. Повторите попытку позже.',
    'api.tooManyUploads': 'Слишком много загрузок. Повторите попытку позже.',
    'api.blockedCannotPublish': 'Запись скрыта администратором и не может быть опубликована.',
    'api.registrationClosed': 'Регистрация новых аккаунтов временно закрыта.',
    'api.noRecordings': 'У этой дегустации нет записей.',
  },
  en: {
    'api.default': 'Something went wrong.',
    'api.notFound': 'Not found.',
    'api.badData': 'The data sent was not valid.',
    'api.badId': 'Invalid id.',
    'api.authRequired': 'You need to sign in.',
    'api.adminOnly': 'Administrators only.',
    'api.noFileAccess': 'You do not have access to this file.',
    'api.wrongCredentials': 'Wrong email or password',
    'api.emailTaken': 'An account with this email already exists.',
    'api.wrongCurrentPassword': 'The current password is wrong.',
    'api.passwordChanged': 'Password changed.',
    'api.passwordChangedSignIn': 'Password changed. You can sign in now.',
    'api.resetLinkSent': 'If that email is registered, a link has been sent.',
    'api.resetLinkInvalid': 'This link is invalid or has expired. Please request recovery again.',
    'api.avatarUrlInvalid': 'That is not a valid avatar link.',
    'api.noFileAvatar': 'No file received: send the image in the "avatar" field.',
    'api.noFilePhoto': 'No file received: send the image in the "photo" field.',
    'api.noFileAudio': 'No file received: send the recording in the "audio" field.',
    'api.audioUnavailable': 'Audio processing is unavailable on the server.',
    'api.audioFailed': 'Could not process the recording. Please try recording again.',
    'api.suggestionThanks': 'Thank you. Your suggestion has been sent.',
    'api.suggestionNotFound': 'Suggestion not found.',
    'api.formDeleted': 'Tasting deleted.',
    'api.userDeleted': 'The user and their data have been deleted.',
    'api.vkNotConfigured': 'VK sign-in is not configured.',
    'api.tooManyRequests': 'Too many requests from this IP address. Please try again later.',
    'api.tooManyLogins': 'Too many sign-in attempts. Please try again later.',
    'api.tooManyUploads': 'Too many uploads. Please try again later.',
    'api.blockedCannotPublish': 'An administrator has hidden this tasting, so it cannot be published.',
    'api.registrationClosed': 'New registrations are closed for now.',
    'api.noRecordings': 'This tasting has no recordings.',
  },
  zh: {
    'api.default': '出现错误。',
    'api.notFound': '未找到记录。',
    'api.badData': '提交的数据无效。',
    'api.badId': 'id 无效。',
    'api.authRequired': '请先登录。',
    'api.adminOnly': '仅管理员可访问。',
    'api.noFileAccess': '您没有该文件的访问权限。',
    'api.wrongCredentials': '邮箱或密码错误',
    'api.emailTaken': '该邮箱已注册。',
    'api.wrongCurrentPassword': '当前密码不正确。',
    'api.passwordChanged': '密码已修改。',
    'api.passwordChangedSignIn': '密码已修改，现在可以登录。',
    'api.resetLinkSent': '如果该邮箱已注册，链接已发送。',
    'api.resetLinkInvalid': '链接无效或已过期，请重新申请找回密码。',
    'api.avatarUrlInvalid': '头像链接无效。',
    'api.noFileAvatar': '未收到文件：请在 "avatar" 字段中发送图片。',
    'api.noFilePhoto': '未收到文件：请在 "photo" 字段中发送图片。',
    'api.noFileAudio': '未收到文件：请在 "audio" 字段中发送录音。',
    'api.audioUnavailable': '服务器音频处理不可用。',
    'api.audioFailed': '录音处理失败，请重新录制。',
    'api.suggestionThanks': '谢谢！建议已发送。',
    'api.suggestionNotFound': '未找到该建议。',
    'api.formDeleted': '记录已删除。',
    'api.userDeleted': '该用户及其数据已删除。',
    'api.vkNotConfigured': '未配置 VK 登录。',
    'api.tooManyRequests': '来自此 IP 的请求过多，请稍后再试。',
    'api.tooManyLogins': '登录尝试次数过多，请稍后再试。',
    'api.tooManyUploads': '上传次数过多，请稍后再试。',
    'api.blockedCannotPublish': '管理员已隐藏该记录，无法公开发布。',
    'api.registrationClosed': '暂时关闭新账户注册。',
    'api.noRecordings': '该记录没有录音。',
  },
};

const DEFAULT_LOCALE = 'ru';

// `req` rather than a bare locale string, so a caller cannot forget to pass the
// language and silently get Russian: every call site already has the request.
// Tolerates a missing req for the handful of places that build a message before
// one exists.
const t = (req, key) => {
  const locale = (req && req.locale) || DEFAULT_LOCALE;
  const table = MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE];
  return table[key] || MESSAGES[DEFAULT_LOCALE][key] || key;
};

// For the rate limiters, which are configured once at startup and have no
// request in scope when the message is written. Express-rate-limit accepts a
// function, so the language is resolved per request after all.
const tFor = (key) => (req) => t(req, key);

module.exports = { MESSAGES, DEFAULT_LOCALE, t, tFor };
