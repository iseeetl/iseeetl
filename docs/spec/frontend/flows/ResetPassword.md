# パスワード再設定

## 概要

- 未ログイン利用者が再設定メールを要求し、トークンを検証して新しいパスワードへ変更する流れを定義する
- アカウント有無の秘匿、レート制限、トークンの発行・置換・単回消費、既存セッション失効、メール失敗時の境界を明確にする

## 利用条件

### 対象ロール

- 主対象: パスワードを忘れた既存ユーザ
- 再設定メール送信、トークン検証、パスワード更新はいずれもJWT不要の公開APIである。再設定メール送信だけはメール配信機能を必要とする
- ゲスト、未ログイン、ログイン済みユーザ、各システムロールが発行済みトークンの検証・更新画面を利用できる
- フロアメンバー、ルームメンバー、キック状態、フロア／ルーム設定は利用可否に影響しない

### 前提

- パスワード再設定対象が論理削除されていないユーザである
- 新しい再設定メールを要求する場合はバックエンドのメール配信機能が有効で、フロントエンド公開URLが正しく設定されている
- 利用者が最新の再設定メールを受信できる
- トークンの有効期間内に新しい8〜16文字のパスワードを設定する

## 操作の流れ

### 1. 再設定メールの要求

1. メール配信が利用可能な場合、ログイン画面から`/user/sendresetpasswordlink`を開く。無効時の直接アクセスはログイン画面へ置換遷移する
   ログイン画面からの往復では入室先の`floor_id`・`room_id`を保持する。パスワード変更画面から開いた場合の復帰は[戻るボタンの仕様](../routing.md#画面内の戻るボタン)に従う。
2. メールアドレスを入力し、`POST /api/auth/resetpassword/sendmail`を実行する
3. API成功時は入力を初期化し、「パスワード再設定メールを送信しました」と通知する
4. 利用者は最新メールの`/user/resetpassword/:reset_token`を開く

- フロントエンドとバックエンドはメール形式と100文字以下を検証し、バックエンドは前後空白除去・小文字化後の値を使用する
- バックエンドはメール配信機能を最初に確認し、無効ならトークンを作成・置換する前に`503 EXTERNAL_FEATURE_DISABLED`を返す
- 有効ユーザが存在する場合だけ48文字hexのトークンを作成し、メール単位で最新1件へ置き換える
- ユーザが存在しない場合もトークンとメールを作成せず`200 OK`を返し、画面表示を同一にしてアカウント有無を秘匿する
- 既定のレート制限は1時間あたり正規化メール単位5回、IP単位20回で、ユーザが存在しない要求にも適用する
- バックエンドログにはトークン、再設定URL、メール本文、宛先を出力しない

### 2. トークン検証

1. 最新メールのURLを開くと、画面が`POST /api/auth/resetpassword/verify`を実行する
2. 検証中は読み込み状態だけを表示し、成功後に新しいパスワードと確認入力を表示する
3. 無効・期限切れなどの失敗時はパスワードを変更せず、固定エラー、「再試行」、ログイン画面へのリンクを表示する。「再試行」は同じトークンを検証し直す

有効期間は`RESET_TOKEN_TTL_MINUTES`で、既定値は60分である。検証ではトークンを消費せず、発行後にメール配信が無効になっても検証・更新できる。入力と表示状態は[パスワード再設定画面](../screens/ResetPassword.md)、トークン契約は[認証API](../../backend/api/auth.md)を参照する。

### 3. パスワード更新とトークン消費

1. 新しいパスワードと一致する確認値を入力して送信する
2. バックエンドがトークン消費とパスワード・セッション世代を同時に確定する
3. 成功時は成功文とログイン画面へのリンクを表示する。自動ログインしないため、新しいパスワードで改めてログインする

同じトークンの更新要求は1回だけ成功する。変更前のJWTは次回以降の認証で拒否され、DB更新成功直後に対象ユーザの全Socket.IO接続を切断する。保存・トークン消費・通知の順序は[認証API](../../backend/api/auth.md)を参照する。DB更新前の失敗では同じトークンで再試行できる。更新確定後に応答だけ失われた場合は同じトークンを再利用できない。

## 完了時・失敗時の動作

### 完了時

- 登録済み・未登録メールのどちらでも同じ成功応答と画面通知になり、ユーザの存在を公開しない
- メール配信が無効な場合は新しい再設定メールの入口を表示せず、直接APIを呼ばれてもトークンを作成・置換しない
- 最新の有効なトークンだけでパスワード入力画面を表示できる
- 再設定成功後はトークンを再利用できず、同じメールの残存トークンも利用できない
- 更新前のJWTは次回以降の認証で拒否され、新しいパスワードで改めてログインできる

### 失敗時

- 入力不正またはメール配信機能無効ではフロントエンドから送信APIを呼ばない。バックエンドも無効時は`503 EXTERNAL_FEATURE_DISABLED`を返す。メール・IPレート制限超過は`429`となり、フロントエンドは専用の再試行案内を表示する
- メール送信失敗では旧リンクを置換しない。送信後のDB確定に失敗すると、届いた新リンクは使用できないため画面から再要求する。並行した再発行・消費は上書きしない
- 更新前の期限・User・DBエラーではトークンを消費しない。利用可能なリンクは同じ要求で再試行できる
- 更新後の旧レコード回収・通知配送に失敗しても成功応答を維持する。未送信通知は保存せず、再配送しない
- 旧リンクの互換読込とメール失敗時の扱いは[認証処理の競合と復旧](../../backend/auth-recovery.md)を参照する

## 関連資料

### 関連仕様

- [パスワード再設定メール（SendResetPasswordLink）](../screens/SendResetPasswordLink.md)
- [パスワード再設定（ResetPassword）](../screens/ResetPassword.md)
- [ログイン画面](../screens/Login.md)
- [パスワード変更（ChangePassword）](../screens/ChangePassword.md)
- [認証API](../../backend/api/auth.md)
- [REST API共通規約](../../backend/api-conventions.md)
- [ドメインモデル](../../domain-model.md#アカウントと認証補助)
- [Socket.IO接続・イベント契約](../../socket-events.md)
- [環境変数](../../backend/environment-variables.md)
- [外部機能の有効状態API](../../backend/api/capabilities.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/api/auth.js`
- `frontend/src/utils/authError.js`
- `backend/controllers/auth.controller.js`
- `backend/models/ResetPassword.js`

### テスト

- `frontend/tests/unit/views/SendResetPasswordLink.spec.js`
- `backend/tests/integration/routes/auth.register-reset.int.test.js`
- `frontend/tests/e2e/specs/flows/account/account-lifecycle.e2e.js`
- `frontend/tests/unit/views/ResetPassword.spec.js`
- `frontend/tests/unit/api/auth.spec.js`
- `frontend/tests/e2e/specs/flows/account/send-reset-password-link.e2e.js`
- `frontend/tests/e2e/specs/flows/account/reset-password.e2e.js`
