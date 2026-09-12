const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { isRegistrationOpen, REGISTRATION_CLOSED_MESSAGE } = require('../utils/settings');
const { t } = require('../utils/apiMessages');

const { NODE_ENV, JWT_SECRET } = process.env;

module.exports.loginUser = (req, res, next) => {
  const { email, password } = req.body;

  User.findOne({ email }).select('+password')
    .then((user) => {
      if (!user) throw new Error(t(req, 'api.wrongCredentials'));

      return bcrypt.compare(password, user.password).then((matched) => ({ matched, user }));
    })
    .then(({ matched, user }) => {
      if (!matched) throw new Error(t(req, 'api.wrongCredentials'));

      const token = jwt.sign(
        { _id: user._id },
        NODE_ENV === 'production' ? JWT_SECRET : 'dev-secret',
      );

      res.cookie('jwt', token, {
        maxAge: 180 * 24 * 60 * 60 * 1000,
        httpOnly: NODE_ENV === 'production',
        secure: NODE_ENV === 'production',
        domain: NODE_ENV === 'production' ? '.teaform.ru' : '',
        // sameSite: 'None',
      });

      // The stored language rides back on the sign-in response so the app can
      // land the user in it without a second round trip. '' for the accounts
      // that never said — the app treats that as "leave them where they are".
      res.status(200).json({
        ok: true, message: 'Login successful', token, language: user.language || '',
      });
    })
    .catch((err) => {
      console.error(err);
      next({ message: err.message, statusCode: 401 });
    });
};

module.exports.createUser = (req, res, next) => {
  const { name, email, password } = req.body;

  // Checked before the hash: bcrypt is the expensive part of this handler, and
  // a closed door is usually closed because something is hammering it.
  isRegistrationOpen()
    .then((open) => {
      if (!open) {
        const e = new Error(REGISTRATION_CLOSED_MESSAGE);
        e.statusCode = 403;
        throw e;
      }
      return bcrypt.hash(password, 10);
    })
    // The language the sign-up form was read in is the best evidence we will
    // ever have of what this account wants, and it costs nothing to keep.
    .then((hash) => User.create({
      name, email, password: hash, language: req.locale,
    }))
    .then(() => res.send({ data: { name, email } }))
    .catch((err) => {
      if (err.statusCode) {
        return next({ message: err.message, statusCode: err.statusCode });
      } if (err.name === 'ValidationError') {
        return next({ message: t(req, 'api.badData'), statusCode: 400 });
      } if (err.code === 11000) {
        return next({ message: t(req, 'api.emailTaken'), statusCode: 409 });
      }
      return next({ message: t(req, 'api.default'), statusCode: 500 });
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
    next({ message: t(req, 'api.authRequired'), statusCode: 401 });
  }
};
