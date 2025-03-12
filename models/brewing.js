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
    type: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        default: [],
      },
    ],
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

module.exports = mongoose.model("brewing", userSchema);
