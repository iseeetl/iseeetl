# ユーザ登録から本登録まで

## 概要

- 未登録の利用者が仮登録し、メール内のトークンでユーザを作成してログイン画面または元のルームへ進む流れを定義する
- 登録画面と有効化画面をまたぐクエリ、トークン、メール、永続データを明確にする

## 利用条件

### 対象ロール

- 主対象: ユーザを持たない未ログイン利用者
- `/register`と`/user/activate/:invite_token`は公開ルートである。`/register`はメール配信が利用可能な場合だけ表示・送信できるが、発行済みトークンのアクティベーションはメール配信を後から無効にしても利用できる
- フロアメンバー、ルームメンバー、キック状態、フロア／ルーム公開設定は画面自体の利用可否に影響しない

### 前提

- 利用者がユーザ登録に使用できるメールアドレスを持つ
- バックエンドのメール配信機能が有効で、フロントエンド公開URLが正しく設定されている
- ルームから登録へ誘導する場合、`room_id`は有効なMongoDB ObjectIdである
- 利用規約、プライバシーポリシー、Cookieポリシーの内容を確認し、フロントエンドの同意チェックを有効にする

## 操作の流れ

### 1. ユーザ登録への遷移と入力

1. メール配信が利用可能な場合、ログイン画面から`/register`を開く。無効時の直接アクセスはクエリを保持してログイン画面へ置換遷移する
2. ログイン画面から渡された`floor_id`と`room_id`は、ユーザ登録内の利用規約・プライバシーポリシー・Cookieポリシーへのリンクへ引き継ぐ
3. ユーザ名、メール、パスワードを入力し、3文書への同意を選択して登録する
4. フロントエンドは`room_id`だけを`POST /api/auth/register`へ送信し、`floor_id`は登録ペイロードへ含めない

- ユーザ名は1〜20文字、メールは100文字以下のメール形式、パスワードは8〜16文字とする
- 規約同意はフロントエンドだけで検査し、文書の版・同意日時を含め、バックエンドの入力やUserTemp・Userには保存しない
- 送信中は3入力欄と登録ボタンを無効化し、二重送信を抑止する

### 2. 仮登録とメール通知

1. バックエンドが仮登録を受け付け、有効化URLをメールで送る
2. `room_id`を指定した場合は有効化URLへ引き継ぐ。有効なルームとフロアを解決できれば、メールにタイムラインリンクも付ける
3. 利用者はメールの有効化URLを開く。有効期間は`SIGNUP_TOKEN_TTL_MINUTES`で、既定値は60分である

仮ユーザの保存、トークン発行、重複・期限の検査は[認証API](../../backend/api/auth.md)を参照する。メール再送の専用操作はない。同じメールアドレスで複数の仮登録が存在する場合の扱いは[失敗時](#失敗時)を参照する。

### 3. 仮登録完了から有効化URLへ

1. 登録API成功後、フロントエンドが入力値と同意状態を初期化し、「ユーザ仮登録完了」ダイアログを表示する
2. ダイアログで「ログインページへ」を選ぶとクエリなしの`/login`へ移動する
3. 利用者は受信メールの`/user/activate/:invite_token`を別途開く

- 登録成功ダイアログからログイン画面へ移る時点では、元の`floor_id`と`room_id`を引き継がない
- 対象ルームの情報はメール内の有効化URLに含まれる`room_id`によって再開する

### 4. 本登録と次の画面

1. 有効化URLを開くと、画面が`POST /api/auth/activate`を自動実行する
2. API完了までは読み込み中を表示し、完了後に成功または失敗のダイアログを表示する
3. 成功時は「ログインページへ」からログインする。応答にフロアIDとルームIDがあれば、ログイン後の遷移先として引き継ぐ
4. フロア・ルームそれぞれのIDとタイトルが揃う場合は、タイムラインへの直接リンクも表示する。未ログインで入室できるのは公開ルームだけである

有効化では自動ログインしない。同じトークンによる有効化は、有効期限内なら登録済みユーザを確認して残りの処理を再実行できる。ルーム情報が欠ける場合の表示条件と画面操作は[ユーザ本登録画面](../screens/CompleteUserActivate.md)、トークンの照合とユーザ作成は[認証API](../../backend/api/auth.md)を参照する。

## 完了時・失敗時の動作

### 完了時

- 入力と同意が有効な場合にUserTempと有効化トークンが作成され、仮登録完了を確認できる
- メール配信が無効な場合は登録入口を表示せず、直接APIを呼ばれてもUserTempとトークンを作成しない
- 有効期間内のトークンでユーザを作成し、使用済みUserTempを削除できる
- 有効な対象ルームの情報がある場合はログイン画面のクエリまたはタイムラインリンクへ引き継げる
- 本登録後はログイン画面で認証して通常機能を利用する

### 失敗時

- フロントエンド入力不正、規約未同意、またはメール配信機能無効では登録APIを呼ばない。バックエンドも無効時は`503 EXTERNAL_FEATURE_DISABLED`を返す
- 既存ユーザとメールが重複する登録は`409 USER_EMAIL_ALREADY_USED`、不明トークンは`404 TOKEN_NOT_FOUND`、期限切れは`410 SIGNUP_TOKEN_EXPIRED`となる
- 仮登録作成後にメール送信が失敗すると、APIは失敗する一方でUserTempとトークンは残る
- 同じメールから複数のUserTempが作られた場合、最初に有効化されたトークンだけがユーザ作成へ進み、残るトークンは`USER_ALREADY_EXISTS`となってUserTempが残り得る
- ユーザ作成とUserTemp削除は単一トランザクションではない。ユーザ作成後の削除失敗ではAPIが失敗してもユーザが存在するが、有効期限内に同じURLを再読込すれば残りの処理を再開できる。有効化トークンと登録済みユーザの対応情報がないデータは、自動復旧できない
- 有効なルームの親フロアを解決できない場合でも成功扱いとなり、返されたフロア／ルームIDをログイン画面のクエリへ引き継ぐことがある。フロアタイトルがなければタイムラインリンクは表示しない
- 有効化処理中は可視の読み込み状態を表示するが、失敗後の画面内再試行操作はない

## 関連資料

### 関連仕様

- [ユーザ登録](../screens/Register.md)
- [ユーザ本登録（CompleteUserActivate）](../screens/CompleteUserActivate.md)
- [ログイン画面](../screens/Login.md)
- [利用規約](../screens/Terms.md)
- [プライバシーポリシー](../screens/Privacy.md)
- [認証API](../../backend/api/auth.md)
- [REST API共通規約](../../backend/api-conventions.md)
- [ドメインモデル](../../domain-model.md#アカウントと認証補助)
- [環境変数](../../backend/environment-variables.md)
- [外部機能の有効状態API](../../backend/api/capabilities.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/api/auth.js`
- `frontend/src/components/common/ConfirmDialog.vue`
- `backend/services/auth.service.js`
- `backend/models/UserTemp.js`

### テスト

- `frontend/tests/unit/views/Register.spec.js`
- `backend/tests/integration/routes/auth.register-reset.int.test.js`
- `frontend/tests/e2e/specs/flows/account/register.validation.e2e.js`
- `frontend/tests/unit/views/CompleteUserActivate.spec.js`
- `frontend/tests/e2e/specs/flows/account/account-lifecycle.e2e.js`
- `frontend/tests/e2e/specs/flows/account/activate.e2e.js`
