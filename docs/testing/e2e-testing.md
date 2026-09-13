# フロントエンドE2Eテスト実行

Nightwatch 3でフロントエンドのE2Eテストを実行する手順です。専用DBの初期化、バックエンド・フロントエンドの起動、テスト、終了処理の順に進めます。

## 前提

- 通常開発・本番環境と分離したE2E専用環境を使います。専用DBの初期化、サービスの起動・停止、Chrome／ChromiumとChromeDriverの実行権限が必要です。
- `core`、`mail`、`analytics`と、これらのプロファイルで動く固定アカウント変更テストを対象とします。確認内容は[プロファイル一覧](#プロファイルと実行コマンド)を参照してください。
- メールはMailpit、AnalyticsはローカルCDPモックで確認します。実際のGA4プロパティへの送信・保持設定や、OneSignal・LINE・Google Translateなどの外部接続は検証しません。
- MongoDBとネットワークを事前に用意し、mailプロファイルではMailpitも追加します。導入方法は[テスト用サービスとブラウザの準備](service-setup.md)を参照してください。

## 初めて環境を用意する場合

Linux上で、次の構成を用意します。Composeを使う場合は、実行環境・MongoDB・Mailpitを同じネットワークへ接続してください。

| 構成要素 | 必要な準備 |
| --- | --- |
| 実行環境 | [テスト環境の対応範囲](test-environment.md#実行環境)を満たすNode.js・npmと、Bash、curl、`timeout`、FFmpeg／ffprobeを導入する |
| ブラウザ | ChromeまたはChromiumと対応するChromeDriverを導入する。実行ファイルの場所は[ブラウザの準備](service-setup.md#e2eの名前解決とブラウザ)で確認・指定する |
| MongoDB | テスト専用サーバを用意する。`backend/.env.e2e`の接続先で、認証情報なしで専用DB`iseeetl_e2e`を利用できること。設定例は`db:27017`。外部へポートを公開しない |
| Mailpit | mailプロファイルで必要。実行環境から設定した専用ホストのSMTP 1025・HTTP API 8025番ポートへ接続できること。SMTPリレー・転送は設定しない |
| ソースと保存先 | 実行環境にリポジトリ全体を配置し、同じOSユーザでBackend・Frontend・Nightwatchを実行する。チェックアウト内の`.e2e-runtime/`へ書き込めること |
| 接続と画面確認 | Nightwatchが使う`localhost:3100`と`localhost:5100`は同じ実行環境を指すこと。手動確認用にポートを公開する場合は、ホストのループバックだけへ公開する |

MongoDBは、現行のBackend Integrationで使用するMongoDB 7.0系を基準に用意します。接続先の固定条件は[バックエンド環境変数](../spec/backend/environment-variables.md#e2e軽量隔離用設定)を参照してください。

1. 上表のツールとサービスを用意し、バージョンと実行環境からの接続を確認します。Mailpitの到達確認コマンドは[mailプロファイルの追加確認](#mail-プロファイルの追加確認)にあります。
2. リポジトリルートで`npm --prefix backend ci`と`npm --prefix frontend ci`を実行します。
3. [設定ファイルの準備](#設定ファイルの準備)に従い、Frontend・Backendの`.env.e2e.example`から環境専用の`.env.e2e`を作成します。
4. 以下の「実行前の確認」から、保存先の準備、専用DB初期化、起動、テスト、終了処理の順に進めます。

この構成はE2E専用です。MongoDBやMailpitのデータを通常開発・本番と共有しません。索引は専用DB初期化時に製品モデルから作成し、既存索引と衝突した場合は自動削除せず停止します。

## 設定ファイルの準備

リポジトリルートで次を実行し、既存ファイルがなければ`.env.e2e.example`を`.env.e2e`へコピーします。テストは`.env.e2e`を読み込み、設定例は直接使用しません。

```bash
test -e backend/.env.e2e || cp backend/.env.e2e.example backend/.env.e2e
test -e frontend/.env.e2e || cp frontend/.env.e2e.example frontend/.env.e2e
```

通常開発や本番の環境ファイルをコピーせず、実際の利用者情報や外部サービスの秘密値を設定しません。各項目の説明は[バックエンドの設定例](../../backend/.env.e2e.example)と[フロントエンドの設定例](../../frontend/.env.e2e.example)を参照してください。

| 項目 | 設定・準備する内容 |
| --- | --- |
| DB接続先 | `backend/.env.e2e`の`DB_CONNECT`を専用MongoDBに合わせる。ホストは`db`、`localhost`、`127.0.0.1`、`[::1]`のいずれかで、ポートは変更可能。DB名は`iseeetl_e2e`固定、認証情報は含めない |
| アプリ名 | 必要に応じてBackendの`VUE_APP_APPNAME`とFrontendの`VITE_APP_NAME`を変更する |
| Mailpit接続先 | `SEND_MAIL_HOST`は`mailpit`、`localhost`、`127.0.0.1`、`::1`から専用サービスのホストを選ぶ。`E2E_MAILPIT_API_URL`も合わせる。SMTP 1025・HTTP API 8025番ポートは固定。IPv6のAPI URLは`http://[::1]:8025`。認証情報・パス・クエリ・フラグメントを含めない |
| 固定の設定 | アプリのURL・3100／5100番ポート・CORS、外部機能のフラグと空の認証情報、Analyticsのダミー値は設定例のまま使う |
| 保存先 | `DIST_PATH`・`MEDIA_PATH`・`PROFILE_PATH`は相対パスのまま使う。配置場所に合わせた書換えは不要。[実行前の確認](#実行前の確認)に従って`.e2e-runtime/`内のディレクトリと書込権限を用意する |
| ブラウザの一時領域 | `.env.e2e`へ記載せず、[実行前の確認](#実行前の確認)で`E2E_BROWSER_TMP_BASE`を設定する |

その他の項目は、調整が必要な場合を除き例示値を使います。固定アカウントを変更する場合も、メールは互いに異なる`example.invalid`のアドレス、パスワードは8～16文字のテスト専用値にします。固定条件に合わない設定は読み込み時に拒否されます。

## 隔離構成

| 項目 | E2E専用設定 |
| --- | --- |
| MongoDB | 同一MongoDBサーバ内の固定DB名`iseeetl_e2e` |
| フロントエンド | `http://localhost:3100`のVite preview |
| バックエンド | `http://localhost:5100` |
| フロントエンド設定 | `.env.e2e.example`から作成する`frontend/.env.e2e` |
| バックエンド設定 | `.env.e2e.example`から作成する`backend/.env.e2e` |
| 実行データ | リポジトリルート直下の`.e2e-runtime/media/`、`profile/` |
| フロントエンドのビルド | `.e2e-runtime/frontend-dist/` |
| レポート | `.e2e-runtime/reports/nightwatch/` |

通常開発用フロントエンド／バックエンドの`3000`／`5000`、目視確認用DB、通常のメディア・プロフィール画像の保存先は、この手順から起動、停止、初期化しません。

## DB初期化の安全条件

`backend/scripts/e2e/reset-database.js`は、次の条件をすべて満たす場合だけDBを初期化します。

1. `NODE_ENV=development`である。
2. E2E用の必須設定と3つの固定アカウントの設定が揃っている。
3. `DB_CONNECT`が`mongodb://`を使用し、接続ホストが専用ネットワーク内の`db`またはループバックアドレスである。
4. 接続後のDB名が`iseeetl_e2e`と完全に一致する。

初期化処理はシステムコレクションを除く全コレクションのデータを削除します。既存のコレクションと索引は維持します。製品モデルの索引を作成してから、管理者・フロア編集者・一般ユーザを登録します。条件が一致しない場合は停止し、別DBへ切り替えません。

## プロファイルと実行コマンド

| プロファイル | バックエンド起動 | Nightwatchの選択 | 確認内容 |
| --- | --- | --- | --- |
| core | `npm run dev:e2e` | 外部サービス、mail、analytics、固定アカウント変更タグを除外 | 外部機能が無効な場合の主要回帰 |
| mail | `npm run dev:e2e:mail` | `--tag mail-capture-enabled` | Mailpitを使うメール導線 |
| analytics | `npm run dev:e2e:analytics` | `--tag analytics` | ローカルモックによるAnalytics契約 |
| 固定アカウント変更 | 対応する標準プロファイル | `--test`でテストファイルを一つずつ指定 | パスワード、ロール、アカウント状態を変えるシナリオ。実際の外部サービスのタグ併記テストファイルは対象外 |

バックエンド用コマンドは`backend/.env.e2e`を自動で読み込みます。固定アカウントの値も同じファイルで管理され、Nightwatchの事前読込処理が必要な項目だけをテストランナーへ渡します。

## 実行前の確認

1. 同じ`iseeetl_e2e`、`3100`、`5100`、`.e2e-runtime/`を使用する別のE2Eが動いていないことを確認します。
2. 対象が本番環境、共有DB、目視確認用DBではないことを確認します。
3. リポジトリルートを実行用変数へ設定します。

   ```bash
   set -eu
   cd /path/to/iseeetl
   E2E_ROOT="$(pwd -P)"
   test -f "$E2E_ROOT/backend/package.json"
   test -f "$E2E_ROOT/frontend/package.json"
   ```

4. E2E専用のファイル領域を準備します。

   ```bash
   cd "$E2E_ROOT"
   for E2E_PATH in .e2e-runtime .e2e-runtime/media .e2e-runtime/profile .e2e-runtime/frontend-dist .e2e-runtime/reports .e2e-runtime/reports/nightwatch; do
     test ! -L "$E2E_PATH"
   done
   mkdir -p .e2e-runtime/media .e2e-runtime/profile .e2e-runtime/reports/nightwatch
   ```

   `set -e`を維持した同じシェルで実行します。`.e2e-runtime/`、各保存先、フロントエンドのビルド先、レポートのいずれかがシンボリックリンクの場合は、`mkdir`より前に停止します。

5. Chromiumの一時ソケット用に、OSが提供する短い一時ディレクトリの下へ今回の実行専用ディレクトリを作り、`E2E_BROWSER_TMPDIR`へ絶対パスを設定します。`E2E_BROWSER_TMP_BASE`には、あらかじめ作成した短い絶対パスを指定します。

   ```bash
   set -eu
   : "${E2E_BROWSER_TMP_BASE:?一時領域の短い絶対パスを指定する}"
   case "$E2E_BROWSER_TMP_BASE" in /*/) exit 1 ;; /*) ;; *) exit 1 ;; esac
   test -d "$E2E_BROWSER_TMP_BASE"
   test ! -L "$E2E_BROWSER_TMP_BASE"
   test "${#E2E_BROWSER_TMP_BASE}" -le 37
   E2E_BROWSER_TMPDIR="$(mktemp -d "$E2E_BROWSER_TMP_BASE/e2e.XXXXXX")"
   export E2E_BROWSER_TMPDIR
   ```

   `set -eu`により、シンボリックリンク、作成失敗、長さ検査のいずれかで失敗した場合はそのシェルを終了します。48文字を超える生成パスは使用しません。
6. `3100`と`5100`を既存プロセスが使用していないことを確認します。使用中の場合、そのプロセスをこの手順から停止せずE2Eを中止します。

## 共通の実行手順

### 1. DBを初期化する

プロファイルの開始前に1回実行します。

```bash
cd "$E2E_ROOT/backend"
npm run e2e:db:reset
```

終了コードが`0`で、3つの固定アカウントの登録が完了した場合だけ次へ進みます。

専用DBの初期化では、固定アカウントの登録前に製品モデルの索引を作成します。索引作成に失敗した場合は、固定アカウントを登録せず停止します。

### 2. バックエンドとフロントエンドを起動する

別々の端末またはサービスのセッションで起動します。各端末で`E2E_ROOT`を同じリポジトリルートへ設定するか、コマンド内の変数をその絶対パスへ置き換えてください。次はcoreの例です。

```bash
cd "$E2E_ROOT/backend"
npm run dev:e2e
```

```bash
cd "$E2E_ROOT/frontend"
npm run serve:e2e
```

mailではバックエンドのコマンドを`npm run dev:e2e:mail`、analyticsでは`npm run dev:e2e:analytics`へ置き換えます。`serve:e2e`はE2E用フロントエンドをビルドしてからVite previewで配信します。ソースコードを変更した場合は、フロントエンドを停止してビルドから起動し直してください。

### 3. 到達を確認する

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3100/
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:5100/
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/capabilities
```

3件ともHTTPステータスが`200`の場合だけテストを開始します。

### 4. Nightwatchを実行する

単一テストファイルの例:

```bash
cd "$E2E_ROOT/frontend"
TMPDIR="$E2E_BROWSER_TMPDIR" npm run test:e2e -- --url http://localhost:3100 --test tests/e2e/specs/flows/login/login-timeline.smoke.js
```

core全件:

```bash
cd "$E2E_ROOT/frontend"
TMPDIR="$E2E_BROWSER_TMPDIR" npm run test:e2e -- --url http://localhost:3100 --skiptags mail-capture-enabled,provider-onesignal,provider-line,provider-google-translate,fixed-seed-mutation,analytics
```

mail:

```bash
cd "$E2E_ROOT/frontend"
TMPDIR="$E2E_BROWSER_TMPDIR" npm run test:e2e -- --url http://localhost:3100 --tag mail-capture-enabled
```

analytics:

```bash
cd "$E2E_ROOT/frontend"
TMPDIR="$E2E_BROWSER_TMPDIR" npm run test:e2e -- --url http://localhost:3100 --tag analytics
```

環境不足でスキップされたシナリオは成功へ含めません。

## mail プロファイルの追加確認

mail プロファイルを始める前に、E2E実行環境からMailpit APIとSMTPへ到達できることを確認します。次は設定例の`mailpit`を使う例です。ループバック接続の場合は、URLとSMTPホストを`backend/.env.e2e`に設定した値へ置き換えます。

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://mailpit:8025/
timeout 5 bash -c 'exec 3<>/dev/tcp/mailpit/1025; exec 3>&-'
```

APIが`200`、SMTP確認の終了コードが`0`であることを確認します。到達できない場合は、別エンドポイントや一時メールサーバへ切り替えず中止してください。

DBの初期化後にバックエンドを`npm run dev:e2e:mail`で起動し、フロントエンド経由のCapabilityを確認します。

```bash
node -e "fetch('http://localhost:3100/api/capabilities').then(async (response) => { const body = await response.json(); if (response.status !== 200 || body.mailDelivery !== true) process.exit(1); }).catch(() => process.exit(1));"
```

終了コードが`0`の場合だけmailのテストへ進みます。DBの初期化はMailpitのメッセージを削除しません。

## analytics プロファイルの追加確認

Analytics用バックエンドを起動した後、Capabilityと公開設定を確認します。

```bash
node -e "fetch('http://localhost:3100/api/capabilities').then(async (response) => { const body = await response.json(); if (response.status !== 200 || body.googleAnalytics !== true) process.exit(1); }).catch(() => process.exit(1));"
```

```bash
node -e "fetch('http://localhost:3100/api/analytics/config').then(async (response) => { const body = await response.json(); if (response.status !== 200 || body.measurement_id !== 'G-E2E0000000' || Object.keys(body).length !== 1) process.exit(1); }).catch(() => process.exit(1));"
```

両方の終了コードが`0`の場合だけanalyticsのテストへ進みます。このプロファイルは固定ダミー設定とローカルCDPモックを使用し、GA4への外部送信を行いません。

## 固定アカウントを変更するテストファイル

`fixed-seed-mutation`に分類され、core／mail／analyticsの標準プロファイルだけで動くテストファイルは一つずつ実行します。各テストファイルの直前に`npm run e2e:db:reset`を成功させ、`--test`で一つだけ指定してください。変更後のDB状態で別テストファイルを続けて実行しません。

`profile.push-settings.e2e.js`は`provider-onesignal`も要求するため、現行の標準プロファイルでは実行できません。同様に実際の外部サービスのタグを併記したテストファイルを、core／mail／analyticsへ読み替えて実行しないでください。

## シナリオデータの準備と破棄

設定・セッション失効の代表シナリオは次のとおりです。

| ファイル（`frontend/tests/e2e/specs/flows/`配下） | 検証 | プロファイル |
| --- | --- | --- |
| `login/logout-media-cookie.e2e.js` | ログアウト通信失敗の再試行、Guest通信停止中のHttpOnly User Cookie消去とローカル認証解除 | core（mailでも実行可能） |
| `timeline/socket-room-floor-configuration-revocation.e2e.js` | メンバー限定化・ルーム／フロア削除後の通知、切断、遷移、再接続拒否 | core |
| `timeline/socket-password-session-revocation.e2e.js` | パスワード変更後の本人2接続失効、旧認証拒否、再ログイン | core・fixed-seed-mutation |
| `account/change-password.success.e2e.js` | 画面から変更後、自動ログアウトとログイン画面遷移、新パスワードで再ログイン | core・fixed-seed-mutation |

- 各テストは必要なフロア、ルーム、投稿などをシナリオ内で作成します。必須設定、作成ID、操作対象が得られない場合はテスト失敗とします。
- 操作の検証として行う論理削除やリアクション解除は、後処理とは区別します。親フロア・ルームの削除で関連データが一括削除されることを前提にしません。
- シナリオデータと固定アカウントの変更は個別に復旧せず、次のプロファイル開始前、または固定アカウントを変更するテストの直前に専用DBを初期化して破棄します。仮登録データも初期化の対象です。
- ブラウザ、Socket、リスナー、WebDriverは各テストの終了処理で解放します。

## サービスの停止と後処理

1. テストと結果確認が終わったら、フロントエンド／バックエンドを起動した各端末で`Ctrl+C`を入力し、起動コマンドが終了するまで待ちます。別プロセスへ`kill`や`pkill`を実行しません。
2. プロセスの終了と`3100`／`5100`の解放を確認します。
3. 一時ディレクトリを作成した同じシェルで、次の検査がすべて成功した場合だけ、今回作成した`E2E_BROWSER_TMPDIR`を削除します。

   ```bash
   : "${E2E_BROWSER_TMP_BASE:?一時領域が未設定}"
   : "${E2E_BROWSER_TMPDIR:?実行用一時ディレクトリが未設定}"
   case "$E2E_BROWSER_TMPDIR" in "$E2E_BROWSER_TMP_BASE"/e2e.??????) ;; *) exit 1 ;; esac
   test -d "$E2E_BROWSER_TMPDIR"
   test ! -L "$E2E_BROWSER_TMPDIR"
   rm -r -- "$E2E_BROWSER_TMPDIR"
   unset E2E_BROWSER_TMPDIR
   ```

   検査が失敗した場合は削除せず、パスを推測して作り直しません。
4. `.e2e-runtime/`は次回実行に使用するため、通常は削除しません。

起動途中、到達確認、E2Eのいずれかが失敗した場合も同じ終了手順を行います。開始前から存在したプロセスや通常開発用`3000`／`5000`は停止しません。

## 中止条件

次のいずれかに該当する場合は開始または続行しません。

- DBの初期化が失敗した、または接続後のDB名を確認できない。
- バックエンド／フロントエンドが`5100`／`3100`以外へ接続している。
- フロントエンドのプロキシが通常開発用バックエンドを指している。
- 同じ専用DB、ポート、保存先を使う別作業が実行中である。
- プロファイルに必要な設定、固定アカウント、Mailpitが揃っていない。
- 本番環境、共有DB、目視確認用DBまたは通常の保存先を対象としている。
- 失敗後のDBを初期化せず、状態変更を伴うシナリオを再実行しようとしている。

## 成功判定

次のすべてを満たした場合に、対象プロファイルまたはテストが成功です。

1. プロファイル開始前のDBの初期化と3つの固定アカウントの登録が成功している。
2. E2E専用フロントエンド／バックエンドが`3100`／`5100`で応答し、フロントエンドのプロキシがE2E専用バックエンドへ接続している。
3. Nightwatchの終了コードが`0`で、対象の検証項目がすべて成功している。
4. 必須シナリオがスキップされていない。
5. ブラウザ、Socket、WebDriver、テストランナーの終了処理が完了している。
6. レポートやスクリーンショットに秘密値や不要な利用者データが含まれていない。
7. 継続起動しない場合、フロントエンド／バックエンドを停止し、`3100`／`5100`が解放されている。

## よくある失敗

### DBの初期化が停止する

`.env.e2e`がない場合は、[設定ファイルの準備](#設定ファイルの準備)に従って作成します。

`NODE_ENV`と必須変数が設定済みであること、接続後のDB名が`iseeetl_e2e`であることを確認します。秘密値はログや共有資料へ出力しないでください。安全検査を無効化したり、別DBへ切り替えたりしないでください。

### フロントエンドまたはバックエンドへ接続できない

フロントエンドが`3100`、バックエンドが`5100`で起動していることと、`VITE_BACKEND_PROXY_TARGET`がE2E専用バックエンドを指すことを確認します。通常開発用の`3000`／`5000`へ切り替えないでください。

### ChromeDriverが起動しない

ChromeDriverとChromiumのメジャーバージョン、`9515`の競合、`E2E_BROWSER_TMPDIR`のパス長を確認します。

### Mailpitへ接続できない、またはメールが届かない

Mailpit APIとSMTPの両方、`mailDelivery=true`、バックエンドを`npm run dev:e2e:mail`で起動したことを確認します。同じMailpitを別のE2Eが使用している場合は中止します。

### シナリオが失敗またはスキップされる

最初の失敗、対象テスト名、終了コード、プロファイルを確認します。再実行する場合は対象サービスを停止し、DBの初期化からやり直します。

## 再実行と復旧

E2E専用DBを既知状態へ戻す場合は、フロントエンド／バックエンドを停止してから、安全条件を満たす`npm run e2e:db:reset`を再実行します。個別データや固定アカウントを手動で復旧しません。

共有データへ接続した疑いがある場合は、設定を変更して再試行せず、プロセスを停止してバックエンドまたはテスト運用の責任者へ連絡してください。

## 関連文書

- [テスト・検証手順](README.md)
- [テスト環境の準備とコマンド選択](test-environment.md)
- [フロントエンドのビルド、設定](../spec/frontend/build-and-config.md)
- [バックエンド環境変数](../spec/backend/environment-variables.md)
- [フロントエンド画面仕様](../spec/frontend/screens/README.md)
- [画面横断の操作フロー](../spec/frontend/flows/README.md)
- [Google Analytics検証](google-analytics.md)

## 参照コード

### 仕様の回帰を確認する代表シナリオ

次のテストはcoreプロファイルで実行します。前述の初期化・起動を済ませ、単独実行では`npm run test:e2e -- --url http://localhost:3100 --test tests/e2e/specs/flows/<下表のファイル>`を使います。

| 確認する仕様 | `flows/`からのファイル | 確認結果 |
| --- | --- | --- |
| フロア・ルーム画像の差し替え取消 | `floor/floor.crud.e2e.js`、`room/room.crud.e2e.js` | 同じファイルの再選択、取消後の保存・再読込で元画像を保持 |
| スマホのタイムラインタブ | `timeline/filter.e2e.js` | タブ内のボタン配置・クリック、選択列の読み上げ・絞り込み編集・削除 |
| 認証済み利用者の招待拒否 | `invite/invite-authenticated-rejection.e2e.js` | 不正・別対象・期限切れの拒否理由、未加入状態 |
| 共通タグCSV取込 | `management/categorytag-management.csv-import.e2e.js` | プレビュー・取消時の未変更、保存、重複名拒否後の未変更 |
| v1とタイムラインの連携 | `timeline/v1-live-updates.e2e.js` | 投稿の作成・更新・削除が再読込なしで反映され、別ルームに配信されない |
| タイムライン出力 | `management/timeline-data-management.smoke.js`、`management/timeline-data-management.media.e2e.js` | JSONの投稿・対象ID、ZIPの画像内容、ファイル名、他ルームのデータを含まないこと |

期限切れ招待とv1用アカウントは専用fixtureで準備します。専用loaderの検証を通した`iseeetl_e2e`だけを操作し、固定3アカウントの状態は変更しません。CSVテストは既存の有効タグを取込データへ含め、名称・順序・IDを保持します。取込対象の更新日時はAPIの仕様に従って更新されます。生成CSVは`.e2e-runtime/fixtures/`へ保持します。JSON・ZIPはブラウザが生成するBlobの内容を読み取り、OSのダウンロード画面は操作しません。

### 実装

- `backend/scripts/e2e/reset-database.js`
- `backend/scripts/e2e/environment.js`
- `frontend/vite.config.js`
- `frontend/nightwatch.config.js`
- `frontend/tests/e2e/specs/helpers/mailpit.js`
- `frontend/tests/e2e/specs/helpers/analytics-cdp.js`
