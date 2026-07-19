const express = require('express');
const { celebrate, Joi } = require('celebrate');

const {
  createTeaForm,
  getTeaForms,
  getTeaFormsByID,
  delTeaFormBySessionID,
  patchTeaForm,
  getPublicTeaForms,
  getPublicTeaFormById,
} = require("../controllers/teaforms");

const teaFormValidation = celebrate({
  body: Joi.object().keys({
    nameRU: Joi.string().min(2).max(60).required(),
    country: Joi.string().min(2).max(60).required(),
    shop: Joi.string().min(2).max(60).required(),
    type: Joi.string().min(2).max(60).required(),
    weight: Joi.number().integer().required(),
    water: Joi.string().min(2).max(60).required(),
    volume: Joi.number().integer().required(),
    temperature: Joi.number().integer().required(),
    price: Joi.number().precision(4).required(),
    teaware: Joi.string().min(2).max(60).required(),
    brewingtype: Joi.string().min(2).max(60).required(),
    publicAccess: Joi.boolean().required(),
    averageRating: Joi.number().min(1).max(10).precision(2).required(),
  }),
  params: Joi.object().keys({
    sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
});

const publicRouter = express.Router();
publicRouter.get('/public-forms', getPublicTeaForms);
publicRouter.get('/public-form/:sessionId', celebrate({
  params: Joi.object().keys({
    sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
}), getPublicTeaFormById);

const privateRouter = express.Router();

privateRouter.get("/my-forms", getTeaForms);
privateRouter.get("/my-form/:sessionId", getTeaFormsByID);
privateRouter.delete("/my-form/:sessionId", delTeaFormBySessionID);
privateRouter.post("/create-form/:sessionId", teaFormValidation, createTeaForm);
privateRouter.patch("/create-form/:sessionId", teaFormValidation, patchTeaForm);

module.exports.publicRouter = publicRouter;
module.exports.privateRouter = privateRouter;
