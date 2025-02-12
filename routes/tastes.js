const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const { 
  createTaste,
  delTasteBySessionID,
  getTastes,
  patchTaste,
  delTasteSelective,
  getAllFromTasteDB
   } = require("../controllers/tastes");

router.post(
  "/my-tastes/:sessionId/brew/:brewId/taste/:tasteId",
  celebrate({
    body: Joi.object().keys({
      tasteStage1: Joi.string().min(2).max(30).required(),
      tasteStage2: Joi.string().min(0).max(30),
      tasteStage3: Joi.string().min(0).max(30),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
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
      tasteStage1: Joi.string().min(2).max(30),
      tasteStage2: Joi.string().min(0).max(30),
      tasteStage3: Joi.string().min(0).max(30),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
      brewId: Joi.number().integer().required(),
      tasteId: Joi.number().integer().required(),
    }),
  }),
  patchTaste
);
router.get("/my-tastes/:sessionId", getTastes);
router.get("/tastedb", getAllFromTasteDB);
router.delete("/my-tastes/:sessionId", delTasteBySessionID);
router.delete("/my-tastes/:sessionId/brew/:brewId/taste/:tasteId", delTasteSelective);
module.exports = router;
