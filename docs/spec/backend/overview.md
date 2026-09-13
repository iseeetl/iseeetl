# バックエンド概要

## 概要

この文書では、`backend/` の構成、起動処理、ルートマウント、主要モジュールを説明します。
個別エンドポイントは [API詳細仕様](api/README.md)、共通の認証ヘッダとエラー形式は [REST API 共通規約](api-conventions.md)、リアルタイム通信は [Socket.IO接続・イベント契約](../socket-events.md) を参照してください。

- フロア・ルーム単位のタイムライン、投稿、返信、タグ、メンバー管理をREST APIで提供する
- Socket.IOでタイムライン更新とルーム状態をリアルタイム配信する
- MongoDBのドメインデータを操作する
- プロフィール画像とフロア・ルーム・タイムラインのメディアを保存・配信する
- 認証、通知、翻訳、文字起こしなどの外部サービス連携を仲介する
- ビルド済みSPAを配信し、History APIを使用する画面ルートを処理する

## 構成・設定項目

### 技術スタック

| 領域 | 主な技術 |
| --- | --- |
| HTTP API | Node.js、Express 4 |
| データベース | MongoDB、Mongoose 7 |
| リアルタイム通信 | Socket.IO 4 |
| 入力検証・保護 | express-validator、express-mongo-sanitize |
| ファイル受信・変換 | multer、sharp、fluent-ffmpeg |
| 外部連携 | LINEログイン、Googleログイン、OneSignal、Google Translate、OpenAI、メール |

依存バージョンの許容範囲は`backend/package.json`、lockファイルで固定された正確なバージョンは`backend/package-lock.json`で確認します。Node.js・npmの対応範囲は[backend/package.json](../../../backend/package.json)の`engines`を参照してください。

### 主要モジュール

| 領域 | 主な配置 |
| --- | --- |
| 認証・ユーザ | 共通窓口の`controllers/auth.controller.js`、`services/auth.service.js`、`services/user.service.js`と、用途別の`controllers/auth/`、`services/auth/`、`services/user/` |
| Google Analytics設定・仮名ID | `routes/analytics.route.js`、`controllers/analytics/`、`services/analytics/` |
| フロア・ルーム | `controllers/floor/`、`controllers/room/`、`services/floor/`、`services/room/` |
| タイムライン | `controllers/timeline/`、`services/timeline/`、`routes/timeline/`。管理機能は照会・ZIP生成・更新へ、投稿／返信の付加情報は共通の更新処理と個別MongoDB更新へ分離する |
| 自動解析 | 共通窓口の`services/analysis.service.js`と`services/analysis/media.service.js`、画像・動画・音声・安全なパス解決・AI実行環境・付加情報保存を分けた`services/analysis/` |
| ファイルアップロード | `routes/upload.route.js`、`middlewares/uploaders.js`、`middlewares/validation.js`、`services/upload.service.js`。受信ファイルの後処理は`services/upload/uploadCleanup.js` |
| メディア参照・削除 | ルーム画像とタイムラインで共用する`services/media/reference.js`・`fileCleanup.js`、未使用ファイルの破棄を扱う`services/media/discard.service.js` |
| 有効データ取得・フロア権限 | `services/_shared/activeResource.js`で有効なユーザ・フロア・ルームを取得し、`services/_shared/floorAccess.js`でフロア権限を判定する |
| タグ・単語 | 各tag/quickTextのコントローラ、サービス、モデル |
| 通知・翻訳・文字起こし | `integrations/` と関連サービス |
| Socket.IO | `socket/index.js`、`socket/authenticateSocket.js`、`socket/roomPresence.js`、接続ルーム名と再認可を扱う`socket/accessRooms.js`・`socket/accessControl.js` |
| 共通認証・エラー | `middlewares/errorHandler.js`、`utils/appError.js`、`utils/errorResponse.js` |

公開用タイムラインデータへの変換は`services/timeline/shared/timelineSerializer.js`で行います。元データを変更せず、内部項目と、通常表示では削除済みの子データを除外します。

認証、ユーザ、フロア／ルーム、タイムラインの主要サービスは、共通の窓口から用途別モジュールへ処理を委譲します。登録・ログイン、プロフィール、管理、取得、作成・更新・削除などを分けて実装しています。

## 動作・適用条件

### 起動処理

エントリーポイントは`backend/app.js`です。直接実行した場合だけ`backend/bootstrap/startServer.js`の`runServer`を呼び、モジュールとして読み込んだ場合は起動処理を開始しません。HTTPアプリの組み立ては`backend/createApp.js`の`configureApp`を使用し、同じモジュールの`createApp`はDB接続や待受を開始せず、HTTPアプリだけを生成します。

1. `DB_CONNECT`、`JWT_SECRET`、`MEDIA_PATH`、`PROFILE_PATH`、`VUE_APP_APPURL`、`GUEST_JWT_SECRET`、`GUEST_REFRESH_SECRET`を起動必須として検証する。未設定時は不足する変数名を出力し、終了コード1で停止する。
2. `bootstrap/runtimeConfig.js`でフロントエンド URLをHTTP／HTTPS URLとして検証し、外部機能の明示フラグを解決して、
   有効な機能だけ必須設定を検証する。フロントエンド URL、外部機能の有効状態、検証済み外部サービス設定を起動時スナップショットとして
   固定する。`MEDIA_PATH`、`PROFILE_PATH`の末尾区切りの正規化、静的ルートとHTTP／Socket CORS設定の解決も行う。
3. `bootstrap/startServer.js`でMongoDB接続Promiseを開始する。
4. 接続完了を待つ間に、`bootstrap/createServer.js`で未設定のExpressアプリとHTTP サーバを作成し、同じHTTP サーバへSocket.IOを関連付ける。Socket ルーム指定値の文字列化、接続認証、ルーム参加、在室状況管理もここで登録する。
5. `configureApp`でHTTP CORS、メディア・プロフィール静的配信、History API フォールバック、SPA静的配信、APIルート、GET フォールバック、グローバルエラーハンドラの順に登録する。
6. MongoDB接続後、`bootstrap/initializeIndexes.js`でUser、FloorMember、RoomMember、KickedUserの索引作成完了を待つ。失敗時は受付を開始せず、終了コード1で停止する。MongoDBの接続とサーバ選択はそれぞれ最大120秒待機する。
7. 索引の準備完了後、`PORT`または既定の5000番ポートでlistenを開始し、`listening`イベントまで待つ。ポート競合などの`error`や同期例外は起動失敗として終了コード1で停止し、成功ログと終了ハンドラの登録を行わない。
8. `bootstrap/shutdown.js`で終了シグナルのハンドラを登録し、終了処理へMongoDB接続とプロセス依存を渡す。

MongoDBの接続PromiseはHTTP／Socket.IOとルートの同期初期化より先に開始しますが、同期初期化は接続完了を待たずに進みます。外部からHTTP／Socket.IOを受け付けるlistenは、MongoDB接続と対象モデルの索引作成に成功した後にだけ実行されます。

起動時に必須とする変数と環境別の設定方法は [環境変数](environment-variables.md) を参照してください。

### HTTP処理の構成

`backend/createApp.js`は、次の2つの関数を提供します。

- `configureApp`: 受け取ったExpressアプリへ共通ミドルウェアとルートを設定し、同じアプリを返す。
- `createApp`: Expressアプリを生成し、同じ設定を適用して返す。

環境区分、外部機能の有効状態、内部設定、CORS、静的配信先、Socket.IOサーバ、ロガーは引数で受け取ります。環境変数の検証、DB接続、HTTP・Socket.IOサーバの生成、接続ハンドラ、受付開始、終了処理は起動側が担当します。本番と結合テストは同じ`configureApp`を使用します。

在室状態はSocket.IO側で管理し、HTTPアプリへは渡しません。Analyticsの設定と秘密値は専用ルートへ渡し、Expressの公開設定へ保存しません。公開範囲と内部保持は[Google Analytics設定・仮名ID API](api/analytics.md)を参照してください。

#### 共通ミドルウェア

- `trust proxy=1`により、1段のリバースプロキシを前提にクライアントIPとsecure接続を解決する
- `express.json()` と `express.urlencoded()` でリクエストボディを受け取る
- `cookie-parser` でCookieを読み取る
- `express-mongo-sanitize` でリクエストボディ、クエリ、パスパラメータ、ヘッダの`$`と`.`を含む危険なキーを除去する
- `x-powered-by` ヘッダを無効化する
- developmentでは設定済みoriginに`GET`、`POST`、`PUT`、`DELETE`、`OPTIONS`、`PATCH`を許可する
- productionでは設定済みoriginに`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`OPTIONS`を許可する。ステージングも`NODE_ENV=production`としてこの分岐を使用する
- development／production以外の`NODE_ENV`では、`configureApp`によるHTTP CORS ミドルウェアを追加しない
- developmentの`/api/auth`だけ、応答完了時にmethod、パス、status、処理時間をinfoログへ出す

共通の入力形式、認証ヘッダ、レスポンスは [REST API 共通規約](api-conventions.md) を参照してください。

#### 静的配信とSPA

- `/media/<floor_id>/<file_name>`: フロア画像を公開配信する
- `/media/<floor_id>/<room_id>/<file_name>`: ユーザまたはゲストのHttpOnly メディアアクセスCookieを検証し、現在のルームアクセス権とキック状態を再確認してから配信する。動画・音声のRange リクエストを維持する
- `/media`の応答には`X-Content-Type-Options: nosniff`と能動コンテンツを禁止するContent Security Policyを付け、ルーム配下は`Cache-Control: private, no-store`とする
- `/profile`: `PROFILE_PATH`を同じセキュリティヘッダ付きで配信する
- その他の静的ファイル: `DIST_PATH`を配信する。productionでは明示設定が必須。DB接続・待受前に配信ディレクトリと`index.html`の存在・読取可否を検証する。development等では既定パスを使用する
- History API フォールバックでは、`/api/.*`、`/media/.*`、`/profile/.*`を元のパスのまま後続処理へ渡し、それ以外の画面遷移をSPAのエントリーポイントへ解決する
- APIルートはHistory API フォールバックとSPA静的配信の後に登録する。上記のパス判定により`/api/*`はSPAへ置換しない
- 未定義の`/api/*`へのGETは、HTML Acceptを含めて共通エラー形式の404 `NOT_FOUND`を返す
- 完全一致`/api`は、JSON AcceptまたはAcceptなしでは共通404を返す。HTML Acceptまたは`*/*`ではSPA エントリーポイントがあれば配信し、なければ`/`へリダイレクトする
- 完全一致`/media`と`/profile`は、配信ディレクトリがあれば末尾スラッシュ付きパスへ301リダイレクトする。ルーム配下の想定外の深いパスは静的配信へフォールスルーさせない
- GET フォールバックまで到達したその他のパスは`/`へリダイレクトする。`/`自体が後続フォールバックまで到達した場合は404とする
- 未定義の非GET パスはGET フォールバックとグローバルエラーハンドラを通らず、Express既定の404を返す

### APIルートマウント

ルート登録は `backend/routes/apiMounts.js` に集約されています。

| ベースパス | 主な責務 |
| --- | --- |
| `/api/capabilities` | 認証前に参照できる外部機能の有効状態 |
| `/api/analytics` | GA4 Measurement IDの公開設定とログインユーザ向け仮名ID生成 |
| `/api/auth` | 登録、有効化、ログイン、外部ログイン、パスワード再設定 |
| `/api/guest` | ゲストトークンの発行・更新 |
| `/api/user` | ユーザ情報と管理者向けユーザ管理 |
| `/api` | フロア、ルーム、メンバー、タグ、単語 |
| `/api/fileupload` | プロフィール・フロア・ルームのファイル受信 |
| `/api/rooms/:room_id/timeline` | ログインユーザ向け投稿・返信・付加情報・タグ操作、取得・検索、メディア受信・破棄 |
| `/api/rooms/:room_id/tags` | ルームタグ一覧 |
| `/api/chat` | タイムラインのロール判定・リアクション・文字起こし・PushFilter・管理操作 |
| `/api/chat/guest` | ゲスト向けタイムライン |
| `/api/categorytag`、`/api/soundtag` | 共通タグと音を鳴らすタグの設定 |
| `/api/spam`、`/api/kickeduser` | スパムワードの管理、キック管理 |
| `/api/v1` | 専用JWTを使用する外部連携用v1 API |

公開プレフィックスと機能別仕様は[API仕様の入口](api.md)を参照してください。個別Method／Pathは
[API詳細仕様](api/README.md)から対象機能を選びます。

- `/api/auth`だけにdevelopment用の処理時間ログミドルウェアを追加する
- `/api/auth`、`/api/user`、`/api`は`req.io`へSocket.IOサーバを注入し、パスワード・ルーム設定・削除・ロール変更時の既存Socket処理に使用する
- フロア、ルーム、キック、v1のルート生成関数へSocket.IO サーバを渡す
- タイムラインとゲストタイムラインはルート登録時のミドルウェアが`req.io`へSocket.IO サーバを注入し、引数なしのルート生成関数を使用する
- v1は`backend/routes/v1.js`から`backend/routes/v1/index.js`へ委譲し、通常APIと同じサービスを使用する。提供範囲、入力変換、認可は[v1 API仕様](api/v1.md)を参照する

### データ

- MongoDBへの接続は `DB_CONNECT` で指定する
- Mongooseモデルは `backend/models/` に配置し、タイムラインの埋め込みスキーマは`backend/models/schemas/timeline/`に分離する
- エンティティ、所有関係、埋め込み、論理削除は [ドメインモデル](../domain-model.md) を参照してください
- ユーザロールとメンバー関係によるアクセス判定は [ロール・権限仕様](../roles-and-permissions.md) を参照してください

#### 起動時の索引作成

User、FloorMember、RoomMember、KickedUserは`autoIndex: true`とし、起動時にモデル定義から索引を作成します。定義は[ユーザメール](user-mail-index.md)、[メンバー関係](member-relationship-uniqueness.md)、[キック情報](api/kicked-user.md#一意索引の作成)を参照してください。接続するDBでは、アプリに必要な読み書きに加えて索引作成の権限を用意します。

対象モデルの`init()`がすべて成功すると`[DATABASE] indexes ready`を出力し、HTTP／Socket.IOの受付へ進みます。再起動時に同じ定義の索引があれば作り直しません。既存索引の削除・上書きや、重複データの自動修正は行いません。

索引作成に失敗すると`INDEX_INITIALIZATION_FAILED`で起動を終了します。ログの`model`は対象モデル、`databaseCode`はMongoDBのエラーコードです。メールアドレスなどの保存値は出力しません。

| `databaseCode` | 確認する内容 |
| --- | --- |
| `11000` | 一意制約に違反する重複データ |
| `85`・`86` | モデル定義と競合する既存索引のオプション・キー |
| `13` | DBへの操作権限 |
| その他・`unknown` | DBの稼働状態と、該当する[MongoDBのエラーコード](https://www.mongodb.com/docs/manual/reference/error-codes/) |

既存DBへの反映前にバックアップを取り、重複データと既存索引の定義を確認します。問題があれば、保持すべきデータと制約を確認して解消してから起動します。失敗後も同じ順序で対処し、再起動します。起動させるためだけにデータや索引を無条件に削除しないでください。

### リアルタイム通信

- Socket.IOはREST APIと同じHTTPサーバを使用する
- heartbeatは`pingInterval=5000ms`、`pingTimeout=15000ms`で、Engine.IO 3クライアント互換を有効にする
- Socket.IOにも環境別CORSを設定し、ルーム指定にMongoose ObjectIdなどが渡された場合は文字列へ正規化する
- `backend/socket/index.js`がSocket ハンドラを登録し、`authenticateSocket.js`が接続認証、`roomPresence.js`がルーム参加と参加者管理を担当する
- 接続中の参加者はプロセス内の `Map` に保持する
- JWTまたはゲストトークンを検証し、REST APIと共通のルームアクセス判定を使用する
- バックエンドは単一プロセスで起動する。Socket.IO adapterと参加者Mapを複数プロセス間で共有しない
- 接続クエリ、サーバ管理ルーム、イベントペイロード、配信対象、再接続・アクセス失効は[Socket.IO接続・イベント契約](../socket-events.md)を参照する

### ファイルと外部連携

- 保存先、事前認可、許可形式、サイズ・multipart件数上限は [ファイルアップロードAPI](api/upload.md) を参照してください
- メディアの保存・参照・配信・削除では共通のパス検証を使用し、保存ルート外へ解決されるIDやファイル名を拒否する。DB更新後に行う置換済み画像の削除は後処理とし、失敗を記録して更新済みAPI応答を失敗へ変えない
- ユーザログイン、Google／LINEログインおよび有効なユーザJWTを確認したAPI応答ではユーザ用、ゲストトークンの発行・更新および有効なゲストトークンを確認したAPI応答ではゲスト用のメディアアクセスCookieを発行する。ただし、Analytics Identity APIと、`RoomTag`・ルーム単語一覧の任意認証では発行しない。CookieはHttpOnly、SameSite=Strict、`/media`限定で、元のアクセストークンと同じ有効期限を持つ。ユーザとゲストを切り替える時は以前のメディア Cookieを削除する
- LINEログイン、OneSignal、Googleログイン、Google Translate、Google Analytics、OpenAI、メール送信の
  明示フラグと必須設定は[環境変数](environment-variables.md)を参照する
- 各外部機能は明示フラグが`true`の場合だけ必須設定を検証して有効化し、フラグが`false`の場合は残存設定を
  検証せず無効にする。外部機能の有効状態と検証済み設定は起動時に固定する。フロントエンドは固定真偽値だけの
  `GET /api/capabilities`で状態を参照する
- Google Analyticsは`EXTERNAL_GOOGLE_ANALYTICS_ENABLED=true`かつMeasurement IDとUser-ID用秘密値が
  妥当な場合だけ有効にする。不足・不正は起動を拒否する。バックエンドは公開設定としてMeasurement IDを返し、
  有効なログインユーザJWTから仮名IDを生成する。バックエンド自身はGoogleへイベントを送信せず、秘密値、元ユーザID、
  JWTを応答やログへ公開しない
- 外部クライアントは`backend/integrations/google/`、`backend/integrations/line/`、`backend/integrations/onesignal/`、`backend/integrations/openai/`、`backend/integrations/mail/`へ配置する。Google・LINE認証の通信は各`login.client.js`、ユーザとの連携・ログイン処理は`services/auth/`が担当する。OpenAIクライアントの共通エラー変換は`integrations/openai/errors.js`で扱う
- 外部連携の運用条件は [バックエンドの運用上の注意](considerations.md) に記載する

### ログ、エラー、定期処理

- `backend/utils/logger.js` はdevelopmentでinfo/warn/error、productionでerrorを出力する
- HTTP受付開始時に8つの外部機能の有効状態を`enabled`／`disabled`として1行で出力し、設定値や秘密値は出力しない
- `backend/middlewares/errorHandler.js`のグローバルエラーハンドラが、`AppError`と未処理エラーをJSONへ変換する。本番アプリと結合テスト環境は同じ実装を使用する
- developmentでは認証APIの処理時間をアプリ共通のロガーへ出力する
- AppErrorはwarn、未処理例外はerrorとしてstackをログへ出し、クライアントへはエラーカタログのcode、status、messageと任意detailsだけを返す
- cron、`setInterval`、アプリ内スケジューラは使用していない。翻訳・解析などは`services/backgroundTaskRunner.js`で追跡してリクエスト処理から非同期で開始し、失敗は同じ処理管理モジュールで記録する

エラー応答の形式は [REST API 共通規約](api-conventions.md)、監視・データ保持の運用条件は [バックエンドの運用上の注意](considerations.md) を参照してください。

### 終了処理

- MongoDB接続とHTTP listen成功後に`SIGINT`、`SIGUSR2`、`SIGTERM`を各1回だけ受け取るハンドラを登録する
- 最初のシグナルでHTTP サーバの新規受付を停止し、追跡中のバックグラウンド処理、Socket.IO サーバ、処理中HTTP接続、MongoDB接続の順に終了する
- 追跡中の処理へ中止を通知し、完了を待つ。完了待ちに失敗した場合はAI解析用の一時メディアを削除してからMongoDB接続を閉じる
- HTTP／Socket／バックグラウンド処理の終了には10秒の上限を設け、全処理の成功時は終了コード0、失敗またはタイムアウト時は終了コード1でプロセスを終了する
- 複数シグナルを受けても同じ終了Promiseを返し、各closeとプロセス exitは1回だけ実行する

### 開発・テスト

- 開発起動: [ローカル開発の準備](../../testing/local-development.md)
- テスト: [テスト環境の準備とコマンド選択](../../testing/test-environment.md)
- サーバでの起動: [サーバへの導入](../../deployment/README.md)。プロセス管理には運用環境に合う方法を選ぶ
- リリースパッケージの構成・識別情報・配置条件: [リリース成果物仕様](../release-artifact.md)

## 関連資料

### 実装

- `backend/app.js`
- `backend/createApp.js`
- `backend/bootstrap/`
- `backend/socket/`
- `backend/controllers/`

### テスト

- `backend/tests/integration/app.factory.int.test.js`
- `backend/tests/integration/routes/media.access.int.test.js`
- `backend/tests/unit/bootstrap/gracefulExit.test.js`
- `backend/tests/unit/bootstrap/startServer.test.js`
- `backend/tests/integration/models/startup-indexes.int.test.js`
- `backend/tests/unit/services/backgroundTaskRunner.test.js`
