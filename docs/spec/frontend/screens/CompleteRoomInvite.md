# ルーム招待の参加完了（/floor/:floor_id/room/:room_id/invite/:invite_token）

## 概要

- ルーム招待URLを開いたログインユーザを対象ルームのルームメンバーとして登録し、成功または失敗を表示する
- 招待URLの発行から受諾までの導線は[ルーム招待受諾フロー](../flows/RoomInvite.md)を参照する

## 利用条件・開き方

- ルーム一覧のメンバー限定ルームカードにある「ルームメンバー招待」で発行・コピーしたURL、または共有されたURLへの直接アクセス

### URL

- パス: `/floor/:floor_id/room/:room_id/invite/:invite_token`
- ルート名: `CompleteRoomInvite`
- コンポーネント: `frontend/src/views/CompleteRoomInvite.vue`
- メタ情報: `isPublic: true`, `title: 'ルームメンバー参加完了'`
- 公開ルートであるため未ログインでも画面は開けるが、受諾APIはJWT必須であり、参加できるのは有効なログインユーザだけである

- 招待URLはフロントエンドオリジンではなく`API_BASE_URL`を連結し、未設定時は相対URLとなる

### 参加条件

| 利用者の状態 | 結果 |
| --- | --- |
| 未ログイン／ゲスト | APIが401となり、ログアウト処理後にログイン画面へ遷移する |
| 対象フロアの作成者 | `FLOOR_EDITOR_NOT_REQUIRD`で参加しない |
| 対象フロアメンバー | `FLOOR_MEMBER_NOT_REQUIRD`で参加しない |
| 既存の対象ルームメンバー | `ALREADY_ROOM_MEMBER`で重複参加しない |
| 上記以外の有効なログインユーザ | 有効なルーム・フロアと招待トークンであれば参加できる |

- 参加判定はシステムロール名だけでは制限しない。AdministratorやEditorも、対象フロアの作成者、フロアメンバー、既存ルームメンバーでなければ参加できる
- 対象ユーザ、ルーム、所属フロアは`delete_flg=false`である必要がある
- バックエンドの参加APIはルームの`member_only`を検査しない。公開ルームでも有効な招待トークンがあればルームメンバーを作成できる

## 画面構成

- 常に表示するもの
  - H1「ルームメンバー参加完了」
  - 戻るボタンは設置しない
- 処理中
  - `role=status`の「読み込み中です」
  - 成功／失敗メッセージとリンクは表示しない
- 成功時
  - `<ルームの原文タイトル> ルームのメンバーに参加しました`
  - メンバー限定ルームへ入室できる旨
  - 「ルームへ移動する」リンク
- 失敗時
  - `.error-color`のエラーメッセージ
  - 「フロア一覧へ移動する」リンク

## 操作と動作

- 招待トークンは参加成功後も削除・使用済みにせず、期限内なら複数ユーザや脱退後の同一ユーザが再利用できる

### 初期表示と操作

1. `created`で`:floor_id`、`:room_id`、`:invite_token`を保存する
2. 3項目が文字列なら`POST /api/roommember/create`を自動実行する
3. リクエストには`:room_id`と`:invite_token`だけを含め、`:floor_id`は送らない
4. API完了までは読み込み中の状態だけを表示し、成功／失敗の結果とリンクを表示しない
5. 成功時はレスポンスのルーム原文タイトルを保存し、参加完了メッセージと「ルームへ移動する」を表示する
6. 利用者がリンクを選ぶとURL由来の`/floor/:floor_id/room/:room_id`へ移動する
7. 失敗時はエラーコードに対応する翻訳済みメッセージを付加し、「フロア一覧へ移動する」を表示する
8. 必須パラメータが文字列でなければAPIを呼ばず、失敗メッセージとフロア一覧リンクを表示する

- 画面から受諾を開始するボタンはなく、URLを開くと自動実行する
- API多重実行は`data`に定義した`this.sending`で抑止する
- 成功してもタイムラインへ自動遷移しない

### 同時参加と再参加

同じルームへの同時参加は、DBの一意索引適用後に1件だけ成立します。後から競合した要求は「参加済み」（`ALREADY_ROOM_MEMBER`）を返し、脱退後の再参加は引き続き可能です。

## 通信・エラー時の動作

### 使用するAPI

#### ルームメンバー参加

- `POST /api/roommember/create`へユーザJWTと`room_id`と`invite_token`（`floor_id`は送らない）を送る
- 応答の`room.title`を成功表示に使う。遷移先のフロアIDとルームIDはURLから取得する
- トークン形式、期限、メンバー作成と副作用は[ルームメンバーAPI](../../backend/api/room-member.md)を参照する

#### 主なエラー

| HTTP | コード | 条件 |
| --- | --- | --- |
| 400 | `INVALID_PARAMS` | ID／トークン形式不正 |
| 400 | `INVITE_EXPIRED` | 招待期限切れ |
| 400 | `FLOOR_EDITOR_NOT_REQUIRD` | 対象フロアの作成者 |
| 400 | `FLOOR_MEMBER_NOT_REQUIRD` | 対象フロアメンバー |
| 400 | `ALREADY_ROOM_MEMBER` | 参加済み |
| 401 | `TOKEN_INVALID` / `TOKEN_EXPIRED` | 未ログイン、期限切れ・無効なJWT、無効なセッション、ログインユーザの不存在・論理削除 |
| 404 | `NOT_FOUND` | ルーム・フロアが存在しない・論理削除済み、またはルームとフロアに一致するトークンがない |

認証成功後の再確認でログインユーザが存在しない・論理削除済みの場合は、404 `NOT_FOUND`となります。

### 読み込み中・データなし・エラー時

- API処理中は`.view-content`を`aria-busy=true`とし、`role=status`の「読み込み中です」だけを表示する
- 成功メッセージとルームリンクは、API成功後にURL由来のフロア／ルームID、レスポンスのルームタイトル、メッセージが揃ってから表示する
- 必須パラメータ欠落またはAPI失敗時は`role=alert`の失敗メッセージとフロア一覧リンクを表示する
- 401以外は画面に留まり、失敗メッセージとフロア一覧リンクを表示する。再試行ボタンはない
- 401では失敗状態を設定した後、共通認証エラー処理が`doLogout`を実行してログイン画面へ遷移する
- ログイン画面は招待URLを保存・復元せず、通常ログイン後はフロア一覧へ遷移する。参加するにはログイン後に元の招待URLをもう一度開く必要がある

## 関連資料

### 関連仕様

- [ルーム招待受諾フロー](../flows/RoomInvite.md)
- [ルーム](Room.md)
- [タイムライン](Timeline.md)
- [ログイン画面](Login.md)
- [ロール・権限](../../roles-and-permissions.md)
- [ルームメンバー API](../../backend/api/room-member.md)
- [フロントエンドAPIクライアント](../api.md)
- [フロントエンドエラー処理](../error-handling.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/views/CompleteRoomInvite.vue`
- `frontend/src/views/Room.vue`
- `frontend/src/components/room-member/InviteRoomMemberDialog.vue`
- `frontend/src/api/roomMember.js`

### テスト

- `frontend/tests/unit/views/CompleteRoomInvite.spec.js`
- `backend/tests/integration/routes/member.crud.int.test.js`
- `frontend/tests/e2e/specs/flows/invite/invite-room-success.e2e.js`
- `frontend/tests/unit/api/roomMember.spec.js`
- `frontend/tests/unit/components/room-member/InviteRoomMemberDialog.spec.js`
