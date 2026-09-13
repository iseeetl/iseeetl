// 既存の呼び出し元との互換性を保つため、用途別のルームサービスをこの窓口から公開する。
module.exports = {
  ...require('./roomQuery.service'),
  ...require('./roomMutation.service'),
  ...require('./roomManagement.service'),
};
