const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  aromas: {
    type: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "aromas",
        default: [],
      },
    ],
  },
  tastes: {
    type: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "tastes",
        default: [],
      },
    ],
  },
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
    type: time,
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
  seansId: {
    type: Number,
    required: true,
  },
  brewingCount: {
    type: Number,
    required: true,
  },
});

module.exports = mongoose.model("brewing", userSchema);
