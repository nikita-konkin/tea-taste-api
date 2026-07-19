const mongoose = require('mongoose');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    minlength: 2,
    maxlength: 30,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    sparse: true,
    validate: validator.isEmail,
  },
  password: {
    type: String,
    required: true,
    validate: validator.isStrongPassword,
    select: false,
    minlength: 4,
    maxlength: 60,
  },
  career: {
    type: String,
    required: false,
    minlength: 2,
    maxlength: 100,
  },
  about: {
    type: String,
    required: false,
    minlength: 2,
    maxlength: 500,
  },
  avatar: {
    type: String,
    required: false,
    validate: {
      // Absolute http(s) URL or a site-relative path (uploaded avatars).
      validator: (v) => v.startsWith('/')
        || validator.isURL(v, { protocols: ['http', 'https'], require_protocol: true }),
      message: 'Некорректная ссылка на аватар.',
    },
  },
  vkId: {
    type: String,
    unique: true,
    sparse: true,
  },
  passwordResetToken: {
    type: String,
    select: false,
  },
  passwordResetExpires: {
    type: Date,
    select: false,
  },
},
  { timestamps: true }
  );

module.exports = mongoose.model('user', userSchema);