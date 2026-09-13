# REST API 共通規約

## 概要

この文書では、バックエンドREST APIに共通する入力形式、認証ヘッダ、成功応答、エラー応答を説明します。
個別エンドポイントのパラメータ、認可条件、レスポンス、エラー条件、副作用は [API詳細仕様](api/README.md) を参照してください。

### 適用範囲

- `backend/createApp.js`の`configureApp`から登録される `/api` 配下のREST API
- `ensureJsonWebToken`、`guestAuth`、`ensureAdminUser` などの共通認証ミドルウェア
- `AppError` とグローバルエラーハンドラを経由する応答

Socket.IOの接続認証とルーム入室判定は [ロール・権限仕様](../roles-and-permissions.md)、クライアント側の通信処理は [フロントエンドAPI](../frontend/api.md) を参照してください。

## 動作・適用条件

### リクエスト形式

- 通常のAPIはJSONまたはURL-encodedのリクエストボディを受け付ける
- ファイルアップロードは `multipart/form-data` を使用する
- Cookieを使用するエンドポイントでは、フロントエンドから `withCredentials: true` を指定する
- `express-mongo-sanitize` により、リクエストボディ、クエリ、パスパラメータ、ヘッダに含まれる危険なMongoDB演算子のキーを除去する

クエリの値は文字列です。検索しない場合、必須の`search`には`search=`を送ります。`search=null`は文字列「null」の検索であり、JSONの`null`には変換しません。JSONボディで`null`を許可するかは各APIに従います。

フィールド名、型、必須条件は各 [API詳細仕様](api/README.md) を参照してください。

#### 言語コード

言語コードは[対応する16言語](../frontend/style-and-i18n.md#対応言語)に限り、前後空白を除去して小文字へ正規化します。ISO 639-1のすべての言語を許可するわけではありません。必須・任意、配列の上限、重複除去は各APIの入力条件に従います。

### 認証情報

| 利用区分 | 認証情報 | 検証処理 |
| --- | --- | --- |
| ログインユーザ | `Authorization: Bearer <JWT>` | `ensureJsonWebToken` |
| ゲスト | `X-Guest-Token: <guest access token>` | `guestAuth` |
| ゲストトークン更新 | リフレッシュトークンを格納したCookie | ゲスト認証サービス |
| v1 API | `Authorization: Bearer <development JWT>` | `ensureJsonWebTokenV1`、`ensureDeveloperUserV1` |

- 通常JWTは `JWT_SECRET`、v1 APIのJWTは `JWT_DEV_SECRET` で検証する
- 通常JWTの検証後は `req.jwtPayload`、ゲストトークンの検証後は `req.guest` と `req.body.guest_id` を設定する
- 通常JWTは署名と期限に加え、論理削除されていないユーザの存在と`session_version`の一致を確認する
- `session_version`を持たないJWTは世代0として扱い、世代0のユーザに限って継続利用を許可する
- JWTの`user_role`は認証時に現在のユーザの`role`で上書きする
- パスワード変更・再設定でユーザの世代が増えると、それ以前のJWTは`TOKEN_INVALID`として拒否する。本人変更・再設定・管理更新はいずれも対象ユーザの全Socketを失効させ、新JWTを返さない
- `ensureAdminUser` は通常JWT検証後の `user_role` が `Administrator` の場合だけ通過させる
- v1 APIは署名・期限、ペイロードの`developer`ロール、論理削除されていないユーザ、DB上の現在ロール`developer`を確認するが、`session_version`は照合しない
- トークン検証は本人確認までを担当し、対象フロア・ルーム・投稿などの認可はサービス層でも行う
- v1 APIも通常APIと同じ処理を使用し、機能に応じたルームアクセス認可とリソース認可を使用する。拒否時のHTTPステータスとエラーコードは[v1 API仕様](api/v1.md)の各契約に従う

通常JWTの認証時に本人が存在しない・論理削除済み、または`session_version`が一致しない場合は、401 `TOKEN_INVALID`を返します。認証成功後にユーザを再確認するAPIでは、その時点で本人が削除済みなどの場合、個別APIに記載した`INVALID_PARAMS`（400）、`NOT_FOUND`（404）、`INVALID_PERMISSION`（401）などを返します。

ロール解決とリソース単位の認可条件は [ロール・権限仕様](../roles-and-permissions.md) を参照してください。

### 成功応答

- JSONを返すエンドポイントが中心だが、全API共通の成功エンベロープは設けていない
- HTTPステータス、レスポンスフィールド、Cookie、リダイレクトは各エンドポイントの仕様に従う
- 作成・更新・削除で生じるDB更新、ファイル操作、通知、リアルタイム配信は、各API詳細仕様がエンドポイント固有の副作用として管理する

### エラー応答

- 一部の既存エンドポイントやファイル受信エラーには、共通形式へ正規化されない応答が残る可能性がある
- `VALIDATION_ERROR`、`RATE_LIMIT_EXCEEDED`、`PAYLOAD_TOO_LARGE` は共通カタログに定義されているが、対象ミドルウェアが常にこれらを明示しているわけではない
- 完全一致`/api`で`Accept: text/html`または`Accept: */*`を指定した場合と、未定義パスへのGET以外の要求では、`/api/*`のJSON形式の404とは異なる応答になる

#### グローバルエラーハンドラの形式

`AppError` または未処理エラーがグローバルエラーハンドラへ渡された場合、次のJSON形式で返す。
実装は`backend/middlewares/errorHandler.js`にある。

```json
{
  "error": {
    "code": "INVALID_PARAMS",
    "status": 400,
    "message": "入力内容が正しくありません"
  }
}
```

- `code`: クライアントが判定に使用する安定識別子
- `status`: 実際に返すHTTPステータス
- `message`: `backend/constants/errorCatalog.js` に対応するメッセージ
- `details`: `AppError` に詳細が指定された場合だけ追加する任意フィールド
- 未知のエラーコードと未処理エラーは `INTERNAL_SERVER_ERROR`、500へ正規化する
- 未処理エラーの内部メッセージやスタックはレスポンスへ含めない

#### 共通ステータス

| HTTPステータス | 代表コード | 用途 |
| --- | --- | --- |
| 400 | `INVALID_PARAMS` | 入力形式または意味上の不正 |
| 401 | `TOKEN_INVALID`、`TOKEN_EXPIRED` | 認証情報の不足・不正・期限切れ |
| 401 | `INVALID_PERMISSION` | 認証後のユーザ・ロール確認での拒否、ルーム入室・更新・削除などの権限不足 |
| 403 | `FORBIDDEN` | 認証済みユーザの権限不足 |
| 404 | `NOT_FOUND` | 対象またはAPIパスが存在しない |
| 409 | `CONFLICT` | 重複または競合 |
| 413 | `FILE_TOO_LARGE`、`PAYLOAD_TOO_LARGE` | ファイルまたはペイロードの上限超過 |
| 422 | `VALIDATION_ERROR` | 422として扱う入力検証エラー |
| 429 | `RATE_LIMIT_EXCEEDED` | リクエスト回数制限 |
| 500 | `INTERNAL_SERVER_ERROR` | 予期しない内部エラー |

権限不足のステータスはAPIによって401または403です。機能固有のコードと発生条件は対象のAPI詳細仕様を参照してください。

#### 未定義APIパス

- 未定義の`/api/*`へのGETは、HTMLを許可する`Accept`ヘッダでも`NOT_FOUND`、404のJSON応答とする
- 完全一致`/api`へのGETは、`Accept: application/json`または`Accept`ヘッダなしでは`NOT_FOUND`、404のJSON応答とする
- 完全一致`/api`へのGETは、`Accept: text/html`または`Accept: */*`ではHistory API用のパス書き換えの対象となる。SPAのエントリーポイントが存在する場合はHTMLを配信し、存在しない場合は`/`へリダイレクトする
- 未定義パスへのGET以外の要求はGET向けの代替応答処理とグローバルエラーハンドラを通らず、Express既定の404応答を返す
- `/`以外の未定義GETパスは、HTMLへの画面遷移でSPAのエントリーポイントが解決されない場合、またはHTMLへの画面遷移以外の場合に`/`へリダイレクトする。静的ファイルとして解決できない`/`は`NOT_FOUND`、404とする

### レート制限

- `express-rate-limit` の拒否応答はライブラリ既定の形式であり、現在はグローバルエラーハンドラのJSON形式へ統一されていない

| 対象 | 既定の時間枠 | 既定の上限 | キー・数え方 |
| --- | --- | --- | --- |
| `POST /api/auth/login` | 15分 | 20回 | IPアドレス単位。成功したリクエストは回数から除外 |
| `POST /api/auth/resetpassword/sendmail` | 1時間 | メールアドレス5回／IPアドレス20回 | 正規化したメールアドレス単位とIPアドレス単位で別々に数え、どちらかの上限超過で拒否 |

時間枠と上限は環境変数で変更できます。変数名は [環境変数](environment-variables.md) を参照してください。

## 関連資料

### 実装

- `backend/bootstrap/runtimeConfig.js`
- `backend/createApp.js`
- `backend/middlewares/errorHandler.js`
- `backend/routes/apiMounts.js`
- `backend/utils/appError.js`

### テスト

- `backend/tests/unit/middlewares/errorHandler.test.js`
- `backend/tests/integration/app.factory.int.test.js`
- `backend/tests/integration/errorResponse.int.test.js`
- `backend/tests/integration/routes/auth.middleware.int.test.js`
- `backend/tests/integration/routes/auth.route.int.test.js`
