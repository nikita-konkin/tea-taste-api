const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// The extension is derived from the mime type, never from the client-supplied
// originalname: a request declaring "image/png" but naming the file "x.html"
// would otherwise land as .html and be served as text/html from the API's own
// origin (/api/uploads/...), i.e. stored XSS next to the auth cookie.
const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  // <ownerId>-<timestamp><random><ext>. The owner prefix is what the delete
  // endpoint checks; the random part keeps parallel uploads (three photo slots
  // at once) from colliding within the same millisecond.
  filename: (req, file, cb) => {
    const ext = MIME_EXT[file.mimetype] || '.png';
    const rand = crypto.randomBytes(4).toString('hex');
    cb(null, `${req.user._id}-${Date.now()}${rand}${ext}`);
  },
});

// Builds a middleware around multer for one field, turning multer's errors
// into regular 400 responses. Limits are per multer instance, so each field
// with its own size cap needs its own uploader.
const makeUploader = (fieldName, { maxBytes, tooBigMessage }) => {
  const upload = multer({
    storage,
    limits: { fileSize: maxBytes },
    fileFilter: (req, file, cb) => {
      if (MIME_EXT[file.mimetype]) {
        cb(null, true);
      } else {
        cb(new Error('Допустимы только изображения (png, jpg, webp, gif).'));
      }
    },
  });

  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        const e = new Error(err.code === 'LIMIT_FILE_SIZE' ? tooBigMessage : err.message);
        e.statusCode = 400;
        return next(e);
      }
      return next();
    });
  };
};

module.exports.uploadAvatar = makeUploader('avatar', {
  maxBytes: 2 * 1024 * 1024,
  tooBigMessage: 'Файл слишком большой (максимум 2 МБ).',
});

// Tea photos come straight off a phone camera; the frontend downscales before
// upload, but the cap stays generous so the no-canvas fallback path works too.
module.exports.uploadTeaPhoto = makeUploader('photo', {
  maxBytes: 8 * 1024 * 1024,
  tooBigMessage: 'Файл слишком большой (максимум 8 МБ).',
});

module.exports.uploadDir = uploadDir;
