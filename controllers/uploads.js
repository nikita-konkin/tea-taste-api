const path = require('path');
const fs = require('fs');

const { uploadDir } = require('../middlewares/upload');
const { normalizeToMp3, hasFfmpeg } = require('../utils/audio');

// Uploads are document-agnostic on purpose: the tasting form is only created
// at the last step of the wizard, while the earlier steps live in localStorage
// (which cannot hold a File). So a photo is stored as soon as it is picked and
// only its URL travels through the form state.
module.exports.createTeaPhoto = (req, res, next) => {
  if (!req.file) {
    const e = new Error('Файл не получен: отправьте изображение в поле "photo".');
    e.statusCode = 400;
    return next(e);
  }

  // Served by express at /uploads, reached by the browser through the /api proxy.
  return res.send({ data: { url: `/api/uploads/${req.file.filename}` } });
};

// A voice note follows the same document-agnostic rule as a photo, with one
// extra step: the browser's own container (webm/opus, or mp4/aac on Safari) is
// not something SpeechKit will accept, so the recording is transcoded to mono
// mp3 here — at the one point every recording passes through — rather than at
// merge time, which keeps the concat a join of identical formats.
module.exports.createVoice = (req, res, next) => {
  if (!req.file) {
    const e = new Error('Файл не получен: отправьте запись в поле "audio".');
    e.statusCode = 400;
    return next(e);
  }

  const raw = req.file.path;

  return hasFfmpeg()
    .then((ready) => {
      if (!ready) {
        const e = new Error('Обработка аудио на сервере недоступна.');
        e.statusCode = 500;
        throw e;
      }
      return normalizeToMp3(raw);
    })
    .then(({ filename, duration }) => res.send({
      data: { url: `/api/uploads/${filename}`, duration },
    }))
    .catch((err) => {
      fs.promises.unlink(raw).catch(() => {});
      if (err.statusCode) return next(err);
      const e = new Error('Не удалось обработать запись. Попробуйте записать ещё раз.');
      e.statusCode = 400;
      return next(e);
    });
};

// True only for a bare filename inside uploadDir that this user uploaded.
// All three checks matter: the prefix proves ownership, basename rejects any
// path segment, and resolve() is the backstop against traversal.
const ownsUpload = (filename, userId) => {
  if (typeof filename !== 'string' || !filename) return false;
  if (path.basename(filename) !== filename) return false;
  if (!filename.startsWith(`${String(userId)}-`)) return false;
  return path.resolve(uploadDir, filename).startsWith(uploadDir + path.sep);
};

// File-type agnostic: the ownership prefix is all it checks, so photos and
// voice notes share it.
module.exports.deleteUpload = (req, res, next) => {
  const { filename } = req.params;

  if (!ownsUpload(filename, req.user._id)) {
    const e = new Error('403 — Нет доступа к этому файлу.');
    e.statusCode = 403;
    return next(e);
  }

  // Idempotent: removing an already-removed file is a success, so the UI does
  // not have to distinguish a double click from a real failure.
  return fs.promises.unlink(path.join(uploadDir, filename))
    .then(() => res.status(204).send())
    .catch((err) => {
      if (err.code === 'ENOENT') return res.status(204).send();
      const e = new Error('500 — Ошибка по умолчанию.');
      e.statusCode = 500;
      return next(e);
    });
};

module.exports.ownsUpload = ownsUpload;
