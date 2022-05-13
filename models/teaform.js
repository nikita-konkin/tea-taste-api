const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  nameRU: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 60,
  },
  type: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 60,
  },
  weight: {
    type: Number,
    required: true,
  },
  water: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 60,
  },
  volume: {
    type: Number,
    required: true,
  },
  temperature: {
    type: Number,
    required: true,
  },
  teaware: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 60,
  },
  brewingtype: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 60,
  },
  brewings: {
    type: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "brewings",
        default: [],
      },
    ],
  },
  country: {
    type: String,
    required: false,
    minlength: 2,
    maxlength: 60,
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
    type: Number,
    required: true,
  },
  { timestamps: true }
});

module.exports = mongoose.model("teaform", userSchema);
