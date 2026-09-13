// 既存の呼び出し元との互換性を保つため、用途別の認証サービスをこの窓口から公開する。
module.exports = {
  ...require('./auth/registration.service'),
  ...require('./auth/login.service'),
  ...require('./auth/line.service'),
  ...require('./auth/passwordReset.service'),
};
