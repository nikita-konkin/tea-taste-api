const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const { 
  createTaste,
  delTasteBySessionID,
  getTastes,
  patchTaste,
  delTasteSelective,
   } = require("../controllers/tastes");

router.post(
  "/create-form/:sessionId/brew/:brewId/taste/:tasteId",
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
router.patch(
  "/my-tastes/:sessionId/brew/:brewId/taste/:tasteId",
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
  patchTaste
);
router.get("/my-tastes/:sessionId", getTastes);
router.delete("/taste/:sessionId", delTasteBySessionID);
router.delete("/my-tastes/:sessionId/brew/:brewId/taste/:tasteId", delTasteSelective);
module.exports = router;
