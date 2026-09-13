# ビルドと設定（Vue 3／Vite）

## 概要

フロントエンドの環境設定、開発サーバ、ビルド成果物、静的アセット、チャンク読み込み失敗時の復旧を説明します。アプリの構成は[フロントエンド概要](overview.md)、検証の実行方法は[テスト・検証手順](../../testing/README.md)を参照してください。

## 構成・設定項目

### 技術構成

| 項目 | 設定 |
| --- | --- |
| フレームワーク・ビルド | Vue 3／Vite 8。依存の指定範囲は`frontend/package.json`、確定バージョンは`frontend/package-lock.json` |
| Node.js／npm | [frontend/package.json](../../../frontend/package.json)の`engines`に記載した対応範囲 |
| JavaScript・CSSの変換対象 | Chrome 111、Edge 111、Firefox 114、Safari 16.4、iOS 16.4 |
| 設定ファイル | `frontend/vite.config.js` |
| HTMLエントリー | `frontend/index.html` |
| アプリのエントリー | 通常は`frontend/src/main.js`。E2Eだけ`frontend/tests/e2e/runtime/main.js` |
| 静的アセット | `publicDir: 'public'`。`frontend/public/`を配信・コピー |
| 環境変数の公開 | `envDir: false`とし、`loadEnv`で読み込んだ値から許可した`VITE_*`だけを生成コードへ埋め込む |

変換対象ブラウザはビルドの互換下限です。実端末での動作確認とは区別します。

### フロントエンド公開環境変数

[`frontend/.env.example`](../../../frontend/.env.example)を基に、`frontend/`直下へ環境別のファイルを作成します。例示値を対象環境の公開URL・公開IDへ置き換えてください。

| 環境 | 設定ファイル | コマンド（`frontend/`で実行） |
| --- | --- | --- |
| 開発 | `.env.development` | `npm run serve`／`npm run build:development` |
| ステージング | `.env.staging` | `npm run build:staging` |
| プロダクション | `.env.production` | `npm run build:production` |

初回の作成例です。既存ファイルは上書きせず、使用する環境の値を設定します。

```bash
cd frontend
test -e .env.development || cp .env.example .env.development
test -e .env.staging || cp .env.example .env.staging
test -e .env.production || cp .env.example .env.production
```

`.env.example`自体はビルド時に読み込みません。新しいチェックアウトにも環境別ファイルを用意します。

| 変数 | 用途 |
| --- | --- |
| `VITE_APP_NAME` | 公開用アプリ名。画面では未参照 |
| `VITE_APP_URL` | APIのベースURL。同一オリジンや開発プロキシを使う場合は空にする |
| `VITE_ONESIGNAL_APP_ID` | OneSignal SDKの公開Application ID。利用しない場合は空にする |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | Google Identity Servicesの公開Client ID。利用しない場合は空にする |

アプリへ公開するのはこの4項目だけです。値は生成されたJavaScriptから参照できるため、Client Secret、トークン、パスワード、バックエンドの資格情報を設定しません。

設定の読み込みと変更には、次の条件があります。

- 同じ変数の優先順位は、高い順に「起動プロセスの環境変数 → `.env.<mode>.local` → `.env.<mode>` → `.env.local` → `.env`」。`<mode>`は`development`、`staging`、`production`、`e2e`に置き換える
- 設定変更後は再ビルドする。開発サーバは再起動し、E2Eは`npm run serve:e2e`を再実行する
- GoogleログインとOneSignalは、公開IDとバックエンドの有効設定が両方揃った場合だけ利用できる。公開IDだけでは有効にしない
- LINEログインの利用可否はバックエンドで制御し、フロントエンド用の公開IDは設定しない
- AI解析の結果ユーザID、固定解析タグ、バックエンドの秘密設定は埋め込まない

Google AnalyticsのMeasurement IDもビルドへ埋め込みません。バックエンドの`googleAnalytics`が有効な場合だけ`GET /api/analytics/config`から取得します。応答の検証と起動条件は[APIクライアント](api.md#google-analytics公開設定identity-api)、バックエンドの設定は[環境変数](../backend/environment-variables.md)を参照してください。

### E2E専用設定

[`frontend/.env.e2e.example`](../../../frontend/.env.e2e.example)を`.env.e2e`へコピーして使用します。既存の`.env.e2e`はそのまま使用でき、設定例は自動読込しません。設定とサービスの準備は[E2E手順](../../testing/e2e-testing.md#設定ファイルの準備)を参照してください。

次の変数はViteのサーバ・プレビュー設定だけで使用し、アプリへ公開しません。

| 変数 | E2Eの固定値 |
| --- | --- |
| `VITE_SERVER_PORT` | `3100` |
| `VITE_BACKEND_PROXY_TARGET` | `http://127.0.0.1:5100` |

`e2e`モードでは`VITE_APP_URL`を`http://localhost:3100`へ固定します。別オリジン、通常開発ポート、資格情報、パス、クエリ、ハッシュを含むプロキシ接続先を拒否します。Google OAuthとOneSignalの公開IDは空に固定し、実行プロセスから非空値が渡された場合もビルドを停止します。

E2Eの環境ファイルには公開ダミー値だけを使用します。Google Analyticsは専用プロファイルのバックエンドAPIから固定ダミー値を取得します。DB、外部通信の制限、プロファイルごとの設定は[E2E手順](../../testing/e2e-testing.md)を参照してください。

## 動作・適用条件

### 開発サーバ

`npm run serve`は`development`モードで起動します。次は既定の設定です。

| 項目 | 設定 |
| --- | --- |
| 待受 | `host: 0.0.0.0`、`port: 3000`、`strictPort: true` |
| 許可Host | `localhost` |
| CORS | localhost／ループバックのポート3000 |
| HMRクライアントポート | `3000` |
| プロキシ | `/api`、`/media/`、`/profile/`、`/socket.io`をループバックのバックエンドポート5000へ転送 |
| ファイル配信 | ソースツリー外と、秘密情報・資格情報・キー関連パスを拒否 |

通常開発では、`frontend/.env.development`に次の任意項目を設定できます。アプリの公開設定には含まれません。

| 変数 | 既定値 | 設定できる値 |
| --- | --- | --- |
| `VITE_SERVER_PORT` | `3000` | 開発サーバのポート。1～65535の整数 |
| `VITE_BACKEND_PROXY_TARGET` | `http://127.0.0.1:5000` | バックエンドのHTTP／HTTPS接続先。認証情報、パス、クエリ、フラグメントは含めない |

変更時はバックエンドの`PORT`、`VUE_APP_APPURL`、`CORS_ALLOWED_ORIGINS`も接続先とブラウザのアクセスURLに合わせます。`SOCKET_CORS_ALLOWED_ORIGINS`を指定している場合も合わせて変更します。設定後はフロントエンドと、設定を変更したバックエンドを再起動してください。E2Eでは3100番ポートと`http://127.0.0.1:5100`への転送が固定です。

Unitテストと`npm run test:e2e`はサーバを自動起動しません。ブラウザでの手動確認は[ローカル開発の準備](../../testing/local-development.md)を参照してください。

### ビルド

通常ビルドの前に、[公開環境変数](#フロントエンド公開環境変数)の手順で対象環境の設定ファイルを用意します。

| コマンド | 用途 | 出力 |
| --- | --- | --- |
| `npm run build:development` | 非圧縮の成果物 | `frontend/dist/` |
| `npm run build:staging` | ステージング設定とプロダクション同等の最適化を適用した成果物 | `frontend/dist/` |
| `npm run build:production` | プロダクション設定と最適化を適用した成果物 | `frontend/dist/` |
| `npm run build:e2e` | Nightwatchで検証するE2E専用成果物 | チェックアウトルートの`.e2e-runtime/frontend-dist/` |

通常の3モードは`frontend/scripts/vue3-build.mjs`を共通入口とし、ビルド後に公開必須ファイル、禁止ディレクトリ、HTMLエントリーの順序、リリースID、未解決プレースホルダーを検査します。チェックアウト先の絶対パスや、入力外のGit状態には依存しません。

リリース情報付きのプロダクションビルドでは、対象のタグ・コミットに一致するソースを用意し、`frontend/`で次を実行します。

```text
npm run build:production -- --release-tag <tag> --release-commit <40桁commit ID>
```

タグとコミットIDは両方を指定します。現行の通常CLIでは、リリース情報はproductionモードだけに指定できます。ビルド処理は親ディレクトリのGit状態を探索しません。識別情報を指定しないローカルビルドとE2Eビルドは、リリース成果物へ流用しません。配布アーカイブの構成と配置条件は[リリース成果物仕様](../release-artifact.md)、サーバでの起動方法は[サーバへの導入](../../deployment/README.md)を参照してください。

### E2Eビルドとプレビュー

`npm run build:e2e`はViteを直接実行し、`frontend/.env.e2e`を読み込みます。ビルド前に出力先がチェックアウト内の実ディレクトリであることを検証し、シンボリックリンクや外部へ解決されるパスは、出力先を空にする前に拒否します。

`npm run serve:e2e`は毎回ビルドしてから成果物を3100で配信し、API・メディア・Socket.IOを5100の専用バックエンドへ転送します。HMRとソース監視は使用しないため、変更後はこのコマンドを再実行します。

E2Eエントリーには診断プラグインを含めます。通常の`development`、`staging`、`production`には含めません。生成先の`.e2e-runtime/frontend-dist/`は実行後も自動削除しません。専用DB、環境の準備・終了・保持条件は[E2E手順](../../testing/e2e-testing.md)に従います。

### リリースIDとチャンク読み込みの復旧

リリースIDを`__ISEEETL_RELEASE_ID__`として生成コードへ一度だけ埋め込み、`vue3-build-manifest.json`にも記録します。

| ビルド | リリースID |
| --- | --- |
| ローカル | `local@<mode>@<run-id>` |
| リリース | `<annotated-tag>@<40桁commit>` |

Viteのpreloadエラーや、チャンクの読み込みエラーと確認できた場合は、`sessionStorage`の`iseeetl:safe-reload:<release ID>`へ`attempted`を保存し、一度だけ自動再読み込みします。ルート、クエリ、ハッシュ、トークン、投稿内容は保存しません。

同じリリースで2回目の失敗、オフライン、保存領域や再読み込みを利用できない場合は、自動再読み込みせず復旧画面と手動の再試行操作を表示します。記録したマーカーは、ルーターの準備とアプリのマウントが両方成功した後に削除します。

### 静的アセット

Viteは`frontend/public/`を開発時にルートURLから配信し、ビルド時には内容を変換せず成果物ルートへコピーします。

- 固定URLや元のファイル名が必要なアセットを`frontend/public/`へ置く。それ以外は原則として`frontend/src/`から読み込み、Viteの変換とハッシュ付きファイル名を利用する
- `manifest.json`、`shortcut-manifest.json`、`web-app-manifest.js`、`OneSignalSDKWorker.js`を成果物ルートへ配置する
- 非公開ファイル、設定ファイル、利用者データ、バックエンドの`media`・`profile`・`upload`ディレクトリは公開ディレクトリへ置かない
- バックエンドの`/media/`と`/profile/`は静的アセットと分け、開発サーバやE2Eプレビューのプロキシを通して取得する

ビルド後は固定ファイル4件が通常ファイルとして存在し、禁止ディレクトリがないことを検査します。HTMLエントリーの順序、リリースID、未解決プレースホルダー、ライセンス情報も検査します。

### HTML、マニフェスト、外部サービス

`frontend/index.html`は`web-app-manifest.js`をViteのモジュールエントリーより前に同期読み込みします。マニフェストはホーム・フロア・ルームに応じて選択し、MongoDB ID、クエリ、ハッシュを参照します。

- Google Fontsは`frontend/index.html`に定義した外部URLから読み込む
- OneSignal SDKは有効設定と公開IDが揃った場合だけ固定URLから動的に読み込む。`OneSignal.init`を一度だけ登録し、ログイン連携は初期化完了を待つ
- Googleログインは有効設定と公開Client IDが揃った場合だけ表示する
- Google Analyticsは有効設定、公開Measurement ID、利用者情報と対象ルートの準備後に固定URLから読み込む。取得や準備に失敗した場合は計測を停止し、通常のアプリ機能を継続する

Google Analyticsの初期設定、送信項目、順序は[Cookie・ブラウザ保存・外部送信](cookies-and-external-transmissions.md#送信イベントとパラメータ)、ページ計測の開始条件は[ルーティング](routing.md#google-analyticsのページ計測)を参照してください。

### 圧縮・キャッシュ・ライセンス

- 事前圧縮したgzipファイルは生成しない。HTTP圧縮は配信層で設定する
- ソースマップは生成しない
- プロダクションではOxcでJavaScript、Lightning CSSでCSSを圧縮し、consoleを除去する
- Vite／Vitestのキャッシュ先は各ツールの標準動作を使用し、チェックアウト先の絶対パスへ固定しない
- ハッシュ付きアセットは変更不可、`index.html`は再検証する配信設定を使用し、ステージングで確認する
- `licenses.json`を成果物ルートへ生成し、依存ライブラリの名前・バージョン・ライセンス名・本文を検査する。不足時はビルドを失敗させる。本文・NOTICEとコード内の権利表示を保持する。詳細は[ライブラリのライセンス](../../legal/libraries.md)を参照
- 配置時は成果物を一括で切り替えるか、以前のハッシュ付きアセットを保持する

### リリース前の検証

`npm run test:build`は通常の3モードを一括ビルドし、成果物の条件とE2E診断モジュールが混入していないことを検査します。Unit、Lint、必要なE2E、対象ブラウザ、キャッシュ・配信設定の確認は[フロントエンドリリース品質確認](../../testing/frontend-release-quality.md)に従います。

外部サービスを有効にする場合は、対象環境の設定でSDK初期化、表示制御、認証・通知を別途確認します。実際のGoogle Analyticsへの送信確認は[Google Analytics検証手順](../../testing/google-analytics.md)を参照してください。

## 関連資料

### 実装

- `frontend/vite.config.js`
- `frontend/package.json`
- `frontend/src/bootstrapApp.js`
- `frontend/src/features/analytics/runtime.js`
- `frontend/scripts/vue3-build.mjs`
- `frontend/scripts/build-licenses.mjs`

### テスト

- `frontend/tests/unit/config/viteConfig.spec.js`
- `frontend/tests/unit/config/vue3Build.spec.js`
- `frontend/tests/unit/config/buildLicenses.spec.js`
- `frontend/tests/unit/features/analytics/runtime.spec.js`
- `frontend/tests/unit/features/chunkLoadRecovery.spec.js`
- `frontend/tests/build-integration/frontend-build-integration.mjs`
