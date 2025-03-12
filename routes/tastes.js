const privateRouter = require("express").Router();
const publicRouter = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const { 
  createTaste,
  delTasteBySessionID,
  getTastes,
  patchTaste,
  delTasteSelective,
  getAllFromTasteDB,
  getPublicTastes,
   } = require("../controllers/tastes");

privateRouter.post(
  "/my-tastes/:sessionId/brew/:brewId/taste/:tasteId",
  celebrate({
    body: Joi.object().keys({
      tasteStage1: Joi.string().min(2).max(30).required(),
      tasteStage2: Joi.string().min(0).max(30),
      tasteStage3: Joi.string().min(0).max(30),
      publicAccess: Joi.boolean().required(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
      tasteId: Joi.number().integer().required(),
    }),
  }),
  createTaste
);
privateRouter.patch(
  "/my-tastes/:sessionId/brew/:brewId/taste/:tasteId",
  celebrate({
    body: Joi.object().keys({
      tasteStage1: Joi.string().min(2).max(30),
      tasteStage2: Joi.string().min(0).max(30),
      tasteStage3: Joi.string().min(0).max(30),
      publicAccess: Joi.boolean(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
      tasteId: Joi.number().integer().required(),
    }),
  }),
  patchTaste
);
privateRouter.get("/my-tastes/:sessionId", getTastes);
privateRouter.get("/tastedb", getAllFromTasteDB);
privateRouter.delete("/my-tastes/:sessionId", delTasteBySessionID);
privateRouter.delete("/my-tastes/:sessionId/brew/:brewId/taste/:tasteId", delTasteSelective);

publicRouter.get("/public-tastes/:sessionId", getPublicTastes);


module.exports.publicRouter = publicRouter;
module.exports.privateRouter = privateRouter;
