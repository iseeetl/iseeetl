# ログイン画面（/login）

## 概要

- 未ログインユーザがメール+パスワードでログインし、環境で利用可能な場合はGoogle／LINEログインも利用する
- ログイン後にフロア一覧、または指定ルームへ遷移する

## 利用条件・開き方

- アプリメニュー（未ログイン時の「ログイン」）から遷移
- 登録完了後の導線（ユーザ登録の完了ダイアログ）から遷移
- ゲストプロフィール設定ダイアログの「ログインページへ」から遷移

### URL

- パス: `/login`
- ルート名: `Login`
- コンポーネント: `frontend/src/views/Login.vue`
- メタ情報: `isPublic: true`, `title: 'ログイン'`

### 利用条件

- 公開ルート（`meta.isPublic`）
- メール+パスワードのログインは外部機能の有効状態にかかわらず表示する
- 登録・再設定導線、OAuthボタン、OneSignal連携だけを対応する外部機能の有効状態で制御する

## 画面構成

- 主要コンポーネント
  - フロア一覧へ戻る`BackButton`
  - `GoogleLoginButton`
  - `LineLoginButton`
- 入力
  - メール: `#mail`（必須）
  - パスワード: `#password`（必須、8〜16文字）
- ボタン/リンク
  - 「ログイン」
  - メール配信が利用可能な場合だけ「ユーザ登録へ」「パスワードが分からない方はこちらへ」
  - 各OAuthが利用可能な場合だけGoogle／LINE。区切りは少なくとも一方が利用可能な場合だけ表示する
  - ログイン方式と外部機能の有効状態にかかわらず常時1段落だけ表示する同意案内。文中の「利用許諾・著作権・禁止事項・免責事項」「プライバシーポリシー」「Cookieポリシー」を各文書へのリンクにする
  - 外部機能の有効状態の取得失敗時の案内と「再試行」

## 操作と動作

- メール+パスワードでログイン
  - `authApi.login({ mail, password })` を呼び出す
  - 成功時はストアにログインユーザ情報を保存し、画面遷移する
  - 失敗時はスナックバーに「ログインに失敗しました」+ API エラー詳細を表示する
- ログイン成功の通知
  - メール・Google・LINEログインの成功時に「ログインしました」をスナックバーで一度表示する
  - 保存済みログイン状態の復元では成功通知を表示しない
- ログイン後の遷移
  - URL に `floor_id` と `room_id` が含まれている場合: `/floor/:floor_id/room/:room_id` へ遷移
  - 上記以外: フロア一覧（`/`）へ遷移
- OneSignal関連付け
  - OneSignalが利用可能で、ログイン応答の`onesignal_external_id`がある場合だけ`OneSignal.login(onesignal_external_id)`を呼ぶ
  - MongoDBの`user_id`はOneSignalへ渡さず、通知用IDが無い場合もフォールバックしない
  - ログイン状態を復元した端末は、アプリ起動時に`GET /api/auth/push-identity`で現在ユーザの通知用IDを再取得する
- Googleログイン
  - バックエンドでGoogleログインが有効で、フロントエンドの公開Client IDが設定されている場合だけボタンを表示する
  - `authApi.loginWithGoogle({ idToken, lang })` を呼び出す
- LINEログイン
  - バックエンドでLINEログインが有効な場合だけボタンを表示する
  - ボタン押下時、`GET /api/auth/line/authorize` に `lang` と `floor_id` / `room_id`（存在時）を付与して認可開始する
  - 成功時は `afterLogin(payload)` が呼ばれる
  - URL ハッシュ `#oauth=line&data=...` があり、LINEログインが利用可能な場合だけ復元処理（`consumeOauthHashIfAny()`）で `afterLogin()` へ合流する。利用不可時もハッシュは削除する
  - ポップアップ不可フォールバック経路でも、`floor_id` / `room_id` を保持してログイン後遷移に利用する
- 外部機能の有効状態の取得失敗
  - 外部機能をすべて利用不可としてメール+パスワードのログイン画面を維持する
  - 「再試行」は外部機能の有効状態を再取得し、OneSignalが新たに利用可能になった場合はSDK初期化も行う
- 規約・ポリシーの同意案内
  - 「メール・パスワードまたはGoogle、LINEログインすることで、利用許諾・著作権・禁止事項・免責事項、プライバシーポリシー及びCookieポリシーに同意したものとみなされます。」を常時表示する
  - 文中の3つのリンクは、保持中の`floor_id`／`room_id`をクエリで引き継ぎ、別タブで各文書を開く
  - メール+パスワード、Google、LINEのすべてを同じ同意対象とし、Analytics専用の別同意は追加しない

## 入力条件

- メール
  - 必須 / メール形式 / 100文字以内
- パスワード
  - 必須 / 8文字以上 / 16文字以内

## 通信・エラー時の動作

### 使用するAPI

- メール+パスワード
  - `POST /api/auth/login`
- Google
  - `POST /api/auth/google/login`
- OneSignal再関連付け
  - `GET /api/auth/push-identity`（JWT必須）
- 外部機能の利用可否
  - `GET /api/capabilities`（起動時に取得。詳細は[外部機能の有効状態API](../../backend/api/capabilities.md)）
- LINE
  - `GET /api/auth/line/authorize` / `GET /api/auth/line/callback`（ブラウザ遷移を含む）
  - `line/authorize` のクエリ: `lang`（任意）, `floor_id`（任意）, `room_id`（任意）

### 読み込み中・データなし・エラー時

- `sending` 中は入力・ボタンが無効になる
- エラーはスナックバーで表示する

## 関連資料

### 関連仕様

- [フロア作成からタイムラインの投稿操作まで](../flows/EditorFloorRoomTimelineCrud.md)
- [ユーザ登録から本登録まで](../flows/RegisterAndActivate.md)
- [パスワード再設定](../flows/ResetPassword.md)
- [フロア招待](../flows/FloorInvite.md)
- [ルーム招待](../flows/RoomInvite.md)

### 実装

- `frontend/src/router.js`
- `frontend/src/views/Login.vue`
- `frontend/src/components/app/GuestProfileDialog.vue`
- `frontend/src/store/root/capabilities.js`
- `frontend/src/views/StaticDocumentView.vue`

### テスト

- `frontend/tests/unit/views/Login.spec.js`
- `frontend/tests/e2e/specs/flows/login/login-failure.e2e.js`
- `frontend/tests/e2e/specs/flows/login/login-timeline.smoke.js`
