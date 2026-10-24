# Analytics

イベント・許可パラメータと保存・外部送信の正本は[仕様書](../../../../docs/spec/frontend/cookies-and-external-transmissions.md)を参照してください。

`editorSubmission.js` は編集画面の操作受付と結果を同じ位置・ルームへ対応づけます。`begin` が内部トークンを返し、`finish` は一度だけ結果を記録します。`reset` は新しい編集セッションの操作回数を初期化します。計測失敗は保存を止めません。各ダイアログから `editorSubmissionMixin` を利用します。

検証: `npm --prefix frontend run test:unit:ci -- tests/unit/features/analytics tests/unit/components/timeline/dialogs`。
