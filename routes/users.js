const router = require('express').Router();

const {
  celebrate,
  Joi,
} = require('celebrate');

const {
  getUserById,
  updateUserProfile,
  updateUserPassword,
} = require('../controllers/users');

// Same password rules as at sign-up (see routes/signs.js).
const passwordSchema = Joi.string()
  .required()
  .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};\'":|,.<>\\/?]).{4,30}$'))
  .min(4)
  .label('пароль')
  .messages({
    'string.pattern.base': 'Ваш "пароль" должен содержать только буквы (как заглавные, так и строчные), цифры и символы и иметь длину от 4 до 30 символов.',
    'string.empty': 'Ваш "пароль" не может быть пустым.',
    'string.min': 'Ваш "пароль" должен иметь минимум {#limit} знаков.',
    'any.required': 'Введите "пароль".',
  });

router.get('/profile/me', getUserById);

router.patch('/profile/me', celebrate({
  body: Joi.object().keys({
    name: Joi.string().min(2).max(30),
    email: Joi.string().email(),
    career: Joi.string().min(2).max(100).allow(''),
    about: Joi.string().min(2).max(500).allow(''),
    avatar: Joi.string().uri({ scheme: ['http', 'https'] }).allow(''),
  }).min(1),
}), updateUserProfile);

router.patch('/profile/password', celebrate({
  body: Joi.object().keys({
    oldPassword: Joi.string().required(),
    newPassword: passwordSchema,
  }),
}), updateUserPassword);

module.exports = router;
