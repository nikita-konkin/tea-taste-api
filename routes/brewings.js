const privateRouter = require("express").Router();
const publicRouter = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const {
  createBrew,
  getBrews,
  delBrewsBySessionID,
  delBrewSelective,
  patchBrew,
  getPublicBrews,
   } = require("../controllers/brewings");

privateRouter.get('/my-brewings/:sessionId', getBrews);
privateRouter.post(
  "/my-brewings/:sessionId/brew/:brewId",
  celebrate({
    body: Joi.object().keys({
      description: Joi.string().min(1).max(2000),
      brewingRating: Joi.number().integer(),
      brewingTime: Joi.string().regex(
        /^(2[0-3]|[01]?[0-9]):([0-5]?[0-9]):([0-5]?[0-9])$/
      ),
      publicAccess: Joi.boolean().required(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
    }),
  }),
  createBrew
);
privateRouter.patch(
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
      publicAccess: Joi.boolean()
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
    }),
  }),
  patchBrew
);
privateRouter.delete("/my-brews/:sessionId", delBrewsBySessionID);
privateRouter.delete(
  "/my-brewings/:sessionId/brew/:brewId",
  celebrate({
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
    }),
  }),
  delBrewSelective
);

publicRouter.get('/public-brewings/:sessionId', getPublicBrews);

module.exports.publicRouter = publicRouter;
module.exports.privateRouter = privateRouter;
