const bcrypt = require('bcryptjs');
const User = require('../models/user');

module.exports.getUserById = (req, res, next) => {
  User.findById(req.user._id)
    .orFail(() => {
      const e = new Error('404 — Запись не найдена.');
      e.statusCode = 404;
      return e;
    })
    .then((user) => {
      res.send({
        data: user,
      });
    })
    .catch((err) => {
      if (err.statusCode) {
        next(err);
      } else if (err.name === 'CastError') {
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
    about,
    avatar,
  } = req.body;

  // Only overwrite the fields that were actually sent;
  // an empty string clears the (optional) field.
  const update = {};
  const unset = {};
  Object.entries({ name, email, career, about, avatar }).forEach(([key, value]) => {
    if (value === '' && key !== 'name' && key !== 'email') {
      unset[key] = 1;
    } else if (value !== undefined) {
      update[key] = value;
    }
  });
  if (Object.keys(unset).length) update.$unset = unset;

  User.findByIdAndUpdate(req.user._id, update, {
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
      } else if (err.code === 11000) {
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

// Stores the uploaded file's public path as the user's avatar. The API is
// served behind the /api proxy prefix, so the browser-facing path is
// /api/uploads/<file> (express serves it at /uploads).
module.exports.updateUserAvatar = (req, res, next) => {
  if (!req.file) {
    const e = new Error('Файл не получен: отправьте изображение в поле "avatar".');
    e.statusCode = 400;
    return next(e);
  }

  const url = `/api/uploads/${req.file.filename}`;

  return User.findByIdAndUpdate(req.user._id, { avatar: url }, { new: true })
    .then((user) => res.send({ data: { avatar: user.avatar } }))
    .catch(() => {
      const e = new Error('500 — Ошибка по умолчанию.');
      e.statusCode = 500;
      next(e);
    });
};

module.exports.updateUserPassword = (req, res, next) => {
  const { oldPassword, newPassword } = req.body;

  User.findById(req.user._id).select('+password')
    .orFail(() => {
      const e = new Error('404 — Запись не найдена.');
      e.statusCode = 404;
      return e;
    })
    .then((user) => bcrypt.compare(oldPassword, user.password))
    .then((matched) => {
      if (!matched) {
        const e = new Error('Неверный текущий пароль.');
        e.statusCode = 401;
        throw e;
      }
      return bcrypt.hash(newPassword, 10);
    })
    .then((hash) => User.findByIdAndUpdate(req.user._id, { password: hash }))
    .then(() => {
      res.send({ ok: true, message: 'Пароль изменён.' });
    })
    .catch((err) => {
      if (err.statusCode) {
        next(err);
      } else {
        const e = new Error('500 — Ошибка по умолчанию.');
        e.statusCode = 500;
        next(e);
      }
    });
};
