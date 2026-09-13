# 共通の単語管理API

## 概要

共通の単語と単語グループを管理します。実装の`QuickTextGroup`系モデルがグループ、`QuickTextItem`系モデルが単語に対応します。

共通の入力形式、認証ヘッダ、成功・エラー応答は [REST API共通規約](../api-conventions.md) を参照してください。
管理用単語のグループ・単語関係とライフサイクルは [ドメインモデル](../../domain-model.md) を参照してください。
グループと単語は別々のデータとして保存し、削除時は論理削除ではなく物理削除します。

## 共通条件

### 共通の認可

以下の条件は全エンドポイントに適用します。

- JWTとサイト管理者権限が必須
- JWT認証時の`TOKEN_INVALID`・`TOKEN_EXPIRED`は[共通の認証情報](../api-conventions.md#認証情報)に従う
- 認証後の管理者判定でユーザIDまたはロールが取得できない場合は401 `INVALID_PERMISSION`を返す
- 認証後の再確認でログインユーザが存在しない・論理削除済みの場合は404 `NOT_FOUND`、管理者でない場合は403 `FORBIDDEN`を返す

### 入力条件

- グループまたは同一グループ内の単語の最大 `order` が100の場合、作成時の自動採番は101となり、上限値を超えて作成に失敗する

## API

### GET /api/management/quick-text/groups/all

単語グループを全件取得する。

#### リクエスト

- なし

#### レスポンス

- 200 OK
- body: `QuickTextGroup[]`
- 並び順: `order`、`created_at`、`_id` の昇順

#### エラー

- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 403: FORBIDDEN
- 404: NOT_FOUND

### GET /api/management/quick-text/groups

単語グループをページング取得する。

#### リクエスト

- query:
  - page: 数値（1以上）、任意。省略時は1

#### レスポンス

- 200 OK
- body: 1ページ10件のページング結果

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 403: FORBIDDEN
- 404: NOT_FOUND

### POST /api/management/quick-text/groups

単語グループを作成する。

#### リクエスト

- body:
  - title: 文字列（1〜200文字）、必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、必須

#### レスポンス

- 200 OK
- body: 作成済み `QuickTextGroup`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- 全グループの末尾となる `order` を自動採番し、`QuickTextGroup`を作成する

### PATCH /api/management/quick-text/groups/:id

単語グループを更新する。

#### リクエスト

- params:
  - id: 文字列（MongoId）、必須
- body:
  - order: 数値（1〜100）、任意
  - title: 文字列（1〜200文字）、任意
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意
  - `order`、`title`、`lang` のいずれか1項目以上が必須

#### レスポンス

- 200 OK
- body: 更新済み `QuickTextGroup`

#### エラー

- 400: INVALID_PARAMS
- 400: NO_UPDATABLE_FIELD
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `QuickTextGroup`を更新する

### DELETE /api/management/quick-text/groups/:id

単語グループを削除する。

#### リクエスト

- params:
  - id: 文字列（MongoId）、必須

#### レスポンス

- 200 OK
- body:
  - ok: true
  - deletedGroupId: 文字列

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- 認可・存在・所属を確認し、配下単語を削除してから最後にグループを削除する。途中失敗はエラーとして返し、画面を再取得して残ったグループから再試行する。専用の削除記録は保存しない。詳細は[単語グループ削除の復旧](../quicktext-deletion.md)を参照

### GET /api/management/quick-text/groups/:groupId/items

指定グループの単語一覧を取得する。

#### リクエスト

- params:
  - groupId: 文字列（MongoId）、必須
- query:
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意。現在は結果の絞り込みに使用しない

#### レスポンス

- 200 OK
- body: `QuickTextItem[]`
- 並び順: `order`、`created_at`、`_id` の昇順
- 指定グループに単語がない場合は空配列を返す。グループ自体が存在しない場合は404 `NOT_FOUND`を返す

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 403: FORBIDDEN
- 404: NOT_FOUND

### POST /api/management/quick-text/groups/:groupId/items

指定グループへ単語を作成する。

#### リクエスト

- params:
  - groupId: 文字列（MongoId）、必須
- body:
  - label: 文字列（1〜200文字）、必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、必須

#### レスポンス

- 200 OK
- body: 作成済み `QuickTextItem`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- 同じグループの末尾となる `order` を自動採番し、`QuickTextItem`を作成する

### PATCH /api/management/quick-text/items/:id

単語を更新する。

#### リクエスト

- params:
  - id: 文字列（MongoId）、必須
- body:
  - order: 数値（1〜100）、任意
  - label: 文字列（1〜200文字）、任意
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意
  - `order`、`label`、`lang` のいずれか1項目以上が必須

#### レスポンス

- 200 OK
- body: 更新済み `QuickTextItem`

#### エラー

- 400: INVALID_PARAMS
- 400: NO_UPDATABLE_FIELD
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `QuickTextItem`を更新する

### DELETE /api/management/quick-text/items/:id

単語を削除する。

#### リクエスト

- params:
  - id: 文字列（MongoId）、必須

#### レスポンス

- 200 OK
- body:
  - ok: true
  - deletedItemId: 文字列

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED / INVALID_PERMISSION
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `QuickTextItem`を物理削除する

## 関連資料

### 実装

- `backend/validates/quickText.validate.js`
- `backend/models/QuickTextGroup.js`
- `backend/models/QuickTextItem.js`
- `backend/routes/quickText.route.js`
- `backend/controllers/quickText.controller.js`
- `backend/services/quickText.service.js`

### テスト

- `backend/tests/unit/routes/quickText.route.test.js`
- `backend/tests/integration/routes/quickText.route.int.test.js`
- `backend/tests/unit/services/quickText.service.test.js`
