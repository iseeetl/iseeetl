# AI解析サービス

全AI種別の本文予算は `conversationBudget.js` の `analysisBodyLimit(snapshot)` を使います。`provider.service.js` は1回のモデル要求、`executor.service.js` は再検証付きの1回短縮と失敗案内への変換、`output.service.js` は保存前の検証と日英の固定文を担当します。

仕様・上限・運用上の注意の正本は[AI解析仕様](../../../docs/spec/ai-analysis.md#全AI種別の本文予算と失敗表示)です。ルートから `cd backend` の後、`npm run test:unit -- --runInBand tests/unit/services/analysis` と `npm run test:int -- tests/integration/services/aiAnalysisExecutor.int.test.js` で確認します。

文字起こしだけは投稿言語を認識のヒントにせず、`translationService.translateTranscription` が翻訳と原文言語判定を行います。`translateTextWithMetadata` は翻訳API応答の言語情報を保持し、従来の `translateText` は文字列配列の互換形式を維持します。[仕様と失敗時の扱い](../../../docs/spec/frontend/source-language.md#ai文字起こし)を参照してください。
