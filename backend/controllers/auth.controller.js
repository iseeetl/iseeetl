// 既存の呼び出し元との互換性を保つため、用途別の認証コントローラをこの窓口から公開する。
module.exports = {
  ...require('./auth/account.controller'),
  ...require('./auth/line.controller'),
  ...require('./auth/passwordReset.controller'),
};
