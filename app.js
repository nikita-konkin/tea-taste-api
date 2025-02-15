const createError = require('http-errors');
const express = require('express');
const path = require('path');
const logger = require('morgan');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { isCelebrateError } = require('celebrate');

// const indexRouter = require('./routes/index');
// const usersRouter = require('./routes/users');
const auth = require('./middlewares/auth');

const allowedCors = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://192.168.50.33:3001',
  'http://192.168.50.33:3000',
  'http://192.168.50.112:3001',
  'http://192.168.50.112:3000',
  'http://10.20.130.148:3001',
  'http://10.20.130.148:3000',
  'http://192.168.137.1:3001',
  'http://192.168.137.1:3001',
  'http://192.168.50.33:3000'
];

const app = express();

const port = process.env.NODE_ENV === 'production' ? process.env.PORT : 3000;
const mdbAddr = process.env.NODE_ENV === 'production' ? process.env.MONDOADDRESS : 'localhost:27017/teadb';

app.use(cookieParser());

app.use((req, res, next) => {
  const {
    origin,
  } = req.headers;

  if (allowedCors.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', true);
  }
  next();
});

app.use((req, res, next) => {
  const DEFAULT_ALLOWED_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE';
  const requestHeaders = req.headers['access-control-request-headers'];

  const {
    method,
  } = req;

  if (method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', DEFAULT_ALLOWED_METHODS);
    res.header('Access-Control-Allow-Headers', requestHeaders);
    return res.end();
  }
  next();
});

mongoose.connect(`mongodb://${mdbAddr}`, {
  useNewUrlParser: true,
}).then(() => {
  console.error('MongoDB connected');
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(require('./routes/signs'));

app.use(auth);

app.use(require('./routes/users'));
app.use(require('./routes/aromas'));
app.use(require('./routes/tastes'));
app.use(require('./routes/brewings'));
app.use(require('./routes/teaforms'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});
// app.use(errors());
app.use((err, req, res, next) => {
  if (isCelebrateError(err)) {
    const errorDetails = {};
    err.details.forEach((value, key) => {
      errorDetails[key] = value.details.map(detail => detail.message);
    });

    return res.status(400).json({
      status: 'error',
      message: errorDetails.body[0],
      // message: 'Validation failed',
      // details: errorDetails,
    });
  }

  next(err);
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.log(err.message); // Log the error message
  const message = statusCode === 500 ? 'Server error' : err.message;
  res.status(statusCode).json({
    status: 'error',
    message,
  });

  next(err);
});

module.exports = app;
