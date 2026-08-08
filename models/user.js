const mongoose = require('mongoose');
const validator = require('validator');
const { LOCALES } = require('../utils/locale');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    minlength: 2,
    maxlength: 30,
  },
  // Public display handle, shown instead of `name` wherever a tasting is
  // attributed. Unique so it cannot be used to pass for someone else; sparse
  // so the many accounts without one do not collide on a missing value —
  // which is why the profile controller $unsets an empty nickname rather than
  // storing ''.
  nickname: {
    type: String,
    required: false,
    minlength: 2,
    maxlength: 30,
    unique: true,
    sparse: true,
    trim: true,
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
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  // Preferred reading language, applied when signing in lands the user on a
  // URL that does not name a language of its own. Deliberately has no default:
  // unset means "never said", which is what every account predating this field
  // is, and what keeps sign-in leaving those users exactly where it used to.
  // Storing 'ru' as a default would be a lie about the same state.
  language: {
    type: String,
    enum: LOCALES,
    required: false,
  },
  // Recognition is billed to the service owner per 15 seconds of audio, so the
  // monthly allowance is counted here rather than trusted to the client.
  // voicePeriod is YYYY-MM: a different month means the counter starts over,
  // which avoids a scheduled job just to reset it.
  voiceSeconds: {
    type: Number,
    default: 0,
  },
  voicePeriod: {
    type: String,
    default: '',
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