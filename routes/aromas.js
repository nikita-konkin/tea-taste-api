const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const { createAroma } = require("../controllers/aromas");

router.post(
  "/form/:sessionId/brew/:brewId/aroma/:aromaId",
  celebrate({
    body: Joi.object().keys({
      aromaStage1: Joi.string().min(2).max(30).required(),
      aromaStage2: Joi.string().min(2).max(30).required(),
      aromaStage3: Joi.string().min(2).max(30).required(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().hex().length(24).required(),
      brewId: Joi.number().integer().required(),
      aromaId: Joi.number().integer().required(),
    }),
  }),
  createAroma
);

module.exports = router;
