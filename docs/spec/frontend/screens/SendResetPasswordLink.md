# パスワード再設定メール（/user/sendresetpasswordlink）

## 概要

- 登録メールアドレスにパスワード再設定URLの送信を依頼する

## 利用条件・開き方

- メール配信が利用可能な場合に表示するログイン画面の「パスワードが分からない方はこちらへ」、または`/user/sendresetpasswordlink`への直接アクセス

### URL

- パス: `/user/sendresetpasswordlink`
- ルート名: `SendResetPasswordLink`
- コンポーネント: `frontend/src/views/SendResetPasswordLink.vue`
- メタ情報: `isPublic: true`, `title: 'パスワード再設定リンク送信'`

### 利用条件

- 公開ルートだが、メール配信機能が有効な場合だけフォームを表示・送信できる
- メール配信が無効または外部機能の有効状態の取得に失敗した状態で直接アクセスした場合は、フォームを表示せずログイン画面へ置換遷移する
- フロアメンバー、ルームメンバー、キック状態、フロア／ルーム設定による制限はない
- 再設定メールAPIもJWTを要求しない
- `BackButton`は直接アクセス時も表示し、開始元に応じてログイン画面またはパスワード変更画面へ戻る。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する

## 画面構成

- `BackButton`、翻訳対象のH1「パスワード再設定リンク送信」
- 登録メールアドレスの入力欄
- 「パスワード再設定リンクを送信」ボタン
- 成功、回数上限、その他の失敗を通知するスナックバー

## 操作と動作

- 送信中はメール入力と送信ボタンを無効化し、同じ処理を重ねて実行しない
- 送信直前にもメール配信機能を確認し、無効ならAPIを呼ばずログイン画面へ置換遷移する
- 成功時は「パスワード再設定メールを送信しました」をstatusのスナックバーで表示し、メール入力とVuelidate状態を初期化する
- 登録中の有効なユーザが存在しないメールでも、アカウント有無を推測できないようAPIは`200`を返し、画面は同じ成功メッセージを表示する
- SMTP送信後、送信中に認証状態が変わっていない場合だけ以前の再設定トークンを置き換える。送信失敗では旧リンクを置換せず、再要求では別のトークンを発行する。送信後のDB確定に失敗した新リンクは使用できない

## 入力条件

- メールは必須、メール形式、100文字以下とする
- フロントエンドは入力時に前後空白を除去する
- バックエンドは前後空白除去と小文字化を行ってから、100文字以下とメール形式を検証する
- blurまたは送信時にVuelidateを更新し、エラーを`role="alert"`で表示する
- 入力不正時はAPIを呼ばず、スナックバーは表示しない

## 通信・エラー時の動作

### 使用するAPI

- `POST /api/auth/resetpassword/sendmail`
- `withCredentials: true`で`mail`を送信する
- 有効なユーザが存在する場合は24バイト乱数を48桁hexにしたトークンを発行し、`/user/resetpassword/{token}`をメールで通知する
- トークンはメールごとに最新1件だけを保持する
- メール配信機能が無効な環境では`503 EXTERNAL_FEATURE_DISABLED`となり、再設定トークンを作成・置換しない
- 回数制限は`RESET_MAIL_RATE_LIMIT_WINDOW_MS`の期間内で、メール単位`RESET_MAIL_RATE_LIMIT_MAX`回、IP単位`RESET_MAIL_IP_RATE_LIMIT_MAX`回である。既定値は1時間、メール5回、IP 20回である
- `429`では「回数上限に達しました。時間をおいて再度お試しください」、その他の失敗では「パスワード再設定メールの送信に失敗しました」にAPI詳細を追記し、alertのスナックバーで表示する

### 読み込み中・データなし・エラー時

- 専用ローディング表示はなく、送信中は入力とボタンの無効化だけで示す
- 入力エラーは項目内、API結果はスナックバーで通知する
- API失敗時はメール入力を保持し、回数制限の解除後またはエラー解消後に再送信できる
- 画面内に送信済み状態やメール到着確認、パスワード再設定画面への直接リンクは表示しない

## 関連資料

### 関連仕様

- [パスワード再設定](../flows/ResetPassword.md)
- [パスワード再設定（ResetPassword）](ResetPassword.md)
- [ログイン画面](Login.md)
- [ドメインモデル](../../domain-model.md#アカウントと認証補助)
- [認証API](../../backend/api/auth.md)
- [外部機能の有効状態API](../../backend/api/capabilities.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/api/auth.js`
- `frontend/src/components/common/BackButton.vue`
- `backend/services/auth.service.js`
- `backend/models/ResetPassword.js`

### テスト

- `frontend/tests/unit/views/SendResetPasswordLink.spec.js`
- `backend/tests/integration/routes/auth.register-reset.int.test.js`
- `frontend/tests/e2e/specs/flows/account/account-lifecycle.e2e.js`
- `frontend/tests/e2e/specs/flows/account/send-reset-password-link.e2e.js`
