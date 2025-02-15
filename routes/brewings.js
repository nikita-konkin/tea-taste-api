const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const { 
  createBrew, 
  getBrews, 
  delBrewsBySessionID,
  patchBrew
   } = require("../controllers/brewings");

router.get('/my-brewings/:sessionId', getBrews);
router.post(
  "/my-brewings/:sessionId/brew/:brewId",
  celebrate({
    body: Joi.object().keys({
      // aromas: Joi.array().required(),
      // tastes: Joi.array().required(),
      description: Joi.string().min(1).max(2000),
      brewingRating: Joi.number().integer(),
      brewingTime: Joi.string().regex(
        /^(2[0-3]|[01]?[0-9]):([0-5]?[0-9]):([0-5]?[0-9])$/
      ),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
    }),
  }),
  createBrew
);
router.patch(
  "/my-brewings/:sessionId/brew/:brewId",
  celebrate({
    body: Joi.object().keys({
      // aromas: Joi.array().required(),
      // tastes: Joi.array().required(),
      description: Joi.string().min(2).max(2000),
      brewingRating: Joi.number().integer(),
      brewingTime: Joi.string().regex(
        /^(2[0-3]|[01]?[0-9]):([0-5]?[0-9]):([0-5]?[0-9])$/
      ),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
    }),
  }),
  patchBrew
);
router.delete("/my-brews/:sessionId", delBrewsBySessionID);
module.exports = router;
