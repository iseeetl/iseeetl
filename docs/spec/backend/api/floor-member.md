# フロアメンバーAPI

## 概要

フロアメンバーの一覧、招待、参加、削除、脱退を提供します。

フロア、メンバー、招待の関係とライフサイクルは [ドメインモデル](../../domain-model.md)、操作できるロールは [ロール・権限仕様](../../roles-and-permissions.md) を参照してください。

## 共通条件

すべてのAPIでJWTが必要です。認証エラーと認証後のユーザ再確認は[REST API共通規約](../api-conventions.md#認証情報)に従います。

### 同時参加と再参加

同じフロアへの同時参加は、起動時に作成する[メンバー関係の一意索引](../member-relationship-uniqueness.md)により1件だけ成立します。後から競合した要求は「参加済み」（`ALREADY_FLOOR_MEMBER`）を返し、脱退後の再参加は引き続き可能です。

## API

### POST /api/floormember/

フロアメンバー一覧を取得する。

#### 認証・権限

- JWT 必須
- サイト管理者、現在ロールが`Editor`である対象フロアの作成者、または対象フロアの`FloorMember`が取得できる

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - `FloorMember[]`
  - 各要素は `user` を populate した `username`, `image_name` を含む
  - 並び順: `created_at` 降順

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN

### POST /api/floormember/invite

フロア招待を作成する。

#### 認証・権限

- JWT 必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者だけが作成できる

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - period: 文字列（`8h`/`3d`/`1m`）, 必須

#### レスポンス

- 200 OK
- body:
  - 作成済み `FloorInvite`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN

#### データ更新・通知

- 招待トークン作成

### POST /api/floormember/create

招待トークンでフロアメンバーに参加する。

#### 認証・権限

- JWT 必須
- 有効なログインユーザが参加できる。ただし、対象フロアの作成者と既存`FloorMember`は参加できない

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - invite_token: 文字列, 必須

#### レスポンス

- 200 OK
- body:
  - 作成済み `FloorMember`（`floor` は populate され `title` を含む）

#### エラー

- 400: INVALID_PARAMS（入力不正、フロアが存在しない・論理削除済み、対応する招待トークンがない、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 400: DONT_NEED_FLOOR_MEMBER
- 400: INVITE_EXPIRED
- 400: ALREADY_FLOOR_MEMBER
- 401: TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- フロアメンバー登録

### POST /api/floormember/delete

フロアメンバーを削除する。

#### 認証・権限

- JWT 必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者だけが削除できる

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - floor_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - 削除済み `FloorMember`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `FloorMember`を物理削除
- 削除対象ユーザの同一フロアにある認証済みSocket接続を列挙し、接続先ルームごとに現在のアクセス権を再評価する
- アクセス権を失った接続へ`RECEIVE_COMPLETE_DELETE_ROOM_MEMBER`を通知する。切断と接続維持の条件は[Socket.IOのアクセス失効](../../socket-events.md)に従う

### POST /api/floormember/leave

フロアメンバーが脱退する。

#### 認証・権限

- JWT 必須
- 操作者自身が対象フロアの`FloorMember`である場合に脱退できる

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - 脱退済み `FloorMember`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND

#### データ更新・通知

- 操作者自身の `FloorMember`を物理削除
- 操作者の同一フロアにある認証済みSocket接続を列挙し、接続先ルームごとに現在のアクセス権を再評価する
- アクセス権を失った接続へ`RECEIVE_COMPLETE_DELETE_ROOM_MEMBER`を通知する。切断と接続維持の条件は[Socket.IOのアクセス失効](../../socket-events.md)に従う

### GET/POST /api/floormember/management/paginate

管理者がフロアメンバー一覧をページング取得する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- GET:
  - query:
    - page: 数値, 必須
- POST:
  - body:
    - page: 数値, 必須

#### レスポンス

- 200 OK
- body:
  - 1ページ10件、`created_at`降順の`paginate`形式
  - `docs`, `total`, `pages`, `page`, `nextPage`, `prevPage`など
  - `docs[].floor`は`title`、`docs[].user`は`username`をpopulateする

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 401: INVALID_PERMISSION（認証後に管理者判定用のロールが取得できない）
- 403: FORBIDDEN
- 404: NOT_FOUND（認証後の再確認で操作中の管理者が存在しない、または論理削除済み）

### POST /api/floormember/management/delete

管理者がフロアメンバーを削除する。

#### 認証・権限

- JWTとサイト管理者権限が必須
- ミドルウェアでJWTのロールを確認した後、サービスで操作者ユーザが有効かつ現在のDBロールもサイト管理者であることを再確認する

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - 削除済み `FloorMember`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 401: INVALID_PERMISSION（認証後に管理者判定用のロールが取得できない）
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `FloorMember`を物理削除する
- 親フロアの論理削除状態は削除条件にしない。親フロアを参照できない孤立レコードも、メンバーレコードのIDを特定できれば削除できる
- 削除した所属が保持するフロアIDとユーザIDを使い、同一フロアにある認証済みSocket接続のアクセス権を再評価する
- アクセス権を失った接続へ`RECEIVE_COMPLETE_DELETE_ROOM_MEMBER`を通知する。切断と接続維持の条件は[Socket.IOのアクセス失効](../../socket-events.md)に従う

## 関連資料

### 実装

- `backend/routes/floor/floorMember.route.js`
- `backend/controllers/floor/floorMember.controller.js`
- `backend/services/floor/floorMember.service.js`
- `backend/socket/accessControl.js`
- `backend/socket/roomPresence.js`

### テスト

- `backend/tests/unit/routes/floor/floorMember.route.test.js`
- `backend/tests/unit/services/floor/floorMember.service.test.js`
- `backend/tests/integration/routes/member.crud.int.test.js`
- `backend/tests/unit/socket/accessControl.test.js`
