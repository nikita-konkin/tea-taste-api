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
const IMAGE_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// Whatever MediaRecorder produces: webm/opus on Chrome and Firefox, mp4/aac on
// Safari and iOS. Everything is transcoded to mono mp3 right after upload, so
// this list only has to cover what a browser can hand us.
const AUDIO_EXT = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
};

// MediaRecorder blobs carry parameters — "audio/webm;codecs=opus" — and how
// much of that survives the multipart round trip depends on the busboy version.
// Matching on the bare type makes the allowlist independent of that.
const baseMime = (mimetype) => String(mimetype || '').split(';')[0].trim().toLowerCase();

const makeStorage = (allowed, fallbackExt) => multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  // <ownerId>-<timestamp><random><ext>. The owner prefix is what the delete
  // endpoint checks; the random part keeps parallel uploads (three photo slots
  // at once) from colliding within the same millisecond.
  filename: (req, file, cb) => {
    const ext = allowed[baseMime(file.mimetype)] || fallbackExt;
    const rand = crypto.randomBytes(4).toString('hex');
    cb(null, `${req.user._id}-${Date.now()}${rand}${ext}`);
  },
});

// Builds a middleware around multer for one field, turning multer's errors
// into regular 400 responses. Limits are per multer instance, so each field
// with its own size cap needs its own uploader — and so does each allowlist:
// one shared map would let an avatar upload smuggle in a .webm.
const makeUploader = (fieldName, {
  allowed, fallbackExt, maxBytes, tooBigMessage, wrongTypeMessage,
}) => {
  const upload = multer({
    storage: makeStorage(allowed, fallbackExt),
    limits: { fileSize: maxBytes },
    fileFilter: (req, file, cb) => {
      if (allowed[baseMime(file.mimetype)]) {
        cb(null, true);
      } else {
        cb(new Error(wrongTypeMessage));
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

const IMAGE_ONLY = 'Допустимы только изображения (png, jpg, webp, gif).';

module.exports.uploadAvatar = makeUploader('avatar', {
  allowed: IMAGE_EXT,
  fallbackExt: '.png',
  maxBytes: 2 * 1024 * 1024,
  tooBigMessage: 'Файл слишком большой (максимум 2 МБ).',
  wrongTypeMessage: IMAGE_ONLY,
});

// Tea photos come straight off a phone camera; the frontend downscales before
// upload, but the cap stays generous so the no-canvas fallback path works too.
module.exports.uploadTeaPhoto = makeUploader('photo', {
  allowed: IMAGE_EXT,
  fallbackExt: '.png',
  maxBytes: 8 * 1024 * 1024,
  tooBigMessage: 'Файл слишком большой (максимум 8 МБ).',
  wrongTypeMessage: IMAGE_ONLY,
});

// One voice note, not the whole tasting: the 5-minute cap applies to the merged
// track, and each segment is transcoded down to ~48 kbit/s mono right after it
// lands, so this limit only has to survive the browser's raw recording.
module.exports.uploadVoice = makeUploader('audio', {
  allowed: AUDIO_EXT,
  fallbackExt: '.webm',
  maxBytes: 12 * 1024 * 1024,
  tooBigMessage: 'Запись слишком большая (максимум 12 МБ).',
  wrongTypeMessage: 'Допустимы только аудиозаписи (webm, ogg, m4a, mp3, wav).',
});

module.exports.uploadDir = uploadDir;
