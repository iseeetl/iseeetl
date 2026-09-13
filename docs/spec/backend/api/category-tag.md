# 共通タグAPI

## 概要

共通タグ（`CategoryTag`）の位置付けとライフサイクルは [ドメインモデル](../../domain-model.md) を参照してください。すべてのエンドポイントでJWTとサイト管理者権限が必須です。

旧版で論理削除されたタグは一覧・更新・同期の対象に含めず、自動復元・一括削除もしません。同名のタグが必要な場合は新しいIDで作成します。

## API

### POST /api/categorytag/management

管理者が共通タグ一覧を取得する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- なし

#### レスポンス

- 200 OK
- body:
  - `CategoryTag[]`（`delete_flg: false` のみ）

#### エラー

- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN

### GET/POST /api/categorytag/management/paginate

管理者が共通タグ一覧をページング取得する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- GET:
  - query:
    - page: 数値（1以上）, 必須
    - search: 文字列（50文字以内）, 任意
- POST:
  - body:
    - page: 数値（1以上）, 必須
    - search: 文字列（50文字以内）, 任意
- searchが空でない文字列の場合は、名前を大文字・小文字を区別せず部分一致で検索する
- 有効なタグだけを返す。旧引数`delete_flg`を指定した場合は400を返す

#### レスポンス

- 200 OK
- body:
  - 1ページ10件のページング結果
  - `order`の昇順
  - 旧版で論理削除されたタグは含めない

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN

### POST /api/categorytag/management/create

管理者が共通タグを作成する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - order: 数値（1〜100）, 必須
  - name: 文字列（1〜50文字）, 必須

#### レスポンス

- 200 OK
- body:
  - 作成済み `CategoryTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN

#### データ更新・通知

- `CategoryTag`を作成

### POST /api/categorytag/management/update

管理者が共通タグの編集項目を更新する。削除には専用APIを使用し、更新時の`delete_flg`指定は400で拒否する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - order: 数値（1〜100）, 必須
  - name: 文字列（1〜50文字）, 必須

#### レスポンス

- 200 OK
- body:
  - 更新後の`CategoryTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象`CategoryTag`が存在しない）
- 409: CONFLICT（条件付き更新の競合）

#### データ更新・通知

- `order`、`name`、`updated_at`を更新する。`delete_flg`と`deleted_at`は変更しない
- 存在しないタグと旧版の削除済みタグは更新しない

### POST /api/categorytag/management/delete

JWTとサイト管理者権限が必要です。ボディは`_id`（MongoId）だけを指定し、`delete_flg`は受け付けません。

- 200: レコードを物理削除し、`{ "_id": "削除したタグのID" }`を返す
- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象なし・再削除）
- 409: CONFLICT（有効な共通AI解析設定から直接参照中）
  - `error.details`は`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "category-tag" }`

復元APIはありません。コピー済みの下位タグ・設定と、そこに保存されたコピー元IDは変更しません。

### POST /api/categorytag/management/import

管理者が共通タグを CSV で一括登録する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - csv: 配列（1〜100行）, 必須
  - 各行: `[order, name]`
  - order: 数値（1〜100）
  - name: 文字列（1〜50文字）
  - 同一CSV内で完全一致するタグ名は重複不可（前後の空白は除去して比較）

#### レスポンス

- 200 OK
- body:
  - 同期後の有効な`CategoryTag[]`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 409: CONFLICT（CSVにない有効`CategoryTag`が有効な共通AI解析設定から直接参照中）
  - `error.details`に`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "category-tag" }`を含む

#### データ更新・通知

- CSVのタグ名から前後の空白を除去し、既存タグ名と完全一致で照合する
- 同名の有効な既存タグは`_id`を維持して内容を更新する
- 新しい名前のタグは新規作成し、CSVにない有効タグは参照制約を満たす場合に物理削除する
- CSVにない有効タグが有効な共通AI解析設定の`category_tag`から直接参照されている場合は、同期を409で拒否して書込みを開始しない
- `FloorTag`の`source_category_tag`は参照制約に使用しない。同期で`CategoryTag`を物理削除しても`FloorTag`を連鎖削除せず、保存済み来歴IDを維持する
- CSVまたは既存の有効タグに同名タグが複数ある場合は`INVALID_PARAMS`とし、同期処理を開始しない

## 関連資料

### 実装

- `backend/routes/categoryTag.route.js`
- `backend/controllers/categoryTag.controller.js`
- `backend/services/categoryTag.service.js`
- `backend/services/_shared/tagServiceHelpers.js`
- `backend/services/analysis/settings/referenceIntegrity.js`

### テスト

- `backend/tests/unit/routes/categoryTag.route.test.js`
- `backend/tests/unit/services/categoryTag.service.test.js`
- `backend/tests/integration/routes/categoryTag.route.int.test.js`
- `backend/tests/integration/models/categoryTag.model.int.test.js`
