const router = require('express').Router();
const {
  celebrate,
  Joi,
  Segments,
} = require('celebrate');

const {
  loginUser,
  createUser,
  logoutUser,
} = require('../controllers/sign');

// Define the Joi schema


const passwordSchema = Joi.string()
.required()
.pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};\'":|,.<>\\/?]).{4,30}$'))
.min(4)
.label('пароль')
.messages({
  'string.pattern.base': 'Ваш "пароль" должен содержать только буквы (как заглавные, так и строчные), цифры и символы и иметь длину от 4 до 30 символов.',
  'string.base': 'Ваш "пароль" должен содержать только буквы (как заглавные, так и строчные), цифры и символы и иметь длину от 4 до 30 символов.',
  'string.empty': 'Ваш "пароль" не может быть рустым.',
  'string.min': 'Ваш "пароль" должен иметь минимум {#limit} знаков.',
  'any.required': 'Введите "пароль".',
});
const emailSchema = Joi.string().email().required().label('email').messages({
  'string.email': 'Ваш {#label} должен быть действительным адресом электронной почты.',
  'string.base': 'Ваш {#label} должен быть строкой.',
  'string.empty': 'Ваш {#label} не может быть пустым.',
  'any.required': 'Введите {#label}.',
});

router.post('/sign-in', celebrate({
  [Segments.BODY]: Joi.object().keys({
    email: emailSchema,
    password: passwordSchema,
  }),
}), loginUser);

router.post('/sign-up', celebrate({
  [Segments.BODY]: Joi.object().keys({
    name: Joi.string().min(1).max(30).required(),
    email: emailSchema,
    password: passwordSchema,
  }),
}),
// (req, res) => {
  // console.log(req.body);
  // res.status(201).send(req.body);
// }
createUser
);

router.post('/sign-out', logoutUser);

module.exports = router;