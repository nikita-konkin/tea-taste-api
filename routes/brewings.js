const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const { createBrew, getBrews } = require("../controllers/brewings");

router.get('/my-forms', getBrews);
router.post(
  "/my-forms/:sessionId",
  celebrate({
    body: Joi.object().keys({
      // aromas: Joi.array().required(),
      // tastes: Joi.array().required(),
      description: Joi.string().min(2).max(2000).required(),
      brewingRating: Joi.number().integer().required(),
      brewingTime: Joi.string().regex(
        /^(2[0-3]|[01]?[0-9]):([0-5]?[0-9]):([0-5]?[0-9])$/
      ),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().hex().length(24).required(),
    }),
  }),
  createBrew
);

module.exports = router;
