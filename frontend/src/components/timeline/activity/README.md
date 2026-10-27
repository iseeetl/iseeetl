# Activity UI

既存タイムラインに履歴の入口・更新バナー・スレッド購読ベルを加える。詳細は[通知仕様](../../../../../docs/spec/backend/activity-notifications.md)。

`ActivityCenter` がルームごとの取得・既読・設定・購読を管理する。`ActivityTarget` は選択した項目だけを読み取り画面で一時表示する。`activityState.js` は再接続用カーソルを利用者×ルーム×一覧種別に分けて保存する。カーソルは既読ではない。

API機能フラグが無効な環境は従来のお知らせUIを維持する。ローカルテストはfrontendで `node node_modules/vitest/vitest.mjs run tests/unit/components/timeline/activity/ActivityCenter.spec.js`。

## 設定と移動

3対象×上部・プッシュ・履歴の選択は `scopesFor` と `alignScopes`、バナー条件は `timelineEnabled` で扱う。履歴より広い通知は設定できず、対象名を含むラベル付きのネイティブselectを使う。保存条件は `currentTabIndex` の列だけを同期する。

一覧の投稿タップはダイアログを閉じてタイムライン内へ直接移動する。📺の更新内容プレビューは別ボタンに残す。通知リンクはアクティビティ内に開き、勝手にタイムラインをスクロールしない。権限を再確認してから移動し、成功後に既読にする。

`activityNavigation.js` は現在のタブで正確な更新箇所を表示できるか判断し、不適合のときだけ条件なしタブへ切り替える。詳細は通知仕様を参照。実機・読み上げは自動テストとは別途確認する。
