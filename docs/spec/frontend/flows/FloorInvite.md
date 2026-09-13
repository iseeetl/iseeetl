# フロア招待受諾

## 概要

- 招待URLの発行、共有、ログインユーザによる受諾、フロアメンバー参加後のルーム一覧到達までを定義する

## 利用条件

### 対象ロール

- 招待発行者
  - Administrator
  - 現在ロールがEditorである対象フロアの作成者
- 招待受諾者
  - 対象フロアの作成者でも既存フロアメンバーでもない有効なログインユーザ
  - システムロール自体は制限せず、Administrator、Editor、Author／developerを含む
- 未ログイン／ゲストは招待URLを開けるが、そのままでは受諾できない

### 前提

- 招待対象フロアが有効である
- 発行者がルーム一覧から「フロアメンバー招待」を開ける
- 受諾者がログイン可能なユーザアカウントを持つ

## 操作の流れ

### 招待URLの発行

1. 発行者が対象フロアのルーム一覧を開く
2. ダイアログの「対象フロア」を確認し、有効期間`8h`、`3d`、`1m`のいずれかを選ぶ。既定値は`8h`
3. 招待URLを発行し、読み取り専用欄へ表示する
4. 発行後に有効期間を変更した場合はコピーを無効化して再発行を案内し、発行時と同じ期間の場合だけコピーできる

### 招待URLの受諾

1. 受諾者は先にログインした状態で招待URLを開く
2. `CompleteFloorInvite`が`POST /api/floormember/create`を自動実行する
3. 参加APIが招待と利用者の参加条件を確認する
4. API完了までは`aria-busy=true`の読み込み状態だけを表示し、結果とリンクを表示しない
5. `FloorMember`を作成し、API成功後に参加完了メッセージと対象フロアのルーム一覧リンクを表示する
6. 受諾者が「フロアへ移動する」を選ぶと`/floor/:floor_id`へ移動する

- 未ログインで開いた場合は401でログイン画面へ移る。ログイン後に招待URLへ自動復帰しないため、元のURLを再度開く必要がある
- トークンは参加成功時に消費せず、有効期限内は別ユーザや脱退後の同一ユーザも利用できる
- 招待レコードの失効・一覧・削除、使用回数の制限、期限切れ後の自動削除は行わない

招待トークンの形式、発行・参加API、期限・参加条件の検査は[フロアメンバーAPI](../../backend/api/floor-member.md)を参照する。

## 完了時・失敗時の動作

### 完了時

- フロアメンバー参加後、非表示フロアをフロア一覧で確認できる
- 対象フロア配下でフロアメンバーに許可されたルーム作成・更新・削除、ルームメンバー招待などを利用できる
- フロア作成者と参加済みユーザは重複するフロアメンバーを作成しない

### 失敗時

- 認証時にログインユーザが存在しない・論理削除済みの場合は401 `TOKEN_INVALID`となる。401はログアウト後にログイン画面へ遷移する
- 形式不正・未知・別フロア用トークン、存在しない・論理削除済みのフロアは400 `INVALID_PARAMS`となる
- 認証成功後の再確認でログインユーザが存在しない・論理削除済みの場合も400 `INVALID_PARAMS`となる
- 期限切れは`INVITE_EXPIRED`、フロア作成者は`DONT_NEED_FLOOR_MEMBER`、参加済みは`ALREADY_FLOOR_MEMBER`となる
- API失敗時はインラインエラーとフロア一覧リンクを表示し、再試行ボタンは提供しない
- 必須のフロアIDまたはトークンが文字列でなければ参加APIを呼ばず、同じエラーとフロア一覧リンクを表示する

### 同時参加と再参加

同じフロアへの同時参加は、DBの一意索引適用後に1件だけ成立します。後から競合した要求は「参加済み」（`ALREADY_FLOOR_MEMBER`）を返し、脱退後の再参加は引き続き可能です。

## 関連資料

### 関連仕様

- [フロア招待の参加完了（CompleteFloorInvite）](../screens/CompleteFloorInvite.md)
- [フロア](../screens/Floor.md)
- [ルーム](../screens/Room.md)
- [ログイン画面](../screens/Login.md)

### 実装

- `frontend/src/views/Room.vue`
- `frontend/src/components/floor-member/InviteFloorMemberDialog.vue`
- `frontend/src/api/floorMember.js`
- `frontend/src/utils/authError.js`
- `backend/models/FloorInvite.js`

### テスト

- `frontend/tests/unit/views/CompleteFloorInvite.spec.js`
- `backend/tests/integration/routes/member.crud.int.test.js`
- `frontend/tests/e2e/specs/flows/invite/invite-floor-success.e2e.js`
- `frontend/tests/unit/api/floorMember.spec.js`
- `frontend/tests/unit/components/floor-member/InviteFloorMemberDialog.spec.js`
- `frontend/tests/e2e/specs/flows/invite/invite-invalid.e2e.js`
- `frontend/tests/e2e/specs/flows/invite/invite-authenticated-rejection.e2e.js`
