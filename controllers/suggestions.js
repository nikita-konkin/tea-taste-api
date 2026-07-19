const Suggestion = require('../models/suggestion');

// POST /suggestions — any signed-in user can leave feedback.
module.exports.createSuggestion = (req, res, next) => {
  Suggestion.create({ text: req.body.text, owner: req.user._id })
    .then(() => res.send({ ok: true, message: 'Спасибо! Предложение отправлено.' }))
    .catch((err) => {
      if (err.name === 'ValidationError') {
        return next({ message: 'Переданы некорректные данные.', statusCode: 400 });
      }
      console.error('createSuggestion failed:', err);
      return next({ message: 'Ошибка по умолчанию.', statusCode: 500 });
    });
};

// GET /admin/suggestions — newest first, with the author attached.
module.exports.getSuggestions = (req, res, next) => {
  Suggestion.find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('owner', 'name email avatar')
    .then((items) => res.send({ data: items }))
    .catch((err) => {
      console.error('getSuggestions failed:', err);
      next({ message: 'Ошибка по умолчанию.', statusCode: 500 });
    });
};

// DELETE /admin/suggestions/:id — dismiss a processed suggestion.
module.exports.deleteSuggestion = (req, res, next) => {
  Suggestion.findByIdAndDelete(req.params.id)
    .then((doc) => {
      if (!doc) return next({ message: 'Предложение не найдено.', statusCode: 404 });
      return res.send({ ok: true });
    })
    .catch((err) => {
      console.error('deleteSuggestion failed:', err);
      next({ message: 'Ошибка по умолчанию.', statusCode: 500 });
    });
};
