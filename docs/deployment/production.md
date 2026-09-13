# 運用事例

サーバの稼働環境と運用方法を紹介します。この構成では、nginxでHTTPを公開し、同じサーバのNode.jsアプリとMongoDBを使用しています。Node.jsのプロセス管理にはPM2を使用しています。

一般的な導入・起動方法は[サーバへの導入](README.md)を参照してください。

## 稼働環境

本事例で使用しているOS・ソフトのバージョンです。新規構築時は、[必要な環境](../../README.md#必要な環境)と`package.json`の対応範囲を確認してください。

| OS・ソフト | バージョン | 用途 |
| --- | --- | --- |
| AlmaLinux | 9.8（Olive Jaguar） | サーバOS |
| Node.js | 24.20.0 | バックエンドの実行 |
| npm | 11.19.0 | 依存パッケージの管理 |
| MongoDB | 7.0.40 | データの保存 |
| mongosh | 2.10.0 | MongoDBの操作・管理 |
| nginx | 1.20.1 | HTTP・HTTPSの受付とアプリへの転送 |
| Postfix | 3.5.25 | メール配送 |
| FFmpeg | 5.1.10 | 動画・音声の変換 |
| ffprobe | 5.1.10 | メディア情報の取得 |
| PM2 | 6.0.14 | Node.jsのプロセス管理 |

## 起動前の準備

- フロントエンドをビルドして配置し、`DIST_PATH`に配信先の絶対パスを設定する。
- [公開設定例](../../backend/.env.example)から環境ファイルを作成し、DB接続先・秘密値・保存先などを設定する。
- データ保存先、PM2の管理領域、ログディレクトリを作成し、実行ユーザへ必要な権限を付ける。
- [PM2の導入案内](https://pm2.keymetrics.io/docs/usage/quick-start/#installation)に従い、`pm2`コマンドを使用できるようにする。PM2はアプリの依存パッケージに含めない。

次の例では、環境ファイルを`/etc/iseeetl/.env.production`、ログを`/var/log/iseeetl/`へ置きます。パスとアプリ名は利用する環境に合わせて設定してください。

DBの索引は起動時に自動作成し、失敗すると受付を開始しません。既存DBの事前確認と失敗時の対処は[起動時の索引作成](../spec/backend/overview.md#起動時の索引作成)を参照してください。

## PM2の設定ファイル

[PM2設定ファイル](../../backend/ecosystem.config.js)を`app.js`と同じディレクトリに配置します。配布アーカイブには同梱されています。

`--env`で指定した環境のファイルだけを読み込み、読込に失敗すると起動を中止します。

| `--env` | 読み込む環境ファイル | `NODE_ENV` |
| --- | --- | --- |
| `production` | `/etc/iseeetl/.env.production` | `production` |
| `staging` | `/etc/iseeetl/.env.staging` | `production` |
| `development`（省略時） | `backend/.env.development`。`BACKEND_ENV_FILE`を指定した場合はそのファイル | `development` |

`BACKEND_ENV_FILE`はPM2のdevelopment起動だけに使用します。通常の`npm run dev`は常に`backend/.env.development`を読み込みます。環境ファイルは配置先で別途用意します。

バックエンドは単一プロセスでの動作を前提とします。複数プロセスへの変更には、[リアルタイム通信](../spec/backend/overview.md#リアルタイム通信)の状態共有への対応が必要です。PM2の設定項目は[設定ファイルの説明](https://pm2.keymetrics.io/docs/usage/application-declaration/)を参照してください。

## 起動・再起動と確認

配置先のバックエンドディレクトリで、アプリの実行ユーザとして実行します。

```bash
npm ci --omit=dev
pm2 start ecosystem.config.js --env production
pm2 status
```

設定変更後も同じ実行ユーザ・管理領域を使用します。再起動中は接続が切れます。

```bash
pm2 restart ecosystem.config.js --env production --update-env
```

PM2で`iseeetl`が`online`となることに加え、公開URLで画面表示・ログイン・メディア送受信を確認します。ログのローテーションと保存期間は運用環境で設定します。

## サーバ再起動後の自動起動

同じ実行ユーザ・管理領域で[PM2の自動起動手順](https://pm2.keymetrics.io/docs/usage/startup/)に従ってOSへ登録し、動作確認後にプロセス一覧を保存します。

```bash
pm2 save
```

サーバ再起動後もアプリが復帰することを確認します。Node.jsや配置先を変更した場合は、自動起動設定も更新します。
