# フロントエンド仕様（spec/frontend/）

このディレクトリは、`frontend/` 実装の仕様ドキュメントを集約します。
画面操作、共通処理、ビルド設定をテーマ別に参照できます。

## まず読む順序

1. [フロントエンド概要](overview.md)（構成、起動、各レイヤの責務）
2. [ルーティング](routing.md) と [画面仕様](screens/README.md)（ルートと画面単体の挙動）
3. [画面横断の操作フロー](flows/README.md)（複数画面にまたがる操作）
4. 必要に応じて状態、API、エラー、UI、ビルドなどの横断仕様を確認する

## 目次

- [フロントエンド概要](overview.md): 構成、起動処理、主要ディレクトリ
- [ルーティング](routing.md): ルート定義とガード
- [状態管理](state.md): Vuexの状態と保存先
- [APIクライアント](api.md): 共通ヘッダ、再試行、リアルタイム通信
- [Socket.IO接続・イベント契約](../socket-events.md): 接続認証、イベントペイロード、配信対象、アクセス失効・再接続
- [エラー処理](error-handling.md): 共通エラーと通知UI
- [UI・i18n](style-and-i18n.md): UI規約、アクセシビリティ、国際化
- [管理一覧・検索共通仕様](management-list.md): 一覧状態、検索、ページ送り
- [ビルド・設定](build-and-config.md): Vite、PWA、ビルド時設定
- [Cookie・ブラウザ保存・外部送信](cookies-and-external-transmissions.md): Cookie、ブラウザ保存、Google Analytics、第三者サービス
- [メディア入力制約](media-input.md): 画像・動画・音声の形式、サイズ、再生時間
- [AI解析設定・実行仕様](../ai-analysis.md): 3階層設定、解析種別、通常の付加情報としての結果
- [タグの引き継ぎ仕様](tag-selection.md): タグの持ち越しと絞り込み優先度
- [タグコピー貼り付け仕様](tag-copy-paste.md): 投稿・返信タグのコピー&貼り付け
- [画面仕様](screens/README.md): 画面・ダイアログの仕様
- [画面横断の操作フロー](flows/README.md): 複数画面にまたがるフロー

## 補足の参照先

- [AI解析設定管理画面](screens/AIAnalysisSettingManagement.md): 共通設定とフロア／ルーム設定ダイアログ
- [ロール・権限仕様](../roles-and-permissions.md): ロール解決、権限、ルーム入室判定

## 参照コード（入口）

- `frontend/src/main.js`
- `frontend/src/bootstrapApp.js`
- `frontend/src/router.js`
- `frontend/src/store/`
- `frontend/src/api/`
