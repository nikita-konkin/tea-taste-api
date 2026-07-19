const privateRouter = require('express').Router();
const { celebrate, Joi, Segments } = require('celebrate');

const adminOnly = require('../middlewares/adminOnly');
const { getUsers, setUserRole, deleteUser } = require('../controllers/admin');
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

privateRouter.get('/admin/suggestions', getSuggestions);

privateRouter.delete('/admin/suggestions/:id', celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    id: Joi.string().hex().length(24).required(),
  }),
}), deleteSuggestion);

module.exports.privateRouter = privateRouter;
