// 既存の呼び出し元との互換性を保つため、用途別の投稿サービスをこの窓口から公開する。
module.exports = {
  ...require('./postsQuery.service'),
  ...require('./postsCreate.service'),
  ...require('./postsMutation.service'),
  ...require('./postsTag.service'),
};
