const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const { NODE_ENV, JWT_SECRET } = process.env;

module.exports.loginUser = (req, res, next) => {
  const { email, password } = req.body;

  User.findOne({ email }).select('+password')
    .then((user) => {
      if (!user) throw new Error('Неправильные почта или пароль');

      return bcrypt.compare(password, user.password).then((matched) => ({ matched, user }));
    })
    .then(({ matched, user }) => {
      if (!matched) throw new Error('Неправильные почта или пароль');

      const token = jwt.sign(
        { _id: user._id },
        NODE_ENV === 'production' ? JWT_SECRET : 'dev-secret'
      );

      res.cookie('jwt', token, {
        maxAge: 180 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: true,
        // secure: NODE_ENV === 'production',
        domain: '.teaform.ru',
        // sameSite: 'None',
      });

      res.status(200).json({ ok: true, message: 'Login successful', token });
    })
    .catch((err) => {
      console.error(err);
      next({ message: err.message, statusCode: 401 });
    });
};

module.exports.createUser = (req, res, next) => {
  const { name, email, password } = req.body;

  bcrypt.hash(password, 10)
    .then((hash) => User.create({ name, email, password: hash }))
    .then(() => res.send({ data: { name, email } }))
    .catch((err) => {
      if (err.name === 'ValidationError') {
        return next({ message: 'Переданы некорректные данные при создании карточки.', statusCode: 400 });
      } else if (err.code === 11000) {
        return next({ message: 'Пользователь уже зарегистрирован по данному email.', statusCode: 409 });
      } else {
        return next({ message: 'Ошибка по умолчанию.', statusCode: 500 });
      }
    });
};

module.exports.logoutUser = (req, res, next) => {
  try {
    res.clearCookie('jwt', {
      httpOnly: true,
      secure: true,
      domain: 'teaform.ru',
      // sameSite: 'None',
    });

    res.status(200).json({ ok: true, message: 'LogOut successful' });
  } catch (err) {
    next({ message: '401 - Необходима авторизация.', statusCode: 401 });
  }
};
