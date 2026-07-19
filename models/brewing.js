const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

  description: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 2000,
  },
  brewingRating: {
    type: Number,
    required: true,
  },
  brewingTime: {
    type: String,
    required: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  publicAccess: {
    type: Boolean,
    required: true,
  },
  sessionId: {
    type: String,
    required: true,
  },
  brewingCount: {
    type: Number,
    required: true,
  },
});

userSchema.index({ owner: 1, sessionId: 1 });

module.exports = mongoose.model("brewing", userSchema);
