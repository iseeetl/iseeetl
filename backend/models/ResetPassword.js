const mongoose = require('mongoose');

const ResetPasswordSchema = new mongoose.Schema({
  mail: {
    type: String,
    unique: true,
    required: true,
  },
  token: {
    type: String,
    unique: true,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ResetPassword', ResetPasswordSchema);
