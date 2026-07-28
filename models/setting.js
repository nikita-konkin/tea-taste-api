const mongoose = require('mongoose');

// Site-wide switches an admin can flip at runtime. One document, found by a
// fixed key — a collection with a single row is cheaper to reason about than
// env vars, which would need a redeploy to change and cannot be flipped from
// the admin page while an abuse wave is in progress.
const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'app',
    },
    registrationOpen: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('setting', settingSchema);
