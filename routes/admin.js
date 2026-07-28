const privateRouter = require('express').Router();
const { celebrate, Joi, Segments } = require('celebrate');

const adminOnly = require('../middlewares/adminOnly');
const {
  getUsers, setUserRole, deleteUser, getAppSettings, updateAppSettings,
  getForms, setFormBlocked, deleteForm,
} = require('../controllers/admin');
const { getSuggestions, deleteSuggestion } = require('../controllers/suggestions');

privateRouter.use('/admin', adminOnly);

privateRouter.get('/admin/users', getUsers);

privateRouter.patch('/admin/users/:id/role', celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    id: Joi.string().hex().length(24).required(),
  }),
  [Segments.BODY]: Joi.object().keys({
    role: Joi.string().valid('user', 'admin').required(),
  }),
}), setUserRole);

privateRouter.delete('/admin/users/:id', celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    id: Joi.string().hex().length(24).required(),
  }),
}), deleteUser);

// Moderation. sessionId is a UUIDv4 everywhere else in the API, so it is
// validated the same way here.
const sessionIdParam = celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
});

privateRouter.get('/admin/forms', celebrate({
  [Segments.QUERY]: Joi.object().keys({
    blocked: Joi.string().valid('true', 'false'),
  }),
}), getForms);

privateRouter.patch('/admin/forms/:sessionId/block', celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  [Segments.BODY]: Joi.object().keys({
    blocked: Joi.boolean().required(),
  }),
}), setFormBlocked);

privateRouter.delete('/admin/forms/:sessionId', sessionIdParam, deleteForm);

privateRouter.get('/admin/settings', getAppSettings);

privateRouter.patch('/admin/settings', celebrate({
  [Segments.BODY]: Joi.object().keys({
    registrationOpen: Joi.boolean(),
  }).min(1),
}), updateAppSettings);

privateRouter.get('/admin/suggestions', getSuggestions);

privateRouter.delete('/admin/suggestions/:id', celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    id: Joi.string().hex().length(24).required(),
  }),
}), deleteSuggestion);

module.exports.privateRouter = privateRouter;
