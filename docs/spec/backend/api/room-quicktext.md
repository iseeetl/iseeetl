# ルーム単語API

## 概要

ルームの単語と単語グループを管理します。実装の`QuickTextGroup`系モデルがグループ、`QuickTextItem`系モデルが単語に対応します。

共通の入力形式、認証ヘッダ、成功・エラー応答は [REST API共通規約](../api-conventions.md) を参照してください。
ルーム用単語のフロア・ルーム・グループ・単語関係とライフサイクルは [ドメインモデル](../../domain-model.md) を参照してください。
グループと単語は別々のデータとして保存し、削除時は論理削除ではなく物理削除します。

## 共通条件

### 共通の認可

- 公開ルームの一覧は匿名または有効ゲストでも取得できる。メンバー限定ルームの一覧はルームへアクセス可能なログインユーザだけが取得できる
- 一覧リクエストにユーザ AuthorizationがあればユーザJWTを優先して検証し、公開ルームでもキック済みユーザを拒否する。ユーザ Authorizationがなくゲストトークンがあればゲストトークンを検証する
- 有効ゲストはメンバー限定ルームで`INVALID_PERMISSION`となる。不正・期限切れのユーザ／ゲストトークンは、匿名や別の認証主体へ切り替えず`TOKEN_INVALID`／`TOKEN_EXPIRED`となる
- メンバー限定ルームで認証情報がない場合は`TOKEN_INVALID`、公開ルーム・メンバー限定ルームのキック済みユーザおよびメンバー限定ルームの所属要件を満たさないユーザは`INVALID_PERMISSION`となる
- 作成・更新・削除はJWT必須。認証失敗の条件は[共通の認証情報](../api-conventions.md#認証情報)に従う
- 作成・更新・削除は、サイト管理者、現在のロールが `Editor` である対象フロアの作成者、または対象フロアの `FloorMember` が実行できる
- 変更時の認証後の再確認でログインユーザ、対象ルーム、所属フロアのいずれかが存在しない・論理削除済みの場合は404 `NOT_FOUND`、変更権限の不足は403 `FORBIDDEN`を返す
- 一覧取得でも、対象ルームまたは所属フロアが論理削除済みの場合は取得できない
- メンバー限定ルームでは`Administrator`、対象フロアの作成者である現在ロール`Editor`、`FloorMember`、または`RoomMember`を許可する

### Google Translateの有効条件

- 有効時はフロアの対象言語へ翻訳する。新規作成では翻訳を生成し、無効時は`translations`を空配列にする。
- 更新では、グループの`title`／`lang`または単語の`label`／`lang`をPATCHに含めると、有効時に再翻訳する。同じ値でも再生成し、`order`だけの更新では再生成しない。無効時は保存済みの`translations`を保持する。
- 有効状態は[外部機能の有効状態API](capabilities.md)の`googleTranslate`を参照する

### 入力条件

- 同一ルームまたは同一グループ内の最大 `order` が100の場合、作成時の自動採番は101となり、上限値を超えて作成に失敗する

## API

### GET /api/rooms/:roomId/quick-text/groups

ルームの単語グループ一覧を取得する。

[共通の認可](#共通の認可)の一覧取得条件を適用します。

#### リクエスト

- params:
  - roomId: 文字列（MongoId）、必須
- query:
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意。現在は結果の絞り込みに使用しない

#### レスポンス

- 200 OK
- body: `RoomQuickTextGroup[]`
- 並び順: `order`、`created_at`、`_id` の昇順

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND

### GET /api/rooms/:roomId/quick-text/groups/:groupId/items

ルームの単語一覧を取得する。

[共通の認可](#共通の認可)の一覧取得条件を適用します。

#### リクエスト

- params:
  - roomId: 文字列（MongoId）、必須
  - groupId: 文字列（MongoId）、必須
- query:
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意。指定時は一致する単語だけを返す

#### レスポンス

- 200 OK
- body: `RoomQuickTextItem[]`
- 並び順: `order`、`created_at`、`_id` の昇順

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND

### POST /api/rooms/:roomId/quick-text/groups

ルームの単語グループを作成する。

#### リクエスト

- params:
  - roomId: 文字列（MongoId）、必須
- body:
  - title: 文字列（1〜200文字）、必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、必須

#### レスポンス

- 200 OK
- body: 作成済み `RoomQuickTextGroup`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- 同じルームの末尾となる `order` を自動採番し、`RoomQuickTextGroup`を作成する
- 対象ルームのフロアIDも保持する
- 共通の翻訳条件に従って`translations`を設定する

### PATCH /api/rooms/:roomId/quick-text/groups/:id

ルームの単語グループを更新する。

#### リクエスト

- params:
  - roomId: 文字列（MongoId）、必須
  - id: 文字列（MongoId）、必須
- body:
  - order: 数値（1〜100）、任意
  - title: 文字列（1〜200文字）、任意
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意
  - `order`、`title`、`lang` のいずれか1項目以上が必須

#### レスポンス

- 200 OK
- body: 更新済み `RoomQuickTextGroup`

#### エラー

- 400: INVALID_PARAMS
- 400: NO_UPDATABLE_FIELD
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `RoomQuickTextGroup`を更新する
- 共通の翻訳条件に従い、`title`または`lang`の指定時に`translations`を更新する

### DELETE /api/rooms/:roomId/quick-text/groups/:id

ルームの単語グループを削除する。

#### リクエスト

- params:
  - roomId: 文字列（MongoId）、必須
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
- グループが存在しない、または対象ルームに所属しない場合は404を返し、データを変更しない

### POST /api/rooms/:roomId/quick-text/groups/:groupId/items

ルームの単語を作成する。

#### リクエスト

- params:
  - roomId: 文字列（MongoId）、必須
  - groupId: 文字列（MongoId）、必須
- body:
  - label: 文字列（1〜200文字）、必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、必須

#### レスポンス

- 200 OK
- body: 作成済み `RoomQuickTextItem`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- 同じグループの末尾となる `order` を自動採番し、`RoomQuickTextItem`を作成する
- 対象ルームのフロアIDも保持する
- 共通の翻訳条件に従って`translations`を設定する

### PATCH /api/rooms/:roomId/quick-text/items/:id

ルームの単語を更新する。

#### リクエスト

- params:
  - roomId: 文字列（MongoId）、必須
  - id: 文字列（MongoId）、必須
- body:
  - order: 数値（1〜100）、任意
  - label: 文字列（1〜200文字）、任意
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）、任意
  - `order`、`label`、`lang` のいずれか1項目以上が必須

#### レスポンス

- 200 OK
- body: 更新済み `RoomQuickTextItem`

#### エラー

- 400: INVALID_PARAMS
- 400: NO_UPDATABLE_FIELD
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `RoomQuickTextItem`を更新する
- 共通の翻訳条件に従い、`label`または`lang`の指定時に`translations`を更新する

### DELETE /api/rooms/:roomId/quick-text/items/:id

ルームの単語を削除する。

#### リクエスト

- params:
  - roomId: 文字列（MongoId）、必須
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

- `RoomQuickTextItem`を物理削除する

## 関連資料

### 実装

- `backend/validates/quickText.validate.js`
- `backend/models/RoomQuickTextGroup.js`
- `backend/models/RoomQuickTextItem.js`
- `backend/routes/room/roomQuickText.route.js`
- `backend/middlewares/optionalRoomMetadataIdentity.js`
- `backend/services/room/roomQuickText.service.js`
- `backend/services/room/roomAccess.service.js`
- `backend/services/_shared/quickTextService.js`

### テスト

- `backend/tests/unit/services/room/roomQuickText.service.test.js`
- `backend/tests/integration/routes/room.quickText.route.int.test.js`
- `backend/tests/unit/services/_shared/quickTextService.test.js`
