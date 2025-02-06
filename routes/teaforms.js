const router = require("express").Router();

const { celebrate, Joi } = require("celebrate");

const {
  createTeaForm,
  getTeaForms,
  getTeaFormsByID,
  delTeaFormBySessionID,
  patchTeaForm,
} = require("../controllers/teaforms");

router.get("/my-forms", getTeaForms);
router.get("/my-forms/:sessionId", getTeaFormsByID);
router.delete("/my-forms/:sessionId", delTeaFormBySessionID);
router.post(
  "/create-form/:sessionId",
  celebrate({
    body: Joi.object().keys({
      nameRU: Joi.string().min(2).max(60).required(),
      type: Joi.string().min(2).max(60).required(),
      weight: Joi.number().integer().required(),
      water: Joi.string().min(2).max(60).required(),
      volume: Joi.number().integer().required(),
      temperature: Joi.number().integer().required(),
      teaware: Joi.string().min(2).max(60).required(),
      brewingtype: Joi.string().min(2).max(60).required(),
      country: Joi.string().min(2).max(60).required(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
    }),
  }),
  createTeaForm
);
router.patch("/create-form/:sessionId",
  celebrate({
    body: Joi.object().keys({
      nameRU: Joi.string().min(2).max(60).required(),
      type: Joi.string().min(2).max(60).required(),
      weight: Joi.number().integer().required(),
      water: Joi.string().min(2).max(60).required(),
      volume: Joi.number().integer().required(),
      temperature: Joi.number().integer().required(),
      teaware: Joi.string().min(2).max(60).required(),
      brewingtype: Joi.string().min(2).max(60).required(),
      country: Joi.string().min(2).max(60).required(),
    }),
    params: Joi.object().keys({
      sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
    }),
  }),
  patchTeaForm
  )

module.exports = router;
