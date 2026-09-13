// 既存の呼び出し元との互換性を保つため、用途別のフロアサービスをこの窓口から公開する。
module.exports = {
  ...require('./floorQuery.service'),
  ...require('./floorMutation.service'),
  ...require('./floorManagement.service'),
};
