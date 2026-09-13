const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const bcrypt = require('bcrypt');

const UserTempSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  mail: {
    type: String,
    required: true,
  },
  lang: {
    type: String,
    default: null,
  },
  password: {
    type: String,
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

UserTempSchema.plugin(mongoosePaginate);

UserTempSchema.pre('save', function (next) {
  const userTemp = this;
  if (this.isModified('password') || this.isNew) {
    bcrypt.genSalt(10, function (err, salt) {
      if (err) {
        return next(err);
      }
      bcrypt.hash(userTemp.password, salt, function (err, hash) {
        if (err) {
          return next(err);
        }
        userTemp.password = hash;
        next();
      });
    });
  } else {
    return next();
  }
});

UserTempSchema.methods.comparePassword = function (password, cb) {
  bcrypt.compare(password, this.password, cb);
};

module.exports = mongoose.model('UserTemp', UserTempSchema);
