const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    nameRU: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 60,
    },
    country: {
      type: String,
      required: false,
      minlength: 2,
      maxlength: 60,
    },
    shop: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 60,
    },
    weight: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 60,
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
    price: {
      type: Number,
      required: true,
    },
    brewingtype: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 60,
    },
    teaware: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 60,
    },
    publicAccess: {
      type: Boolean,
      required: true,
    },
    averageRating: {
      type: Number,
      required: false,
      min: 0,
      max: 10,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

userSchema.index({ owner: 1, sessionId: 1 });
userSchema.index({ publicAccess: 1, createdAt: -1 });

module.exports = mongoose.model("teaform", userSchema);
