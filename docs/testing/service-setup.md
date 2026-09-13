# テスト用サービスとブラウザの準備

開発・テスト用のMongoDB、Mailpit、ブラウザをLinux上に用意する手順です。Node.js・npmとテストコマンドは[テスト環境](test-environment.md)を参照してください。

## 必要なものを選ぶ

| 作業 | MongoDB | Mailpit | Chrome／Chromium・ChromeDriver |
| --- | --- | --- | --- |
| 単体テスト・ビルド検証 | 不要 | 不要 | 不要 |
| バックエンド結合テスト | テスト処理が専用MongoDBを起動 | 不要 | 不要 |
| ローカル開発・手動確認 | 開発用DBを準備 | メール確認時に必要 | 手動操作用ブラウザ。ChromeDriverは不要 |
| フロントエンドE2E | 専用DBを準備 | mailプロファイルで必要 | 両方必要 |

結合テストのMongoDBはテスト処理が用意します。詳細は[結合テストの説明](test-environment.md#バックエンドの結合テスト)を参照してください。

## MongoDB

ローカル開発とE2Eでは、[MongoDBの導入手順](https://www.mongodb.com/docs/manual/administration/install-community/)に従って専用環境を用意します。バージョンは[運用事例の稼働環境](../deployment/production.md#稼働環境)を参考にしてください。本番・共有DBへ接続しません。

- ローカル開発：開発用環境ファイルへ接続先を設定し、[DBの確認](local-development.md#3-dbの確認)を行います。
- E2E：外部に公開しない専用MongoDBを用意し、認証情報なしで専用DB`iseeetl_e2e`へ接続できるようにします。[設定ファイルの準備](e2e-testing.md#設定ファイルの準備)に従って接続先を指定します。設定例は`db:27017`です。索引と試験ユーザは[E2EのDB初期化](e2e-testing.md#1-dbを初期化する)が作成します。

## Mailpit

Mailpitはテストメールを捕捉して画面やAPIで確認するSMTPサーバです。[公式手順](https://mailpit.axllent.org/docs/install/)で1.26.2以降を導入し、`mailpit --version`で確認します。

アプリと同じサーバで使う場合は、1025・8025番ポートが空いていることを確認し、別の端末で起動します。

```bash
mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --disable-version-check
```

`http://localhost:8025`で画面を開き、[メール手動確認](local-mail-testing.md)の設定へ進みます。SMTPリレー・転送・Webhookは設定せず、SMTPと確認画面はインターネットへ公開しません。リモート接続にはSSHのポート転送などを使います。

終了は`Ctrl+C`です。既定では終了時にメールを削除します。保持する場合の`--database`などは[Mailpitの実行オプション](https://mailpit.axllent.org/docs/configuration/runtime-options/)を参照してください。

## E2Eの名前解決とブラウザ

E2Eはバックエンド・フロントエンド・Nightwatchを同じ実行環境で動かします。そこから設定したMongoDBへ、mailプロファイルでは専用MailpitのSMTP 1025番ポートとHTTP API 8025番ポートにも接続できるようにします。

- 同じサーバに置く場合：MongoDBとMailpitの接続ホストは`127.0.0.1`などに変更できます。Mailpitは`backend/.env.e2e`の`SEND_MAIL_HOST=127.0.0.1`と`E2E_MAILPIT_API_URL=http://127.0.0.1:8025`を設定します。専用サービスはループバックで待ち受けます。
- Composeを使う場合：実行環境とサービスを同じ専用ネットワークに置き、サービス名で接続します。MongoDBとSMTPのポートはホストへ公開しません。Compose定義はリポジトリに含まれません。

ブラウザとChromeDriverは[公式の対応バージョン案内](https://developer.chrome.com/docs/chromedriver/downloads/version-selection)に従って組み合わせます。Nightwatchを起動するシェルで、次の環境変数に実行ファイルの絶対パスを指定できます。`.env.e2e`には記載しません。

| 実行ファイル | 環境変数 | 未指定時の配置先 |
| --- | --- | --- |
| Chrome／Chromium | `E2E_CHROME_BINARY` | `/usr/bin/chromium-browser` |
| ChromeDriver | `E2E_CHROMEDRIVER_PATH` | `/usr/bin/chromedriver` |

両方の`--version`で確認し、必要なOSライブラリを揃えます。ブラウザは画面を表示せず、サンドボックスを無効にして動くため、試験データだけの隔離環境を使います。

準備後は[E2E手順](e2e-testing.md)に従ってDB初期化・起動・接続確認を行います。専用のMongoDB・Mailpitは、アプリとテストの終了・結果確認後に停止します。
