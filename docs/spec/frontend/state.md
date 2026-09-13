# 状態管理と保存先

## 概要

ログイン情報、表示設定、タイムラインなどの共有状態と保存先を説明します。

## 構成・設定項目

### ストア構成

- `frontend/src/store/index.js`の`createApplicationStore(overrides = {})`でVuexストアを生成する。製品起動用には1つ生成して既定エクスポートする
- ストア生成ごとに`rootState.js`の`createRootState()`を呼び、配列や入れ子の状態をストア間で共有しない
- `frontend/src/store/root/`は、認証、外部機能の有効状態、フロア・ルーム、表示設定、通知、永続化の処理を機能別に持つ。`root.js`で各機能の`getters`、`mutations`、`actions`をルートストアへまとめる
- `overrides.modules`でモジュールを追加し、その他の設定は`overrides`の値で上書きできる

## 動作・適用条件

### 主な状態

- `user`: ログイン状態、権限、表示名・画像名、言語、目にやさしいモード、通知設定など
- `floor` / `room` / `tag`: 選択中のフロア/ルーム/タグ
- `tagClipboard`: タグコピー貼り付けで使うページ内だけのコピー済みタグ
- `setting`: タイムライン表示設定（表示項目、アニメーションなど）
- `ariahidden` / `inertAppContainer`: アクセシビリティ制御
- `error`: 共通エラーメッセージ
- `guestSoundTags` / `filters` / `tempRoomId`: タイムライン周辺の保存状態
- `message`: スナックバーとスクリーンリーダー用メッセージ
- `capabilities`: 外部機能8項目へ正規化した有効状態と取得状態（`idle`／`loading`／`ready`／`error`）

ログイン中ユーザの表示名と画像名は、プロフィール保存成功後に`user`へ反映する。APIから取得したユーザ情報を表示するときは、IDがログイン中ユーザと一致する場合だけ`resolveUserDisplayName`／`resolveUserDisplayImageName`がVuexの最新値を返す。他ユーザとゲストの取得済み情報は書き換えない。

Google Analyticsの状態はVuexへ追加せず、アプリまたは画面単位の機能モジュールで管理する。詳細は[Google Analyticsのアプリ内状態](#google-analyticsのアプリ内状態)を参照する。

### 永続化（保存先）

- `saveState`プラグインで`localStorage`の`iseeetl_store`へ保存する。保存JSONのルートには`schemaVersion: 1`を持たせる
- `schemaVersion`がないオブジェクトは、型が正しい既知フィールドだけを復元し、次の保存で`schemaVersion: 1`を付ける。1以外のバージョンが明示されている場合や、ルートが通常のオブジェクトでない場合は復元しない
- 保存対象は`user`、`guestCache`、`floor`、`room`、`tag`、`setting`、`ariahidden`、`error`の既知フィールドと、ルートの`guestSoundTags`、`filters`、`tempRoomId`だけとする
- `message`、`inertAppContainer`、`tagClipboard`、`capabilities`、認証リビジョン、未知フィールドは保存しない。`capabilities`は起動ごとにバックエンドから取得する
- ルートと各グループは配列などを除く通常のオブジェクトだけを受理し、基本型が不正なフィールドを無視する。文字列配列は不正要素を捨て、`filters`と`guestSoundTags`は最低限の構造・型を満たさないエントリーを丸ごと捨てる
- ログイン状態の復元には非空ユーザID、トークン、有効なロールの一式とゲスト識別情報が空であることを要求する。不完全なら認証フィールドをログアウト既定値へ戻し、非ログイン状態ではユーザの資格情報を復元せず有効なゲスト識別情報だけを復元する
- Storageの取得、JSON解析、検証、保存、削除の例外は外へ送出しない。Storage削除に失敗してもメモリ上のログアウトとゲスト認証の再確保を続ける
- AI解析結果だけを隠す表示設定は保存しない。保存データに同名フィールドがあっても復元せず、通常の付加情報表示へ統一する
- `logout` で `localStorage` から削除する

#### Google AnalyticsのCookieと停止設定

- `iseeetl_analytics_opt_out`による端末別停止設定と停止／再開UIは提供しない。実行中の`ga-disable-<Measurement ID>`は送信準備中・停止中の内部フラグであり、利用者設定として保存しない
- Google タグが作成するCookieの属性と保持条件は[Cookie・ブラウザ保存・外部送信](cookies-and-external-transmissions.md#本システムのcookie)を参照する。フロントエンドは停止操作によるCookie削除を行わない

### 認証・セッション（`user.token`）

- `user.token` はログイン成功時に API から返却された JWT を保持する
- ログイン状態の復元条件を満たす`user.token`は保存する。ゲストトークンは保存しない
- JWTの有効期限は`JWT_EXPIRES_IN`で変更でき、未設定時は30日（`30d`）
- 定期的なトークン更新は行わない
- パスワード変更成功時は`doLogout`の完了を待ってログイン画面へ遷移する。APIは新JWTを発行しない
- パスワード再設定時は新JWTを発行せず、全端末で再ログインを必要とする
- `saveState` は `user.guestToken` と `guestCache.guestToken` の両方を保存対象から除外する
- HTTP認証競合の判定に使うリビジョンはストアごとのメモリ上の状態とし、Vuex stateおよび`localStorage`へ保存しない。ユーザ／ゲストの切替、主体IDの変更、ユーザの資格情報の置換、ローカルのログアウト確定時に進め、同じゲストIDの正常なトークン更新では進めない
- `guestToken` 自体は永続化しないため、`doEnsureGuestAuth` 実行時に再取得して補完する
- ゲスト認証の言語は保存済み言語、API応答言語、ブラウザ言語の順に解決する
- ゲスト名が未設定の場合、初期化／更新／Socket認証復旧では`DEFAULT_GUEST_NAMES`から解決後の言語に対応する既定名を選ぶ
- `doLogout`は先に`POST /api/auth/logout`でUserメディアCookieを消去し、成功後の`logout`で`user.token`をクリアする。後続`doEnsureGuestAuth`が失敗してもログアウト成功を維持する。Cookie消去APIが失敗した場合は完了扱いせず、AppMenuに再試行案内を表示する
- タイムラインのゲストSocket再接続では`doRecoverGuestSocketAuth`を使用する。同じゲストに対する同時要求は、トークン更新から必要時の初期認証まで1つの処理にまとめる。完了時にログイン済み、またはゲストIDが変わっている場合は結果をストアへ反映しない
- 更新が`401 TOKEN_INVALID`または`401 TOKEN_EXPIRED`の場合だけ初期化し、通信障害、429、5xx、その他の401では現在のゲストIDとトークンを維持する

### 外部機能の有効状態とOneSignalの責務

- `doLoadCapabilities`は`GET /api/capabilities`の応答を厳密に検証する。8項目の真偽値を受理し、`googleAnalytics`だけがない7項目の応答では`googleAnalytics=false`を補完する。正常時は8項目を`ready`として保存する。その他7項目の欠落、真偽値以外の値、未知項目がある場合は`error`とし、全8項目を`false`へ戻す
- `googleAnalyticsCapabilityEnabled`は、外部機能の有効状態の取得が`ready`でバックエンドが返す`googleAnalytics`値が`true`の場合だけ`true`を返す。この段階では公開設定APIの取得結果やGoogle Analyticsの実行処理の起動可否を表さない
- アプリ単位のAnalyticsサービスは上記外部機能の有効状態が`true`の場合だけ公開設定APIを呼び、応答を検証して妥当なMeasurement IDを取得し実行時処理を構成できた場合にだけ利用可能とする
- Googleログインはバックエンドの`googleLogin=true`と`VITE_GOOGLE_OAUTH_CLIENT_ID`の両方、OneSignalはバックエンドの`oneSignalPush=true`と`VITE_ONESIGNAL_APP_ID`の両方が揃った場合だけ利用可能とする。LINEログイン、メール、Google Translate、OpenAIの機能はバックエンドが返す有効状態をそのまま利用可否とする
- OneSignalが利用可能な場合だけ起動処理がSDKを動的に読み込み、初期化Promiseを共有してログイン中ユーザのExternal IDを再関連付けする
- ログイン直後はOneSignalが利用可能な場合だけ`Login.vue`から`maybeLoginOneSignal`を呼ぶ。`doLogout`のOneSignalのログアウト失敗は通常のログアウトを妨げない
- `ProfileDialog.vue`はOneSignalが利用可能な場合だけ購読状態を同期する。無効時もバックエンドから取得した既存Push設定は保持して通常のプロフィール更新へ含める
- 外部機能の有効状態の項目とバックエンド側ガードは[外部機能の有効状態API](../backend/api/capabilities.md)を参照する

### Google Analyticsのアプリ内状態

- 公開設定（Measurement ID）、実行時処理の準備状態、識別情報、ページ計測の保留候補、対象リソースの計測状態、操作トークンはメモリだけに保持し、Vuex、ブラウザ保存、URL、DOMへ保存しない
- `createApplication()`はAnalyticsの実行処理、識別情報の調整処理、ページ計測処理をアプリごとに生成し、他のアプリと共有しない。起動条件は[ビルド・設定](build-and-config.md#フロントエンド公開環境変数)に従う
- 識別情報の調整処理は登録ユーザの`analytics_user_id`をメモリに保持し、GA4のUser-IDへだけ設定する。ゲストはIdentity APIを呼ばず、Google Analyticsの端末／クライアント識別情報を使用する
- ログイン、ログアウト、識別情報要求の競合では送信を一時停止し、古い応答やUser-IDを再利用しない。登録ユーザからゲストへ移る際に`user_id=null`を設定できなければ、ゲストの送信を再開しない
- 外部機能の有効状態が無効から有効へ変化した場合は公開設定取得を一度開始する。通常のログイン／ログアウトではMeasurement IDを再取得せず、識別情報だけを切り替える
- ページ計測処理は最新の保留候補、安全な参照元URL、送信済みリソースキー、リソーストークンとその世代をメモリに保持する。停止、利用不能化、破棄時に保留候補・参照元・送信済みキーを消去する
- 各画面は`analyticsPageReporter`を利用する。ルームとタイムラインは、画面遷移ごとに計測用トークンを取得し、初期取得が成功した場合だけ翻訳前のAPI応答で計測対象を確定する
- 失敗・離脱・画面破棄時は計測を取り消す。二重の有効化、ルートID不一致、古い世代の応答は採用しない

| 操作 | API |
| --- | --- |
| 遷移時の計測トークンを取得 | `capture()` |
| 初期取得した対象を確定 | `activate(token, resource)` |
| 計測を取り消し | `cancel(token)` |

- リソースキーは`room_list:<floor_id>`または`timeline:<floor_id>:<room_id>`相当とする。重複判定と遷移中のコンテキスト維持は[ルーティング](routing.md#google-analyticsのページ計測)、ページ設定の項目と更新順序は[送信契約](cookies-and-external-transmissions.md#送信イベントとパラメータ)に従う
- `Timeline.vue`は画面ごとにタイムライントラッカーを生成する。取得時点の翻訳前のルーム詳細とルームタグ、現在ルーム、世代、操作トークンをメモリに保持し、投稿本文、ファイル名、絞り込みのキーワード等を保持しない
- ルーム変更、初期化失敗、入室拒否、画面破棄でタイムラインのコンテキストを消去し、旧ルームの遅延成功を送らない。`visitor_type`はトラッカーへ保存せず、実行時処理が送信時の識別情報から付与する。操作ごとの計測条件は[タイムライン画面仕様](screens/Timeline.md#google-analyticsによる利用状況計測)を参照する

## 関連資料

### 関連仕様

- [タグコピー貼り付け仕様](tag-copy-paste.md)
- [認証API](../backend/api/auth.md)
- [バックエンド環境変数](../backend/environment-variables.md)
- [外部機能の有効状態API](../backend/api/capabilities.md)

### 実装

- `frontend/src/store/root.js`
- `frontend/src/store/root/capabilities.js`
- `frontend/src/store/root/persistence.js`
- `frontend/src/features/analytics/runtime.js`
- `frontend/src/features/analytics/timelineTracking.js`

### テスト

- `frontend/tests/unit/store/index.spec.js`
- `frontend/tests/unit/store/root.spec.js`
- `frontend/tests/unit/store/root-guest-auth.spec.js`
- `frontend/tests/unit/store/capabilities.spec.js`
- `frontend/tests/unit/features/analytics/runtime.spec.js`
