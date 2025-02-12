const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  tasteStage1: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 30,
  },
  tasteStage2: {
    type: String,
    required: false,
    minlength: 2,
    maxlength: 30,
  },
  tasteStage3: {
    type: String,
    required: false,
    minlength: 0,
    maxlength: 30,
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
  sessionId: {
    type: String,
    required: true,
  },
  tasteCount: {
    type: Number,
    required: true,
  },
  brewingCount: {
    type: Number,
    required: true,
  },
});

module.exports = mongoose.model("taste", userSchema);