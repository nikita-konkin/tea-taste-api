const User = require('../models/user');

module.exports.getUserById = (req, res, next) => {
  User.findById(req.user._id)
    .orFail(() => {
      const e = new Error('404 — Запись не найдена.');
      e.statusCode = 404;
      next(e);
    })
    .then((user) => {
      res.send({
        data: user,
      });
    })
    .catch((err) => {
      if (err.name === 'CastError') {
        const e = new Error('400 - Невалидный id');
        e.statusCode = 400;
        next(e);
      } else {
        const e = new Error('500 — Ошибка по умолчанию.');
        e.statusCode = 500;
        next(e);
      }
    });
};

module.exports.updateUserProfile = (req, res, next) => {
  const {
    name,
    email,
    career,
  } = req.body;

  User.findByIdAndUpdate(req.user._id, {
    name,
    email,
    career,
  }, {
    new: true,
    runValidators: true,
  })
    .then((data) => {
      res.send({
        data,
      });
    })
    .catch((err) => {

      if (err.name === 'ValidationError') {
        const e = new Error('400 - Некорректные данные');
        e.statusCode = 400;
        next(e);
      } else if (err.code === 'DuplicateKey') {
        const e = new Error('409 — Данный пользователь уже существует');
        e.statusCode = 409;
        next(e);
      } else {
        const e = new Error('500 — Ошибка по умолчанию.');
        e.statusCode = 500;
        next(e);
      }
    });
};