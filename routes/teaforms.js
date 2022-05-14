const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const { createTeaForm, getTeaForms } = require("../controllers/teaforms");

router.get("/my-forms", getTeaForms);
router.post(
  "/form/:sessionId",
  celebrate({
    body: Joi.object().keys({
      nameRU: Joi.string().min(2).max(60).required(),
      type: Joi.string().min(2).max(60).required(),
      weight: Joi.number().integer().required(),
      water: Joi.string().min(2).max(60).required(),
      volume: Joi.number().integer().required(),
      temperature: Joi.number().integer().required(),
      teaware: Joi.string().min(2).max(60).required(),
      brewingtype: Joi.string().min(2).max(60).required(),
      country: Joi.string().min(2).max(60).required(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().hex().length(24).required(),
    }),
  }),
  createTeaForm
);

module.exports = router;
