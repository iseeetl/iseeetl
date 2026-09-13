# タイムラインAPI：返信・返信リアクション

## 概要

認証、入室権限、プッシュ通知、メディアの扱いは[タイムラインAPI共通仕様](timeline.md)を参照してください。
AI解析の起動条件、解析元の更新管理、結果の保存方法は[AI解析設定・実行仕様](../../ai-analysis.md)を参照してください。

## 共通条件

### 外部機能の利用可否

- Google Translateが無効な場合、新規返信の`translations`は空配列になり、返信更新では保存済みの翻訳を保持する
- OpenAI自動解析が無効な場合は解析を実行しない。設定の有無や外部サービス状態にかかわらず、返信更新またはタグ更新だけを理由に保存済みAI解析結果を削除しない
- OneSignalが無効な場合、プッシュ通知だけを省略し、返信の作成・更新を継続する
- 有効状態は[外部機能の有効状態API](capabilities.md)を参照する

## API

### POST /api/rooms/:room_id/timeline/posts/:post_id/replies

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- スパムワードを置換した本文で投稿の`replies`へ返信を追加
- OneSignalが有効な場合は、投稿者、既存返信者、`PushFilter`一致ユーザへ各自のプッシュ設定に応じて通知を試行し、JWTのユーザ本人は通知対象から除外する。無効な場合は通知だけを省略する
- Socket.IOの`REPLY_CREATE`を対象ルームへ送信
- `notify_all`は保存せず、`REPLY_CREATE`の新規返信へSocket送信時だけ一時的に付与
- `notify_all=true`の場合は、通知付き送信操作ごとに一意な`notification_event_id`と処理日時`notified_at`も対象返信へ一時的に付与する。これらはRESTレスポンスへ含めない
- Google Translateが有効な場合は本文翻訳、OpenAI自動解析が有効な場合は有効なルーム設定と保存済みの解析元データに一致する解析を応答処理とは別に試行する
- 翻訳結果は`REPLY_UPDATE`、AI結果は作成時`REPLY_SUPPLEMENT_CREATE`、更新時`REPLY_SUPPLEMENT_UPDATE`で送信する

### PATCH /api/rooms/:room_id/timeline/posts/:post_id/replies/:reply_id

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- 返信の本文、言語、タグ、アニメーション、メディア項目、`updated_at`を更新
- Google Translateが有効で本文または原文言語（`lang`）が変わった場合は既存の翻訳を空配列へ戻す。無効な場合は保存済みの翻訳を保持する
- 変更前と異なる画像・動画・字幕・音声ファイルを、他の有効なデータから参照されていない場合に削除
- 本文、言語、タグ、画像・動画・音声の実変更時は`analysis_source_revision`を原子的に増加させる。保存済みAI解析結果は解析元データの変更だけを理由に削除しない
- 返信更新は`REPLY_UPDATE`を対象ルームへ送信
- `notify_all`は保存せず、`REPLY_UPDATE`の対象返信へSocket送信時だけ一時的に付与
- `notify_all=true`の場合は、通知付き編集操作ごとに一意な`notification_event_id`と処理日時`notified_at`も対象返信へ一時的に付与する。これらはRESTレスポンスへ含めない
- Google Translateが有効で本文または原文言語（`lang`）が変わった場合は翻訳、OpenAI自動解析が有効な場合は有効なルーム設定に一致する解析を応答処理とは別に試行する

### DELETE /api/rooms/:room_id/timeline/posts/:post_id/replies/:reply_id

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- 対象返信の`delete_flg`をtrueにし、`updated_at`と`deleted_at`を現在日時へ更新
- 返信に直接設定された画像、動画、字幕、音声ファイルを、他の有効なデータから参照されていない場合に削除
- Socket.IOの`REPLY_DELETE`を対象ルームへ送信

#### 動作上の注意

- 返信内の付加情報も応答から見えなくなるが、付加情報のメディアファイルはこの処理では削除しない

### PUT /api/rooms/:room_id/timeline/posts/:post_id/replies/:reply_id/tags

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- 返信の`room_tags`を置換
- `RoomTag`が実際に変わった場合は`analysis_source_revision`を原子的に増加させる。保存済みAI解析結果はタグ変更だけを理由に削除しない
- タグ更新は`TAG_UPDATE`を対象ルームへ送信
- OpenAI自動解析が有効な場合は、有効なルーム設定に一致する解析を応答処理とは別に試行し、AI結果の作成または更新イベントを送信する

#### 動作上の注意

- 返信者本人または管理権限の確認は行わないため、ルームへ入室できるユーザは他ユーザの返信タグも更新できる

### POST /api/chat/reply/reaction

返信にリアクションを追加する。

#### 認証・権限

- JWT必須
- 投稿が属するルームへの入室権限が必要。条件は[ルーム入室判定](../../roles-and-permissions.md#ルーム入室判定)を参照する

#### リクエスト

- body:
  - `post_id`: 文字列(MongoId), 必須
  - `reply_id`: 文字列(MongoId), 必須
  - `type`: `いいね` / `超いいね` / `拍手` / `笑顔` / `びっくり`, 必須

#### レスポンス

- 200 OK
- body: リアクション追加後の`Chat`
- 論理削除済みの返信、投稿付加情報、返信付加情報は配列から除外

#### エラー

- 400: INVALID_PARAMS（入力不正、投稿・ルーム・フロアが無効、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: INVALID_PERMISSION（キック済み、またはメンバー限定ルームへの入室権限がない）
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND（対象返信が存在しない）

#### データ更新・通知

- 返信の`reactions`へJWTのユーザIDと種別を追加
- Socket.IOの`REPLY_REACTION_CREATE`を対象ルームへ送信

#### 動作上の注意

- 同じユーザ・同じ種別の重複を確認しないため、同一リアクションを複数追加できる
- 対象返信の`delete_flg`を更新条件に含めないため、論理削除済み返信にもリアクションを追加できる
- 成功応答では論理削除済み返信が除外されるため、追加したリアクションは応答上に現れない

### POST /api/chat/reply/reaction/delete

返信リアクションを削除する。

#### 認証・権限

- JWT必須
- 投稿が属するルームへの入室権限が必要。条件は[ルーム入室判定](../../roles-and-permissions.md#ルーム入室判定)を参照する
- `Administrator`、対象フロアを作成した`Editor`、対象フロアの`FloorMember`、またはリアクションを追加した本人
- `RoomMember`であることだけでは、他ユーザのリアクションを削除できない

#### リクエスト

- body:
  - `post_id`: 文字列(MongoId), 必須
  - `reply_id`: 文字列(MongoId), 必須
  - `reaction_id`: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: リアクション削除後の`Chat`
- 論理削除済みの返信、投稿付加情報、返信付加情報は配列から除外

#### エラー

- 400: INVALID_PARAMS（入力不正、投稿・ルーム・フロアが無効、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: INVALID_PERMISSION（ルーム入室不可、またはリアクションの削除権限がない）
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND（対象返信が存在しない）

#### データ更新・通知

- 返信の`reactions`から対象リアクションを物理削除
- Socket.IOの`REACTION_DELETE`を対象ルームへ送信

#### 動作上の注意

- 対象返信の`delete_flg`を更新条件に含めないため、論理削除済み返信のリアクションも削除できる
- 管理権限を持つユーザは`reaction_id`の存在を確認せず削除処理へ進むため、存在しないIDでも変更なしの成功応答となる
- 成功応答では論理削除済み返信を除外する

## 関連資料

### 実装

- `backend/routes/timeline/postResource.route.js`
- `backend/services/timeline/replies.service.js`
- `backend/services/timeline/replyReactions.service.js`
- `backend/services/timeline/shared/replyNotifications.js`

### テスト

- `backend/tests/integration/routes/timeline.core.int.test.js`
- `backend/tests/unit/services/timeline/replies.service.test.js`
- `backend/tests/unit/services/timeline/replyReactions.service.test.js`
