# 音を鳴らすタグAPI

## 概要

`SoundTag`は、利用者が対象ルームで音を鳴らす`RoomTag`を保存する設定です。フロア・ルーム・ユーザ・`RoomTag`との関係は [ドメインモデル](../../domain-model.md) を参照してください。
共通の入力形式、認証ヘッダ、成功・エラー応答は [REST API共通規約](../api-conventions.md) を参照してください。

## 共通条件

### 共通事項

- すべてのエンドポイントでJWT必須
- `tags`は空配列を許可し、要素数の上限は設けていない
- 削除エンドポイントはない。選択を解除する場合は更新APIで`tags: []`を送信する
- 同じ`RoomTag` IDが複数指定された場合は、先頭の指定を残して重複を除去する

### 整合性検証

| 項目 | 動作 |
| --- | --- |
| フロア、ルーム、`RoomTag`のID形式 | バリデーションで確認する |
| ユーザ、フロア、ルームの実在と論理削除状態 | 共通のルームアクセス判定で確認する |
| ルームがフロアに所属すること | ルームから解決したフロアとリクエストまたは保存済み`SoundTag`のフロアを比較する |
| `RoomTag`の実在・所属・論理削除状態 | 作成・更新時に対象フロア・ルーム・`delete_flg: false`で一括確認する |
| フロア・ルームへのアクセス可否 | メンバー限定ルームのメンバー関係とキック状態を含めて確認する |
| 更新対象の所有者 | ログインユーザ本人であることを確認する |
| フロア・ルーム・ユーザの組み合わせの重複 | 作成をupsertにし、データベースの複合一意索引でも防止する |

### 複合一意索引適用時の注意

- 既存環境に同じ`floor + room + user`の`SoundTag`が複数ある場合、一意索引を作成できない
- 索引適用前に重複データの有無を確認し、設定内容を確認したうえで1件へ統合する
- 既存の重複データを自動削除する機能はない

## API

### POST /api/soundtag/

ログインユーザ自身の音を鳴らすタグ設定を取得する。

#### 認証・権限

- Bearer JWTが必須
- ログインユーザ自身の設定だけを取得できる
- [整合性検証](#整合性検証)のルームアクセス判定を適用する

#### リクエスト

- body:
  - floor_id: 文字列（MongoId）、必須
  - room_id: 文字列（MongoId）、必須

#### レスポンス

- 200 OK
- body:
  - `floor_id`、`room_id`、ログインユーザIDが一致する`SoundTag`
  - 存在しない場合は`null`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- なし

### POST /api/soundtag/create

ログインユーザ自身の音を鳴らすタグ設定を作成する。

#### 認証・権限

- Bearer JWTが必須
- ログインユーザ自身の設定だけを作成できる
- [整合性検証](#整合性検証)のルームアクセス判定を適用する

#### リクエスト

- body:
  - floor_id: 文字列（MongoId）、必須
  - room_id: 文字列（MongoId）、必須
  - tags: 配列、必須
    - 各要素: `RoomTag`のMongoId
    - 空配列を許可

#### レスポンス

- 200 OK
- body: 作成済みの`SoundTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- JWTのユーザ、ルームから解決したフロア、対象ルームを使用する
- 対象ルームへのアクセス可否と、各`RoomTag`の実在・所属・論理削除状態を保存前に確認する
- `floor + room + user`が一致する`SoundTag`をupsertし、既存設定がある場合は`tags`と`updated_at`を更新する
- `floor + room + user`には複合一意索引を設定し、同時リクエストでも重複作成を防止する

### POST /api/soundtag/update

ログインユーザ自身の音を鳴らすタグ設定を更新する。

#### 認証・権限

- Bearer JWTが必須
- ログインユーザ自身の設定だけを更新できる
- [整合性検証](#整合性検証)のルームアクセス判定を適用する

#### リクエスト

- body:
  - _id: 文字列（MongoId）、必須
  - tags: 配列、必須
    - 各要素: `RoomTag`のMongoId
    - 空配列を許可

#### レスポンス

- 200 OK
- body: 更新後の`SoundTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
  - 対象が別ユーザの設定である場合を含む
- 404: NOT_FOUND

#### データ更新・通知

- `tags`と`updated_at`を更新する
- フロア、ルーム、ユーザは変更しない
- 保存済み`SoundTag`のルームを基準にアクセス可否とフロア所属を確認する
- 各`RoomTag`の実在・所属・論理削除状態を更新前に確認する

## 関連資料

### 実装

- `backend/validates/tag.validate.js`
- `backend/models/SoundTag.js`
- `backend/routes/soundTag.route.js`
- `backend/controllers/soundTag.controller.js`
- `backend/services/soundTag.service.js`

### テスト

- `backend/tests/unit/services/soundTag.service.test.js`
- `backend/tests/integration/routes/soundTag.route.int.test.js`
- `backend/tests/unit/routes/soundTag.route.test.js`
