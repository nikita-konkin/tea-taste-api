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
    minlength: 0,
    maxlength: 30,
  },
  aromaStage3: {
    type: String,
    required: false,
    minlength: 0,
    maxlength: 30,
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
  aromaCount: {
    type: Number,
    required: true,
  },
  brewingCount: {
    type: Number,
    required: true,
  },
});

userSchema.index({ owner: 1, sessionId: 1 });

module.exports = mongoose.model("aroma", userSchema);
