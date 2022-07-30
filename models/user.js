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
  },
  career: {
    type: String,
    required: false,
    minlength: 2,
    maxlength: 100,
  }
},
  { timestamps: true }
  );

module.exports = mongoose.model('user', userSchema);