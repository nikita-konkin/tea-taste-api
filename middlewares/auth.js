const jwt = require('jsonwebtoken');

const {
  NODE_ENV,
  JWT_SECRET,
} = process.env;

module.exports = (req, res, next) => {
  const token = req.cookies.jwt;

  if (!token) {
    const e = new Error('Необходима авторизация.');
    e.statusCode = 401;
    return next(e);
  }

  let payload;
  try {
    payload = jwt.verify(token, NODE_ENV === 'production' ? JWT_SECRET : 'dev-secret');
  } catch (err) {
    const e = new Error('Необходима авторизация.');
    e.statusCode = 401;
    return next(e);
  }

  req.user = payload;

  return next();
};
