# バックエンド環境変数

## 概要

バックエンドとその起動スクリプトが使用する環境変数を、起動時必須、機能利用時必須、実行モード、任意調整に分類する。各項目に用途、既定値、未設定・不正値時の動作を示す。

- ダミー値を含む形式例は[バックエンド環境変数の設定例](../../../backend/.env.example)を参照する。この設定例は自動読込されない。
- 実際の秘密値、接続文字列、資格情報JSONはGit管理しない。
- フロントエンドへ埋め込む公開設定は`VITE_*`を使用する。ここに記載する`VUE_APP_APPURL`と`VUE_APP_APPNAME`はバックエンド専用設定であり、フロントエンドの公開設定へ秘密値を設定してはならない。
- 秘密値を含む設定はログへ出力しない。
- サーバ用ソフトの準備と起動は[サーバへの導入](../../deployment/README.md)を参照する。実際の稼働環境とPM2での起動方法は[運用事例](../../deployment/production.md)で説明する。

## 構成・設定項目

### 起動時必須

未設定または空白だけの場合、`backend/bootstrap/runtimeConfig.js`は不足する変数名を特定し、エントリーポイントは変数名を出力して終了コード1で停止する。

| 変数 | 用途 | 起動時検証の範囲 |
| --- | --- | --- |
| `DB_CONNECT` | MongoDB接続先 | 空でないことを確認 |
| `JWT_SECRET` | 通常ユーザJWTの署名・検証 | 空でないことを確認 |
| `MEDIA_PATH` | タイムライン、フロア、ルームのメディア保存・配信ルート | 空でないことを確認し、末尾の区切り文字を補完 |
| `PROFILE_PATH` | プロフィール画像の保存・配信ルート | 空でないことを確認し、末尾の区切り文字を補完 |
| `VUE_APP_APPURL` | 認証メール、通知、外部ログイン後のフロントエンド URL | 空でないHTTPまたはHTTPS URL |
| `GUEST_JWT_SECRET` | ゲストアクセストークンの署名・検証 | 空でないことを確認 |
| `GUEST_REFRESH_SECRET` | ゲストリフレッシュトークンの署名・検証 | 空でないことを確認 |

`JWT_SECRET`、`GUEST_JWT_SECRET`、`GUEST_REFRESH_SECRET`は、OSまたは秘密値管理ツールの乱数生成機能で作成した、用途ごとに異なる値を設定する。手入力した単語や規則的な文字列は使用しない。バックエンドは同値使用や短い値を起動時に拒否しないため、設定時にこれらの条件を満たす必要がある。

### 機能利用時に必要な設定

#### LINEログイン

| 変数 | 用途 |
| --- | --- |
| `EXTERNAL_LINE_LOGIN_ENABLED` | LINEログインの有効化 |
| `LINE_LOGIN_CHANNEL_ID` | LINEログインのチャネルID |
| `LINE_LOGIN_CHANNEL_SECRET` | トークン交換用チャネルシークレット |
| `LINE_LOGIN_REDIRECT_URI` | LINE コールバック URL |

- フラグが`true`の場合だけ3項目を必須とし、不足時はバックエンドが起動しない。
- `LINE_LOGIN_REDIRECT_URI`はHTTPまたはHTTPS URLとし、LINE側へ登録したコールバック URLと一致させる。

#### Googleログイン

| 変数 | 用途 |
| --- | --- |
| `EXTERNAL_GOOGLE_LOGIN_ENABLED` | Googleログインの有効化 |
| `GOOGLE_OAUTH_CLIENT_ID` | Google ID トークンのaudience検証 |

- フラグが`true`の場合だけクライアント IDを必須とする。

#### Google Analytics

| 変数 | 用途 |
| --- | --- |
| `EXTERNAL_GOOGLE_ANALYTICS_ENABLED` | Google Analyticsの有効化 |
| `GA4_MEASUREMENT_ID` | フロントエンドがGoogleタグを初期化するWeb streamの公開Measurement ID |
| `GA4_USER_ID_SECRET` | 登録ユーザの元IDを直接送らないため、GA4 User-ID用の仮名IDをHMAC-SHA256で生成する専用秘密値 |

- フラグが`true`の場合だけ2項目を必須とし、不足変数を`EXTERNAL_FEATURE_CONFIG_INVALID`としてバックエンドを起動しない。
- Measurement IDは`G-`に続く英大文字または数字だけを許可する。不正な形式ではバックエンドを起動しない。公開可能な識別子だが、外部機能の有効状態APIの応答やログへは含めず、外部機能が有効な場合の`GET /api/analytics/config`だけでフロントエンドへ返す。
- User-ID用秘密値は空白除去後にUTF-8で32バイト以上でなければバックエンドを起動しない。OSまたは秘密値管理ツールの乱数生成機能で作成し、手入力した単語や規則的な文字列は使用しない。
- JWT、ゲスト、OneSignal、OAuthなど他用途の秘密値と共有しない。productionと非productionでも異なる値を使用する。
- 同じ環境の全バックエンドプロセスでは同じ値を使用する。値が異なると同じ登録ユーザに異なる`analytics_user_id`が生成される。
- 2項目は起動時に正規化・検証して各HTTPアプリへ渡す。User-ID用秘密値はフロントエンド設定、外部機能の有効状態APIの応答、API応答、ログへ値・長さ・設定元を公開しない。
- 秘密値を変更すると生成される`analytics_user_id`も変わり、GA4上で変更前後の登録ユーザを同じユーザとして継続集計できない。意図しない変更を避ける。
- 設定変更は実行中プロセスへ反映されない。バックエンドを再起動する。
- 2項目が妥当な場合だけ、公開設定APIと登録ユーザ向け仮名ID APIを同時に有効にする。バックエンド自身はGoogle Analyticsへイベントを送信しない。API契約は[Google Analytics設定・仮名ID API](api/analytics.md)を参照する。

#### メール送信

| 変数 | 用途 |
| --- | --- |
| `EXTERNAL_MAIL_DELIVERY_ENABLED` | SMTPメール送信の有効化 |
| `SEND_MAIL_HOST` | SMTP ホスト |
| `SEND_MAIL_PORT` | SMTP ポート |
| `NO_REPLY_MAIL` | Fromの送信元アドレス |
| `VUE_APP_APPNAME` | From表示名、件名、本文中のアプリ名 |
| `VUE_APP_APPURL` | 有効化・パスワード再設定URLの生成元 |

- フラグが`true`の場合だけSMTP 3項目と`VUE_APP_APPNAME`をメール固有の必須項目とする。`VUE_APP_APPURL`はフラグにかかわらずバックエンド全体の起動時必須項目である。
- `SEND_MAIL_PORT`は1～65535の10進整数、`NO_REPLY_MAIL`はメールアドレス形式でなければバックエンドが起動しない。
- `VUE_APP_APPURL`はメール内のリンク生成に使用する。公開フロントエンドのHTTP／HTTPSオリジンを末尾の`/`なしで設定する。
- developmentとproductionは同じSMTP接続設定を使用する。SMTP接続は認証なし、`secure: false`、TLS証明書検証なしであり、管理された内部SMTPまたは開発用Mailpitだけを対象とする。外部SMTPへ直接接続せず、認証と証明書検証を含む接続処理を実装・検証してから切り替える。
- メール無効時、ユーザ登録とパスワード再設定メール要求は`EXTERNAL_FEATURE_DISABLED`の503応答となり、SMTPへ接続しない。パスワード変更後などの通知は送信を省略する。登録・再設定URL、トークン、メール本文、宛先をconsoleへ出力しない。

#### OneSignalプッシュ通知

| 変数 | 用途 |
| --- | --- |
| `EXTERNAL_ONESIGNAL_ENABLED` | OneSignalプッシュ通知の有効化 |
| `ONESIGNAL_APP_ID` | OneSignal application ID |
| `ONESIGNAL_REST_API_KEYS` | REST API認証 |
| `ONESIGNAL_HOST` | API ホスト。既定`onesignal.com` |
| `ONESIGNAL_PORT` | API ポート。既定`443` |
| `ONESIGNAL_PATH` | 通知API パス。既定`/api/v1/notifications` |
| `ONESIGNAL_EXTERNAL_ID_SECRET` | ユーザIDから通知用External IDを生成する専用秘密値 |

- フラグが`true`の場合だけ必須3項目を検証し、専用秘密値がUTF-8で32バイト以上の場合だけ有効になる。不足または短い場合はバックエンドが起動しない。変換前のユーザIDへフォールバックしない。
- ホスト、ポート、パスは任意で、未設定または空白なら上記の既定値を起動時に適用する。
- ポートは1～65535の10進整数、パスは`/`で始まる値とする。
- 秘密値を変更するとExternal IDも変わる。端末が次回アプリ起動時に再関連付けされるまで通知を受信できない。
- 無効時は通知を送らず空配列を返す。現行の低レベルクライアントはAPIエラーと通信エラーを呼出元へ伝播せず再試行もしない。

#### Google Translate

| 変数 | 区分 | 用途 |
| --- | --- | --- |
| `EXTERNAL_GOOGLE_TRANSLATE_ENABLED` | 機能判定 | `true`／`false`で外部翻訳を明示的に有効化・無効化 |
| `GOOGLE_APPLICATION_CREDENTIALS` | 機能判定 | Application Default Credentialsで読む資格情報ファイルのパス |
| `GOOGLE_PROJECT_ID` | 機能判定 | 翻訳 APIの`parent`に使用するプロジェクトID |
| `GOOGLE_TRANSLATE_LOCATION` | 任意 | 翻訳 API location。既定`global` |
| `GOOGLE_TRANSLATE_API_LIMIT` | 有効時必須 | 月単位の文字数上限。正の安全な整数または`unlimited` |

- `false`では資格情報と上限値を評価せず、タグ、単語、タイムライン、AI結果の外部翻訳を行わない。
- `true`では資格情報のパス、プロジェクトID、上限値を必須とし、不足時は起動しない。
- 上限値は10進の正の安全な整数、または明示的な無制限を表す`unlimited`だけを許可する。未設定、0、負数、小数、指数表記、不正値は起動エラーとする。
- API失敗時はerrorログを出して空の翻訳結果を返し、原文データの保存は継続する。

#### OpenAI解析・文字起こし

| 変数 | 区分 | 用途 |
| --- | --- | --- |
| `EXTERNAL_OPENAI_ENABLED` | 機能判定 | `true`／`false`でOpenAI解析と文字起こしを一体で有効化・無効化 |
| `OPENAI_API_KEY` | 有効時必須 | 画像・動画・音声・本文解析と文字起こしのAPI認証 |
| `OPENAI_VISION_MODEL` | 有効時必須 | 画像解析（`vision`）のモデル |
| `OPENAI_VIDEO_MODEL` | 有効時必須 | 動画解析（`video`）のモデル |
| `OPENAI_AUDIO_MODEL` | 有効時必須 | 音声の状況解析（`audioScene`）のモデル |
| `OPENAI_CONVERSATION_MODEL` | 有効時必須 | 投稿・返信本文の解析（`conversation`）のモデル |
| `OPENAI_TRANSCRIPTION_MODEL` | 有効時必須 | 自動解析（`speech`）と通常操作の文字起こしの共通モデル |

- `false`ではOpenAI クライアントとAI タスクを作らず、文字起こしも無効にする。AI解析設定の管理と通常のタイムライン保存は利用できる。local／Unit／Integration／E2Eでは未設定もfalseとして扱う。
- staging／productionではフラグの未設定、不正値を起動エラーとする。`true`では`OPENAI_API_KEY`と5種類すべてのモデル指定を必須とする。未設定・空値・空白のみの場合は不足する変数名を示して起動を拒否する。`false`ではモデル指定は不要。
- 解析実行時の結果ユーザは各設定の保存値から解決する。`SUPPORT_USER_ID`は設定画面の新規作成時の初期選択にだけ使用する。
- [環境変数の設定例](../../../backend/.env.example)を参考にモデルを指定する。コード内の既定値や別種別のモデルによる代替はない。設定は起動時に固定され、変更の反映にはバックエンドの再起動が必要。
- モデルを変更するときは、画像・動画・音声の状況解析・本文解析で使用するChat Completions API、文字起こしで使用するAudio Transcriptions APIの入力形式・パラメータに対応するモデルを選ぶ。起動時の検証は設定の有無を対象とし、モデルの利用可否やAPI互換性は検証しない。解析対象と制限は[AI解析設定・実行仕様](../ai-analysis.md#解析種別)を参照する。
- 自動解析の失敗は投稿・返信の保存を取り消さず、errorログを出して解析結果なしで継続する。

#### 外部連携用v1 API

| 変数 | 用途 |
| --- | --- |
| `JWT_DEV_SECRET` | `/api/v1`用JWTの検証 |

- 通常APIの`JWT_SECRET`とは異なる秘密値を使用する。
- `JWT_DEV_SECRET`未設定でもバックエンドは起動するが、v1 JWT検証は成功しない。
- v1のアップロードと未添付メディア破棄は、通常APIと同じ処理と保存先（`MEDIA_PATH`）を使用する。
- `/api/v1`は通常APIと認証方式が異なります。[v1 API](api/v1.md)を参照してください。

### 実行モード

#### `NODE_ENV`

| 値 | HTTP／Socket.IO | メール | ログ |
| --- | --- | --- | --- |
| `development` | 開発用CORSと許可HTTPメソッド | 明示フラグと必須設定に従う | info／warn／error、認証APIの処理時間 |
| `production` | 本番用CORSと許可HTTPメソッド | 明示フラグと必須設定に従う | 共通ロガーはerrorだけ |
| `test` | `app.js`のモード別CORSなし | 明示フラグと必須設定に従う | 非productionとしてinfo／warn／error |
| 未設定・その他 | `app.js`のモード別CORSなし | 明示フラグと必須設定に従う | 非productionとしてinfo／warn／error |

- `NODE_ENV`は起動時の必須検証対象ではない。
- ステージングでも`NODE_ENV=production`を設定し、本番分岐を使用する。
- `npm run dev`は`backend/.env.development`を読み込み、`NODE_ENV=development`を設定する。

### E2E軽量隔離用設定

E2E専用コマンドは、`.env.e2e.example`から作成した`backend/.env.e2e`を専用ローダーで読み込みます。ファイルがなければ作成方法を案内して停止し、設定例へ自動で切り替えません。通常のdevelopment・staging・productionでは使用せず、親プロセスの同名変数で上書きしません。

ローダーは専用DB`iseeetl_e2e`、バックエンドの5100番ポート、リポジトリ内の`.e2e-runtime/`、外部機能の隔離条件を検証し、不一致なら起動しません。固定アカウント、Mailpit、プロファイル別の外部機能、DB初期化と後処理は[E2E手順](../../testing/e2e-testing.md)を参照してください。

### 任意調整

#### AI解析設定の初期ユーザ

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `SUPPORT_USER_ID` | 空欄 | 共通・フロア・ルームAI解析設定を画面から新規作成する際の「付加情報を行うユーザ」の初期選択 |

既存ユーザのID（24桁の16進数）を指定する。前後の空白は除去し、未設定・不正な形式・存在しないユーザ・論理削除済みユーザの場合は初期選択を空欄にする。OpenAIの有効化とは独立して利用できる。

画面でユーザを選び直すことができ、編集時は保存済みのユーザを維持する。保存APIの`result_user`は引き続き必須で、環境変数による省略時の補完は行わない。既存設定や保存済みの解析結果は変更せず、ユーザの自動作成もしない。環境ファイルの変更後はバックエンドを再起動する。

#### サーバ・CORS・パス

| 変数 | 既定値／フォールバック | 備考 |
| --- | --- | --- |
| `PORT` | `5000` | 数値形式や範囲を事前検証しない |
| `DIST_PATH` | productionは必須、その他は`../frontend/dist/` | SPAビルド成果物の配信ルート。productionではディレクトリ・index.htmlの存在と読取可否をDB接続・待受前に検証 |
| `CORS_ALLOWED_ORIGINS` | developmentは`http://localhost:3000`、productionは空の許可リスト | カンマ区切り、空要素除外 |
| `SOCKET_CORS_ALLOWED_ORIGINS` | `CORS_ALLOWED_ORIGINS`と同値 | カンマ区切り |

- 両方の許可オリジンを実行環境に合わせて指定する。未設定時は`backend/bootstrap/runtimeConfig.js`の既定値を使用する。
- productionのHTTPは、許可リストが空の場合にクロスオリジン通信を許可しない。Socket.IOは許可リストが空なら`VUE_APP_APPURL`のオリジンとそのポート違いを許可する。
- developmentのHTTP／Socket.IOは`GET`、`POST`、`PUT`、`DELETE`、`OPTIONS`、`PATCH`を許可する。
- productionのHTTPは`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`OPTIONS`、Socket.IOは`GET`、`POST`、`OPTIONS`を許可する。
- originの形式を起動時に検証しない現行影響は[許可オリジン](considerations.md#許可オリジンの管理)を参照する。

#### 認証トークン・Cookie

| 変数 | 既定値 | 不正値時 |
| --- | --- | --- |
| `JWT_EXPIRES_IN` | `30d` | jsonwebtokenへそのまま渡すため、発行時に失敗し得る |
| `SIGNUP_TOKEN_TTL_MINUTES` | `60` | 1未満・非整数は既定値 |
| `RESET_TOKEN_TTL_MINUTES` | `60` | 1未満・非整数は既定値 |
| `LINE_OAUTH_COOKIE_TTL_MS` | `600000` | 1未満・非整数は既定値 |
| `GUEST_ACCESS_TTL` | `900`秒 | 未設定は既定値。非数値は既定値へ戻さずトークン発行時に失敗し得る |
| `GUEST_REFRESH_TTL` | `2592000`秒 | 未設定は既定値。非数値は既定値へ戻さずトークン発行時に失敗し得る |

#### レート制限

| 変数 | 既定値 | 適用対象 |
| --- | --- | --- |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` | ログイン失敗回数の時間枠 |
| `LOGIN_RATE_LIMIT_MAX` | `20` | 時間枠内のログイン失敗上限。成功要求は回数から除外 |
| `RESET_MAIL_RATE_LIMIT_WINDOW_MS` | `3600000` | 再設定メールのmail／IP共通時間枠 |
| `RESET_MAIL_RATE_LIMIT_MAX` | `5` | 正規化mail単位の上限 |
| `RESET_MAIL_IP_RATE_LIMIT_MAX` | `20` | IP単位の上限 |

- 時間枠は1000ms未満、回数は1未満、または非整数の場合に既定値へフォールバックする。
- `trust proxy=1`を前提にIPを解決するため、実際のproxy段数と一致させる。

### 設定ファイルごとの適用範囲

`backend/.env.example`は開発・ステージング・本番で共通の設定例。必要な環境のファイル名でコピーし、DB接続先、秘密値、保存先などを利用する環境に合わせて設定する。

| 用途 | 作成するファイル | `NODE_ENV` |
| --- | --- | --- |
| 開発・ローカル | `backend/.env.development` | `development` |
| ステージング | `backend/.env.staging` | `production` |
| 本番 | `backend/.env.production` | `production` |

開発は`npm run dev`で読み込む。ステージング・本番は、Node.jsの`--env-file`など、利用する起動方法でファイルを指定する。環境ファイルを置くだけでは自動選択されない。

E2Eには`backend/.env.e2e.example`を使い、`backend/.env.e2e`へコピーして設定する。変更する項目と読込条件は[E2E手順](../../testing/e2e-testing.md#設定ファイルの準備)を参照する。

## 動作・適用条件

### 読込と評価の共通仕様

- アプリケーションは`process.env`を参照し、`backend/config/env.js`で空白除去、存在確認、整数、CSVの共通読込を提供する。
- 「起動時必須」に分類した項目は空白除去後に空でないことを確認する。`VUE_APP_APPURL`はHTTPまたはHTTPS URLも
  検証する。MongoDB URI、秘密値の長さ、ディレクトリの存在・権限までは共通検証せず、外部機能用の値は
  後述する機能固有の規則で追加検証する場合がある。
- `backend/bootstrap/runtimeConfig.js`が`MEDIA_PATH`、`PROFILE_PATH`へ起動時に末尾のディレクトリ区切りを補う。
- 相対パスの静的配信ルートは`backend/`ディレクトリを基準に解決する。
- 外部機能は7つの明示フラグで有効・無効を決める。`false`では残存する外部サービス設定を検証せず、クライアントを作成せず、外部通信しない。`true`では必要設定を検証し、不足・不正があればHTTP受付開始前に起動を停止する。
- 外部機能の有効状態、検証済み外部サービス設定、メール・LINE・通知で使用するフロントエンド URLはバックエンド起動時に
  固定される。値を変更した場合はバックエンドプロセスを再起動する。
- 起動時は8つの外部機能の項目名と`enabled`／`disabled`だけを1行で出力する。外部サービス設定値、秘密値、接続成否は出力しない。
- フロントエンドへ公開する有効状態は[外部機能の有効状態API](api/capabilities.md)を参照する。

#### 外部機能の有効化フラグ

| 変数 | 対象機能 |
| --- | --- |
| `EXTERNAL_OPENAI_ENABLED` | OpenAI解析・文字起こし |
| `EXTERNAL_GOOGLE_TRANSLATE_ENABLED` | Google Translate |
| `EXTERNAL_GOOGLE_LOGIN_ENABLED` | Googleログイン |
| `EXTERNAL_LINE_LOGIN_ENABLED` | LINEログイン |
| `EXTERNAL_ONESIGNAL_ENABLED` | OneSignalプッシュ通知 |
| `EXTERNAL_GOOGLE_ANALYTICS_ENABLED` | Google Analytics |
| `EXTERNAL_MAIL_DELIVERY_ENABLED` | メール送信 |

- 許可値は小文字の`true`または`false`だけである。
- development、test、`NODE_ENV`未設定ではフラグ未設定を`false`として扱う。staging、productionでは未設定または`TRUE`、`1`等の不正値を起動エラーとする。
- `false`では対象外部サービスのID、秘密値、接続先、上限値が残っていても評価しない。
- 1つの`EXTERNAL_OPENAI_ENABLED`から`openaiTranscription`と`openaiAnalysis`の2つの機能を決めるため、外部機能の有効状態APIは8項目である。

#### 本番環境で認証機能を無効化する前の確認

- Google／LINEログインまたはメール送信を使用中のproduction環境では、対応フラグを`false`へ変更する前に既存アカウントの認証方式を確認する。
- OAuthだけで利用しているアカウントにはパスワードログイン等の代替認証を、メールに依存するアカウントには管理者が実施できるパスワード復旧手段を、設定変更とは別の移行作業で用意する。
- メール無効化前に発行済みの本登録／パスワード再設定トークンは既存の有効期限まで利用できるが、無効化後は新しいトークンを発行しない。
- 本機能は外部連携を無効化できる製品挙動だけを提供し、アカウント移行や管理者向け復旧操作は自動実行しない。移行・復旧手段が確認できるまでproductionの設定を外さない。

## 関連資料

### 関連仕様

- [バックエンド概要](overview.md)
- [バックエンドの運用上の注意](considerations.md)
- [認証API](api/auth.md)
- [ゲスト認証API](api/guest.md)
- [タイムライン API](api/timeline.md)
- [ゲストタイムライン API](api/timeline-guest.md)
- [ファイルアップロードAPI](api/upload.md)
- [外部連携用v1 API](api/v1.md)
- [テスト環境](../../testing/test-environment.md)
- [ローカル開発環境でのメール手動確認](../../testing/local-mail-testing.md)

### 実装

- `backend/bootstrap/runtimeConfig.js`
- `backend/scripts/e2e/environment.js`
- `backend/scripts/e2e/reset-database.js`
- `backend/config/env.js`
- `backend/integrations/mail/mailer.js`

### テスト

- `backend/tests/unit/config/env.test.js`
- `backend/tests/unit/config/featureFlags.test.js`
- `backend/tests/unit/bootstrap/runtimeConfig.test.js`
- `backend/tests/unit/bootstrap/startServer.test.js`
- `backend/tests/unit/scripts/e2e-environment.test.js`
