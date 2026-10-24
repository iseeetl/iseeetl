# テスト・検証手順

このディレクトリには、開発者・テスト担当者に向けた開発・テスト環境の準備と検証手順を収録しています。

## 手順を選ぶ

| 目的 | 文書 | 対象環境 |
| --- | --- | --- |
| ソースから起動してブラウザで動作を確認する | [ローカル開発の準備](local-development.md) | 開発・手動確認 |
| MongoDB・Mailpit・ブラウザを用意する | [テスト用サービスとブラウザの準備](service-setup.md) | 必要なテストに応じた専用環境 |
| テスト種別とコマンドを選ぶ | [テスト環境の準備とコマンド選択](test-environment.md) | 開発・テスト |
| フロントエンドE2Eを実行する | [フロントエンドE2Eテスト実行](e2e-testing.md) | 専用DB・ポートを使用する隔離E2E環境 |
| 登録・再設定メールを手動確認する | [ローカル開発環境でのメール手動確認](local-mail-testing.md) | Mailpitを使用するローカル開発環境 |
| フロントエンドのリリース候補を確認する | [フロントエンドリリース品質確認](frontend-release-quality.md) | テスト・ステージング・リリース作業環境 |
| Google Analyticsの設定・収集結果を照合する | [Google Analytics検証](google-analytics.md) | テスト用の非本番環境プロパティ |

各文書の前提、影響、中止条件、成功判定を確認してから実行してください。本番環境や共有データを、ローカル・E2E用の手順へ流用しません。

文字起こし空結果：provider・output・audio clientのUnitテスト、AI解析executorの投稿／返信保存・配信テスト、recordingの通知／本文保持テストで確認する。仕様は[発話が検出されない場合](../spec/ai-analysis.md#発話が検出されない場合)。


AI付加情報の閲覧設定：`frontend/tests/unit/features/timeline/aiVisibility.spec.js`で由来・ルーム分離・読み上げ待機列を、`backend/tests/integration/routes/room.ai-sources.int.test.js`で実DBの履歴・削除・ゲスト閲覧権限を検証する。実アプリでは2ルーム、同名の別タグID、人とAIの投稿／返信付加情報を用意し、PC・スマートフォン幅でタグ別非表示、再読み込み、共通表示OFF/ON、編集・返信・他者タグ更新を確認する。外部APIを無効にした合成データを使う。

`frontend/tests/unit/features/timeline/aiVisibilitySettings.spec.js` は、設定を開き直した際の改名・AI設定解除・追加タグの既定選択と、ルーム切替時に遅れて届く応答の破棄を検証する。VoiceOverの実音声確認はアクセシビリティツリーの検査と区別して記録する。
