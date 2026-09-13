// 既存の呼び出し元との互換性を保つため、AI解析の付加情報作成・保存処理をこの窓口から公開する。
// 作成者や解析の起点となるタグは、検証済みのルーム設定のスナップショットから決める。

module.exports = {
  ...require('./output.service'),
  ...require('./result.service'),
};
