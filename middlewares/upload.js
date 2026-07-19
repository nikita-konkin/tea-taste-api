const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Допустимы только изображения (png, jpg, webp, gif).'));
    }
  },
});

// Wraps multer so its errors become regular 400 responses.
module.exports.uploadAvatar = (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      const e = new Error(err.code === 'LIMIT_FILE_SIZE'
        ? 'Файл слишком большой (максимум 2 МБ).'
        : err.message);
      e.statusCode = 400;
      return next(e);
    }
    return next();
  });
};

module.exports.uploadDir = uploadDir;
