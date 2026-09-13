# スパム管理API

## 概要

`Spam`は、タイムラインの投稿、返信、投稿付加情報、返信付加情報に含まれる対象語を置換するための設定です。すべての管理エンドポイントでJWTとサイト管理者権限が必須です。
共通の入力形式、認証ヘッダ、成功・エラー応答は [REST API共通規約](../api-conventions.md) を参照してください。

## 共通条件

### 共通の認証・認可

- Bearer JWTが必須
- JWTに対応する有効なユーザをリクエスト時に取得し、現在ロールが`Administrator`の場合だけ実行できる
- 一般ユーザおよび`Editor`は`403 FORBIDDEN`となる

### タイムライン本文への置換仕様

- 投稿、返信、投稿付加情報、返信付加情報の作成時および本文更新時に、保存前の本文へ適用する。ゲスト投稿・返信も対象とする。
- 本文の処理ごとに全`Spam.word`を取得し、長い語から並べ、正規表現の特殊文字を通常文字として扱う。
- 大文字・小文字を区別せず、本文中の一致箇所をすべて`***`へ置換する。
- 入力本文が`null`、`undefined`、空文字の場合は空文字を返す。
- スパムワード設定の作成、更新、削除はキャッシュを介さないため、次回の本文処理から反映される。
- 設定変更前に保存済みの本文、翻訳、通知は遡って再処理しない。
- スパムワード設定の作成、更新、削除自体はSocket.IOイベントを送信せず、製品内の操作履歴も記録しない。

### モデル

- `_id`: スパムワードID
- `user`: 作成したサイト管理者のユーザID。必須
- `word`: 置換対象語。前後空白を除去した1〜50文字。必須、一意制約なし。大文字・小文字だけが異なる語も保存できる
- `created_at`: 作成日時
- `updated_at`と`delete_flg`は持たず、削除APIでは物理削除する

## API

### GET/POST /api/spam/management/paginate

スパムワード一覧をページング取得する。

#### 認証・権限

- Bearer JWTが必須
- 現在ロールが`Administrator`であること

#### リクエスト

- GET:
  - query:
    - `page`: 1以上の整数、必須
    - `search`: 文字列（50文字以内）、任意
- POST:
  - body:
    - `page`: 1以上の整数、必須
    - `search`: 文字列（50文字以内）または`null`、任意

`page`は整数へ変換して検証します。`search`の前後空白は除去し、省略・空文字、JSONボディの`null`は検索条件なしとして扱います。検索時は正規表現の特殊文字を通常の文字として扱い、`word`を大文字・小文字を区別せず部分一致検索します。

#### レスポンス

- 200 OK
- body: 1ページ10件のページング結果
  - `docs`: `Spam[]`
  - `total`: 全件数
  - `limit`: 10
  - `pages`: 総ページ数
  - `page`: 現在のページ
  - `pagingCounter`: ページ先頭の通番
  - `hasPrevPage` / `hasNextPage`: 前後ページの有無
  - `prevPage` / `nextPage`: 前後のページ番号。存在しない場合は`null`
- 並び順: `created_at`の降順

#### エラー

- `400 INVALID_PARAMS`: `page`または`search`が不正
- `401 TOKEN_INVALID` / `TOKEN_EXPIRED`: JWTが欠落、不正、期限切れ、または有効なユーザが存在しない
- `403 FORBIDDEN`: 現在ロールがサイト管理者ではない

### POST /api/spam/management/create

スパムワードを作成する。

#### 認証・権限

- Bearer JWTが必須
- 現在ロールが`Administrator`であること

#### リクエスト

- body:
  - `word`: 文字列（1〜50文字）、必須
    - 前後空白を除去する

#### レスポンス

- 200 OK
- body: 作成済みの`Spam`

#### エラー

- `400 INVALID_PARAMS`: `word`が不正
- `401 TOKEN_INVALID` / `TOKEN_EXPIRED`: JWTが欠落、不正、期限切れ、または有効なユーザが存在しない
- `403 FORBIDDEN`: 現在ロールがサイト管理者ではない

#### データ更新・通知

- JWTのユーザIDを`user`に設定して`Spam`を作成する
- 同じ`word`が既に存在しても別レコードとして作成する

### POST /api/spam/management/update

スパムワードを更新する。

#### 認証・権限

- Bearer JWTが必須
- 現在ロールが`Administrator`であること

#### リクエスト

- body:
  - `_id`: 文字列（MongoId）、必須
  - `word`: 文字列（1〜50文字）、必須
    - 前後空白を除去する

#### レスポンス

- 200 OK
- body:
  - 更新後の`Spam`
  - 対象が存在しない場合は`null`

#### エラー

- `400 INVALID_PARAMS`: `_id`または`word`が不正
- `401 TOKEN_INVALID` / `TOKEN_EXPIRED`: JWTが欠落、不正、期限切れ、または有効なユーザが存在しない
- `403 FORBIDDEN`: 現在ロールがサイト管理者ではない

#### データ更新・通知

- `word`を更新し、モデルの文字数・必須制約も再検証する
- `user`と`created_at`は変更しない

### POST /api/spam/management/delete

スパムワードを削除する。

#### 認証・権限

- Bearer JWTが必須
- 現在ロールが`Administrator`であること

#### リクエスト

- body:
  - `_id`: 文字列（MongoId）、必須

#### レスポンス

- 200 OK
- body:
  - 物理削除した`Spam`
  - 対象が存在しない場合は`null`

#### エラー

- `400 INVALID_PARAMS`: `_id`が不正
- `401 TOKEN_INVALID` / `TOKEN_EXPIRED`: JWTが欠落、不正、期限切れ、または有効なユーザが存在しない
- `403 FORBIDDEN`: 現在ロールがサイト管理者ではない

#### データ更新・通知

- `Spam`を物理削除する

## 関連資料

### 実装

- `backend/routes/spam.route.js`
- `backend/controllers/spam.controller.js`
- `backend/services/spam.service.js`
- `backend/services/timeline/shared/postCreate.js`
- `backend/services/timeline/shared/replyCreate.js`

### テスト

- `backend/tests/unit/routes/spam.route.test.js`
- `backend/tests/integration/routes/spam.route.int.test.js`
- `backend/tests/integration/services/spam.service.int.test.js`
- `backend/tests/integration/models/spam.model.int.test.js`
- `backend/tests/unit/services/spam.service.test.js`
