const mongoose = require('mongoose');
const { Schema } = mongoose;

const AuthIdentitySchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  provider: {
    type: String,
    enum: ['password', 'google', 'line'],
    required: true,
  },
  provider_user_id: {
    type: String,
    required: true,
  }, // OIDCのsubなど、外部サービス内のユーザID
  email: {
    type: String,
    default: null,
  }, // メールアドレスは保存前に小文字へ正規化する
  email_verified: {
    type: Boolean,
    default: false,
  },
  provisioning: { type: Boolean, default: false },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

// 外部サービスとユーザIDの組み合わせを一意にする。
AuthIdentitySchema.index({ provider: 1, provider_user_id: 1 }, { unique: true });

module.exports = mongoose.model('AuthIdentity', AuthIdentitySchema);
