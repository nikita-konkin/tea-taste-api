const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const {
  NODE_ENV,
  JWT_SECRET,
} = process.env;

module.exports.loginUser = (req, res, next) => {
  const {
    email,
    password,
  } = req.body;

  User.findOne({
    email,
  }).select('+password')
    .then((user) => {
      if (!user) {
        return Promise.reject(new Error('Неправильные почта или пароль'));
      }

      req.user = user;

      return bcrypt.compare(password, user.password);
    })
    .then((matched) => {
      if (!matched) {
        return Promise.reject(new Error('Неправильные почта или пароль'));
      }
      const token = jwt.sign({
        _id: req.user._id,
      }, NODE_ENV === 'production' ? JWT_SECRET : 'dev-secret');
      res.cookie('jwt', token, {
        maxAge: 9000000,
        httpOnly: true,
        // secure: true,
        // domain: 'nomoredomains.xyz',
        // sameSite: 'None'
      })
        .end('{}');

      // return '';
    })
    .catch((err) => {
      console.log(err)
      const e = new Error(err.message);
      e.statusCode = 401;

      next(e);
    });
};

module.exports.createUser = (req, res, next) => {
  console.log(req.body)
  const {
    name,
    email,
    password,
  } = req.body;

  bcrypt.hash(password, 10)
    .then((hash) => User.create({
      name,
      email,
      password: hash,
    }))
    .then(() => res.send({
      data: {
        name,
        email,
      },
    }))
    .catch((err) => {
      console.log('err.name')
      console.log(err)
      if (err.name === 'ValidationError') {
        const e = new Error('400 — Переданы некорректные данные при создании карточки.');
        e.statusCode = 400;
        next(e);
      } else if (err.code === 11000) {
        const e = new Error('409 - Пользователь уже зарегистрирован по данному email.');
        e.statusCode = 409;
        next(e);
      } else {
        const e = new Error('500 — Ошибка по умолчанию.');
        e.statusCode = 500;
        next(e);
      }
      next(e);
    });
};

module.exports.logoutUser = (req, res, next) => {
  try {
    res.clearCookie('jwt')
    .res.end('{logout}');
  } catch (err) {
    const e = new Error('401 - Необходима авторизация.');
    e.statusCode = 401;
    next(e);
  }
};