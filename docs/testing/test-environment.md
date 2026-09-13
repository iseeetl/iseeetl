# テスト環境の準備とコマンド選択

バックエンドとフロントエンドのテストについて、準備、実行コマンド、結果の確認方法を説明します。

## 前提

- 開発・テスト環境で、単体テスト、結合テスト、フロントエンドのビルドを実行します。
- 本番用の認証情報や共有データは使用しません。外部サービスはモックで確認し、実際の接続・送信の検証は別に行います。
- E2Eは専用DBとサービスの起動が必要です。[E2E手順](e2e-testing.md)で準備から終了までを確認してください。

## 実行環境

Node.js・npmの対応範囲は、[フロントエンド](../../frontend/package.json)と[バックエンド](../../backend/package.json)の`package.json`にある`engines`で確認します。バージョンの選定には[運用事例の稼働環境](../deployment/production.md#稼働環境)を参考にしてください。

依存パッケージを導入する前に、使用するNode.js・npmが対応範囲内であることを確認します。MongoDB・Mailpit・Chrome／Chromium・ChromeDriverは[テスト用サービスとブラウザの準備](service-setup.md)で、必要なものを選んで用意します。

```bash
node --version
npm --version
```

## 共通準備

この文書のコマンドは、リポジトリルートから実行します。`npm --prefix`で対象を指定するため、実行後も開始位置は変わりません。

1. テスト対象のバージョンまたはリビジョンを確認します。
2. ロックファイルに基づいてバックエンドとフロントエンドの依存パッケージを導入します。

   ```bash
   set -eu
   npm --prefix backend ci
   npm --prefix frontend ci
   ```

3. 本番用の認証情報や共有運用データをテストへ渡さないことを確認します。
4. ブラウザ、外部サービス、バックエンド／フロントエンドの起動が必要なテストは、個別手順の前提と中止条件を確認します。

`npm ci`がロックファイルの不整合で停止した場合は、`npm install`で依存情報を書き換えず、`package.json`と`package-lock.json`の対応を確認してください。

バックエンドでは、Jestと`babel-jest`は同じ30系を使用します。

フロントエンドでは、Nightwatchが使うMocha配下の`serialize-javascript`を、セキュリティ修正版`7.0.5`へ限定して`overrides`で指定しています。NightwatchやMochaを更新する際は、この指定の必要性とMochaの設定シリアライズ・E2E実行の互換性を確認してください。

## テスト種別とコマンド

| 対象 | 種別 | コマンド | 確認範囲 |
| --- | --- | --- | --- |
| バックエンド | 単体・結合テスト全件 | `npm --prefix backend test` | 単体テストが成功した後、結合テスト全件を連続実行 |
| バックエンド | コード検査 | `npm --prefix backend run lint` | ESLintによるコードの静的検査 |
| バックエンド | 単体テスト | `npm --prefix backend run test:unit` | DB、外部API、ファイル入出力、ネットワークを分離した単体確認 |
| バックエンド | 結合テスト全件 | `npm --prefix backend run test:int` | mongodb-memory-serverを使う結合確認 |
| バックエンド | v1重点結合テスト | `npm --prefix backend run test:int:v1` | v1ルートの指定テストファイル |
| バックエンド | 外部依存をモックするテスト群 | `npm --prefix backend run test:int:external-mocked` | マニフェストで分類された外部依存のモックを前提とするテストファイル |
| バックエンド | その他の結合テスト | `npm --prefix backend run test:int:remaining` | 同じマニフェストから導出した残りのテストファイル |
| フロントエンド | 単体テスト・通常 | `npm --prefix frontend run test:unit` | 変更監視モード |
| フロントエンド | 単体テスト・単発 | `npm --prefix frontend run test:unit:ci` | 単発実行 |
| フロントエンド | ビルド結合 | `npm --prefix frontend run test:build` | 開発・ステージング・本番環境向けビルドとマニフェスト |
| フロントエンド | E2E | [フロントエンドE2Eテスト実行](e2e-testing.md)を参照 | 専用DBと専用サービスを使うブラウザE2E |

結合テストはすべてmongodb-memory-serverを使用し、本番・ステージング環境、共有MongoDBへ接続しません。

## バックエンドの単体テスト

- Jest設定: `backend/jest.unit.config.js`
- MongoDBを含むルートとモデルの結合は対象外です。
- 実際の外部APIへ接続するテストではありません。

## バックエンドの結合テスト

結合テストでは、`backend/tests/jest.mongo.globalSetup.js`がmongodb-memory-serverを起動し、終了時にプロセスと一時DBを片付けます。初回はMongoDBバイナリの取得が発生する場合があります。取得に失敗しても、実DBや共有DBへ接続先を変更しないでください。

外部機能の設定はテスト開始時に無効化され、外部サービス固有のテストだけがダミー設定とモッククライアントを使用します。実際の外部APIの品質は検証しません。

製品モジュールを読み込む前に、認証鍵、トークン有効期間、レート制限を固定のテスト値へ上書きします。メディア・プロフィールの保存先も`.test-runtime/backend/integration/`配下へ固定し、シェルの設定を継承しません。個別テストの保存先も同じリポジトリの`.test-runtime/backend/`配下で用意し、自分の生成物だけを後処理します。Jest設定を直接指定した場合もワーカーは1つです。

バックエンドの結合テスト開始時は、テスト専用DBに、製品モデルで定義したユーザメール・メンバー関係・キック情報の索引を作成します。索引の作成はテスト用ヘルパーが行い、アプリ起動時の自動作成に依存しません。

## フロントエンドの単体テスト

単発実行は終了時にファイル数、テスト数、失敗、スキップ、所要時間を表示します。個々のテスト名を確認する場合は`npm --prefix frontend run test:unit:verbose`を使用します。

## フロントエンドのビルド

開発・ステージング・本番環境向けの各ビルド、公開設定の注入、マニフェストを一時ディレクトリで確認します。生成された本番用成果物にE2E専用設定や秘密値が含まれないことも確認してください。

## フロントエンドE2E

E2Eはフロントエンド `3100`、バックエンド `5100`、固定DB名`iseeetl_e2e`を使います。通常開発環境とは分離し、DBの初期化、サービス起動、テスト実行、停止を[フロントエンドE2Eテスト実行](e2e-testing.md)の順序で行ってください。

## 成功判定

次のすべてを満たした場合に成功です。

1. 対象コマンドの終了コードが`0`である。
2. 必須テストがすべて成功し、環境不足によるスキップがない。
3. テストランナーと子プロセスが終了している。
4. E2Eでは、個別手順に記載された追加条件も満たしている。

## よくある失敗

### `npm ci`が失敗する

Node.js／npmのバージョンと、`package.json`、`package-lock.json`の対応を確認します。認証情報やレジストリトークンをログへ出力しないでください。

### mongodb-memory-serverが起動しない

初回バイナリ取得のネットワーク到達性と、バイナリのキャッシュディレクトリの書込権限を確認します。実DBへの切替で回避しないでください。

### フロントエンドの単体テストがワーカーエラーで停止する

`package.json`が定めるNode.js／npmと`frontend/vitest.config.mjs`を使用していることを確認します。

### テストが失敗する

最初の失敗、対象テスト名、終了コードを確認し、環境不足、実装不具合、テスト不具合を切り分けます。失敗したテストをスキップして成功扱いにしないでください。

## 関連文書

- [テスト・検証手順](README.md)
- [フロントエンドE2Eテスト実行](e2e-testing.md)
- [仕様](../spec/README.md)

## 参照コード

- `backend/package.json`
- `backend/jest.unit.config.js`
- `backend/jest.integration.config.js`
- `frontend/package.json`
- `frontend/vitest.config.mjs`
