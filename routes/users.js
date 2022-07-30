const router = require('express').Router();

const {
  celebrate,
  Joi,
} = require('celebrate');

const {
  getUserById,
  updateUserProfile,
} = require('../controllers/users');

router.get('/profile/me', getUserById);
router.patch('/profile/me', celebrate({
  body: Joi.object().keys({
    name: Joi.string().min(2).max(30).required(),
    email: Joi.string().email().required(),
    career: Joi.string().min(2).max(100),
  }),
}), updateUserProfile);

module.exports = router;