const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const bcrypt = require('bcrypt');
const ROLES = require('../constants/roles');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: false, // 外部ログインで作成するユーザは、パスワード未設定を許可する。
    default: null,
    select: false,
  },
  mail: {
    type: String,
    required: false, // LINEからメールアドレスを取得できなければnullにする。
    default: null,
  },
  lang: {
    type: String,
    default: null,
  },
  activation_token_hash: { type: String, select: false },
  activation_expires_at: { type: Date, select: false },
  password_reset: {
    type: new mongoose.Schema({
      token_hash: { type: String, required: true },
      mail: { type: String, required: true },
      expires_at: { type: Date, required: true },
      consumed: { type: Boolean, default: false },
    }, { _id: false }),
    select: false,
  },
  // 旧版の配送記録を通常の検索応答へ露出させないための互換定義。新規保存・再送は行わない。
  password_reset_delivery: { type: mongoose.Schema.Types.Mixed, select: false },
  password_change_notice: { type: mongoose.Schema.Types.Mixed, select: false },

  image_name: {
    type: String,
    default: null,
  },
  role: {
    type: String,
    default: ROLES.AUTHOR,
  },
  eye_friendly_mode: {
    type: Boolean,
    default: false,
  },
  push_enabled: {
    type: Boolean,
    default: false,
  },
  reply_push_enabled: {
    type: Boolean,
    default: true,
  },
  replied_post_push_enabled: {
    type: Boolean,
    default: true,
  },
  session_version: {
    type: Number,
    min: 0,
    default: 0,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: null,
  },
  deleted_at: {
    type: Date,
    default: null,
  },
  delete_flg: {
    type: Boolean,
    default: false,
  },
}, { autoIndex: true });

UserSchema.plugin(mongoosePaginate);

// メールアドレスが文字列の場合だけ一意制約を適用する。
UserSchema.index({ mail: 1 }, { name: 'uniq_users_mail_string', unique: true, partialFilterExpression: { mail: { $type: 'string' } } });

// 再設定リンクをハッシュで照合するための検索索引。
UserSchema.index({ 'password_reset.token_hash': 1 }, { name: 'users_password_reset_token_hash', sparse: true });

// findByIdAndUpdateはfindOneAndUpdateミドルウェアも実行する。
// パスワード更新時は、このミドルウェアで値をハッシュ化する。
UserSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate ? this.getUpdate() : this._update;
  const password = typeof update.password !== 'undefined' ? update.password : update.$set?.password;

  if (typeof password !== 'undefined') {
    bcrypt.genSalt(10, function (err, salt) {
      if (err) {
        return next(err);
      }
      bcrypt.hash(password, salt, function (err, hash) {
        if (err) {
          return next(err);
        }
        if (typeof update.password !== 'undefined') {
          update.password = hash;
        } else {
          update.$set.password = hash;
        }
        next();
      });
    });
  } else {
    return next();
  }
});

UserSchema.methods.comparePassword = function (plainPw, cb) {
  if (!this.password) {
    const err = new Error('Password hash is not loaded on this document.');
    if (cb) return cb(err);
    return Promise.reject(err);
  }

  if (typeof cb === 'function') {
    return bcrypt.compare(plainPw, this.password, cb);
  }

  // コールバック未指定時はPromise形式で比較結果を返す。
  return bcrypt.compare(plainPw, this.password);
};

module.exports = mongoose.model('User', UserSchema);
