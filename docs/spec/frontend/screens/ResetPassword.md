# パスワード再設定（/user/resetpassword/:reset_token）

## 概要

- 再設定メールのトークンを検証し、新しいパスワードへ変更する

## 利用条件・開き方

- パスワード再設定メール内のURL、またはURLへの直接アクセス

### URL

- パス: `/user/resetpassword/:reset_token`
- ルート名: `ResetPassword`
- コンポーネント: `frontend/src/views/ResetPassword.vue`
- メタ情報: `isPublic: true`, `title: 'パスワード再設定'`

### 利用条件

- ゲスト、未ログイン、ログインユーザ、各ロールのいずれも利用できる公開画面である
- フロアメンバー、ルームメンバー、キック状態、フロア／ルーム設定による制限はない
- トークン検証と再設定APIはJWTを要求しない
- `BackButton`は直接アクセス時も表示し、ログイン画面へ戻る。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する
- 有効なトークンの検証に成功した場合だけパスワード入力フォームを表示する
- トークン検証とパスワード更新はメール配信機能で制限しない。発行後にメール配信を無効にしても、有効なトークンからこの画面を利用できる

## 操作と動作

| 状態 | 表示・操作 |
| --- | --- |
| トークン検証中 | `aria-busy=true`と`role="status"`の「読み込み中です」を表示し、フォーム、エラー、リンクは表示しない |
| トークン有効 | 新しいパスワード、確認入力、「再設定」ボタンを表示する |
| トークン無効・期限切れ | `role="alert"`で固定のエラー文、同じトークンを再検証する「再試行」、`/login`への「ログインページへ」を表示する |
| 再設定成功 | `role="status"`で成功文と`/login`への「ログインページへ」を表示し、フォームを隠す |

- トークン検証失敗後の「再試行」は読取専用の検証APIだけを同じルートトークンで再実行し、パスワード更新APIは呼ばない
- 再試行開始時は以前のトークン成功／失敗状態を消し、処理中の再操作では検証APIを重複実行しない
- 再設定中は2入力欄と送信ボタンを無効化し、二重送信を防止する
- 入力不正時はAPIを呼ばない
- 成功時は入力値とVuelidate状態を初期化し、statusのスナックバーにも成功を通知する
- 再設定API失敗時はフォームを残し、「パスワード再設定に失敗しました」にAPI詳細を追記したalertのスナックバーを表示する
- トークン検証APIの失敗詳細は画面やスナックバーへ出さず、無効・期限切れ共通の固定文言を表示する

## 入力条件

| 項目 | フロントエンド | バックエンド |
| --- | --- | --- |
| `reset_token` | 必須パスパラメータをそのままAPIへ送信 | 48文字のhex文字列、DBに存在し、有効期間内であること |
| 新しいパスワード | 必須、8〜16文字、入力時に前後空白を除去 | 必須の文字列、8〜16文字 |
| パスワード確認 | 必須、8〜16文字、新しいパスワードと一致 | 送信しない |

- blurまたは再設定時にVuelidateを更新し、項目別エラーを`role="alert"`で表示する
- トークンの形式はフロントエンドで検証せず、初期表示時のAPIで判定する

## 通信・エラー時の動作

### 使用するAPI

#### トークン検証

- `POST /api/auth/resetpassword/verify`
- `withCredentials: true`で`token`を送信する
- トークンの有効期間は`RESET_TOKEN_TTL_MINUTES`で設定し、既定値は60分である
- トークンなし・形式不正・DBに存在しない場合は`400 INVALID_PARAMS`、期限切れは`400 RESET_TOKEN_EXPIRED`とする

#### パスワード再設定

- `POST /api/auth/resetpassword`
- `withCredentials: true`で`password`と`token`を送信する
- バックエンドはUser内のトークン消費・パスワード・セッション世代を同じ条件付き更新で確定し、同時利用は1回だけ成功する
- 成功時はパスワードを更新し、`session_version`を増やして対象ユーザの既存セッションを全失効する
- DB更新直後に対象ユーザの全Socketへ`SESSION_REVOKED`を送り切断する
- メール有効時は更新後に完了通知を1回試行する。通知失敗は成功を覆さず、未送信記録の保存・再配送は行わない
- API成功時に新しいJWTやログイン状態は発行せず、利用者は改めてログインする必要がある

### 読み込み中・データなし・エラー時

- パスワード再設定中はフォームを表示したまま入力と送信操作を無効化し、専用の進捗文は表示しない
- 更新前の失敗は入力値を保持して同じリンクで再送信できる。確定後の応答喪失や期限切れ・使用済みトークンでは再送できない

## 関連資料

### 関連仕様

- [パスワード再設定](../flows/ResetPassword.md)
- [パスワード再設定メール（SendResetPasswordLink）](SendResetPasswordLink.md)
- [フロントエンド状態管理](../state.md)
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

- `frontend/tests/unit/views/ResetPassword.spec.js`
- `backend/tests/integration/routes/auth.register-reset.int.test.js`
- `frontend/tests/e2e/specs/flows/account/account-lifecycle.e2e.js`
- `frontend/tests/e2e/specs/flows/account/reset-password.e2e.js`
