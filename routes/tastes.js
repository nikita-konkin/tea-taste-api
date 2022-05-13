const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const { createTaste } = require("../controllers/tastes");

router.post(
  "/form/:sessionId/brew/:brewId/taste/:tasteId",
  celebrate({
    body: Joi.object().keys({
      tasteStage1: Joi.string().min(2).max(30).required(),
      tasteStage2: Joi.string().min(2).max(30).required(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().hex().length(24).required(),
      brewId: Joi.number().integer().required(),
      tasteId: Joi.number().integer().required(),
    }),
  }),
  createTaste
);

module.exports = router;
