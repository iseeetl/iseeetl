# タイムラインAPI

## 概要

JWT必須APIでは、トークン発行時のロールではなく、リクエスト時点の有効なユーザから再取得した現在ロールを使用します。認証時にJWTのユーザが存在しない、論理削除済み、または`session_version`が一致しない場合は401 `TOKEN_INVALID`を返します。認証と認証後のユーザ再確認の違いは[REST API共通規約](../api-conventions.md#認証情報)を参照してください。

ゲスト用APIは別の認証・所有者境界を持つため、[ゲスト向けタイムラインAPI](timeline-guest.md)を参照してください。各操作で送るイベントのデータ、対象ルーム、送信者自身への配信、再接続時の扱いは[Socket.IO接続・イベント契約](../../socket-events.md)を参照してください。

## 共通条件

### 保存後の通知・翻訳・解析

投稿・返信・付加情報・タグ・リアクションの変更では、DB保存後のSocket.IO配信の例外を記録し、保存済み操作のAPI応答を失敗へ変えません。通知用データの生成と配信先の取得も同じ扱いです。DB保存自体の失敗はAPIエラーとして返します。ログインユーザ、ゲスト、v1でこの扱いを共有します。

翻訳とAI解析は応答とは別に実行します。両方が対象の場合は翻訳、解析の順に試み、翻訳が失敗しても解析を続けます。失敗は処理段階ごとに記録します。保存した翻訳・解析結果のSocket通知が失敗しても、その保存は成功として扱います。通知の自動再送はありません。画面への反映と再取得は[Socket.IO接続・イベント契約](../../socket-events.md#配信の共通契約)を参照してください。

### プッシュ通知の共通受信者認可

投稿、返信、投稿付加情報、返信付加情報から送るプッシュ通知は、通知設定や`PushFilter`で候補を選んだ後、OneSignal送信直前に対象ルームへの現在のアクセス権を一括確認する。

- 論理削除されていないユーザ、ルーム、フロアだけを対象とする
- 対象フロアでキックされているユーザは対象外とする
- 公開ルームは、上記を満たす有効なユーザを対象とする
- `member_only=true`のルームは、`Administrator`、フロア作成者本人の`Editor`、`FloorMember`、`RoomMember`のいずれかを満たすユーザだけを対象とする
- 受信者認可に失敗した場合は送信せず、投稿・返信・付加情報の作成結果は取り消さない
- 通知見出しと本文は全対応言語をOneSignalの`headings`と`contents`へ渡す。アプリ内の中国語コード `zh`は、OneSignalの簡体中国語コード `zh-Hans`へ変換する

### メディア参照の共通検証

投稿、返信、投稿付加情報、返信付加情報の作成・更新では、[アップロードAPIの「タイムラインへのメディア設定」](upload.md#タイムラインへのメディア設定)に定めた次の条件を保存前に検証します。

- ファイル名に含まれるユーザIDがJWTのユーザと一致し、対象フロア・ルームの保存領域に実体が存在する
- 媒体ごとの拡張子、画像・動画とサムネイルの組み合わせ、動画字幕と動画本体の組み合わせが正しい
- 論理削除されていないルームの画像、投稿、返信、投稿付加情報、返信付加情報から同じファイルが参照されていない
- 更新では新規指定または変更したファイルだけを検証し、変更しないメディアは再検証しない

更新・削除で参照されなくなったメディアは、ほかの有効なデータが参照していない場合だけ物理削除します。参照確認に失敗した場合は誤削除を避けるためファイルを保持します。

## API一覧

ログインユーザの投稿・返信・付加情報の作成・部分更新・削除、タグ更新、一覧・検索・詳細は、[ルーム配下のAPI](timeline-post-resources.md)を使用する。v1も同じサービスへ接続し、認可・保存・通知を共有する。

| 責務 | 仕様 |
| --- | --- |
| ルーム配下の投稿・返信・付加情報、タグ、一覧・検索・詳細 | [ルーム配下のAPI](timeline-post-resources.md) |
| 投稿一覧、詳細、作成・更新・削除、タグ | [投稿](timeline-posts.md) |
| 投稿リアクション | [投稿リアクション](timeline-post-reactions.md) |
| 投稿付加情報とそのリアクション | [投稿付加情報](timeline-post-supplements.md) |
| 返信、タグ、返信リアクション | [返信・返信リアクション](timeline-replies.md) |
| 返信付加情報とそのリアクション | [返信付加情報](timeline-reply-supplements.md) |
| 音声文字起こし、`PushFilter`、管理用取得・削除 | [文字起こし・`PushFilter`・管理](timeline-operations.md) |
| 設定駆動AI解析、解析元の世代、結果整合性 | [AI解析設定・実行仕様](../../ai-analysis.md) |

共通認証、エラー形式、ルームアクセス、Socket.IO イベントは本書と関連する横断仕様を先に確認します。

## 関連資料

### 実装

- `backend/routes/timeline/index.js`
- `backend/models/Chat.js`
- `backend/services/room/roomAccess.service.js`
- `backend/services/media/reference.js`
- `backend/services/timeline/shared/timelineSerializer.js`

### テスト

- `backend/tests/integration/routes/timeline.core.int.test.js`
- `backend/tests/integration/services/timelinePostSave.int.test.js`
- `backend/tests/integration/routes/timeline.access.int.test.js`
- `backend/tests/integration/routes/timeline.pushFilter.route.int.test.js`
- `backend/tests/integration/routes/timeline.management.route.int.test.js`
- `backend/tests/unit/constants/notificationMessages.test.js`
