const mongoose = require("mongoose");


const userSchema = new mongoose.Schema({
  aromaStage1: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 30,
  },
  aromaStage2: {
    type: String,
    required: false,
    minlength: 2,
    maxlength: 30,
  },
  aromaStage3: {
    type: String,
    required: false,
    minlength: 2,
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
  aromaCount: {
    type: Number,
    required: true,
  },
  brewingCount: {
    type: Number,
    required: true,
  },
});

module.exports = mongoose.model("aroma", userSchema);
