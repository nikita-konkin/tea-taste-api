const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const {
  createAroma,
  delAromaBySessionID,
  getAromas,
  patchAroma,
  delAromaSelective
  } = require("../controllers/aromas");

router.post(
  "/create-form/:sessionId/brew/:brewId/aroma/:aromaId",
  celebrate({
    body: Joi.object().keys({
      aromaStage1: Joi.string().min(2).max(30).required(),
      aromaStage2: Joi.string().min(0).max(30),
      aromaStage3: Joi.string().min(0).max(30),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().hex().length(24).required(),
      brewId: Joi.number().integer().required(),
      aromaId: Joi.number().integer().required(),
    }),
  }),
  createAroma
);

router.patch(
  "/my-aromas/:sessionId/brew/:brewId/aroma/:aromaId",
  celebrate({
    body: Joi.object().keys({
      aromaStage1: Joi.string().min(2).max(30),
      aromaStage2: Joi.string().min(0).max(30),
      aromaStage3: Joi.string().min(0).max(30),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().hex().length(24).required(),
      brewId: Joi.number().integer().required(),
      aromaId: Joi.number().integer().required(),
    }),
  }),
  patchAroma
);

router.get("/my-aromas/:sessionId", getAromas)
router.delete("/aroma/:sessionId", delAromaBySessionID);
router.delete("/my-aromas/:sessionId/brew/:brewId/aroma/:aromaId", delAromaSelective);
module.exports = router;
