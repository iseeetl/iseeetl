# バックエンドの運用上の注意

## 概要

認証、外部連携、データ保持など、バックエンドを運用する際の注意事項をまとめます。

## 動作・適用条件

### 外部連携用v1 APIの認証

`/api/v1`は通常APIとは別の`developer` JWTを使用し、`session_version`を照合せず、専用のレート制限も設けていない。
パスワード変更後の失効条件は通常APIと異なるため、v1のトークンを別に管理する必要がある。
提供するエンドポイントと入力条件は[外部連携用v1 API](api/v1.md)を参照する。

### 外部連携の有効条件と失敗時の動作

LINE／Google認証、メール、Google Translate、OpenAI、OneSignal、Google Analyticsは、明示フラグと
起動時の必須設定検証で有効化条件を統一している。一方、呼出失敗時の扱いは機能ごとに異なる。
タイムアウトや再試行は個別実装に従い、共通の監視指標・アラートは設けていない。OneSignalは呼出元が送信成否を確定できない。
AI解析モデルは解析種別ごとの環境変数で指定する。
現行の有効化条件は[環境変数](environment-variables.md)、AI解析の境界は[AI解析設定・実行仕様](../ai-analysis.md)を参照する。

### REST API共通契約

AppErrorは共通JSONへ変換する一方、レート制限、Multer、未定義非GETなどは異なる応答になり得る。
一覧のページ番号項目、件数、HTTPメソッドも機能ごとに異なり、機械可読スキーマがないため、クライアントは個別APIの
契約を確認する必要がある。現行共通範囲は[REST API共通規約](api-conventions.md)を参照する。

### ゲスト投稿の濫用防止

公開ルームのゲスト投稿・返信・リアクションには専用レート制限がなく、CAPTCHA、通報、ブロック、
不正利用に対応する専用の運用機能は設けていない。

### データ保持・個人識別情報・メディア回収

データ種別ごとの保持期限、親削除時の一律連鎖、孤立メディアの定期回収がない。
管理ダウンロードにはユーザ・ゲストの識別情報やファイル名を含む。保管・共有・破棄は運用側で管理する。論理削除時に物理削除したメディアは復元できない。
現行のデータ関係は[ドメインモデル](../domain-model.md)を参照する。

### ログ・監視・稼働状態

productionの共通ロガーはerrorだけを出力し、一部処理はconsoleを直接使用する。構造化ログ、相関ID、
計測指標、アラート、外部集約、専用の稼働・受付可能状態の確認機能がないため、プロセスの`online`やHTTP応答だけでは
サービスが要求を受け付けられる状態を判定できない。

### 許可オリジンの管理

`VUE_APP_APPURL`は起動時にHTTP／HTTPS URLとして検証する。一方、HTTP／Socket.IOのオリジンとHTTPメソッドは
環境別設定とコード内既定値に分かれ、許可オリジン一覧のURL形式・重複・意図しないワイルドカードを検証しない。
OriginヘッダのないSocket接続も許可するため、CORSを認証・認可の代替にはできない。

### 実行環境とプロセスのライフサイクル

バックエンドは単一プロセスでの動作を前提とし、複数プロセス間でSocket.IOの状態を共有しない。終了時はHTTP受付を停止し、バックグラウンド処理、Socket.IO、HTTP接続、MongoDB接続の順に終了する。詳細は[バックエンド概要](overview.md#終了処理)を参照する。

Node.js／npmの対応範囲は`package.json`の`engines`で定義する。ホストへの導入、プロセスの再起動・切替、障害時のホスト復元は、稼働環境に合わせた運用手順を別途用意する。

## 関連資料

### 関連仕様

- [バックエンド概要](overview.md)
- [バックエンド環境変数](environment-variables.md)
- [REST API共通規約](api-conventions.md)
- [非機能要件](../non-functional-requirements.md)

### 実装

- `backend/app.js`
- `backend/bootstrap/shutdown.js`
- `backend/createApp.js`
- `backend/config/env.js`
- `backend/routes/apiMounts.js`

### テスト

- `backend/tests/unit/config/env.test.js`
- `backend/tests/integration/app.factory.int.test.js`
- `backend/tests/unit/config/featureFlags.test.js`
- `backend/tests/unit/routes/auth.route.test.js`
- `backend/tests/unit/bootstrap/startServer.test.js`
