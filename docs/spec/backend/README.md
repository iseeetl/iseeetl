# バックエンド仕様（spec/backend/）

構成と起動は[バックエンド概要](overview.md)、個別APIの契約は[API仕様](api.md)から確認できます。

## 目次

- [バックエンド概要](overview.md): 技術構成、起動処理、ルートマウント、主要モジュール
- [ドメインモデル](../domain-model.md): エンティティ、所有関係、埋め込み、ライフサイクル
- [ロール・権限仕様](../roles-and-permissions.md): フロントエンド・バックエンド横断の認可仕様
- [Socket.IO接続・イベント契約](../socket-events.md): 接続認証、イベントペイロード、配信対象、アクセス失効・再接続
- [AI解析設定・実行仕様](../ai-analysis.md): 3階層設定、非同期実行、結果の整合性、メディアの扱い
- [REST API 共通規約](api-conventions.md): 共通入力、認証ヘッダ、成功・エラー応答
- [API仕様（入口）](api.md): API文書の読み方と代表的な機能領域
- [API詳細仕様](api/README.md): エンドポイント別の入出力、認証・認可、副作用
- [ユーザメールの一意索引](user-mail-index.md): メールの部分一意制約と起動時の作成
- [メンバー関係の一意制約](member-relationship-uniqueness.md): フロア・ルームへの重複所属を防ぐ索引と起動時の作成
- [単語グループ削除の復旧](quicktext-deletion.md): 削除順序と失敗後の再試行
- [認証処理の競合と復旧](auth-recovery.md): ログイン・有効化の競合処理と通知失敗時の扱い
- [環境変数](environment-variables.md): 変数名、用途、必須・任意の区分
- [環境変数の設定例](../../../backend/.env.example): バックエンド用の公開設定例
- [バックエンドの運用上の注意](considerations.md): 複数機能に影響する現行制約と運用上の影響

## バックエンドの責務

- Express の REST API と Socket.IO のリアルタイム配信を提供する
- MongoDB のドメインデータと、画像・動画・音声などの保存データを管理する
- JWT、ゲストトークン、リソース単位の権限判定によってアクセスを制御する
- SPA とメディアを配信し、通知・翻訳・文字起こしなどの外部連携を仲介する
