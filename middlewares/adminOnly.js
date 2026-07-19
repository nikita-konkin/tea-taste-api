const User = require('../models/user');

// Allows the request through only for users with role 'admin'.
// Runs after the auth middleware, so req.user._id is set.
module.exports = (req, res, next) => {
  User.findById(req.user._id)
    .then((user) => {
      if (!user || user.role !== 'admin') {
        return next({ message: '403 — Доступ только для администратора.', statusCode: 403 });
      }
      return next();
    })
    .catch(() => next({ message: 'Ошибка по умолчанию.', statusCode: 500 }));
};
