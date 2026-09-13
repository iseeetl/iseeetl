# フロア招待の参加完了（/floor/:floor_id/invite/:invite_token）

## 概要

- フロア招待URLを開いたログインユーザを対象フロアのフロアメンバーとして登録し、成功または失敗を表示する
- 招待URLの発行から受諾までの導線は[フロア招待受諾フロー](../flows/FloorInvite.md)を参照する

## 利用条件・開き方

- ルーム一覧の「フロアメンバー招待」で発行・コピーしたURL、または共有されたURLへの直接アクセス

### URL

- パス: `/floor/:floor_id/invite/:invite_token`
- ルート名: `CompleteFloorInvite`
- コンポーネント: `frontend/src/views/CompleteFloorInvite.vue`
- メタ情報: `isPublic: true`, `title: 'フロアメンバー参加完了'`
- 公開ルートであるため未ログインでも画面は開けるが、受諾APIはJWT必須であり、参加できるのは有効なログインユーザだけである

- 招待URLはフロントエンドオリジンではなく`API_BASE_URL`を連結し、未設定時は相対URLとなる

### 参加条件

| 利用者の状態 | 結果 |
| --- | --- |
| 未ログイン／ゲスト | APIが401となり、ログアウト処理後にログイン画面へ遷移する |
| 対象フロアの作成者 | `DONT_NEED_FLOOR_MEMBER`で参加しない |
| 既存の対象フロアメンバー | `ALREADY_FLOOR_MEMBER`で重複参加しない |
| 上記以外の有効なログインユーザ | 有効なフロアと招待トークンであれば参加できる |

- 参加判定はシステムロール名だけでは制限しない。AdministratorやEditorも、対象フロアの作成者または既存フロアメンバーでなければ参加できる
- 対象ユーザとフロアは`delete_flg=false`である必要がある
- フロアが一覧上で非表示でも、アクティブで有効な招待であれば参加できる。参加後はフロアメンバーとして非表示フロアを一覧表示できる

## 画面構成

- 常に表示するもの
  - H1「フロアメンバー参加完了」
  - 戻るボタンは設置しない
- 処理中
  - `role=status`の「読み込み中です」
  - 成功／失敗メッセージとリンクは表示しない
- 成功時
  - `<フロアの原文タイトル> フロアのメンバーに参加しました`
  - フロアメンバーとしてルームの作成・更新・削除を行える旨
  - 「フロアへ移動する」リンク
- 失敗時
  - `.error-color`のエラーメッセージ
  - 「フロア一覧へ移動する」リンク

## 操作と動作

- 招待トークンは参加成功後も削除・使用済みにせず、期限内なら複数ユーザや脱退後の同一ユーザが再利用できる

### 初期表示と操作

1. `created`で`:floor_id`と`:invite_token`を取得する
2. 両方が文字列なら`POST /api/floormember/create`を自動実行する
3. API完了までは読み込み中の状態だけを表示し、成功／失敗の結果とリンクを表示しない
4. 成功時はレスポンスのフロアIDと原文タイトルを保存し、参加完了メッセージと「フロアへ移動する」を表示する
5. 利用者がリンクを選ぶと`/floor/<response.floor._id>`へ移動する
6. 失敗時はエラーコードに対応する翻訳済みメッセージを付加し、「フロア一覧へ移動する」を表示する
7. 必須パラメータが文字列でなければAPIを呼ばず、失敗メッセージとフロア一覧リンクを表示する

- 画面から受諾を開始するボタンはなく、URLを開くと自動実行する
- API多重実行は`data`に定義した`this.sending`で抑止する
- 成功してもフロア一覧またはルーム一覧へ自動遷移しない

### 同時参加と再参加

同じフロアへの同時参加は、DBの一意索引適用後に1件だけ成立します。後から競合した要求は「参加済み」（`ALREADY_FLOOR_MEMBER`）を返し、脱退後の再参加は引き続き可能です。

## 通信・エラー時の動作

### 使用するAPI

#### フロアメンバー参加

- `POST /api/floormember/create`へユーザJWTと`floor_id`と`invite_token`を送る
- 応答の`floor._id`と`floor.title`を成功表示と遷移先に使う
- トークン形式、期限、メンバー作成と副作用は[フロアメンバーAPI](../../backend/api/floor-member.md)を参照する

#### 主なエラー

| HTTP | コード | 条件 |
| --- | --- | --- |
| 400 | `INVALID_PARAMS` | ID／トークン形式不正、フロア／トークン不在、フロアが論理削除済み |
| 400 | `INVITE_EXPIRED` | 招待期限切れ |
| 400 | `DONT_NEED_FLOOR_MEMBER` | 対象フロアの作成者 |
| 400 | `ALREADY_FLOOR_MEMBER` | 参加済み |
| 401 | `TOKEN_INVALID` / `TOKEN_EXPIRED` | 未ログイン、期限切れ・無効なJWT、無効なセッション、ログインユーザの不存在・論理削除 |

認証成功後の再確認でログインユーザが存在しない・論理削除済みの場合は、400 `INVALID_PARAMS`となります。

### 読み込み中・データなし・エラー時

- API処理中は`.view-content`を`aria-busy=true`とし、`role=status`の「読み込み中です」だけを表示する
- 成功メッセージとフロアリンクは、API成功後にレスポンスのフロアIDとメッセージが揃ってから表示する
- 必須パラメータ欠落またはAPI失敗時は`role=alert`の失敗メッセージとフロア一覧リンクを表示する
- 401以外は画面に留まり、失敗メッセージとフロア一覧リンクを表示する。再試行ボタンはない
- 401では失敗状態を設定した後、共通認証エラー処理が`doLogout`を実行してログイン画面へ遷移する
- ログイン画面は招待URLを保存・復元せず、通常ログイン後はフロア一覧へ遷移する。参加するにはログイン後に元の招待URLをもう一度開く必要がある

## 関連資料

### 関連仕様

- [フロア招待受諾フロー](../flows/FloorInvite.md)
- [フロア](Floor.md)
- [ルーム](Room.md)
- [ログイン画面](Login.md)
- [ロール・権限](../../roles-and-permissions.md)
- [フロアメンバー API](../../backend/api/floor-member.md)
- [フロントエンドAPIクライアント](../api.md)
- [フロントエンドエラー処理](../error-handling.md)

### 実装

- `frontend/src/routes/public.js`
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
