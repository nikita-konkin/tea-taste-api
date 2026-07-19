const privateRouter = require('express').Router();
const { celebrate, Joi, Segments } = require('celebrate');

const { createSuggestion } = require('../controllers/suggestions');

privateRouter.post('/suggestions', celebrate({
  [Segments.BODY]: Joi.object().keys({
    text: Joi.string().min(5).max(1000).required().messages({
      'string.min': 'Опишите предложение хотя бы в {#limit} символов.',
      'string.max': 'Предложение не должно превышать {#limit} символов.',
      'any.required': 'Введите текст предложения.',
      'string.empty': 'Введите текст предложения.',
    }),
  }),
}), createSuggestion);

module.exports.privateRouter = privateRouter;
