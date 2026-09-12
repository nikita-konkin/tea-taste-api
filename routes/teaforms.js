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
  getSitemap,
  getVoiceStatus,
  extractFromVoice,
  retryVoice,
} = require('../controllers/teaforms');

// Shared by the photo and voice URLs. Anchored, with a required extension:
// that is what rejects a bare ".." segment as well as an off-site address.
const UPLOAD_URL = /^\/api\/uploads\/[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,5}$/;

const teaFormValidation = celebrate({
  body: Joi.object().keys({
    // Nothing here is required any more. A tasting is often recorded before it
    // can be typed up — that is the whole point of the voice notes — so demanding
    // twelve complete fields at creation contradicted the feature. What is
    // actually needed to save is enforced in the wizard: a name, or a recording
    // to derive one from later.
    //
    // The mongoose schema still marks several of these required, which is
    // decorative on this path: createTeaForm writes through updateMany/upsert and
    // patchTeaForm through findOneAndUpdate, and neither runs validators.
    nameRU: Joi.string().min(2).max(60),
    country: Joi.string().min(2).max(60).allow(''),
    shop: Joi.string().min(2).max(60).allow(''),
    type: Joi.string().min(2).max(60).allow(''),
    weight: Joi.number().integer(),
    water: Joi.string().min(2).max(60).allow(''),
    volume: Joi.number().integer(),
    temperature: Joi.number().integer(),
    price: Joi.number().precision(4),
    teaware: Joi.string().min(2).max(60).allow(''),
    brewingtype: Joi.string().min(2).max(60).allow(''),
    publicAccess: Joi.boolean(),
    averageRating: Joi.number().min(1).max(10).precision(2),
    // Free text about the tea as a whole, and about the smell of the dry leaf.
    // Same 2000 characters a пролив description gets, and .allow('') so an
    // edit that empties the box actually clears the stored value.
    description: Joi.string().max(2000).allow(''),
    dryAromaDescription: Joi.string().max(2000).allow(''),
    // Optional so existing clients that omit it keep working, and explicitly
    // without .default([]) — celebrate replaces req.body with Joi's output, so
    // a default would wipe the stored photos on every PATCH that omits the key.
    // The required extension in the pattern is what rejects a bare ".." segment.
    photos: Joi.array().max(3).unique('kind').items(
      Joi.object().keys({
        url: Joi.string().pattern(UPLOAD_URL).required(),
        kind: Joi.string().valid('dry', 'liquor', 'wet').required(),
        // Written by the upload endpoint and echoed back by the edit dialog.
        // Same anchored pattern as url — it is a path the browser will fetch.
        thumb: Joi.string().pattern(UPLOAD_URL).allow(''),
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
          whole: Joi.boolean(),
        }),
      ),
      track: Joi.object().keys({
        url: Joi.string().pattern(UPLOAD_URL).allow(''),
        duration: Joi.number().min(0).max(900),
      }),
      transcript: Joi.string().allow('').max(20000),
      transcriptRaw: Joi.string().allow('').max(20000),
      // Server-owned like transcript, and accepted for the same reason: the
      // edit dialog may echo the whole voice object back. patchTeaForm keeps
      // only `segments` and `public` from a client either way.
      parts: Joi.array().max(60).items(
        Joi.object().keys({
          brewingNumber: Joi.number().integer().min(0).max(50),
          whole: Joi.boolean(),
          transcript: Joi.string().allow('').max(20000),
          transcriptRaw: Joi.string().allow('').max(20000),
        }),
      ),
      pending: Joi.array().max(60).items(
        Joi.object().keys({
          brewingNumber: Joi.number().integer().min(0).max(50),
          operationId: Joi.string().allow('').max(200),
        }),
      ),
      // Unlike transcript/status, this one IS the client's to set.
      public: Joi.boolean(),
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
publicRouter.get('/sitemap.xml', getSitemap);
publicRouter.get('/public-forms', getPublicTeaForms);
// Accepts a readable slug (da-hun-pao-ba5e1be584) or a raw sessionId — every
// /blog/<uuid> link shared before slugs existed still has to resolve. The
// pattern is what a slug can be built from (utils/slugify.js) plus the hyphens
// of a UUID, so it stays a validated parameter and not a free-text lookup.
publicRouter.get('/public-form/:sessionId', celebrate({
  params: Joi.object().keys({
    sessionId: Joi.string().pattern(/^[a-z0-9-]{1,80}$/i).required(),
  }),
}), getPublicTeaFormById);

const privateRouter = express.Router();

privateRouter.get('/my-forms', getTeaForms);
privateRouter.get('/my-form/:sessionId', getTeaFormsByID);
privateRouter.get('/my-form/:sessionId/voice', celebrate({
  params: Joi.object().keys({
    sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
}), getVoiceStatus);
privateRouter.post('/my-form/:sessionId/voice/retry', celebrate({
  params: Joi.object().keys({
    sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
}), retryVoice);
privateRouter.post('/my-form/:sessionId/extract', celebrate({
  params: Joi.object().keys({
    sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
}), extractFromVoice);
privateRouter.delete('/my-form/:sessionId', delTeaFormBySessionID);
privateRouter.post('/create-form/:sessionId', teaFormValidation, createTeaForm);
privateRouter.patch('/create-form/:sessionId', teaFormValidation, patchTeaForm);

module.exports.publicRouter = publicRouter;
module.exports.privateRouter = privateRouter;
