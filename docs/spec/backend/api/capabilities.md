# 外部機能の有効状態API

## 概要

ログインや翻訳など、外部連携機能が利用可能かどうかを返します。

## API

### GET /api/capabilities

バックエンド起動時に固定した外部機能の有効状態を、フロントエンドへ公開可能な真偽値だけで返す。表示制御用の情報であり、各機能のバックエンド側の有効状態の検査を代替しない。

#### 認証・権限

- 不要。ログイン画面を構築する前に取得できる。

#### リクエスト

- path: なし
- query: なし
- body: なし

#### レスポンス

- `200 OK`
- header:
  - `Cache-Control: no-store`
- body:
  - `googleLogin`: 真偽値。Googleログインが利用可能か
  - `lineLogin`: 真偽値。LINEログインが利用可能か
  - `mailDelivery`: 真偽値。登録・パスワード再設定に必要なメール配送が利用可能か
  - `oneSignalPush`: 真偽値。OneSignalのWebプッシュ通知が利用可能か
  - `googleTranslate`: 真偽値。Google Translateが利用可能か
  - `openaiTranscription`: 真偽値。OpenAI文字起こしが利用可能か
  - `openaiAnalysis`: 真偽値。OpenAI自動解析が利用可能か
  - `googleAnalytics`: 真偽値。Analytics公開設定APIと登録ユーザ向けIdentity APIが利用可能か

全8項目を常に返す。秘密値、公開クライアント ID、資格情報のパス、内部接続先、利用上限、ユーザID、設定不足理由は返さない。
各項目は対応する明示的な外部機能フラグが`true`で、起動時に必須設定の検証へ成功した場合だけ`true`になる。
フラグが`false`の場合は、対応する設定値が残っていても検証せず、外部通信を行わない。
`openaiTranscription`と`openaiAnalysis`は同じ明示的なOpenAI フラグと必要設定から決まり、個別に有効化することはできない。falseでもAI解析設定の管理と通常のタイムライン保存は利用でき、外部送信と
解析タスク起動だけを止める。`googleTranslate`は独立した明示フラグと必要設定から決まる。

`googleAnalytics`は`EXTERNAL_GOOGLE_ANALYTICS_ENABLED=true`で、妥当な`GA4_MEASUREMENT_ID`と
`GA4_USER_ID_SECRET`が起動時に揃い、公開設定APIと仮名ID生成が利用可能であることを表す。
Measurement IDそのもの、Googleタグの読込結果、実際のGA4送信状態は表さない。フロントエンドは`true`を
確認した後に`GET /api/analytics/config`でMeasurement IDを取得する。

```json
{
  "googleLogin": false,
  "lineLogin": false,
  "mailDelivery": false,
  "oneSignalPush": false,
  "googleTranslate": false,
  "openaiTranscription": false,
  "openaiAnalysis": false,
  "googleAnalytics": false
}
```

#### エラー

このエンドポイント固有の業務エラーはない。起動時の外部機能設定に不整合がある場合、バックエンドはHTTP受付開始前に停止する。

#### データ更新・通知

- なし。環境変数を要求ごとに再評価せず、外部サービスやDBへ接続しない。

AI解析の設定・実行境界は[AI解析設定・実行仕様](../../ai-analysis.md)を参照してください。

## 関連資料

### 実装

- `backend/config/featureFlags.js`
- `backend/routes/capabilities.route.js`
- `backend/controllers/capabilities.controller.js`

### テスト

- `backend/tests/integration/app.factory.int.test.js`
- `backend/tests/unit/config/featureFlags.test.js`
- `backend/tests/unit/controllers/capabilities.controller.test.js`
