# AI解析サービス

会話の長さ制限は `conversationBudget.js` の `conversationBodyLimit(snapshot)` を使います。`provider.service.js` は1回のモデル要求、`executor.service.js` は再検証付きの1回短縮と失敗案内への変換、`output.service.js` は保存前の検証と日英の固定文を担当します。

仕様・上限・運用上の注意の正本は[AI解析仕様](../../../docs/spec/ai-analysis.md#会話の長さ制限と失敗表示)です。ルートから `cd backend` の後、`npm run test:unit -- --runInBand tests/unit/services/analysis` と `npm run test:int -- tests/integration/services/aiAnalysisExecutor.int.test.js` で確認します。
