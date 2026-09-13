# パスワード変更（/changepassword）

## 概要

- ログイン中ユーザが現在のパスワードを確認した上で、新しいパスワードへ変更する
- メール配信が利用可能な場合は、現在のパスワードが分からない利用者が公開画面`SendResetPasswordLink`へ移動できる

## 利用条件・開き方

- プロフィールダイアログの「パスワード変更」、または`/changepassword`への直接アクセス

### URL

- パス: `/changepassword`
- ルート名: `ChangePassword`
- コンポーネント: `frontend/src/views/ChangePassword.vue`
- メタ情報: `requiresAuth: true`, `title: 'パスワード変更'`

### 利用条件

- JWTを持つログインユーザ本人だけが利用できる。未ログイン時は入力フォームを表示せずログイン画面へ遷移する
- Administrator、Editor、Author、developerのロール差、フロアメンバー／ルームメンバー、キック状態、フロア／ルーム設定による利用制限はない
- `BackButton`は直接アクセス時も表示し、プロフィールを開いた元の画面へ戻ってプロフィールを表示する。開始元がなければフロア一覧で開く。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する

## 画面構成

- `BackButton`、翻訳対象のH1「パスワード変更」、入力案内
- メール配信が利用可能な場合だけ表示する、`SendResetPasswordLink`へ進む「現在のパスワードが分からない場合」のリンク
- 現在のパスワード、新しいパスワード、新しいパスワード確認の3入力欄
- 各入力欄の`/16`文字数表示と、パスワード表示／非表示ボタン
- 変更を送信する「設定」ボタン

## 操作と動作

- 各表示／非表示ボタンは対応する入力欄の`type`を`password`と`text`で切り替え、アイコンを`visibility`と`visibility_off`で切り替える
- 送信時は入力検証、二重送信防止の順に確認し、`old_password`と`new_password`を送信する
- 送信中は3入力欄、「設定」、表示／非表示ボタンを無効化する。パスワード再設定リンクは利用できる
- メール配信が無効でも、現在のパスワードを使用する変更フォームとAPIは通常どおり利用できる
- 成功時は`doLogout`の完了を待ち、ログイン画面へ遷移する
- 成功スナックバーを表示し、3入力値とVuelidate状態を初期化する
- 失敗時は入力値を保持し、「パスワード変更に失敗しました」へAPIエラー詳細を追記してalertのスナックバーで通知する

## 入力条件

| 項目 | フロントエンド | バックエンド |
| --- | --- | --- |
| 現在のパスワード | 必須、8〜16文字、前後空白を除去 | 必須の文字列、8〜16文字、保存済みハッシュとの一致 |
| 新しいパスワード | 必須、8〜16文字、前後空白を除去 | 必須の文字列、8〜16文字 |
| 新しいパスワード確認 | 必須、8〜16文字、前後空白を除去、新しいパスワードと一致 | ペイロードへ送信せず、バックエンドでは検証しない |

- 各入力欄のblurまたは送信時にVuelidateを更新し、項目エラーを`role="alert"`で表示する
- 入力検証に失敗した場合はAPIを呼ばず、画面全体のスナックバーは表示しない
- 現在のパスワードと新しいパスワードが同じでも拒否する検証はない

## 通信・エラー時の動作

### API通信とセッション影響

- `POST /api/user/changepassword`
- JWT必須で、ペイロードは`old_password`と`new_password`である
- バックエンドは有効ユーザと現在のパスワードを確認し、パスワードをハッシュ化して更新すると同時に`session_version`を1増分する
- 成功レスポンスは`{}`で、新しいJWTを発行しない
- 変更前のJWTは操作中の端末も含めて無効となる。対象ユーザの全Socketへ`SESSION_REVOKED`を送り切断し、全端末で再ログインを必要とする
- Socket失効は通知メール送信より先に行う
- バックエンドは、メール配信が有効な場合に変更通知メールを送信する
- 認証エラーの401では共通APIクライアントがログアウトしてゲスト認証を確保し、画面はAPIエラーのスナックバーを表示する。ChangePassword自身はログイン画面への遷移を実行しない

通知メールが失敗しても、パスワード更新と失効が完了した場合は変更成功としてログアウトし、ログイン画面へ進みます。未送信記録は保存せず、通知の再配送は行いません。

### 読み込み中・データなし・エラー時

- 専用のローディング表示や進捗バーはなく、`sending=true`中の入力欄・送信ボタン無効化だけで示す
- 現在のパスワード不一致を含む`400 INVALID_PARAMS`は、APIエラー詳細付きのalertとして表示する
- API失敗後は`sending`を解除して再送信できる
- 画面内で現在のパスワードが正しいかを事前判定する処理はない
- 401でログアウトした場合も現在ルートは即時には変わらず、次に認証必須・管理ルートへ遷移する際に認証ガードがログイン画面へ誘導する

## 関連資料

### 関連仕様

- [プロフィール](Profile.md)
- [パスワード再設定メール（SendResetPasswordLink）](SendResetPasswordLink.md)
- [フロントエンド状態管理](../state.md)
- [フロントエンドエラー処理](../error-handling.md)
- [ユーザAPI](../../backend/api/user.md)
- [外部機能の有効状態API](../../backend/api/capabilities.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/api/apiClient.js`
- `backend/controllers/user.controller.js`
- `backend/services/user.service.js`
- `backend/models/User.js`

### テスト

- `frontend/tests/unit/views/ChangePassword.spec.js`
- `backend/tests/integration/routes/user.route.int.test.js`
- `frontend/tests/e2e/specs/flows/account/protected-routes.e2e.js`
- `frontend/tests/unit/api/user.spec.js`
- `frontend/tests/e2e/specs/flows/account/change-password.validation.e2e.js`
