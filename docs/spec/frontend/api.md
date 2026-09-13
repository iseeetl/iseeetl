# APIクライアント、共通ヘッダ、再試行

## 概要

バックエンドが受け付ける認証情報とエラー応答は [REST API共通規約](../backend/api-conventions.md) を参照してください。

## 動作・適用条件

### APIクライアント

- 通信は `axios` を利用し、共通クライアント `frontend/src/api/apiClient.js` 経由で行う
- `apiClient`は`API_BASE_URL`をbaseURLとするaxiosインスタンス
- `main.js`はアプリ生成時に選択したアプリのストアを`apiStoreAdapter.js`へ設定する。共通の前後処理は既定ストアを直接読み込まず、アダプタから現在のストアを取得する
- `API_BASE_URL`はフロントエンド用の`VITE_APP_URL`を参照し、空文字列の場合は同一オリジンを使用する。APIクライアント自身はバックエンドのホストやポートを選択しない
- `VITE_APP_URL`にはビルド時の設定値を使用する。空の場合、開発時の同一オリジンに対する`/api`、`/media/`、`/profile/`、`/socket.io`は、Viteのプロキシがループバックのバックエンドへ転送する。E2E専用の接続先は[ビルド・設定](build-and-config.md)を参照する
- 認証情報は[共通ヘッダ・認証](#共通ヘッダ認証)に従って付与する
- 応答の共通処理による認証エラーの401対応
  - `TOKEN_INVALID`、`TOKEN_EXPIRED`、`UNAUTHORIZED`、またはエラーコードのない401を対象とする
  - 権限不足の`INVALID_PERMISSION`では、ログアウト、ゲストトークン更新、リクエスト再送を行わない。`skipAuthRecovery`を指定した要求も共通の認証回復を行わない
  - リクエスト開始時のストア、メモリ内だけの認証状態の世代番号、主体種別、主体IDを要求開始時の状態として保持し、完了時まで現在主体と一致する場合だけ認証状態を変更またはリクエストを再送する。この記録はトークンを含まず、永続化・ログ出力しない
  - ログイン時: 同時401間で共有するPromiseにより`doLogout`を1回だけ実行して失敗を返す
  - ユーザJWTを付けて送信したリクエストは内部フラグで識別し、ログアウト後に遅延して401となってもゲスト処理へ切り替えない
  - APIクライアントでログアウト処理済みの401は、画面側`handleAuthError`でログアウトを重ねずログイン画面遷移だけ行う
  - 共通クライアントを通らない未処理401に限り、`handleAuthError`がフォールバックとしてログアウトする
  - 未ログインかつユーザ認証リクエストでない場合: 同時401間で共有するPromiseにより`/api/guest/refresh`（`doRefreshGuestToken`）を1回だけ実行し、各リクエストを1回だけ再試行する
  - ゲスト認証の更新中にユーザへ切り替わった場合、またはゲストIDが変わった場合は、古い更新結果を反映せずリクエストも再送しない。同じゲストIDの正常なトークン更新では同時401の共有を維持する
  - `_guestRetry`または`skipGuestRefresh`を持つリクエストはゲストトークンを更新しない。ゲスト初期化／更新自身は`skipGuestRefresh`を指定して再帰を防ぐ
- `doLogout`はOneSignalからのログアウトを試行した後、開始時と同じユーザである場合だけユーザ状態を消去してゲスト認証を再確立する。待機中に再ログインした場合は現在ユーザを維持し、必要なOneSignalの識別情報だけを再確認する
- `normalizeUrl`により、`API_BASE_URL`と同じ文字列で始まる絶対URL入力を相対URLに正規化する

### 外部機能の利用可否

- 起動時に`frontend/src/api/capabilities.js`から認証なしで`GET /api/capabilities`を1回呼ぶ
- リクエストタイムアウトは5秒で、ゲスト用401トークン更新を行わない
- 応答を8項目の真偽値へ正規化する。`googleAnalytics`だけがない場合は`false`を補完する。通信・検証に失敗した場合は全項目を無効としてアプリを継続する。検証条件は[状態管理](state.md#外部機能の有効状態とonesignalの責務)を参照する
- ログイン画面の再試行操作だけが外部機能の有効状態を再取得する
- 項目、応答、バックエンド側ガードの詳細は[外部機能の有効状態API](../backend/api/capabilities.md)を参照する

### Google Analytics公開設定／Identity API

- `frontend/src/api/analytics.js`は公開設定用の`GET /api/analytics/config`と、登録ユーザ用の`GET /api/analytics/identity`を公開する
- 起動時に`googleAnalytics`が有効な場合だけ公開設定をバックグラウンドで取得する。リクエストタイムアウトは5秒とし、通常画面の表示は取得完了を待たない。成功応答は`measurement_id`の1項目だけを含むことを検証し、前後の空白を除去済みの`G-`形式だけを受理する。外部機能が無効な場合は呼び出さず、取得・検証失敗時はGoogle タグを開始せず通常のアプリ起動を継続する
- リクエスト本文とクエリへユーザIDを渡さず、共通APIクライアントが付ける現在のユーザ認証を使用する。ゲスト用401トークン更新は無効にし、主体変更時にリクエストを中断できるよう`AbortSignal`を引き渡す
- フロントエンドは成功応答が`analytics_user_id`、`visitor_type=registered`、`identity_version=v1`の3項目だけを含むことを検証する。IDは`ga1_`と64桁の小文字16進数からなる値だけを受理する
- ゲストはこのAPIを呼ばず、Google Analyticsの端末／クライアント識別情報だけを使用する。登録ユーザの応答はアプリ内のメモリへだけ保持し、Vuex、ブラウザ保存領域、URL、DOMへ保存しない
- 通信中にログイン・ログアウト、ユーザの切り替え、外部機能の有効状態の変更があった場合は、変更前の通信結果を使用しない。API失敗時はAnalyticsだけを停止し、通常の画面起動や認証処理を失敗させない

認証、外部機能が無効な場合の503、キャッシュ制御、HMACによるID生成を含むバックエンド契約は
[Analytics Identity API](../backend/api/analytics.md)を参照してください。

計測イベントはバックエンドAPIを介さず、アプリ単位のAnalyticsの実行処理からGoogle タグの`dataLayer`へ送ります。
ルーム／タイムラインのページ計測は既存APIの初期化成功後に開始します。画面遷移と遅延応答の扱いは
[ルーティング](routing.md#google-analyticsのページ計測)、送信順序と項目は
[Cookie・ブラウザ保存・外部送信](cookies-and-external-transmissions.md#送信イベントとパラメータ)を参照してください。

### 共通ヘルパーとエラー表示

- `buildBasePath`: 通常／管理APIのベースパスと末尾スラッシュを組み立てる
- `buildRequestConfig`: `onUploadProgress`、`withCredentials`、`responseType`、`params`を既存設定へ追加する
- `withAuth`: 明示指定したトークンをBearer認証ヘッダへ設定する。単語の互換呼び出しなどで使用する
- `normalizeApiError`: 共通エラー応答から`status`、`code`、`message`、`requestId`、`details`を取り出す
- `formatApiErrorMessage`、`appendApiErrorMessage`: 翻訳処理の失敗を無視しつつ、画面表示用メッセージを作成する

表示文言とエラー詳細の優先順位は[共通エラーと通知UI](error-handling.md#画面個別の通知)を参照してください。

### APIラッパー

- `frontend/src/api/*.js`に用途別のラッパーを配置する
  - `auth.js`、`guest.js`、`chat.js`、`floor.js`、`floorMember.js`、`room.js`、`roomMember.js`
  - `tag.js`、`upload.js`、`quickText.js`、`user.js`、`spam.js`、`kickedUser.js`
  - `capabilities.js`、`analytics.js`
- `frontend/src/api/quickText.js`
  - management／floor／roomの単語を1ファイルで扱う
  - Vuexの共通トークンに加えて、互換呼び出し用の明示Bearerトークンを受け付ける
- `frontend/src/api/chat.js`
  - 投稿／返信／付加情報／リアクション／PushFilter／絞り込み／管理系タイムラインAPIを集約する
  - ユーザ／ゲストによって詳細、一覧、投稿、返信、リアクションのURLを切り替える
  - ゲストの投稿・返信・リアクションではCookieを送信する
- `frontend/src/api/upload.js`
  - フロア画像・ルーム画像のアップロードでは、FormDataの対象IDを認可用クエリにも付与する。バックエンドはmultipart受信前に認可し、本文のIDとの一致を確認する
  - タイムライン添付ではルームIDをURLに指定し、本文にはファイルだけを送る。クエリや本文に対象IDを追加すると拒否される
- `frontend/src/api/floor.js`
  - フロア作成は管理モードを受け付けず、通常の`POST /api/floor/create`だけを使用する。呼び出し側のアップロード進捗を含むリクエストオプションは維持する
  - フロア更新は管理モードに応じて通常の`POST /api/floor/update`と`POST /api/floor/management/update`を選択する
  - タイムラインデータ管理のフロア詳細は`managementDetail`で`POST /api/floor/management/detail`を使用し、論理削除済みフロアも取得する
- `frontend/src/api/room.js`
  - ルーム作成は管理モードを受け付けず、通常の`POST /api/room/create`だけを使用する。呼び出し側のアップロード進捗を含むリクエストオプションは維持する
  - ルーム更新は管理モードに応じて通常の`POST /api/room/update`と`POST /api/room/management/update`を選択する
- `frontend/src/api/tag.js`
  - フロアタグ／ルームタグ作成は管理モードを受け付けず、それぞれ通常の`POST /api/floortag/create`と`POST /api/roomtag/create`だけを使用する。呼び出し側のアップロード進捗を含むリクエストオプションは維持する
  - フロアタグ／ルームタグ更新は管理モードに応じて通常／管理のupdate パスを選択する。共通タグの管理作成とSoundTagのAPI契約は別系統として維持する
- `frontend/src/api/floorMember.js`
  - 通常画面の削除は`remove`で`POST /api/floormember/delete`を使用する
  - 管理画面の削除は`managementDelete`で`POST /api/floormember/management/delete`を使用し、親フロアの状態へ依存しないメンバーIDだけを送る

#### 管理一覧の削除状態クエリ

- `frontend/src/api/pagination.js`の`buildPaginateParams`は`page`、指定された`search`に加え、
  `delete_flg`が真偽値の場合だけクエリへ追加する。`false`は有効データ、`true`は削除済みデータ、
  省略は両方を対象とする。
- フロア、ルーム、ルームタグ、ユーザの管理ページングはGET／POST共通で
  任意な`delete_flg`を受け付け、検索条件と同時に適用する。返却は1ページ10件の
  `docs`、`total`、`pages`、`page`である。
- ルーム管理ページングは`floor_id`を併用できる。フロアタグ管理ページングは所属フロアと保存済みの
  コピー元の共通タグ、ルームタグ管理ページングは所属フロア／ルームと保存済みのコピー元のフロアタグをpopulateする。
  ルームとコピー元のフロアタグには所属フロアのIDも含める。共通・フロアタグ一覧は有効なタグだけを返し、削除状態の指定は受け付けない。ルームタグは削除状態を指定でき、復元可否は所属フロア／ルームの有効性と所属関係で判定する。
- AI共通設定一覧は`page`、`search`を送り、有効な設定だけを対象に検索・並び替え・ページングを行う。

#### 管理用の削除状態専用ラッパー

次のフロントエンドラッパーは、編集用の全フィールドを再送せず、本文の`_id`と真偽値の`delete_flg`だけで
論理削除または復元を要求します。

| 対象 | フロントエンドラッパー | Method / Path |
| --- | --- | --- |
| フロア | `floorApi.managementSetDeleteState` | `POST /api/floor/management/delete-state` |
| ルーム | `roomApi.managementSetDeleteState` | `POST /api/room/management/delete-state` |
| ルームタグ | `tagApi.roomTag.managementSetDeleteState` | `POST /api/roomtag/management/delete-state` |
| ユーザ | `userApi.managementSetDeleteState` | `POST /api/user/management/delete-state` |

- いずれも通常フィールドを維持し、削除時は`deleted_at`を設定、復元時は`null`へ戻す。
- ユーザはAdministratorの状態変更を拒否し、有効ユーザの削除時は`session_version`を増分する。
- ユーザは有効なAI解析設定、ルームタグは同階層の有効なAI解析設定から直接参照中の場合、削除を409で拒否する。
- フロア／ルームは有効な配下AI解析設定が存在しても論理削除でき、設定の削除状態を変更しない。親が論理削除中は設定を利用せず、親の復元後は有効な設定を既存状態のまま再び利用する。
- ルームの復元は所属フロアが削除済みの場合に409となる。ルームタグの復元には所属関係が一致する有効なフロア／ルームが必要で、コピー元タグの状態は条件にしない。投稿・返信・通知で使用中でもルームタグは論理削除・復元できる。

#### タグとAI解析設定の物理削除

- `tagApi.categoryTag.remove`、`tagApi.floorTag.managementRemove`は、各`/api/...tag/management/delete`へ`_id`だけを送る。通常のフロアタグ削除も物理削除する。
- タグは同階層の有効なAI解析設定から使用中なら409を返す。`error.details.reason`に対応する理由を画面へ表示する。
- 子タグのコピー元IDは来歴として保持し、親タグの削除を妨げない。
- AI解析設定の削除は各範囲の専用APIへID、内部リビジョン、必要な所属IDを送る。更新番号は画面に表示せず、削除時の加算は行わない。応答は削除した`_id`だけで、復元操作は提供しない。
- AI解析設定の削除競合の409や対象消失の404では自動再送せず、最新一覧を再取得する。

### 音声文字起こし

- エンドポイント: `POST /api/chat/transcription/audio`
- 送信形式: `multipart/form-data`
- パラメータ: `file`, `room_id`, `lang`
- レスポンス: `{ text: string }`
- 呼び出し元: `frontend/src/utils/recording.js`
- 録音は既定29秒で自動停止し、録音ファイル、現在ルームID、画面言語を送信する
- 成功時は既存本文へ改行して文字起こし結果を追加し、成功・失敗のどちらでも文字起こし中状態を解除する
- `openaiTranscription`が無効な場合も録音と音声添付は利用できるが、録音停止後の文字起こしAPI呼び出しは行わない

### AI解析設定

- `frontend/src/api/aiAnalysisSettings.js`が共通設定のCRUD、フロア／ルーム設定の一覧・作成・更新・削除、および結果ユーザ検索をまとめる。フロア／ルーム設定の一覧は有効だけで、復元クライアントは提供しない。共通設定用検索はAdministrator専用ユーザ API、フロア／ルームダイアログは対象適用範囲の認可を伴う`result-users/search`を使用する
- 共通一覧はGET クエリ、その他はJSON 本文を使い、共通`apiClient`のJWT・401処理を継承する
- フロントエンドは追加指示の文字数・容量、解析種別、適用範囲ごとの送信内容を事前検証するが、バックエンドの入力検証・認可を代替しない
- 共通一覧でタグまたは結果ユーザの参照先が欠損した設定は安全な代替表示を使う。参照先が存在する行では管理ページングが返す`tag.delete_flg`と`result_user.delete_flg`も確認し、欠損または論理削除済みの参照IDを更新APIへ送らないよう編集を無効化する。共通設定の削除はIDとリビジョンだけを専用APIへ送り、参照先の状態にかかわらず物理削除できる
- 409は入力を自動再送せず、画面がダイアログを閉じて最新一覧を再取得する。詳細は[AI解析設定管理画面](screens/AIAnalysisSettingManagement.md)を参照する

### 共通ヘッダ・認証

- ユーザトークンがある場合は`Authorization: Bearer <token>`を付ける
- 未ログインでゲストトークンがある場合は`X-Guest-Token: <guest_token>`を付ける
- 呼び出し側が指定した認証ヘッダは上書きしない
- ユーザ認証ヘッダがあるリクエストは`_userAuthRequest`で識別する
- Cookieが必要な通信（例: `/api/guest/*`、`/api/auth/*`、ゲストリアクション）は`withCredentials: true`を使用する

トークンの有無とログイン状態は別々に参照します。Vuexの状態が不整合な場合は、ユーザとゲストの認証ヘッダを同時に付けることがあります。

### リアルタイム通信（Socket.IO）

接続認証、配信グループ、受信イベント、再接続と強制切断は[Socket.IO接続・イベント契約](../socket-events.md)に従います。フロントエンドでは次の処理を担当します。

- 初期接続は`connectInitialSocket`、復旧は`requestSocketReconnect`から開始し、接続生成を`connectTimelineSocket`へまとめる
- 接続先は`API_BASE_URL`のオリジンとし、未設定時は`window.location.origin`を使う
- 接続クエリへ`room_id`を付ける。`lang`は現在の表示言語（i18n）を優先し、未設定なら保存済みの言語（Vuex）を使う。どちらもなければ送らない
- `user_token`と`guest_token`はVuexの値が`null`でなければそれぞれ送る。排他性はバックエンドで検証する
- [再接続処理](../socket-events.md#フロントエンドの接続処理)では、以前のSocketとリスナーを管理し、古い認証結果やイベントを新しい接続へ反映しない
- `USER_ROLE_UPDATED`の不正なペイロードは無視する。`SESSION_REVOKED`によるログアウト・画面遷移の失敗は、Socketハンドラ外へ例外を送出しない
- 投稿などの受信イベントを、各カラムの追加・更新・削除、通知カード、効果音、読み上げへ反映する

### プッシュ通知（OneSignal）

- `OneSignal` のログイン連携ヘルパー: `utils/onesignalHelpers.js`
- バックエンドの`oneSignalPush=true`とフロントエンドの`VITE_ONESIGNAL_APP_ID`が揃った場合だけSDKを動的に読み込み、以降の連携を行う
- `Login.vue`: 通常／OAuthログイン成功後、OneSignalが利用可能な場合だけレスポンスのExternal IDでOneSignalログインを試行する
- アプリ起動時: OneSignalが利用可能で、保存状態にログインユーザがある場合だけ`/api/auth/push-identity`からExternal IDを再取得してOneSignalログインを試行する
- `ProfileDialog.vue`: OneSignalが利用可能な場合だけSDKの購読状態を画面へ同期する。無効時はPush UIを隠し、既存のプロフィールPush設定値を通常更新で保持する
- OneSignalの初期化・ログイン・ログアウト失敗は、アプリ本体のログイン・ログアウトを妨げない

### 再試行方針

- HTTPの共通再試行は、未ログイン・ユーザ認証なしのリクエストで[認証エラーの401](#apiクライアント)が発生した場合の、ゲストトークン更新後の1回だけとする。APIのURLがゲスト用かどうかでは判定しない
- HTTP全体に適用するタイムアウト・キャンセル・汎用再試行は設定しない。外部機能の有効状態やAnalytics APIなど、個別に設定する通信は各節に記載する
- Socket.IOの接続タイムアウト、再接続回数・間隔はクライアントライブラリの既定値に従う

## 関連資料

### 実装

- `frontend/src/api/apiClient.js`
- `frontend/src/api/apiStoreAdapter.js`
- `frontend/src/api/chat.js`
- `frontend/src/api/analytics.js`
- `frontend/src/features/analytics/identityCoordinator.js`

### テスト

- `frontend/tests/unit/api/apiClient.spec.js`
- `frontend/tests/unit/api/apiErrorMessages.spec.js`
- `frontend/tests/unit/api/pagination.spec.js`
- `frontend/tests/unit/features/analytics/pageTracking.spec.js`
- `frontend/tests/e2e/specs/flows/analytics/timeline-events.e2e.js`
