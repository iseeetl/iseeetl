# タイムラインAPI：投稿

## 概要

認証、入室権限、プッシュ通知、メディアの扱いは[タイムラインAPI共通仕様](timeline.md)を参照してください。
AI解析の起動条件、解析元の更新管理、結果の保存方法は[AI解析設定・実行仕様](../../ai-analysis.md)を参照してください。

通常画面の投稿作成・更新・削除は[ルーム配下のタイムラインAPI](timeline-post-resources.md)を使用します。

## 共通条件

### 外部機能の利用可否

- Google Translateが無効な場合、新規投稿の`translations`は空配列になり、投稿更新では保存済みの翻訳を保持する
- OpenAI自動解析が無効な場合は解析を実行しない。設定の有無や外部サービス状態にかかわらず、投稿更新またはタグ更新だけを理由に保存済みAI解析結果を削除しない
- OneSignalが無効な場合、プッシュ通知だけを省略し、投稿の作成・更新を継続する
- 有効状態は[外部機能の有効状態API](capabilities.md)を参照する

## API

### POST /api/chat/role

ユーザのタイムライン権限ロールを判定する。

#### 認証・権限

- JWT必須
- 対象フロアとルームが論理削除されておらず、ルームが指定フロアに所属すること
- キック状態と`member_only`による入室可否は判定せず、有効ロールだけを返す

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - room_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - role: 文字列（Administrator/FloorEditor/FloorMember/RoomMember/Author）

#### エラー

- 400: INVALID_PARAMS（入力不正、フロア・ルームが無効、またはルームが指定フロアに所属しない）
- 401: TOKEN_INVALID / TOKEN_EXPIRED

### 一覧・検索

通常一覧は`GET /api/rooms/:room_id/timeline/posts`、複合検索は同URL末尾`/search`への`POST`を使用する。日時条件・件数・入力項目は[一覧・検索・詳細](timeline-post-resources.md#一覧検索詳細)を参照する。

`globalServerQuery`と`serverQuery`は独立した条件としてANDで適用する。同じ項目でも一方で上書きしない。各グループは本文キーワード、ユーザ名、タグ、タグなし、アニメーションの条件を受け付ける。`filterMode`で包含／除外、`logicalOperator`でキーワードのor／and、`tagSearchOperator`でタグのor／andを指定する。画面表示用の`showRange`は送信しない。

応答は作成日時降順の投稿配列。投稿・返信・付加情報・リアクションのユーザ情報を展開し、論理削除済みの子を除外する。読み取りによる通知・更新は行わない。

### POST /api/chat/guest

ゲスト用の投稿一覧を取得します。検索条件、並び順、取得上限は[ゲスト向けタイムラインAPI](timeline-guest.md#post-apichatguest)を参照してください。

#### 認証・権限

- ゲストアクセストークンが必須
- 詳細は[ゲスト向けタイムラインAPI](timeline-guest.md)を参照

### GET /api/rooms/:room_id/timeline/posts/:post_id

[一覧・検索・詳細](timeline-post-resources.md#一覧検索詳細)を参照する。URLのルームに属する投稿とその返信・付加情報を返す。読み取りによる通知・更新は行わない。

### POST /api/rooms/:room_id/timeline/posts

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- スパムワードを置換した本文で`Chat`を作成
- OneSignalが有効な場合は`PushFilter`に一致する他ユーザへプッシュ通知を試行し、無効な場合は通知だけを省略する
- Socket.IOの`POST_CREATE`を対象ルームへ送信
- Google Translateが有効な場合は本文翻訳、OpenAI自動解析が有効な場合は有効なルーム設定と保存済みの解析元データに一致する解析を応答処理とは別に試行する。結果の作成・更新時は追加のSocket.IO更新を送信する
- 通知、翻訳、解析の失敗はログへ記録し、作成済み`Chat`を取り消さない

### PATCH /api/rooms/:room_id/timeline/posts/:post_id

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- `Chat`の本文、言語、タグ、アニメーション、メディア項目、`updated_at`を更新
- Google Translateが有効で本文または原文言語（`lang`）が変わった場合は既存の翻訳を空配列へ戻す。無効な場合は保存済みの翻訳を保持する
- 本文、言語、タグ、画像・動画・音声の実変更時は`analysis_source_revision`を原子的に増加させる。リアクション、付加情報、表示だけの変更では増加させない
- 変更前と異なる画像・動画・音声ファイルを削除
- Socket.IOの`POST_UPDATE`を対象ルームへ送信
- Google Translateが有効で本文または原文言語（`lang`）が変わった場合は翻訳、OpenAI自動解析が有効な場合は有効なルーム設定に一致する解析を応答処理とは別に試行する

### DELETE /api/rooms/:room_id/timeline/posts/:post_id

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- `delete_flg`をtrueにし、`updated_at`と`deleted_at`を現在日時へ更新
- 投稿本体に紐づく画像、動画、字幕、音声ファイルを削除
- 投稿に埋め込まれた返信や付加情報のメディアはこの処理では削除しない
- Socket.IOの`POST_DELETE`を対象ルームへ送信

### PUT /api/rooms/:room_id/timeline/posts/:post_id/tags

入力・応答・認可・エラーは[ルーム配下のタイムラインAPI](timeline-post-resources.md)を参照する。

#### データ更新・通知

- `Chat`の`room_tags`を更新
- `RoomTag`が実際に変わった場合は`analysis_source_revision`を原子的に増加させる。保存済みAI解析結果はタグ変更だけを理由に削除しない
- Socket.IOの`TAG_UPDATE`を対象ルームへ送信
- OpenAI自動解析が有効な場合は、有効なルーム設定に一致する解析を応答処理とは別に試行する

## 関連資料

### 実装

- `backend/routes/timeline/postResource.route.js`
- `backend/controllers/timeline/postResource.controller.js`
- `backend/services/timeline/posts.service.js`
- `backend/services/timeline/shared/timelineList.js`

### テスト

- `backend/tests/integration/routes/timeline.core.int.test.js`
- `backend/tests/unit/services/timeline/posts.service.test.js`
- `backend/tests/integration/routes/timeline.access.int.test.js`
