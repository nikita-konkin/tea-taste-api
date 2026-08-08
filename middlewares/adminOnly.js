const User = require('../models/user');
const { t } = require('../utils/apiMessages');

// Allows the request through only for users with role 'admin'.
// Runs after the auth middleware, so req.user._id is set.
module.exports = (req, res, next) => {
  User.findById(req.user._id)
    .then((user) => {
      if (!user || user.role !== 'admin') {
        return next({ message: t(req, 'api.adminOnly'), statusCode: 403 });
      }
      return next();
    })
    .catch(() => next({ message: t(req, 'api.default'), statusCode: 500 }));
};
