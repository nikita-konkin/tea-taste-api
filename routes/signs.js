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


const passwordSchema = Joi.string().required().pattern(new RegExp('^[a-zA-Z0-9]{3,30}$')).min(8).label('Password').messages({
  'string.pattern.base': 'Your {#label} does not match the suggested pattern',
  'string.base': 'Your {#label} should match the suggested pattern',
  'string.empty': 'Your {#label} cannot be empty',
  'string.min': 'Ваш "пароль" должен иметь минимум {#limit} знаков',
  'any.required': 'Your {#label} is required',
});


router.post('/sign-in', celebrate({
  [Segments.BODY]: Joi.object().keys({
    email: Joi.string().email().required(),
    password: passwordSchema,
  }),
}), loginUser);

router.post('/sign-up', celebrate({
  [Segments.BODY]: Joi.object().keys({
    name: Joi.string().min(1).max(30).required(),
    email: Joi.string().email().required(),
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