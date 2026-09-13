# ルーム招待受諾

## 概要

- 招待URLの発行、共有、ログインユーザによる受諾、ルームメンバー参加後のタイムライン到達までを定義する

## 利用条件

### 対象ロール

- 招待発行者
  - Administrator
  - 現在ロールがEditorである対象フロアの作成者
  - 対象フロアメンバー
- 招待受諾者
  - 対象フロアの作成者、フロアメンバー、既存の対象ルームメンバーのいずれでもない有効なログインユーザ
  - システムロール自体は制限せず、Administrator、Editor、Author／developerを含む
- 未ログイン／ゲストは招待URLを開けるが、そのままでは受諾できない

### 前提

- 招待対象ルームと所属フロアが有効である
- 通常画面では対象ルームが`member_only=true`であり、発行者がルーム一覧の対象カードにある「ルームメンバー招待」を開ける
- 受諾者がログイン可能なユーザアカウントを持つ

## 操作の流れ

### 招待URLの発行

1. 発行者が対象フロアのルーム一覧を開き、対象のメンバー限定ルームカードにある「ルームメンバー招待」を選ぶ
2. 招待ダイアログで有効期間`8h`、`3d`、`1m`のいずれかを選ぶ。既定値は`8h`
3. 招待URLを発行して画面へ表示し、必要に応じてクリップボードへコピーする

### 招待URLの受諾

1. 受諾者は先にログインした状態で招待URLを開く
2. `CompleteRoomInvite`がURLのルームIDとトークンを`POST /api/roommember/create`へ送り、URLのフロアIDは送らない
3. 参加APIが招待と利用者の参加条件を確認する
4. API完了までは`aria-busy=true`の読み込み状態だけを表示し、結果とリンクを表示しない
5. `RoomMember`を作成し、API成功後に参加完了メッセージとURL由来のタイムラインリンクを表示する
6. 受諾者が「ルームへ移動する」を選ぶと`/floor/:floor_id/room/:room_id`へ移動する

- 未ログインで開いた場合は401でログイン画面へ移る。ログイン後に招待URLへ自動復帰しないため、元のURLを再度開く必要がある
- トークンは参加成功時に消費せず、有効期限内は別ユーザや脱退後の同一ユーザも利用できる
- 招待レコードの失効・一覧・削除、使用回数の制限、期限切れ後の自動削除は行わない
- バックエンド受諾APIは`member_only`を検査しないため、API上は公開ルームにも参加できる

招待トークンの形式、発行・参加API、期限・参加条件の検査は[ルームメンバーAPI](../../backend/api/room-member.md)を参照する。

## 完了時・失敗時の動作

### 完了時

- ルームメンバー参加後、対象のメンバー限定ルームへ入室できる
- ルーム一覧の対象カードからルームメンバー一覧を確認でき、対象ルームのタイムラインから本人の脱退を利用できる
- フロア作成者、フロアメンバー、参加済みユーザは重複するルームメンバーを作成しない

### 失敗時

- 認証時にログインユーザが存在しない・論理削除済みの場合は401 `TOKEN_INVALID`となる。401はログアウト後にログイン画面へ遷移する
- 形式不正なID／トークンは`INVALID_PARAMS`となる
- ルーム・フロアが存在しない・論理削除済み、またはルームとフロアに一致するトークンがなければ404 `NOT_FOUND`となる
- 認証成功後の再確認でログインユーザが存在しない・論理削除済みの場合も404 `NOT_FOUND`となる
- 期限切れは`INVITE_EXPIRED`、フロア作成者は`FLOOR_EDITOR_NOT_REQUIRD`、フロアメンバーは`FLOOR_MEMBER_NOT_REQUIRD`、参加済みは`ALREADY_ROOM_MEMBER`となる
- API失敗時はインラインエラーとフロア一覧リンクを表示し、再試行ボタンは提供しない
- 必須のフロアID、ルームID、トークンのいずれかが文字列でなければ参加APIを呼ばず、同じエラーとフロア一覧リンクを表示する

### 同時参加と再参加

同じルームへの同時参加は、DBの一意索引適用後に1件だけ成立します。後から競合した要求は「参加済み」（`ALREADY_ROOM_MEMBER`）を返し、脱退後の再参加は引き続き可能です。

## 関連資料

### 関連仕様

- [ルーム招待の参加完了（CompleteRoomInvite）](../screens/CompleteRoomInvite.md)
- [ルーム](../screens/Room.md)
- [タイムライン](../screens/Timeline.md)
- [ログイン画面](../screens/Login.md)

### 実装

- `frontend/src/views/Room.vue`
- `frontend/src/components/room-member/InviteRoomMemberDialog.vue`
- `frontend/src/api/roomMember.js`
- `frontend/src/utils/authError.js`
- `backend/models/RoomInvite.js`

### テスト

- `frontend/tests/unit/views/CompleteRoomInvite.spec.js`
- `backend/tests/integration/routes/member.crud.int.test.js`
- `frontend/tests/e2e/specs/flows/invite/invite-room-success.e2e.js`
- `frontend/tests/unit/api/roomMember.spec.js`
- `frontend/tests/unit/components/room-member/InviteRoomMemberDialog.spec.js`
- `frontend/tests/e2e/specs/flows/invite/invite-invalid.e2e.js`
- `frontend/tests/e2e/specs/flows/invite/invite-authenticated-rejection.e2e.js`
