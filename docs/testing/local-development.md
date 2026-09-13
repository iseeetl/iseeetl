# ローカル開発の準備

Linux・Bashでバックエンドとフロントエンドを起動し、ブラウザで確認する手順です。自動テストは[テスト環境](test-environment.md)、E2Eは[専用環境の手順](e2e-testing.md)を参照してください。

## 1. 実行環境と依存パッケージ

- Node.js・npmと、メディア処理用のFFmpeg／ffprobeを用意します。バージョンは[運用事例の稼働環境](../deployment/production.md#稼働環境)を参考にし、Node.js・npmの対応範囲は各`package.json`の`engines`で確認します。
- [MongoDBの準備](service-setup.md#mongodb)に従い、本番・共有DBやE2E専用DBとは別の開発用DBを用意します。
- バックエンドとフロントエンドは同じ環境で、ポート5000・3000を使用します。

リポジトリルートで、依存パッケージを導入します。

```bash
npm --prefix backend ci
npm --prefix frontend ci
```

## 2. 環境設定

リポジトリルートで、公開設定例から開発用ファイルを作成します。既存ファイルは上書きしません。

```bash
test -e backend/.env.development || cp backend/.env.example backend/.env.development
test -e frontend/.env.development || cp frontend/.env.example frontend/.env.development
```

DB接続先、秘密値、保存先などを、利用する環境に合わせて設定します。

| 対象 | 設定する内容 |
| --- | --- |
| DB・接続先 | `DB_CONNECT`は開発用DB。`PORT=5000`、`VUE_APP_APPURL=http://localhost:3000`とし、CORSにも同じURLを許可 |
| 認証 | `JWT_SECRET`・`GUEST_JWT_SECRET`・`GUEST_REFRESH_SECRET`は用途ごとに異なるランダムな秘密値 |
| 保存先 | `MEDIA_PATH`・`PROFILE_PATH`は開発専用の絶対パス。ディレクトリを作成し、書込権限を付ける |
| 外部機能 | 最初は`EXTERNAL_*_ENABLED=false`とし、利用する機能だけ設定を揃えて有効化 |
| フロントエンド | `VITE_APP_URL`と、利用しない外部連携の公開IDは空にする |

設定の詳細は[バックエンド環境変数](../spec/backend/environment-variables.md)と[フロントエンドのビルドと設定](../spec/frontend/build-and-config.md)を参照してください。

## 3. DBの確認

DBの索引は起動時に自動作成します。接続ユーザには読み書きと索引作成の権限を用意します。既存DBのバックアップ・重複確認と、作成失敗時の対処は[起動時の索引作成](../spec/backend/overview.md#起動時の索引作成)を参照してください。

索引作成に失敗すると受付を開始しません。E2EのDB初期化コマンドは開発用DBには使用しません。

## 4. 起動と確認

バックエンド用ターミナルで、リポジトリルートから実行します。

```bash
cd backend
npm run dev
```

`backend/.env.development`を読み込み、`NODE_ENV=development`で起動します。

別のターミナルで、リポジトリルートからフロントエンドを起動します。

```bash
cd frontend
npm run serve
```

ブラウザで`http://localhost:3000`を開き、フロア一覧が表示されることを確認します。データがなければ一覧は空です。

新規登録・パスワード再設定メールも確認する場合は、[Mailpitを使うメール確認](local-mail-testing.md)に従ってメール送信を有効にします。

終了は各ターミナルで`Ctrl+C`を押します。起動できない場合は、エラーに示された設定、DB接続、保存先の権限、ポートを確認してください。
