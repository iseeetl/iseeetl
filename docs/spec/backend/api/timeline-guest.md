# ゲスト向けタイムラインAPI

## 概要

共通の入力形式、認証ヘッダ、成功・エラー応答は [REST API共通規約](../api-conventions.md) を参照してください。
ゲストトークンの発行・更新は [ゲスト認証API](guest.md) を、投稿と埋め込みデータの関係は [ドメインモデル](../../domain-model.md) を参照してください。

## 共通条件

保存後のSocket通知の失敗は、保存した投稿・返信・リアクションのAPI応答を失敗へ変えません。[保存後の通知・翻訳・解析](timeline.md#保存後の通知翻訳解析)の共通契約に従います。

### 共通の認証・アクセス制御

- 全エンドポイントでリクエストヘッダ `X-Guest-Token` が必須
- `X-Guest-Token` は `/api/guest/bootstrap` で発行し、期限切れ前後の更新には `/api/guest/refresh` を使用する
- `guestAuth`がトークンの`guest_id`をボディへ設定するため、クライアントは`guest_id`を送信しない。送信した場合もトークンの値で上書きする
- `guest_name`はトークンに含まれず、リクエストボディの値を使用する
- 対象ルームと所属フロアが有効で、ルームがメンバー限定ではない場合だけ利用できる
- 一覧取得でメンバー限定ルームを指定した場合は403 `FORBIDDEN`、それ以外の操作では401 `INVALID_PERMISSION`を返す
- `guest_reaction_only`が有効なルームでは、投稿・返信の本文に`👍`、`💖`、`👏`、`😊`、`😲`と空白だけを指定できる

### AI解析元の世代

- ゲストの投稿・返信作成は`analysis_source_revision=1`で保存し、本文・言語・`RoomTag`・主要メディアの実変更時はrevisionを増加させる。
- ゲスト API自身はAI タスクを起動しない。後から登録ユーザが通常のタイムラインAPIで解析対象を更新した場合は起動対象になり得る。
- 解析元の更新管理は[AI解析設定・実行仕様](../../ai-analysis.md#起動と解析対象の更新世代)を参照する。

### リアクション共通仕様

- 作成時の`type`は`いいね`、`超いいね`、`拍手`、`笑顔`、`びっくり`のいずれか
- `guest_name`は1〜20文字で、`guest_id`は共通の認証・アクセス制御に従ってトークンから補完する
- 削除できるのは、トークンの`guest_id`とリアクションの`guest_id`が一致する場合だけ。不一致、ユーザ作成リアクション、対象リアクションなしの場合は401 `INVALID_PERMISSION`を返す
- 操作対象の投稿に紐づくルームとフロアが有効で、ルームがメンバー限定ではないことを確認する
- 作成・削除時は、対象ルームへ更新後の`Chat`をSocket.IOで送信する

### 入力条件

- 投稿・返信では、対象決定や保存に使用しない`floor_id`、`floor_title`、`room_title`、`keyup`を互換入力として要求する一方、実データのフロア・ルームは対象ルームから解決する

## API

### POST /api/chat/guest/

ゲスト向けの投稿一覧を取得する。

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - room_id: 文字列(MongoId), 必須
  - from: 文字列（ISO 8601日時）またはnull、必須。日時指定時は`created_at < from`で絞り込む
  - to: 文字列（ISO 8601日時）またはnull、必須。日時指定時は`created_at >= to`で絞り込む
  - server_query／serverQuery: オブジェクト、任意。列単位の絞り込み条件
  - global_server_query／globalServerQuery: オブジェクト、任意。全列共通の絞り込み条件
- 全列共通条件と列単位条件はANDで結合する

#### レスポンス

- 200 OK
- body: `Chat[]`
- 並び順: `created_at`の降順
- 最大件数: 通常10件。`to`を日時指定した場合は最大200件
- `floor_id`が対象ルームの所属フロアと一致しない場合は、空配列を返す
- 論理削除済みの埋め込みデータをレスポンスから除外する

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN（メンバー限定ルーム）
- 404: NOT_FOUND（対象ルームまたは所属フロアが存在しない、または論理削除済み）

### POST /api/chat/guest/detail

ゲスト向けの投稿詳細を取得する。

#### リクエスト

- body:
  - post_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: `Chat`。投稿が存在しない場合は`null`
- 論理削除済みの埋め込みデータをレスポンスから除外する

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION

### POST /api/chat/guest/post

ゲスト投稿を作成する。

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - floor_title: 文字列（1〜100文字）、必須
  - room_id: 文字列(MongoId), 必須
  - room_title: 文字列（1〜100文字）、必須
  - guest_name: 文字列（1〜20文字）、必須
  - content: 文字列（0〜400文字）、必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、必須
  - room_tags: 文字列(MongoId)[], 必須。空配列も許可
  - animation: `move-and-erase`またはnull、必須
  - keyup: 文字列（最大5000文字）、必須
  - target_langs: 文字列[], 必須。空配列可、最大16件。各要素は[対応言語コード](../api-conventions.md#言語コード)とし、前後空白除去・小文字化後に重複を除外する
- `room_tags`はすべて対象フロア・ルームに属し、論理削除されていない`RoomTag`である必要がある
- `floor_id`、`floor_title`、`room_title`、`keyup`は互換入力として受け付けるが、投稿の対象決定や保存には使用しない。投稿のフロアは対象ルームの所属フロアから解決する

#### レスポンス

- 200 OK
- body: 作成済み`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION

#### データ更新・通知

- `Chat`を作成する
- `PushFilter`一致ユーザへWebプッシュ通知を試行する
- 対象ルームへSocket.IOの`POST_CREATE`を送信する
- `target_langs`が空でない場合、翻訳を非同期で依頼する。翻訳エラーはレスポンスへ反映しない

### POST /api/chat/guest/reply

ゲスト返信を作成する。

#### リクエスト

- body:
  - floor_id: 文字列（MongoId）、必須
  - floor_title: 文字列（1〜100文字）、必須
  - room_id: 文字列（MongoId）、必須
  - room_title: 文字列（1〜100文字）、必須
  - post_id: 文字列（MongoId）、必須
  - guest_name: 文字列（1〜20文字）、必須
  - content: 文字列（0〜400文字）、必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、必須
  - room_tags: 文字列(MongoId)[], 必須。空配列も許可
  - animation: `move-and-erase`またはnull、必須
  - keyup: 文字列（最大5000文字）、必須
  - target_langs: 文字列[], 必須。空配列可、最大16件。各要素は[対応言語コード](../api-conventions.md#言語コード)とし、前後空白除去・小文字化後に重複を除外する
- `room_tags`はすべて対象フロア・ルームに属し、論理削除されていない`RoomTag`である必要がある
- 対象投稿が指定ルームに属している必要がある
- `floor_id`、`floor_title`、`room_title`、`keyup`は互換入力として受け付けるが、返信の対象決定や保存には使用しない。返信のルーム・フロアは対象投稿とルームから検証する

#### レスポンス

- 200 OK
- body: 作成済み返信を含む`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION

#### データ更新・通知

- `Chat.replies`へ返信を追加する
- 投稿者、既存返信者、`PushFilter`一致ユーザへWebプッシュ通知を試行する
- 対象ルームへSocket.IOの`REPLY_CREATE`を送信する
- Google Translateが有効で`target_langs`が空でない場合、翻訳をバックグラウンドで依頼する。返信作成の応答と`REPLY_CREATE`は翻訳完了を待たない。翻訳失敗はログへ記録し、レスポンスへ反映しない

### POST /api/chat/guest/reaction

ゲストが投稿にリアクションする。

#### リクエスト

- body:
  - guest_name: 文字列（1〜20文字）、必須
  - post_id: 文字列(MongoId), 必須
  - type: 文字列、必須。値は「リアクション共通仕様」を参照

#### レスポンス

- 200 OK
- body: 更新済み`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION

#### データ更新・通知

- `Chat.reactions`へリアクションを追加する
- 対象ルームへSocket.IOの`REACTION_CREATE`を送信する

### POST /api/chat/guest/reaction/delete

ゲストの投稿リアクションを削除する。

#### リクエスト

- body:
  - guest_name: 文字列（1〜20文字）、必須
  - post_id: 文字列(MongoId), 必須
  - reaction_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: 更新済み`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION

#### データ更新・通知

- 所有者確認後、`Chat.reactions`からリアクションを削除する
- 対象ルームへSocket.IOの`REACTION_DELETE`を送信する

### POST /api/chat/guest/supplement/reaction

ゲストが投稿付加情報にリアクションする。

#### リクエスト

- body:
  - guest_name: 文字列（1〜20文字）、必須
  - post_id: 文字列(MongoId), 必須
  - supplement_id: 文字列(MongoId), 必須
  - type: 文字列、必須。値は「リアクション共通仕様」を参照

#### レスポンス

- 200 OK
- body: 更新済み`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 404: NOT_FOUND（対象付加情報を更新できない場合）

#### データ更新・通知

- `Chat.supplementaries[].reactions`へリアクションを追加する
- 対象ルームへSocket.IOの`SUPPLEMENT_REACTION_CREATE`を送信する

### POST /api/chat/guest/supplement/reaction/delete

ゲストの投稿付加情報リアクションを削除する。

#### リクエスト

- body:
  - guest_name: 文字列（1〜20文字）、必須
  - post_id: 文字列(MongoId), 必須
  - supplement_id: 文字列(MongoId), 必須
  - reaction_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: 更新済み`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION

#### データ更新・通知

- 所有者確認後、`Chat.supplementaries[].reactions`からリアクションを削除する
- 対象ルームへSocket.IOの`REACTION_DELETE`を送信する

### POST /api/chat/guest/reply/reaction

ゲストが返信にリアクションする。

#### リクエスト

- body:
  - guest_name: 文字列（1〜20文字）、必須
  - post_id: 文字列(MongoId), 必須
  - reply_id: 文字列(MongoId), 必須
  - type: 文字列、必須。値は「リアクション共通仕様」を参照

#### レスポンス

- 200 OK
- body: 更新済み`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 404: NOT_FOUND（対象返信を更新できない場合）

#### データ更新・通知

- `Chat.replies[].reactions`へリアクションを追加する
- 対象ルームへSocket.IOの`REPLY_REACTION_CREATE`を送信する

### POST /api/chat/guest/reply/reaction/delete

ゲストの返信リアクションを削除する。

#### リクエスト

- body:
  - guest_name: 文字列（1〜20文字）、必須
  - post_id: 文字列(MongoId), 必須
  - reply_id: 文字列(MongoId), 必須
  - reaction_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: 更新済み`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION

#### データ更新・通知

- 所有者確認後、`Chat.replies[].reactions`からリアクションを削除する
- 対象ルームへSocket.IOの`REACTION_DELETE`を送信する

### POST /api/chat/guest/reply/supplement/reaction

ゲストが返信付加情報にリアクションする。

#### リクエスト

- body:
  - guest_name: 文字列（1〜20文字）、必須
  - post_id: 文字列(MongoId), 必須
  - reply_id: 文字列(MongoId), 必須
  - supplement_id: 文字列(MongoId), 必須
  - type: 文字列、必須。値は「リアクション共通仕様」を参照

#### レスポンス

- 200 OK
- body: 更新済み`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION

#### データ更新・通知

- `Chat.replies[].supplementaries[].reactions`へリアクションを追加する
- 対象ルームへSocket.IOの`REPLY_SUPPLEMENT_REACTION_CREATE`を送信する

### POST /api/chat/guest/reply/supplement/reaction/delete

ゲストの返信付加情報リアクションを削除する。

#### リクエスト

- body:
  - guest_name: 文字列（1〜20文字）、必須
  - post_id: 文字列(MongoId), 必須
  - reply_id: 文字列(MongoId), 必須。処理に使用するが、ルートでの必須・形式検証は行わない
  - supplement_id: 文字列(MongoId), 必須
  - reaction_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: 更新済み`Chat`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION

#### データ更新・通知

- 所有者確認後、`Chat.replies[].supplementaries[].reactions`からリアクションを削除する
- 対象ルームへSocket.IOの`REACTION_DELETE`を送信する

## 関連資料

### 実装

- `backend/middlewares/guestAuth.js`
- `backend/validates/base.validate.js`
- `backend/validates/serverQuery.validate.js`
- `backend/validates/reaction.validate.js`
- `backend/services/timeline/shared/guestAccess.js`
- `backend/services/timeline/shared/guestRules.js`
- `backend/services/timeline/shared/reactionHelpers.js`
- `backend/models/Chat.js`
- `backend/routes/timeline/guest/index.js`
- `backend/controllers/timeline/guest/guestPosts.controller.js`
- `backend/services/timeline/guest/guestPosts.service.js`
- `backend/services/timeline/guest/guestReplies.service.js`
- `backend/services/timeline/guest/guestReplySupplementReactions.service.js`

### テスト

- `backend/tests/unit/services/timeline/shared/guestAccess.test.js`
- `backend/tests/integration/routes/guest.timeline.route.int.test.js`
- `backend/tests/unit/services/timeline/guest/guestPosts.service.test.js`
- `backend/tests/unit/services/timeline/guest/guestReplies.service.test.js`
- `backend/tests/unit/services/timeline/guest/guestPostReactions.service.test.js`
