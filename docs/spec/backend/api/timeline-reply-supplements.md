# タイムラインAPI：返信付加情報

## 概要

認証、入室権限、プッシュ通知、メディアの扱いは[タイムラインAPI共通仕様](timeline.md)を参照してください。

## 共通条件

### 外部機能の利用可否

- Google Translateが無効な場合、新規付加情報の`translations`は空配列になり、更新では保存済みの翻訳を保持する
- OneSignalが無効な場合、プッシュ通知だけを省略し、付加情報の作成・更新を継続する
- 有効状態は[外部機能の有効状態API](capabilities.md)を参照する

## API

### POST /api/rooms/:room_id/timeline/posts/:post_id/replies/:reply_id/supplements

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- スパムワードを置換した本文で返信の`supplementaries`へ付加情報を追加
- OneSignalが有効で返信者本人以外が作成した場合は、返信者のプッシュ設定と返信通知設定に応じて通知を試行する。無効な場合は通知だけを省略する
- OneSignalが有効な場合は`PushFilter`に一致する他ユーザへプッシュ通知を試行し、無効な場合は通知だけを省略する
- Socket.IOの`REPLY_SUPPLEMENT_CREATE`を対象ルームへ送信し、`Chat`と作成した付加情報を通知
- Google Translateが有効な場合は応答処理とは別に本文翻訳を試行し、結果が作成された場合は`REPLY_SUPPLEMENT_UPDATE`を送信する

### PATCH /api/rooms/:room_id/timeline/posts/:post_id/replies/:reply_id/supplements/:supplement_id

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- 付加情報の本文、言語、メディア項目、`updated_at`を更新
- Google Translateが有効で本文または原文言語（`lang`）が変わった場合は既存の翻訳を空配列へ戻す。無効な場合は保存済みの翻訳を保持する
- 変更前と異なる画像・動画・字幕・音声ファイルを削除
- Socket.IOの`REPLY_SUPPLEMENT_UPDATE`を対象ルームへ送信
- Google Translateが有効で本文または原文言語（`lang`）が変わった場合は、応答処理とは別に翻訳を試行する

### DELETE /api/rooms/:room_id/timeline/posts/:post_id/replies/:reply_id/supplements/:supplement_id

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- 対象付加情報の`delete_flg`をtrueにし、`updated_at`と`deleted_at`を現在日時へ更新
- 付加情報に紐づく画像、動画、字幕、音声ファイルを削除
- Socket.IOの`REPLY_SUPPLEMENT_DELETE`を対象ルームへ送信

### POST /api/chat/reply/supplement/reaction

返信付加情報にリアクションを追加する。

#### 認証・権限

- JWT必須
- 投稿が属するルームへの入室権限が必要。条件は[ルーム入室判定](../../roles-and-permissions.md#ルーム入室判定)を参照する

#### リクエスト

- body:
  - `post_id`: 文字列(MongoId), 必須
  - `reply_id`: 文字列(MongoId), 必須
  - `supplement_id`: 文字列(MongoId), 必須
  - `type`: `いいね` / `超いいね` / `拍手` / `笑顔` / `びっくり`, 必須

#### レスポンス

- 200 OK
- body: 付加情報リアクション追加後の`Chat`
- 論理削除済みの返信、投稿付加情報、返信付加情報は配列から除外

#### エラー

- 400: INVALID_PARAMS（入力不正、投稿・ルーム・フロアが無効、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: INVALID_PERMISSION（キック済み、またはメンバー限定ルームへの入室権限がない）
- 401: TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- 返信付加情報の`reactions`へJWTのユーザIDと種別を追加
- Socket.IOの`REPLY_SUPPLEMENT_REACTION_CREATE`を対象ルームへ送信

#### 動作上の注意

- 同じユーザ・同じ種別の重複を確認しないため、同一リアクションを複数追加できる
- 対象返信と付加情報の存在や`delete_flg`を更新前に確認しない
- 論理削除済みの返信または付加情報にもリアクションを追加でき、成功応答ではその対象が除外される
- 存在しない`reply_id`または`supplement_id`では、変更がないまま成功応答となる

### POST /api/chat/reply/supplement/reaction/delete

返信付加情報のリアクションを削除する。

#### 認証・権限

- JWT必須
- 投稿が属するルームへの入室権限が必要。条件は[ルーム入室判定](../../roles-and-permissions.md#ルーム入室判定)を参照する
- `Administrator`、対象フロアを作成した`Editor`、対象フロアの`FloorMember`、またはリアクションを追加した本人
- `RoomMember`であることだけでは、他ユーザのリアクションを削除できない

#### リクエスト

- body:
  - `post_id`: 文字列(MongoId), 必須
  - `reply_id`: 文字列(MongoId), 必須
  - `supplement_id`: 文字列(MongoId), 必須
  - `reaction_id`: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: 付加情報リアクション削除後の`Chat`
- 論理削除済みの返信、投稿付加情報、返信付加情報は配列から除外

#### エラー

- 400: INVALID_PARAMS（入力不正、投稿・ルーム・フロアが無効、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: INVALID_PERMISSION（ルーム入室不可、またはリアクションの削除権限がない）
- 401: TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- 返信付加情報の`reactions`から対象リアクションを物理削除
- Socket.IOの`REACTION_DELETE`を対象ルームへ送信

#### 動作上の注意

- 対象返信と付加情報の`delete_flg`を更新条件に含めないため、論理削除済み対象のリアクションも削除できる
- 管理権限を持つユーザは返信・付加情報・リアクションの存在を確認せず削除処理へ進むため、存在しないIDでも変更なしの成功応答となる
- 成功応答では論理削除済み返信と付加情報を除外する

## 関連資料

### 実装

- `backend/routes/timeline/postResource.route.js`
- `backend/services/timeline/replySupplements.service.js`
- `backend/services/timeline/replySupplementReactions.service.js`
- `backend/services/timeline/shared/supplementCommon.js`

### テスト

- `backend/tests/integration/routes/timeline.core.int.test.js`
- `backend/tests/unit/services/timeline/replySupplements.service.test.js`
- `backend/tests/unit/services/timeline/replySupplementReactions.service.test.js`
