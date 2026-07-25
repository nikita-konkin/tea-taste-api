const privateRouter = require('express').Router();
const rateLimit = require('express-rate-limit');

const { uploadTeaPhoto, uploadVoice } = require('../middlewares/upload');
const { createTeaPhoto, createVoice, deleteUpload } = require('../controllers/uploads');

// Tighter than the global limiter (1000/15min): these requests write to disk.
// Three photo slots plus a voice note per пролив and retries still leaves
// plenty of headroom.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много загрузок. Повторите попытку позже.',
});

privateRouter.post('/upload/tea-photo', uploadLimiter, uploadTeaPhoto, createTeaPhoto);
privateRouter.post('/upload/voice', uploadLimiter, uploadVoice, createVoice);
// Filename in the path rather than the body: some proxies drop DELETE bodies.
// One handler for both: it authorises on the owner prefix, not the file type.
privateRouter.delete('/upload/tea-photo/:filename', deleteUpload);
privateRouter.delete('/upload/voice/:filename', deleteUpload);

module.exports.privateRouter = privateRouter;
