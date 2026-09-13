# ゲスト認証API

## 概要

このAPIは、未ログイン時に使用するゲストアクセストークンを発行・更新します。共通の認証ヘッダとエラー応答は [REST API共通規約](../api-conventions.md)、有効期限を変更する環境変数は [環境変数](../environment-variables.md) を参照してください。

- アクセストークン: リクエストヘッダX-Guest-Tokenで使用する短命のJWT
- リフレッシュトークン: Cookie guest_refreshに保持し、アクセストークンの更新に使用するJWT
- 既定の有効期限はアクセストークンが15分、リフレッシュトークンが30日

## 共通条件

### 共通のメディアCookie

発行・更新の成功時は、アクセストークンを`iseeetl_media_guest`へ設定し、ログインユーザ用の`iseeetl_media_user`を解除します。属性は`Path=/media`、HttpOnly、SameSite=Strictで、本番環境だけSecureです。有効期限はアクセストークンと一致します。保管情報の一覧は[Cookieと外部送信](../../frontend/cookies-and-external-transmissions.md)を参照してください。

## API

### POST /api/guest/bootstrap

ゲストID、アクセストークン、リフレッシュトークンを新規発行する。

#### 認証・権限

- 不要
- Cookieを受け取るため、フロントエンドはwithCredentials: trueを指定

#### リクエスト

- body:
  - guest_name: 文字列（1〜20文字）, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須

#### レスポンス

- 200 OK
- body:
  - guest_id: 文字列(UUID)
  - guest_name: 文字列
  - lang: 文字列
  - guest_token: 文字列（アクセストークン）
  - expires_in: 数値（アクセストークンの有効秒数）
- Set-Cookie:
  - [共通のメディアCookie](#共通のメディアcookie)を設定・解除
  - guest_refresh: リフレッシュトークン
  - HttpOnly、SameSite=Laxで、本番環境のみSecure
  - Max-Ageはリフレッシュトークンの有効秒数

#### エラー

- 400: INVALID_PARAMS

#### データ更新・通知

- UUIDのゲストIDを生成
- ゲストIDを含むアクセストークンとリフレッシュトークンを発行
- ゲスト情報はデータベースへ保存しない

### POST /api/guest/refresh

Cookie guest_refreshを検証し、新しいアクセストークンを発行する。

#### 認証・権限

- Cookie guest_refresh必須
- Cookieを送受信するため、フロントエンドはwithCredentials: trueを指定

#### リクエスト

- body: なし
- Cookie:
  - guest_refresh: 文字列, 必須

#### レスポンス

- 200 OK
- body:
  - guest_id: 文字列(UUID)
  - guest_token: 文字列（新しいアクセストークン）
  - expires_in: 数値（アクセストークンの有効秒数）
- Set-Cookie:
  - [共通のメディアCookie](#共通のメディアcookie)を設定・解除
  - guest_refresh: リクエストで受け取ったリフレッシュトークンを再設定
  - CookieのMax-Ageは再設定されるが、リフレッシュトークン自体は更新されず、JWTに記録された有効期限も延長されない

#### エラー

- 401: TOKEN_INVALID（Cookie不足、トークン不正、またはguest_id不足）
- 401: TOKEN_EXPIRED

#### データ更新・通知

- リフレッシュトークン内のゲストIDを引き継いだ新しいアクセストークンを発行
- 同じリフレッシュトークンをCookieへ再設定

## 関連資料

### 実装

- `backend/routes/guest.route.js`
- `backend/controllers/guest.controller.js`
- `backend/services/guestAuth.service.js`

### テスト

- `backend/tests/unit/services/guestAuth.service.test.js`
- `backend/tests/integration/routes/guest.auth.int.test.js`
- `backend/tests/unit/controllers/guest.controller.test.js`
