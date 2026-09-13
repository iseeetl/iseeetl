# フロア単語API

## 概要

フロアの単語と単語グループを管理します。実装の`QuickTextGroup`系モデルがグループ、`QuickTextItem`系モデルが単語に対応します。

共通の入力形式、認証ヘッダ、成功・エラー応答は [REST API共通規約](../api-conventions.md) を参照してください。
フロア用単語のグループ・単語関係とライフサイクルは [ドメインモデル](../../domain-model.md) を参照してください。
グループと単語は別々のデータとして保存し、削除時は論理削除ではなく物理削除します。

## 共通条件

### 共通の認可

以下の条件は全エンドポイントに適用します。

- JWT必須。認証失敗の条件は[共通の認証情報](../api-conventions.md#認証情報)に従う
- サイト管理者、または現在のロールが `Editor` である対象フロアの作成者だけが操作できる
- 認証後の再確認でログインユーザまたは対象フロアが存在しない・論理削除済みの場合は404 `NOT_FOUND`、権限不足は403 `FORBIDDEN`を返す

### Google Translateの有効条件

- 有効時はフロアの対象言語へ翻訳する。新規作成では翻訳を生成し、無効時は`translations`を空配列にする。
- 更新では、グループの`title`／`lang`または単語の`label`／`lang`をPATCHに含めると、有効時に再翻訳する。同じ値でも再生成し、`order`だけの更新では再生成しない。無効時は保存済みの`translations`を保持する。
- 有効状態は[外部機能の有効状態API](capabilities.md)の`googleTranslate`を参照する

### 入力条件

- 同一フロアまたは同一グループ内の最大 `order` が100の場合、作成時の自動採番は101となり、上限値を超えて作成に失敗する

## API

### GET /api/floors/:floorId/quick-text/groups

フロアの単語グループ一覧を取得する。

#### リクエスト

- params:
  - floorId: 文字列（MongoId）、必須
- query:
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意。現在は結果の絞り込みに使用しない

#### レスポンス

- 200 OK
- body: `FloorQuickTextGroup[]`
- 並び順: `order`、`created_at`、`_id` の昇順

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

### POST /api/floors/:floorId/quick-text/groups

フロアの単語グループを作成する。

#### リクエスト

- params:
  - floorId: 文字列（MongoId）、必須
- body:
  - title: 文字列（1〜200文字）、必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、必須

#### レスポンス

- 200 OK
- body: 作成済み `FloorQuickTextGroup`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- 同じフロアの末尾となる `order` を自動採番し、`FloorQuickTextGroup`を作成する
- 共通の翻訳条件に従って`translations`を設定する

### PATCH /api/floors/:floorId/quick-text/groups/:id

フロアの単語グループを更新する。

#### リクエスト

- params:
  - floorId: 文字列（MongoId）、必須
  - id: 文字列（MongoId）、必須
- body:
  - order: 数値（1〜100）、任意
  - title: 文字列（1〜200文字）、任意
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意
  - `order`、`title`、`lang` のいずれか1項目以上が必須

#### レスポンス

- 200 OK
- body: 更新済み `FloorQuickTextGroup`

#### エラー

- 400: INVALID_PARAMS
- 400: NO_UPDATABLE_FIELD
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `FloorQuickTextGroup`を更新する
- 共通の翻訳条件に従い、`title`または`lang`の指定時に`translations`を更新する

### DELETE /api/floors/:floorId/quick-text/groups/:id

フロアの単語グループを削除する。

#### リクエスト

- params:
  - floorId: 文字列（MongoId）、必須
  - id: 文字列（MongoId）、必須

#### レスポンス

- 200 OK
- body:
  - ok: true
  - deletedGroupId: 文字列

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- 認可・存在・所属を確認し、配下単語を削除してから最後にグループを削除する。途中失敗はエラーとして返し、画面を再取得して残ったグループから再試行する。専用の削除記録は保存しない。詳細は[単語グループ削除の復旧](../quicktext-deletion.md)を参照
- グループが存在しない、または対象フロアに所属しない場合は404を返し、データを変更しない

### GET /api/floors/:floorId/quick-text/groups/:groupId/items

フロアの単語一覧を取得する。

#### リクエスト

- params:
  - floorId: 文字列（MongoId）、必須
  - groupId: 文字列（MongoId）、必須
- query:
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意。現在は結果の絞り込みに使用しない

#### レスポンス

- 200 OK
- body: `FloorQuickTextItem[]`
- 並び順: `order`、`created_at`、`_id` の昇順

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

### POST /api/floors/:floorId/quick-text/groups/:groupId/items

フロアの単語を作成する。

#### リクエスト

- params:
  - floorId: 文字列（MongoId）、必須
  - groupId: 文字列（MongoId）、必須
- body:
  - label: 文字列（1〜200文字）、必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、必須

#### レスポンス

- 200 OK
- body: 作成済み `FloorQuickTextItem`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- 同じグループの末尾となる `order` を自動採番し、`FloorQuickTextItem`を作成する
- 共通の翻訳条件に従って`translations`を設定する

### PATCH /api/floors/:floorId/quick-text/items/:id

フロアの単語を更新する。

#### リクエスト

- params:
  - floorId: 文字列（MongoId）、必須
  - id: 文字列（MongoId）、必須
- body:
  - order: 数値（1〜100）、任意
  - label: 文字列（1〜200文字）、任意
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意
  - `order`、`label`、`lang` のいずれか1項目以上が必須

#### レスポンス

- 200 OK
- body: 更新済み `FloorQuickTextItem`

#### エラー

- 400: INVALID_PARAMS
- 400: NO_UPDATABLE_FIELD
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `FloorQuickTextItem`を更新する
- 共通の翻訳条件に従い、`label`または`lang`の指定時に`translations`を更新する

### DELETE /api/floors/:floorId/quick-text/items/:id

フロアの単語を削除する。

#### リクエスト

- params:
  - floorId: 文字列（MongoId）、必須
  - id: 文字列（MongoId）、必須

#### レスポンス

- 200 OK
- body:
  - ok: true
  - deletedItemId: 文字列

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `FloorQuickTextItem`を物理削除する

## 関連資料

### 実装

- `backend/validates/quickText.validate.js`
- `backend/models/FloorQuickTextGroup.js`
- `backend/models/FloorQuickTextItem.js`
- `backend/routes/floor/floorQuickText.route.js`
- `backend/routes/_shared/quickTextRoutes.js`
- `backend/controllers/floor/floorQuickText.controller.js`
- `backend/services/floor/floorQuickText.service.js`
- `backend/services/_shared/quickTextService.js`

### テスト

- `backend/tests/unit/services/floor/floorQuickText.service.test.js`
- `backend/tests/integration/routes/floor.quickText.route.int.test.js`
- `backend/tests/unit/services/_shared/quickTextService.test.js`
