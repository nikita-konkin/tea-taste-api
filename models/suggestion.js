const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      minlength: 5,
      maxlength: 1000,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
  },
  { timestamps: true }
);

suggestionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('suggestion', suggestionSchema);
