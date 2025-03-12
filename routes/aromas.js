const privateRouter = require("express").Router();
const publicRouter = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const {
  createAroma,
  delAromaBySessionID,
  getAromas,
  patchAroma,
  delAromaSelective,
  getAllFromAromaDB,
  getPublicAromas,
  } = require("../controllers/aromas");

privateRouter.post(
  "/my-aromas/:sessionId/brew/:brewId/aroma/:aromaId",
  celebrate({
    body: Joi.object().keys({
      aromaStage1: Joi.string().min(2).max(30).required(),
      aromaStage2: Joi.string().min(0).max(30),
      aromaStage3: Joi.string().min(0).max(30),
      publicAccess: Joi.boolean().required(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
      aromaId: Joi.number().integer().required(),
    }),
  }),
  createAroma
);

privateRouter.patch(
  "/my-aromas/:sessionId/brew/:brewId/aroma/:aromaId",
  celebrate({
    body: Joi.object().keys({
      aromaStage1: Joi.string().min(2).max(30),
      aromaStage2: Joi.string().min(0).max(30),
      aromaStage3: Joi.string().min(0).max(30),
      publicAccess: Joi.boolean(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
      aromaId: Joi.number().integer().required(),
    }),
  }),
  patchAroma
);

privateRouter.get("/my-aromas/:sessionId", getAromas);
privateRouter.get("/aromadb", getAllFromAromaDB);
privateRouter.delete("/my-aromas/:sessionId", delAromaBySessionID);
privateRouter.delete("/my-aromas/:sessionId/brew/:brewId/aroma/:aromaId", delAromaSelective);

publicRouter.get("/public-aromas/:sessionId", getPublicAromas);

module.exports.publicRouter = publicRouter;
module.exports.privateRouter = privateRouter;
