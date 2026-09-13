# Google Analytics設定・仮名ID API

## 概要

Google Analyticsの公開設定と、ログインユーザの計測用IDを返します。

## 共通条件

有効化フラグと設定値は[バックエンド環境変数](../environment-variables.md#google-analytics)に従い、起動時に検証して固定する。Google Analyticsが無効な場合、両APIは認証前に503を返す。

ルートとサービスはHTTPアプリごとに生成し、設定を共有しない。秘密値は仮名IDサービスだけへ渡し、外部機能の有効状態、Expressの公開設定、API応答、ログへ公開しない。

## API

### GET /api/analytics/config

フロントエンドがGoogleタグを初期化するためのGA4 Measurement IDだけを返すAPIである。Measurement IDは公開識別子だが、外部機能の有効状態APIの応答へ混在させず、Google Analyticsが有効な場合だけこの専用APIから取得する。

#### 認証・権限

- 不要。ゲスト、ログイン前、ログインユーザのいずれも同じ設定を取得できる。
- 機能の有効状態の検査を最初に評価し、無効時は設定を返さない。

#### リクエスト

- path: なし
- query: なし
- body: なし
- header: なし

#### レスポンス

- `200 OK`
- header:
  - `Cache-Control: no-store`
- body:
  - `measurement_id`: 文字列。`G-`に続く英大文字または数字

```json
{
  "measurement_id": "G-EXAMPLE01"
}
```

応答は`measurement_id`の1項目だけとし、`GA4_USER_ID_SECRET`、ユーザID、JWT、環境名、設定元は含めない。

#### エラー

| HTTPステータス | code | 発生条件 |
| --- | --- | --- |
| 503 | `EXTERNAL_FEATURE_DISABLED` | Google Analyticsが無効。`details.feature`は`googleAnalytics` |

#### データ更新・通知

- DBへの読書き、認証、Cookie発行、Googleへの通信を行わない。
- 環境変数を要求ごとに読み直さず、アプリ生成関数へ注入された起動時スナップショットを返す。

### GET /api/analytics/identity

有効なログインユーザJWTから、GA4のUser-IDへ使用する安定した仮名IDを生成する。MongoDBのユーザIDをGA4へ直接送らず、元IDを推測しにくいHMAC-SHA256の値へ変換するためのAPIである。

`analytics_user_id`は仮名化された識別子であり、匿名情報ではない。フロントエンドによるGA4への送信開始条件とイベント項目はフロントエンド側のAnalytics仕様に従う。

#### 認証・権限

- `Authorization: Bearer <JWT>`を必須とし、`ensureJsonWebToken`で署名、期限、ユーザの有効性、`session_version`を検証する。
- ログインユーザだけが利用できる。ゲストトークン、`X-Guest-Token`、v1 `developer` JWTは受け付けない。
- 仮名IDの生成元は、検証済みJWTから設定された`req.jwtPayload.user_id`だけを使用する。パス、クエリ、ボディにユーザIDまたはゲストIDを指定しても仮名IDの生成元には使用しない。

#### リクエスト

- path: なし
- query: なし
- body: なし
- header:
  - `Authorization: Bearer <JWT>`

#### レスポンス

- `200 OK`
- header:
  - `Cache-Control: no-store`
- body:
  - `analytics_user_id`: 文字列。`ga1_`に続く64桁の小文字16進数。形式は`^ga1_[a-f0-9]{64}$`
  - `visitor_type`: 文字列。固定値`registered`
  - `identity_version`: 文字列。固定値`v1`

```json
{
  "analytics_user_id": "ga1_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "visitor_type": "registered",
  "identity_version": "v1"
}
```

`analytics_user_id`は、空白除去して小文字化したMongoDB ユーザIDを使い、次の入力を`GA4_USER_ID_SECRET`によるHMAC-SHA256で変換して生成する。

```text
iseeetl:ga4:v1:user:<User._id>
```

同じ秘密値とユーザIDの組合せでは同じ値になる。秘密値を変更すると値も変わるため、変更前後をGA4上で同じユーザとして継続集計できない。

#### エラー

| HTTPステータス | code | 発生条件 |
| --- | --- | --- |
| 503 | `EXTERNAL_FEATURE_DISABLED` | Google Analyticsが無効。`details.feature`は`googleAnalytics` |
| 401 | `TOKEN_INVALID`、`TOKEN_EXPIRED` | 外部機能の有効状態が有効で、JWTが未指定、不正、期限切れ、ユーザ無効、またはセッション世代の不一致 |

#### データ更新・通知

- 仮名ID生成によるDBへの書込み、Googleへの通信、Cookie発行は行わない。
- 認証では現在のユーザと`session_version`をDBから確認する。このAPIでは共通認証のメディアアクセスCookie設定を無効にする。
- 秘密値、元ユーザID、JWT、生成時のHMAC入力をログへ出力しない。

## 関連資料

### 実装

- `backend/routes/analytics.route.js`
- `backend/controllers/analytics/config.controller.js`
- `backend/controllers/analytics/identity.controller.js`
- `backend/services/analytics/identity.service.js`
- `backend/middlewares/ensureJsonWebToken.js`

### テスト

- `backend/tests/unit/services/analytics/identity.service.test.js`
- `backend/tests/unit/controllers/analytics.config.controller.test.js`
- `backend/tests/integration/routes/analytics.config.route.int.test.js`
- `backend/tests/integration/routes/analytics.identity.route.int.test.js`
- `backend/tests/integration/app.factory.int.test.js`
