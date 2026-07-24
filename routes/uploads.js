const privateRouter = require('express').Router();
const rateLimit = require('express-rate-limit');

const { uploadTeaPhoto } = require('../middlewares/upload');
const { createTeaPhoto, deleteTeaPhoto } = require('../controllers/uploads');

// Tighter than the global limiter (1000/15min): these requests write to disk.
// Three slots per form plus retries still leaves plenty of headroom.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много загрузок. Повторите попытку позже.',
});

privateRouter.post('/upload/tea-photo', uploadLimiter, uploadTeaPhoto, createTeaPhoto);
// Filename in the path rather than the body: some proxies drop DELETE bodies.
privateRouter.delete('/upload/tea-photo/:filename', deleteTeaPhoto);

module.exports.privateRouter = privateRouter;
