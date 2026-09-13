# サーバへの導入

Linuxサーバ1台で、nginx、MongoDB、Node.js、Postfix、FFmpegを使う基本的な構成例です。管理権限でソフトを導入し、設定後に動作を確認します。

## 1. 必要なソフトをインストールする

各リンクから、利用するOSに対応した導入手順を選びます。

| ソフト | 役割 | 導入案内 |
| --- | --- | --- |
| Node.js・npm | アプリの実行・依存パッケージの導入 | [Node.js公式配布](https://nodejs.org/en/download) |
| MongoDB | データの保存 | [MongoDBの導入](https://www.mongodb.com/docs/manual/administration/install-community/) |
| nginx | HTTPSでの公開・アプリへの転送 | [nginxのLinuxパッケージ](https://nginx.org/en/linux_packages.html) |
| Postfix | アプリから受け取ったメールの配送 | [Postfixのパッケージ](https://www.postfix.org/packages.html) |
| FFmpeg・ffprobe | 動画・音声の変換、メディア情報の取得 | [FFmpegの導入案内](https://ffmpeg.org/download.html) |

バージョンは[運用事例の稼働環境](production.md#稼働環境)を参考にし、Node.js・npmの対応範囲は各`package.json`の`engines`で確認します。導入後、次のコマンドでバージョンが表示されることを確認します。

```bash
node --version
npm --version
ffmpeg -version
ffprobe -version
```

## 2. 基本設定を行う

### MongoDB

同じサーバのアプリから接続する場合は、`mongod.conf`の待受を次のように設定します。既存の保存先やログ設定は保持します。

```yaml
net:
  bindIp: 127.0.0.1
  port: 27017
```

使用するDBと接続ユーザ・権限を用意します。接続元の制限と認証は、[MongoDBの接続設定](https://www.mongodb.com/docs/manual/core/security-mongodb-configuration/)と[認証の設定](https://www.mongodb.com/docs/manual/tutorial/enable-authentication/)を参照してください。

### Postfix

同じサーバのアプリから送信する構成では、`/etc/postfix/main.cf`の受付範囲を次のように設定します。

```ini
inet_interfaces = loopback-only
inet_protocols = ipv4
mynetworks = 127.0.0.0/8
```

アプリのSMTP接続先は`127.0.0.1:25`です。`myhostname`・`myorigin`には使用するホスト名・送信ドメインを設定します。外部への配送は、直接配送するか、中継先SMTPを`relayhost`に指定します。

配送経路は[Postfixの基本設定](https://www.postfix.org/BASIC_CONFIGURATION_README.html)、中継先の認証・暗号化は[SMTP認証の設定](https://www.postfix.org/SASL_README.html)を参照してください。使用するドメインのDNSと、サーバから外部へのSMTP通信制限も確認します。

### nginx

公開ドメインのDNSとHTTPS証明書を用意し、nginxの`http`内に読み込まれる設定ファイルへ、ドメイン用の`server`設定を追加します。

| 項目 | 設定内容 |
| --- | --- |
| 公開先 | `server_name`にドメイン、`listen 443 ssl`と証明書のパスを設定 |
| 転送先 | `proxy_pass`に同じサーバのアプリを指定。例：`http://127.0.0.1:5000` |
| 転送ヘッダ | 公開ホスト、HTTPS、接続元IPをアプリへ伝える。WebSocketを使う場合はUpgradeヘッダも転送 |
| アップロード | `client_max_body_size`をアプリの上限に合わせる |

具体例は[HTTPS設定](https://nginx.org/en/docs/http/configuring_https_servers.html)、[プロキシ設定](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[WebSocket転送](https://nginx.org/en/docs/http/websocket.html)を参照してください。証明書の更新方法とHTTPからHTTPSへの転送も設定します。アプリ・MongoDB・SMTPの待受ポートは外部へ公開しません。

## 3. 起動する

設定を検査し、エラーを解消してから各サービスを起動します。

```bash
sudo nginx -t
sudo postfix check
```

新規構築したsystemd環境での例です。サービス名は導入したパッケージに合わせます。

```bash
sudo systemctl enable mongod postfix nginx
sudo systemctl restart mongod postfix nginx
systemctl is-active mongod postfix nginx
```

Node.jsアプリは、配置先で依存パッケージを導入して起動します。次のパスと起動ファイル名は、使用するアプリに合わせて置き換えます。

```bash
cd /path/to/app
npm ci --omit=dev
node --env-file=/path/to/app.env app.js
```

環境ファイルにはDB・SMTPの接続先などを設定し、公開ディレクトリの外で管理します。フロントエンドがある場合はビルドも必要です。起動方法は[Node.jsの環境ファイル指定](https://nodejs.org/api/cli.html#--env-filefile)を参照してください。端末での起動は`Ctrl+C`で終了し、継続運用ではサービス管理へ登録します。

## 4. 動作を確認する

- 各サービスが`active`となり、アプリからMongoDBへ接続できる。
- 公開URLをHTTPSで開ける。WebSocketやアップロードも、利用する場合は確認する。
- アプリから送信したテストメールが届く。届かない場合はPostfixの配送ログとキューを確認する。
- アプリの実行ユーザでFFmpeg・ffprobeを実行できる。

## 関連資料

- [フロントエンドのビルドと設定](../spec/frontend/build-and-config.md)
- [バックエンド環境変数](../spec/backend/environment-variables.md)
- [運用事例](production.md)
- [開発・テスト環境の準備](../testing/README.md)
