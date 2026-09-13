# ルームメンバーAPI

## 概要

ルームメンバーの一覧、招待、参加、削除、脱退を提供します。

フロア、ルーム、メンバー、招待の関係とライフサイクルは [ドメインモデル](../../domain-model.md)、操作できるロールは [ロール・権限仕様](../../roles-and-permissions.md) を参照してください。

## 共通条件

すべてのAPIでJWTが必要です。認証エラーと認証後のユーザ再確認は[REST API共通規約](../api-conventions.md#認証情報)に従います。

### 同時参加と再参加

同じルームへの同時参加は、起動時に作成する[メンバー関係の一意索引](../member-relationship-uniqueness.md)により1件だけ成立します。後から競合した要求は「参加済み」（`ALREADY_ROOM_MEMBER`）を返し、脱退後の再参加は引き続き可能です。

## API

### POST /api/roommember/

ルームメンバー一覧を取得する。

#### 認証・権限

- JWT 必須
- サイト管理者、現在ロールが`Editor`である対象フロアの作成者、対象フロアの`FloorMember`、または対象ルームの`RoomMember`が取得できる

#### リクエスト

- body:
  - room_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - `RoomMember[]`
  - 各要素は `user` を populate した `username`, `image_name` を含む
  - 並び順: `created_at` 降順

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象ルーム・所属フロアが存在しない・論理削除済み、または認証後の再確認でログインユーザが存在しない・論理削除済み）

### POST /api/roommember/invite

ルーム招待を作成する。

#### 認証・権限

- JWT 必須
- サイト管理者、現在ロールが`Editor`である対象フロアの作成者、または対象フロアの`FloorMember`が作成できる

#### リクエスト

- body:
  - room_id: 文字列(MongoId), 必須
  - period: 文字列（`8h`/`3d`/`1m`）, 必須

#### レスポンス

- 200 OK
- body:
  - 作成済み `RoomInvite`

#### エラー

- 400: INVALID_PARAMS
- 403: FORBIDDEN
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND（対象ルーム・所属フロアが存在しない・論理削除済み、または認証後の再確認でログインユーザが存在しない・論理削除済み）

#### データ更新・通知

- 招待トークン作成

### POST /api/roommember/create

招待トークンでルームメンバーに参加する。

#### 認証・権限

- JWT 必須
- 有効なログインユーザが参加できる。ただし、対象フロアの作成者と既存`FloorMember`は参加できない

#### リクエスト

- body:
  - room_id: 文字列(MongoId), 必須
  - invite_token: 文字列, 必須

#### レスポンス

- 200 OK
- body:
  - 作成済み `RoomMember`（`room` は populate され `title` を含む）

#### エラー

- 400: INVALID_PARAMS
- 400: INVITE_EXPIRED
- 400: FLOOR_EDITOR_NOT_REQUIRD
- 400: FLOOR_MEMBER_NOT_REQUIRD
- 400: ALREADY_ROOM_MEMBER
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND（ルーム・フロアが存在しない・論理削除済み、対応する招待トークンがない、または認証後の再確認でログインユーザが存在しない・論理削除済み）

#### データ更新・通知

- ルームメンバー登録

### POST /api/roommember/delete

ルームメンバーを削除する。

#### 認証・権限

- JWT 必須
- サイト管理者、現在ロールが`Editor`である対象フロアの作成者、または対象ルームの作成者が削除できる

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - 削除済み `RoomMember`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `RoomMember`を物理削除
- 削除対象ユーザの同一フロアにある認証済みSocket接続を列挙し、接続先ルームごとに現在のアクセス権を再評価する
- アクセス権を失った接続へ`RECEIVE_COMPLETE_DELETE_ROOM_MEMBER`を通知する。切断と接続維持の条件は[Socket.IOのアクセス失効](../../socket-events.md)に従う

### POST /api/roommember/leave

ルームメンバーが脱退する。

#### 認証・権限

- JWT 必須
- 操作者自身が対象ルームの`RoomMember`である場合に脱退できる

#### リクエスト

- body:
  - room_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - 脱退済み `RoomMember`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND

#### データ更新・通知

- 操作者自身の `RoomMember`を物理削除
- 操作者の同一フロアにある認証済みSocket接続を列挙し、接続先ルームごとに現在のアクセス権を再評価する
- アクセス権を失った接続へ`RECEIVE_COMPLETE_DELETE_ROOM_MEMBER`を通知する。切断と接続維持の条件は[Socket.IOのアクセス失効](../../socket-events.md)に従う

### POST /api/roommember/contains

ユーザがルームメンバーに含まれるか判定する。

#### 認証・権限

- JWT 必須
- 有効なログインユーザが自身の所属状態を確認できる

#### リクエスト

- body:
  - room_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - `true` / `false`（対象ルームのメンバー有無）

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND（対象ルーム・所属フロアが存在しない・論理削除済み、または認証後の再確認でログインユーザが存在しない・論理削除済み）

### GET/POST /api/roommember/management/paginate

管理者がルームメンバー一覧をページング取得する。

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
  - `docs[].room`は`title`、`docs[].user`は`username`をpopulateする

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 401: INVALID_PERMISSION（認証後に管理者判定用のロールが取得できない）
- 403: FORBIDDEN
- 404: NOT_FOUND（認証後の再確認で操作中の管理者が存在しない、または論理削除済み）

### POST /api/roommember/management/delete

管理者がルームメンバーを削除する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - 削除済み `RoomMember`

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 401: INVALID_PERMISSION（認証後に管理者判定用のロールが取得できない）
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `RoomMember`を物理削除
- 削除対象ユーザの同一フロアにある認証済みSocket接続を列挙し、接続先ルームごとに現在のアクセス権を再評価する
- アクセス権を失った接続へ`RECEIVE_COMPLETE_DELETE_ROOM_MEMBER`を通知する。切断と接続維持の条件は[Socket.IOのアクセス失効](../../socket-events.md)に従う

## 関連資料

### 実装

- `backend/routes/room/roomMember.route.js`
- `backend/controllers/room/roomMember.controller.js`
- `backend/services/room/roomMember.service.js`
- `backend/socket/accessControl.js`
- `backend/socket/roomPresence.js`

### テスト

- `backend/tests/unit/routes/room/roomMember.route.test.js`
- `backend/tests/unit/services/room/roomMember.service.test.js`
- `backend/tests/integration/routes/member.crud.int.test.js`
- `backend/tests/unit/socket/accessControl.test.js`
