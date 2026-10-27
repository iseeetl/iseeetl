# Activity services

通知イベント、受信履歴、設定、既読、スレッド購読、配信を扱う。仕様の正本は[通知仕様](../../../docs/spec/backend/activity-notifications.md)。

`ACTIVITY_NOTIFICATIONS_ENABLED` を `true` にした環境だけ、Chatの保存からoutboxを記録し、起動時に2秒間隔のワーカーを開始する。停止・再開時も未処理outboxを保持する。既存の外部サービスフラグは別途必要。テストは仕様書のコマンドを使う。

`context.js` は検証済みのHTTP主体を変更処理へ伝える。`capture.js` は変更内容だけをoutboxへ追加する。翻訳、無変更、リアクション取り消しは新通知を作らない。`materialize.js` は履歴、`push.js` は外部送信を担当する。外部送信試験では `deliverOnce({send})` に模擬送信関数を渡す。

schemaVersion 3の範囲設定を `preferences.js` の `scopesFor` / `scopeAllows` で解釈・検証する。旧設定は3対象の明示保存まで維持する。`contract.js` は親投稿単位の参加者と届け方を判定し、`filterContext.js` は最後に選択したタブの条件を検証する。データ変更・移行は上記仕様書が正本。
