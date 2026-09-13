# フロントエンド概要

## 概要

この文書では、`frontend/` のアプリ構成、起動順序、各レイヤの責務を説明します。
ルートや画面の挙動、状態、通信などの詳細は、それぞれの専用仕様を参照してください。

- Vueでブラウザ向けSPAを構成する
- フロア、ルーム、タイムライン、アカウント、管理画面のUIを提供する
- Vue Routerで画面遷移、Vuexで共有状態とブラウザ保存を管理する
- REST APIとSocket.IOを通じてバックエンドと通信する
- 多言語表示、アクセシビリティ補助、PWA、Webプッシュ通知のクライアント処理を担う
- `frontend/public/` の静的コンテンツとビルド時に配信する公開ファイルを管理する

## 構成・設定項目

### 技術スタック

| 領域 | 主な技術 |
| --- | --- |
| UI基盤 | Vue 3、自前`Ui*`部品と意味に沿ったHTML要素 |
| ルーティング・状態 | Vue Router 5、Vuex 4 |
| 通信 | axios、Socket.IO Client 4 |
| 国際化 | vue-i18n 11 |
| 入力・表示補助 | DOMPurify、Vuelidate 2、自前UI部品 |
| タイムラインUI | splitpanes、wavesurfer.js、Velocity |
| ビルド・テスト | Vite 8、Vitest 4、Vue Test Utils 2、Nightwatch 3 |

依存関係の指定範囲は`frontend/package.json`、実際に解決されたバージョンは`frontend/package-lock.json`で確認してください。

## 動作・適用条件

### アプリの生成

- `frontend/src/application.js`の`createApplication(options)`はストアアダプタ、API クライアントのストア参照、Router、i18n、Vue アプリ、アプリ単位のAnalytics サービスの生成・マウント境界を組み立て、`store`、`router`、`i18n`、`analytics`、`start`を返す。任意の`configureApp`コールバックは標準プラグイン登録後、マウント前に一度だけ実行する
- `frontend/src/startApplication.js`はチャンク取得失敗時の復旧処理を導入し、DOMに`#app`がある場合だけアプリを開始する
- `frontend/src/bootstrapApp.js`の`mountApplication(options)`は状態初期化、アプリ生成、ルーターの準備、マウントの進行を担当する
- Router、ストア、i18nはそれぞれ`createApplicationRouter`、`createApplicationStore`、`createApplicationI18n`を公開し、製品起動とUnitテストが同じ生成関数を使用する。詳細は[ルーティング](routing.md)、[状態管理](state.md)、[UI・i18n](style-and-i18n.md)を参照する

### 起動順序

通常のエントリーは`frontend/src/main.js`です。

1. `createApplication`が指定されたストアをAPIクライアントへ設定し、i18n、ストアアダプタ、Analyticsの処理、ルーターを生成する。Analyticsは停止状態から始める
2. `start`から`mountApplication`を呼び、`doLoadState`でブラウザの保存状態を復元する
3. `doLoadCapabilities`で外部機能の有効状態を取得する。失敗時は全機能を無効として続行する
4. Google Analyticsが有効な場合は公開設定の取得を非同期で始める。取得・検証に失敗しても画面のマウントを妨げない
5. OneSignalが利用可能ならSDKを初期化し、成功後にExternal IDを再取得して関連付ける。続いてゲスト認証を確保し、Analyticsの利用者状態の監視を登録する
6. Vueアプリへストア、ルーター、i18nとAnalyticsの通知用インターフェースを登録し、`configureApp`を一度実行する。ルーターの初回遷移が完了してからマウントする
7. マウント中の`App.vue`が、クローラ、保存済み言語、ブラウザ言語の順に表示言語を決める。マウント後にHTMLの言語、画面高、ヘルプのショートカットを設定する
8. マウント成功後に現在リリースの自動再読み込みマーカーを削除する

状態復元、外部機能の取得、OneSignal、ゲスト認証の初期化で例外が返された場合は、処理名とエラーをconsoleへ記録し、後続処理を続けます。Analyticsのページ計測は、ルートの確定と必要なAPI初期化が成功してから開始します。

アプリの破棄時はAnalyticsの監視・実行処理を終了します。`App.vue`のイベントリスナーは`beforeUnmount`で解除します。保存・復元は[状態管理](state.md)、計測開始条件は[ルーティング](routing.md#google-analyticsのページ計測)、チャンク読み込みの復旧は[ビルドと設定](build-and-config.md)を参照してください。

### レイヤと責務

| レイヤ | 主な配置 | 責務 |
| --- | --- | --- |
| エントリ・共通初期化 | `src/main.js`、`src/application.js`、`src/startApplication.js`、`src/bootstrapApp.js`、`src/App.vue` | アプリ生成、プラグイン、起動順序、共通レイアウト |
| ルーティング | `src/router.js`、`src/routes/` | ルート定義、ガード、画面タイトル、画面ごとの戻り先 |
| 画面 | `src/views/`、`src/views/management/` | ルート単位の画面とデータ取得 |
| UI部品 | `src/components/` | ダイアログ、入力、タイムライン、共通部品 |
| 機能ロジック | `src/features/` | 機能別の状態生成、画面制御、変換・判定。タイムライン固有の処理は`timeline/`、計測処理は`analytics/`に集約する |
| 状態 | `src/store/` | 共有状態、永続化、タイムライン状態 |
| REST通信 | `src/api/` | 共通axiosクライアントと用途別APIラッパー |
| リアルタイム通信 | `src/features/timeline/socketClient.js`、`src/features/timeline/socket.js` | Socket.IO接続、イベント購読、タイムライン画面への反映 |
| 横断処理 | `src/utils/`、`src/constants/` | 複数の機能で使う変換・検証・操作補助と定数 |
| 表示資産 | `src/locales/`、`src/content/static/`、`src/styles/` | 翻訳リソース、ビルド管理する言語別文書と共通スタイル |
| 公開資産 | `public/` | ヘルプ本文を含む固定URLの静的コンテンツ、マニフェスト、Service Worker |

E2E専用の診断処理は`frontend/tests/e2e/runtime/`に置き、通常のビルドには含めません。エントリーの選択は[ビルドと設定](build-and-config.md#e2eビルドとプレビュー)に従います。

### 主要なデータの流れ

- 画面とUI部品は、ログイン状態、選択中のフロア／ルーム、表示設定などの共有状態をVuexから参照する
- HTTP通信は原則として`src/api/`の用途別ラッパーを経由し、共通クライアントが`apiStoreAdapter`経由で現在のアプリのストアからユーザ／ゲスト認証情報を付与する
- タイムライン画面はREST APIで初期データと再接続後のデータを取得し、Socket.IOイベントで表示中カラムの投稿、通知カード、接続状態を更新する
- Socket.IOハンドラは主に表示中の`Timeline.vue`の画面コンテキストへ反映し、永続化するフィルタやユーザ／ルームロールなど必要な共有状態だけをVuexへ反映する
- ログイン状態と画面遷移は、Vuexの状態とルートガードを組み合わせて制御する
- 外部機能の表示可否は、起動時にバックエンドから取得する外部機能の有効状態をVuexから参照する。GoogleログインとOneSignalは対応するフロントエンド公開IDも設定されている場合だけ利用可能とする
- Google Analyticsは公開設定と現在の利用者情報を検証した後、画面遷移と成功したタイムライン操作を計測する。ルーム／タイムライン画面はAPIで取得したリソースを渡し、古い画面の遅延応答を送らない。状態は[状態管理](state.md#google-analyticsのアプリ内状態)、送信項目は[Cookie・ブラウザ保存・外部送信](cookies-and-external-transmissions.md#送信イベントとパラメータ)に従う
- ブラウザへ保存する状態と一時状態は[状態管理](state.md)の区分に従う

### Google Analytics

フロントエンドは、公開設定の取得、登録ユーザ／ゲストの識別、ページとタイムライン操作の計測を提供します。
Analyticsの状態はアプリごとに分離し、送信条件を満たさない場合は計測を停止します。
Analyticsの失敗でログイン、閲覧、投稿などの通常機能は停止しません。

- 起動条件とビルド時の扱い: [ビルド・設定](build-and-config.md#フロントエンド公開環境変数)
- 一時状態と利用者の切り替え: [状態管理](state.md#google-analyticsのアプリ内状態)
- 公開設定とIdentity API: [APIクライアント](api.md#google-analytics公開設定identity-api)
- ページ分類と遷移: [ルーティング](routing.md#google-analyticsのページ計測)
- 操作と計測の対応: [タイムライン画面仕様](screens/Timeline.md#google-analyticsによる利用状況計測)
- 送信順序、項目、Cookie、外部管理設定: [Cookie・ブラウザ保存・外部送信](cookies-and-external-transmissions.md#google-analytics)

ローカルの検証と実際のGA4プロパティでの送信確認は、[E2E手順](../../testing/e2e-testing.md)と[Google Analytics検証手順](../../testing/google-analytics.md)を参照してください。運用環境での有効化、保持・削除、緊急停止、配置・切り戻しは環境ごとに管理します。

### コンテンツのサニタイズ

- タイムライン本文は`TimelineUtil.tokenizeTimelineText`で`text`／`link` トークンへ分割し、`TimelineText.vue`が通常のVueテンプレートで描画する。HTML文字列と`v-html`は使用しない
- タイムラインでリンク化するスキームは`http`／`https`だけとし、リンクには`target="_blank"`と`rel="noopener noreferrer"`を付ける。タグのような入力、`javascript`、`data`は通常テキストとして扱う
- ヘルプは`htmlSanitizer.js`の`sanitizeStaticContentHtml`、利用規約、問い合わせ、プライバシー、Cookieポリシー、アクセシビリティは`sanitizeStaticDocumentHtml`だけを通して`v-html`へ渡す
- 静的HTMLはDOMPurifyを使用し、現行配布コンテンツに必要な構造タグ、`class`／`id`／`aria-label`、リンク属性、表見出しの`scope`を明示的に許可する。URL スキームは`http`、`https`、`mailto`、`tel`だけを許可する
- `script`、`style`、`iframe`、イベント処理関数属性、`javascript`／`data` URLは許可しない

### 静的コンテンツとPWA

- 利用規約、プライバシー、Cookieポリシー、問い合わせ、アクセシビリティは`frontend/src/content/static/{lang}/`でビルド管理し、ヘルプは`frontend/public/content/{lang}/help.html`に配置する。`frontend/public/`配下はすべて固定URLの公開対象として扱う
- ホーム、フロア、ルームで使用するマニフェストの選択とOneSignal Workerの配信は[ビルド・設定](build-and-config.md)を参照する
- 画面ルートは[ルーティング](routing.md)と[画面一覧](screens/README.md)を参照する

### 開発・検証

- 起動とブラウザでの手動確認: [ローカル開発の準備](../../testing/local-development.md)
- 環境変数とビルド: [ビルドと設定](build-and-config.md)
- Unit・Integration・Lint・ビルド検証: [テスト環境](../../testing/test-environment.md)
- NightwatchによるE2E: [E2E手順](../../testing/e2e-testing.md)

## 関連資料

### 実装

- `frontend/src/main.js`
- `frontend/src/application.js`
- `frontend/src/features/analytics/runtime.js`
- `frontend/src/features/analytics/identityCoordinator.js`
- `frontend/src/features/analytics/pageTracking.js`

### テスト

- `frontend/tests/unit/mainApplication.spec.js`
- `frontend/tests/unit/App.spec.js`
- `frontend/tests/unit/router.spec.js`
- `frontend/tests/unit/store/capabilities.spec.js`
- `frontend/tests/unit/features/analytics/pageTracking.spec.js`
