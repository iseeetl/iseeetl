# 認証API

## 概要

ユーザ登録、ログイン、外部認証、パスワード再設定を提供します。

## 共通条件

JWT、Cookie、エラー応答の共通形式は [REST API共通規約](../api-conventions.md)、有効期限やレート制限を変更する環境変数は [環境変数](../environment-variables.md) を参照してください。

パスワードログイン、Googleログイン、LINEログインの成功時は、次のログイン情報を返します。LINEログインでは、このオブジェクトをHTML内のpostMessageまたは遷移先URLへ埋め込みます。

- user_id: 文字列(MongoId)
- user_role: 文字列
- user_name: 文字列
- image_name: 文字列またはnull
- lang: 文字列またはnull
- token: 文字列（JWT）
- eye_friendly_mode: 真偽値
- push_enabled: 真偽値
- reply_push_enabled: 真偽値
- replied_post_push_enabled: 真偽値
- onesignal_external_id: 文字列またはnull（認証済み本人のOneSignal関連付け専用。MongoDB ユーザIDを含まないHMAC値）

OneSignalが無効な場合、通常のログイン情報に含む`onesignal_external_id`はnullになります。フロントエンドはnullの場合にOneSignalへログインせず、生の`user_id`へフォールバックしません。

パスワード・Google・LINEログインの成功時は、発行したJWTを`iseeetl_media_user`へ設定し、ゲスト用の`iseeetl_media_guest`を解除します。Cookieは`Path=/media`、HttpOnly、SameSite=Strictで、本番環境だけSecureです。有効期限はJWTと一致します。保管情報の一覧は[Cookieと外部送信](../../frontend/cookies-and-external-transmissions.md)を参照してください。

JWTの有効期限はJWT_EXPIRES_INで変更でき、既定値は30dです。

JWTにはユーザの`session_version`を含めます。`session_version`を持たないJWTは世代0として扱い、ユーザの世代も0の場合だけ利用できます。
パスワード変更または再設定でユーザの世代が更新されると、それ以前のJWTは有効期限内でも利用できません。

## API

### POST /api/auth/register

仮ユーザを作成し、認証メールを送信する。

#### 認証・権限

- 不要

#### リクエスト

- body:
  - username: 文字列（1〜20文字）, 必須
  - mail: 文字列（メールアドレス、100文字以内）, 必須
  - password: 文字列（8〜16文字）, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
  - room_id: 文字列(MongoId), 任意

#### レスポンス

- 200 OK
- body: OK

#### エラー

- 400: INVALID_PARAMS
- 409: USER_EMAIL_ALREADY_USED（論理削除済みを含む既存ユーザとメールアドレスが重複）
- 503: EXTERNAL_FEATURE_DISABLED（`feature: mailDelivery`。仮ユーザやトークンを作成する前に拒否）

#### データ更新・通知

- パスワードをハッシュ化し、登録言語を保持した仮ユーザと48文字の認証トークンを作成
- メール配送が有効な場合だけ仮ユーザとトークンを作成し、登録言語で認証URLを記載したメールを送信。room_idで有効なルームとフロアを解決できる場合は、そのルームへのリンクも記載

### POST /api/auth/activate

仮登録トークンを検証し、本ユーザを作成する。

#### 認証・権限

- 不要

#### リクエスト

- body:
  - invite_token: 文字列（48文字の16進数）, 必須
  - room_id: 文字列(MongoId), 任意

#### レスポンス

- 200 OK
- body:
  - roomId: 文字列(MongoId)またはnull
  - roomTitle: 文字列またはnull
  - floorId: 文字列(MongoId)またはnull
  - floorTitle: 文字列またはnull
- roomIdはリクエストのroom_idをそのまま返し、未指定時はnull。roomTitle、floorId、floorTitleは有効なルームまたはフロアを解決できない場合にnullになる

#### エラー

- 400: INVALID_PARAMS
- 404: TOKEN_NOT_FOUND
- 409: USER_ALREADY_EXISTS（同一メールアドレスのユーザが存在し、同じ有効化トークン由来の有効Userとして復旧できない）
- 410: SIGNUP_TOKEN_EXPIRED

#### データ更新・通知

- 仮ユーザの情報と登録言語から本ユーザを作成。言語がない場合は`ja`とする
- 使用した仮ユーザを物理削除。削除失敗後は有効期限内に同じトークンで再試行し、同じ有効化から作成されたUserの後処理だけを再開できる。完了後の同じトークンも期限内は成功する。詳細は[認証処理の競合と復旧](../auth-recovery.md)を参照
- 仮登録トークンの有効期限はSIGNUP_TOKEN_TTL_MINUTESで変更でき、既定値は60分

### POST /api/auth/login

メールアドレスとパスワードでログインする。

#### 認証・権限

- 不要
- IPアドレス単位のレート制限あり。既定は15分間に20回で、成功したリクエストは回数から除外

#### リクエスト

- body:
  - mail: 文字列（メールアドレス、100文字以内）, 必須
  - password: 文字列（8〜16文字）, 必須

#### レスポンス

- 200 OK
- body: この文書冒頭のログイン情報
- Set-Cookie: 冒頭のメディアCookieを設定・解除

#### エラー

- 400: INVALID_PARAMS（入力不正、ユーザ不存在、論理削除済み、パスワード未設定、またはパスワード不一致）
- 429: レート制限超過（共通JSON形式ではなくexpress-rate-limitの既定応答）

#### データ更新・通知

- JWTを発行し、冒頭のメディアCookieを設定・解除

### POST /api/auth/google/login

Google IDトークンでログインする。

#### 認証・権限

- 不要

#### リクエスト

- body:
  - id_token: 文字列（10〜5000文字）, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須

#### レスポンス

- 200 OK
- body: この文書冒頭のログイン情報
- Set-Cookie: 冒頭のメディアCookieを設定・解除

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION（IDトークン不正、メール未検証、または連携先ユーザが無効）
- 409: USER_ALREADY_EXISTS（同時登録の競合を解決できない場合）
- 503: EXTERNAL_FEATURE_DISABLED（`feature: googleLogin`。Google クライアント生成と外部検証より前に拒否）

#### データ更新・通知

- 既存のGoogle認証情報がある場合は、その認証情報に紐づく有効なユーザでログイン
- 認証済みメールアドレスと一致する有効なユーザがいる場合は、Google認証情報を自動連携
- 一致するユーザがいない場合はパスワード未設定のユーザとGoogle認証情報を作成
- JWTを発行し、冒頭のメディアCookieを設定・解除

### GET /api/auth/push-identity

ログイン済み端末を、現在のユーザに対応するOneSignal通知用External IDへ再関連付けするための値を取得する。

#### 認証・権限

- JWT必須
- JWTに対応する有効なユーザ本人の通知用IDだけを返す

#### リクエスト

- ボディなし

#### レスポンス

- 200 OK
- body:
  - onesignal_external_id: 文字列
- 通知用IDは、専用秘密値とJWTのユーザIDからHMAC-SHA256で決定的に生成する
- MongoDB ユーザIDそのものや、他ユーザの通知用IDは返さない

#### エラー

- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 503: EXTERNAL_FEATURE_DISABLED（`feature: oneSignalPush`）

#### データ更新・通知

- なし
- フロントエンドはアプリ起動時にこの値を取得し、値がある場合だけ`OneSignal.login(onesignal_external_id)`を呼ぶ

### GET /api/auth/line/authorize

LINE認可フローを開始し、LINEへリダイレクトする。

#### 認証・権限

- 不要

#### リクエスト

- query:
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 任意
  - floor_id: 文字列（64文字以内）, 任意。ログイン後の復帰先フロアID
  - room_id: 文字列（64文字以内）, 任意。ログイン後の復帰先ルームID

#### レスポンス

- 302 Found
- Location: LINE認可URL
- Set-Cookie:
  - line_oauth_state
  - line_oauth_nonce
  - line_lang
  - line_floor_id
  - line_room_id
- CookieはHttpOnly、SameSite=Laxで、本番環境のみSecure。有効期間はLINE_OAUTH_COOKIE_TTL_MSで変更でき、既定値は10分

#### エラー

- 400: INVALID_PARAMS
- 503: EXTERNAL_FEATURE_DISABLED（`feature: lineLogin`。Cookie作成とLINEへの遷移より前に拒否）

#### データ更新・通知

- OAuthのstateとnonceを生成し、復帰先情報とともにCookieへ保存

### GET /api/auth/line/callback

LINEからのコールバックを検証し、ログイン結果をHTMLで返す。

#### 認証・権限

- JWTは不要
- Cookieのstateおよびnonceを検証

#### リクエスト

- query:
  - code: 文字列, 必須
  - state: 文字列, 必須
- Cookie:
  - line_oauth_state: 文字列, 必須
  - line_oauth_nonce: 文字列, 必須
  - line_lang: 文字列, 任意
  - line_floor_id: 文字列, 任意
  - line_room_id: 文字列, 任意

#### レスポンス

- 200 OK
- Content-Type: text/html; charset=utf-8
- body: ログイン情報を親ウィンドウへpostMessageするHTML
- 親ウィンドウを利用できない場合は、ログイン情報をURLフラグメントへ格納し、/loginへ遷移
- floor_idまたはroom_idがCookieにある場合は、復帰先として/loginのクエリへ引き継ぐ

#### エラー

- 401: INVALID_PERMISSION（codeの不足、stateまたはnonceの不一致、LINEのトークン検証失敗など）
- 409: USER_ALREADY_EXISTS（同時登録の競合を解決できない場合）
- 503: EXTERNAL_FEATURE_DISABLED（`feature: lineLogin`。LINEとのトークン交換より前に拒否）

#### データ更新・通知

- stateが一致した後、LINEログイン用Cookieを削除
- LINEのトークン交換とIDトークン検証を実行
- 既存のLINE認証情報、メールアドレス、または新規ユーザの順にログイン先を解決する。新規作成では認証情報の一意キーでUser IDを予約し、同時要求・途中失敗後も同じUserを作成・再利用する。確定した認証情報の有効UserだけへJWTを発行する。詳細は[認証処理の競合と復旧](../auth-recovery.md)を参照
- JWTを発行し、冒頭のメディアCookieを設定・解除

### POST /api/auth/logout

ログインユーザ用のメディアアクセスCookieを解除する。同じ要求を繰り返しても成功する。

#### 認証・権限

- 不要。JWT期限切れやゲスト認証の障害時も利用できる。

#### リクエスト

- body: なし

#### レスポンス

- `204 No Content`
- `iseeetl_media_user`を発行時と同じCookie属性で失効させる。

#### データ更新・通知

- JWTや別端末のセッションは失効させず、DB更新やゲスト認証を行わない。
- 並行する認証済みAPIや新しいログインの応答によるメディアCookie発行は妨げない。
- フロントエンドは成功後にローカルのユーザ認証を解除し、ゲスト認証を試す。ゲスト認証に失敗してもログアウトは成功とする。通信失敗時は完了を表示せず、再試行できる。

### POST /api/auth/resetpassword/sendmail

パスワード再設定メールを送信する。対象メールアドレスの登録有無にかかわらず同じ成功応答を返す。

#### 認証・権限

- 不要
- 正規化したメールアドレス単位のレート制限あり。既定は1時間に5回
  - 前後空白と大文字・小文字の違いは同じメールアドレスとして数える
  - `RESET_MAIL_RATE_LIMIT_WINDOW_MS`と`RESET_MAIL_RATE_LIMIT_MAX`で変更可能
- IPアドレス単位のレート制限あり。既定は同じ1時間窓で20回
  - `RESET_MAIL_IP_RATE_LIMIT_MAX`で変更可能

#### リクエスト

- body:
  - mail: 文字列（メールアドレス、100文字以内）, 必須

#### レスポンス

- 200 OK
- body: OK

#### エラー

- 400: INVALID_PARAMS
- 429: レート制限超過（共通JSON形式ではなくexpress-rate-limitの既定応答）
- 500: INTERNAL_SERVER_ERROR（送信失敗・競合・送信後の状態確定失敗。画面から再要求できる）
- 503: EXTERNAL_FEATURE_DISABLED（`feature: mailDelivery`。再設定トークンを作成する前に拒否）

#### データ更新・通知

- メール配送が有効で、論理削除されていない対象ユーザがいる場合だけ、48文字の再設定トークンを発行する
- SMTP成功後、送信前のメール・セッション世代・再設定状態が変わっていない場合だけ`password_reset`へSHA-256・発行先メール・期限・未消費状態を確定する。送信失敗では旧リンクを置換しない。配送記録は保存せず、再要求では別のトークンを発行する。詳細は[認証処理の競合と復旧](../auth-recovery.md#パスワード再設定)を参照
- 対象ユーザに保存された言語で最新トークンを含む再設定メールを送信する
- 対象ユーザがいない場合は、トークン作成もメール送信も行わない

### POST /api/auth/resetpassword/verify

パスワード再設定トークンを検証する。

#### 認証・権限

- 不要

#### リクエスト

- body:
  - token: 文字列（48文字の16進数）, 必須

#### レスポンス

- 200 OK
- body: OK

#### エラー

- 400: INVALID_PARAMS（入力不正またはトークン不存在）
- 400: RESET_TOKEN_EXPIRED
- 401: INVALID_PERMISSION（旧リンクの有効Userが存在しない、または発行先メールから変更された場合）

#### データ更新・通知

- なし
- トークンの有効期限はRESET_TOKEN_TTL_MINUTESで変更でき、既定値は60分

### POST /api/auth/resetpassword

パスワードを再設定する。

#### 認証・権限

- 不要

#### リクエスト

- body:
  - password: 文字列（8〜16文字）, 必須
  - token: 文字列（48文字の16進数）, 必須

#### レスポンス

- 200 OK
- body: OK

#### エラー

- 400: INVALID_PARAMS（入力不正またはトークン不存在）
- 400: RESET_TOKEN_EXPIRED
- 401: INVALID_PERMISSION（トークンに対応する有効なユーザが存在しない）

#### データ更新・通知

- トークンの一致・未消費・期限内を条件に、消費状態とパスワード・`session_version`を同じUser更新で原子的に確定する。更新前の失敗はトークンを消費せず、同時送信・再利用は1回だけ成功する
- 論理削除されていない対象ユーザのパスワードを更新し、`session_version`を1増やして既存JWTをすべて失効させる
- パスワード更新成功直後に対象ユーザの全Socketへ`SESSION_REVOKED`を送り切断する。通知メールやトークン後処理が失敗しても、この失効は完了済みとなる
- Userの確定状態で旧リンクを拒否する。互換読込した旧トークンの物理回収に失敗しても成功応答を維持する
- メール有効時は保存済み言語で再設定完了通知を試行する。失敗は200を覆さず、未送信記録の保存・再配送は行わない

#### 旧リンクとの互換性と索引

新規発行はUser内の状態を使用します。旧`ResetPassword`のリンクは、Userが新状態を持たない場合だけ受け付けます。移入、再要求、切替条件、検索索引の適用は[認証処理の競合と復旧](../auth-recovery.md)を参照してください。`ResetPassword`のメール・トークン一意索引も維持します。

## 関連資料

### 実装

- `backend/routes/auth.route.js`
- `backend/controllers/auth.controller.js`
- `backend/services/auth.service.js`
- `backend/integrations/onesignal/identity.js`
- `backend/models/UserTemp.js`

### テスト

- `backend/tests/unit/services/auth.service.test.js`
- `backend/tests/integration/routes/auth.route.int.test.js`
- `backend/tests/integration/routes/auth.oauth.route.int.test.js`
