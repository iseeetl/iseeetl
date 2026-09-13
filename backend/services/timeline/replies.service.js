// 既存の呼び出し元との互換性を保つため、用途別の返信サービスをこの窓口から公開する。
module.exports = {
  ...require('./repliesCreate.service'),
  ...require('./repliesMutation.service'),
  ...require('./repliesTag.service'),
};
