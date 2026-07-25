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
  getVoiceStatus,
} = require("../controllers/teaforms");

// Shared by the photo and voice URLs. Anchored, with a required extension:
// that is what rejects a bare ".." segment as well as an off-site address.
const UPLOAD_URL = /^\/api\/uploads\/[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,5}$/;

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
    // Optional so existing clients that omit it keep working, and explicitly
    // without .default([]) — celebrate replaces req.body with Joi's output, so
    // a default would wipe the stored photos on every PATCH that omits the key.
    // The required extension in the pattern is what rejects a bare ".." segment.
    photos: Joi.array().max(3).unique('kind').items(
      Joi.object().keys({
        url: Joi.string().pattern(UPLOAD_URL).required(),
        kind: Joi.string().valid('dry', 'liquor', 'wet').required(),
      }),
    ),
    // Same no-.default() rule as photos. The server-owned half (track,
    // transcript, status, operationId, error) has to be *accepted* here because
    // the edit dialog echoes the whole object back, but patchTeaForm keeps only
    // `segments` from the client — see controllers/teaforms.js.
    voice: Joi.object().keys({
      segments: Joi.array().max(20).items(
        Joi.object().keys({
          url: Joi.string().pattern(UPLOAD_URL).required(),
          brewingNumber: Joi.number().integer().min(0).max(50),
          duration: Joi.number().min(0).max(600),
        }),
      ),
      track: Joi.object().keys({
        url: Joi.string().pattern(UPLOAD_URL).allow(''),
        duration: Joi.number().min(0).max(900),
      }),
      transcript: Joi.string().allow('').max(20000),
      status: Joi.string().valid('idle', 'queued', 'processing', 'done', 'error'),
      operationId: Joi.string().allow('').max(200),
      error: Joi.string().allow('').max(500),
    }),
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
privateRouter.get("/my-form/:sessionId/voice", celebrate({
  params: Joi.object().keys({
    sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
}), getVoiceStatus);
privateRouter.delete("/my-form/:sessionId", delTeaFormBySessionID);
privateRouter.post("/create-form/:sessionId", teaFormValidation, createTeaForm);
privateRouter.patch("/create-form/:sessionId", teaFormValidation, patchTeaForm);

module.exports.publicRouter = publicRouter;
module.exports.privateRouter = privateRouter;
