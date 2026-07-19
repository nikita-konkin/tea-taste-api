require('dotenv').config();
const createError = require('http-errors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const express = require('express');
const path = require('path');
const logger = require('morgan');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { isCelebrateError } = require('celebrate');
const auth = require('./middlewares/auth');

const app = express();

const port = process.env.PORT || 3001;
const mdbAddr = process.env.API_MONGO_URI || 'mongodb://localhost:27017';
const allowedCors = process.env.ALLOWED_CORS ? process.env.ALLOWED_CORS.split(',') : [];
const allowedMethods = process.env.DEFAULT_ALLOWED_METHODS || 'GET,HEAD,PUT,PATCH,POST,DELETE';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required in production. Exiting.');
  process.exit(1);
}

// The app runs behind a reverse proxy (nginx): take the client IP from
// X-Forwarded-For so the rate limiter counts per client, not per proxy.
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много запросов с этого IP-адреса. Повторите попытку позже.',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много попыток входа. Повторите попытку позже.',
});

// Middleware
app.use(helmet());
app.use(limiter);
app.use(['/sign-in', '/sign-up', '/password-reset'], authLimiter);
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
// Uploaded avatars (behind the /api proxy: /api/uploads/<file>).
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health endpoint: reports DB connectivity so orchestration can detect
// a dead Mongo connection (readyState 1 = connected).
app.get('/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    db: dbConnected ? 'connected' : 'disconnected',
  });
});

// CORS
app.use((req, res, next) => {
  const { origin } = req.headers;
  if (origin && allowedCors.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', allowedMethods);
    res.header(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || 'Content-Type, Authorization'
    );
    return res.sendStatus(204);
  }
  next();
});

// Routes
app.use(require('./routes/signs'));
app.use(require('./routes/teaforms').publicRouter);
app.use(require('./routes/aromas').publicRouter);
app.use(require('./routes/tastes').publicRouter);
app.use(require('./routes/brewings').publicRouter);
app.use(auth);
app.use(require('./routes/users'));
app.use(require('./routes/admin').privateRouter);
app.use(require('./routes/suggestions').privateRouter);
app.use(require('./routes/stats').privateRouter);
app.use(require('./routes/aromas').privateRouter);
app.use(require('./routes/tastes').privateRouter);
app.use(require('./routes/brewings').privateRouter);
app.use(require('./routes/teaforms').privateRouter);

// 404
app.use((req, res, next) => {
  next(createError(404));
});

// celebrate errors
app.use((err, req, res, next) => {
  if (isCelebrateError(err)) {
    const errorDetails = {};
    err.details.forEach((value, key) => {
      errorDetails[key] = value.details.map((detail) => detail.message);
    });

    return res.status(400).json({
      status: 'error',
      message: errorDetails.body?.[0] || 'Validation error',
    });
  }
  next(err);
});

// generic errors
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.error('Error:', err.message);
  res.status(statusCode).json({
    status: 'error',
    message: statusCode === 500 ? 'Server error' : err.message,
  });
});

let server;

mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

async function start() {
  try {
    await mongoose.connect(mdbAddr);
    console.log('MongoDB connected');

    server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${port}`);
      console.log('running type:', process.env.NODE_ENV, process.env.NODE_ENV === 'production');
      console.log('Allowed CORS:', allowedCors);
    });
  } catch (err) {
    console.error('Failed to start application:', err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      console.log('HTTP server closed');
    }

    await mongoose.connection.close();
    console.log('MongoDB connection closed');

    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Only start the server when run directly (node app.js), not when the app
// is imported (e.g. by supertest in tests).
if (require.main === module) {
  start();
}

module.exports = app;