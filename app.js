require('dotenv').config();
const createError = require('http-errors');
// const https = require("https");
// const fs = require("fs");
const express = require('express');
const path = require('path');
const logger = require('morgan');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { isCelebrateError } = require('celebrate');
const auth = require('./middlewares/auth');

const app = express();

// Check for SSL Certificates
// const keyPath = "key.pem";
// const certPath = "cert.pem";
// if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
//   console.error("SSL key or cert not found! Exiting...");
//   process.exit(1);
// }

// const options = {
//   key: fs.readFileSync(keyPath),
//   cert: fs.readFileSync(certPath),
// };

// Environment Variables
const port = process.env.API_PORT || 3001;
const mdbAddr = process.env.API_MONGO_URI || "mongodb://localhost:27017";
const allowedCors = process.env.ALLOWED_CORS ? process.env.ALLOWED_CORS.split(',') : [];
const allowedMethods = process.env.DEFAULT_ALLOWED_METHODS || "GET,HEAD,PUT,PATCH,POST,DELETE";

// Middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// CORS Handling
app.use((req, res, next) => {
  const { origin } = req.headers;
  if (allowedCors.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', true);
  }
  next();
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', allowedMethods);
    res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
    return res.status(204).end();
  }
  next();
});

// MongoDB Connection
mongoose.connect(mdbAddr, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.error('MongoDB connected');
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

// Routes
app.use(require('./routes/signs'));
app.use(auth);
app.use(require('./routes/users'));
app.use(require('./routes/aromas'));
app.use(require('./routes/tastes'));
app.use(require('./routes/brewings'));
app.use(require('./routes/teaforms'));

// Error Handling
app.use((req, res, next) => {
  next(createError(404));
});

app.use((err, req, res, next) => {
  if (isCelebrateError(err)) {
    const errorDetails = {};
    err.details.forEach((value, key) => {
      errorDetails[key] = value.details.map(detail => detail.message);
    });
    return res.status(400).json({
      status: 'error',
      message: errorDetails.body?.[0] || "Validation error",
    });
  }
  next(err);
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.error("Error:", err.message);
  res.status(statusCode).json({
    status: 'error',
    message: statusCode === 500 ? 'Server error' : err.message,
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
  console.log('running type:', process.env.NODE_ENV, process.env.NODE_ENV === 'production');
});

// console.error("Starting HTTPS server...");

// const server = https.createServer(options, app);
// server.listen(port, () => {
//   console.error(`Secure server running on https://192.168.50.117:${port}`);
// });

// // Log error if the server fails
// server.on("error", (err) => {
//   console.error("Failed to start server:", err);
// });

module.exports = app;
