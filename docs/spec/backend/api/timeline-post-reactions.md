# タイムラインAPI：投稿リアクション

## 概要

認証、入室権限、プッシュ通知、メディアの扱いは[タイムラインAPI共通仕様](timeline.md)を参照してください。

## API

### POST /api/chat/reaction

投稿にリアクションを追加する。

#### 認証・権限

- JWT必須
- 投稿が属するルームへの入室権限が必要。条件は[ルーム入室判定](../../roles-and-permissions.md#ルーム入室判定)を参照する

#### リクエスト

- body:
  - `post_id`: 文字列(MongoId), 必須
  - `type`: `いいね` / `超いいね` / `拍手` / `笑顔` / `びっくり`, 必須

#### レスポンス

- 200 OK
- body: リアクション追加後の`Chat`
- 投稿、付加情報、リアクション、返信のユーザ情報を用途に応じて展開
- 論理削除済みの返信、投稿付加情報、返信付加情報は配列から除外

#### エラー

- 400: INVALID_PARAMS（入力不正、投稿・ルーム・フロアが無効、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: INVALID_PERMISSION（キック済み、またはメンバー限定ルームへの入室権限がない）
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 409: CONFLICT（同じユーザが同じ種別のリアクションを追加済み）

#### データ更新・通知

- 投稿の`reactions`へJWTのユーザIDと種別を追加
- Socket.IOの`REACTION_CREATE`を対象ルームへ送信

### POST /api/chat/reaction/delete

投稿のリアクションを削除する。

#### 認証・権限

- JWT必須
- 投稿が属するルームへの入室権限が必要。条件は[ルーム入室判定](../../roles-and-permissions.md#ルーム入室判定)を参照する
- `Administrator`、対象フロアを作成した`Editor`、対象フロアの`FloorMember`、またはリアクションを追加した本人
- `RoomMember`であることだけでは、他ユーザのリアクションを削除できない

#### リクエスト

- body:
  - `post_id`: 文字列(MongoId), 必須
  - `reaction_id`: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: リアクション削除後の`Chat`
- 論理削除済みの返信、投稿付加情報、返信付加情報は配列から除外

#### エラー

- 400: INVALID_PARAMS（入力不正、投稿・ルーム・フロアが無効、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: INVALID_PERMISSION（ルーム入室不可、またはリアクションの削除権限がない）
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND（対象リアクションが存在しない）

#### データ更新・通知

- 投稿の`reactions`から対象リアクションを物理削除
- Socket.IOの`REACTION_DELETE`を対象ルームへ送信

## 関連資料

### 実装

- `backend/routes/timeline/postReactions.route.js`
- `backend/services/timeline/postReactions.service.js`
- `backend/services/timeline/shared/reactionHelpers.js`

### テスト

- `backend/tests/integration/routes/timeline.core.int.test.js`
- `backend/tests/unit/services/timeline/postReactions.service.test.js`
- `frontend/tests/e2e/specs/flows/timeline/reaction.e2e.js`
