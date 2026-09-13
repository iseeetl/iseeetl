# 製品ドキュメント

このディレクトリには、製品の利用、構築、仕様確認、テストに必要な文書を収録しています。

## 読み始める場所

| 目的 | 参照先 |
| --- | --- |
| 画面操作、ロール別の利用方法、外部APIの利用手順、トラブル対応を確認する | [操作マニュアル](manual/README.md) |
| 製品の現行要件、設計、権限、API契約を確認する | [仕様](spec/README.md) |
| ソースから起動してブラウザで動作を確認する | [ローカル開発の準備](testing/local-development.md) |
| nginx・MongoDBなどのサーバ環境を用意する | [サーバへの導入](deployment/README.md) |
| フロントエンドをビルドする | [ビルドと設定](spec/frontend/build-and-config.md#ビルド) |
| サーバの稼働環境と運用方法を確認する | [運用事例](deployment/production.md) |
| Unit、E2E、メールなどのテスト・検証手順を確認する | [テスト・検証](testing/README.md) |
| 画像、動画、音声等の利用条件と第三者表示を確認する | [アセットの利用条件と第三者表示](legal/assets.md) |
| 依存ライブラリのライセンスと権利表示を確認する | [ライブラリのライセンス](legal/libraries.md) |

## 主な技術仕様

- [AI解析設定・実行仕様](spec/ai-analysis.md)
- [ロール・権限仕様](spec/roles-and-permissions.md)
- [非機能要件](spec/non-functional-requirements.md)
- [Socket.IO接続・イベント契約](spec/socket-events.md)
- [ドメインモデル](spec/domain-model.md)
- [フロントエンド仕様](spec/frontend/README.md)
- [バックエンド仕様](spec/backend/README.md)

## 文書の読み方

- `manual/`は、画面操作、外部APIの利用、環境管理者によるアカウント作成・トークン発行を説明します。
- `spec/`は、現在の製品が提供する動作、設計、外部契約、適用条件を説明します。
- `deployment/`は、サーバ用ソフトの基本的な導入・設定と、稼働環境・運用方法の事例を説明します。
- `testing/`は、開発者・テスト担当者に向けて、開発・テスト環境の準備と検証手順を説明します。
- 文書に記載された実装・設定・テストのパスは、リポジトリルートからの相対パスです。
- テスト手順は各文書の前提と成功判定を確認して使用します。

設定例の接続先やダミー値は、環境管理者が用意した設定値へ置き換えてください。
