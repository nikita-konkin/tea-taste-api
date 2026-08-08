const Suggestion = require('../models/suggestion');
const { t } = require('../utils/apiMessages');

// POST /suggestions — any signed-in user can leave feedback.
module.exports.createSuggestion = (req, res, next) => {
  Suggestion.create({ text: req.body.text, owner: req.user._id })
    .then(() => res.send({ ok: true, message: t(req, 'api.suggestionThanks') }))
    .catch((err) => {
      if (err.name === 'ValidationError') {
        return next({ message: t(req, 'api.badData'), statusCode: 400 });
      }
      console.error('createSuggestion failed:', err);
      return next({ message: t(req, 'api.default'), statusCode: 500 });
    });
};

// GET /admin/suggestions — newest first, with the author attached.
module.exports.getSuggestions = (req, res, next) => {
  Suggestion.find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('owner', 'name nickname email avatar')
    .then((items) => res.send({ data: items }))
    .catch((err) => {
      console.error('getSuggestions failed:', err);
      next({ message: t(req, 'api.default'), statusCode: 500 });
    });
};

// DELETE /admin/suggestions/:id — dismiss a processed suggestion.
module.exports.deleteSuggestion = (req, res, next) => {
  Suggestion.findByIdAndDelete(req.params.id)
    .then((doc) => {
      if (!doc) return next({ message: t(req, 'api.suggestionNotFound'), statusCode: 404 });
      return res.send({ ok: true });
    })
    .catch((err) => {
      console.error('deleteSuggestion failed:', err);
      next({ message: t(req, 'api.default'), statusCode: 500 });
    });
};
