const createError = require('http-errors');
const express = require('express');
const path = require('path');
const logger = require('morgan');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');

// const indexRouter = require('./routes/index');
// const usersRouter = require('./routes/users');
const auth = require('./middlewares/auth');

const app = express();

const port = process.env.NODE_ENV === 'production' ? process.env.PORT : 3000;
const mdbAddr = process.env.NODE_ENV === 'production' ? process.env.MONDOADDRESS : 'localhost:27017/teadb';

app.use(cookieParser());

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

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
// app.use(function(err, req, res, next) {
//   // set locals, only providing error in development
//   res.locals.message = err.message;
//   res.locals.error = req.app.get('env') === 'development' ? err : {};

//   // render the error page
//   res.status(err.status || 500);
//   res.render('error');
// });
app.use((err, req, res, next) => {
  console.log(err)
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Server error' : err.message;
   res.status(statusCode).send({
    message,
  });

  next();
});

module.exports = app;
