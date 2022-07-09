const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const { createBrew, getBrews, delBrewsBySessionID } = require("../controllers/brewings");

router.get('/my-brewings/:sessionId', getBrews);
router.post(
  "/create-form/:sessionId/brew/:brewId",
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
      brewId: Joi.number().integer().required(),
    }),
  }),
  createBrew
);
router.delete("/my-brewings/:sessionId", delBrewsBySessionID);
module.exports = router;
