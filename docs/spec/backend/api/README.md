# API詳細仕様

共通の入力形式、認証ヘッダ、成功・エラー応答は[REST API共通規約](../api-conventions.md)、機能別の接続先は[API仕様](../api.md)を参照してください。以下の文書は、各エンドポイントの入出力、権限、副作用を説明します。

## 目次

- [外部機能の有効状態](capabilities.md)
- [AI解析設定](ai-analysis-settings.md)
- [Google Analytics設定・仮名ID](analytics.md)
- [ゲスト](guest.md)
- [認証](auth.md)
- [ユーザ](user.md)
- [フロア](floor.md)
- [フロアメンバー](floor-member.md)
- [フロアタグ](floor-tag.md)
- [フロア単語](floor-quicktext.md)
- [ルーム](room.md)
- [ルームメンバー](room-member.md)
- [ルームタグ](room-tag.md)
- [ルーム単語](room-quicktext.md)
- [タイムライン共通契約・索引](timeline.md)
  - [ルーム配下のタイムラインAPI](timeline-post-resources.md)
  - [投稿](timeline-posts.md)
  - [投稿リアクション](timeline-post-reactions.md)
  - [投稿付加情報](timeline-post-supplements.md)
  - [返信・返信リアクション](timeline-replies.md)
  - [返信付加情報](timeline-reply-supplements.md)
  - [文字起こし・`PushFilter`・管理](timeline-operations.md)
- [ゲスト向けタイムライン](timeline-guest.md)
- [アップロード](upload.md)
- [管理系単語](quicktext-admin.md)
- [共通タグ](category-tag.md)
- [音を鳴らすタグ](sound-tag.md)
- [スパム](spam.md)
- [キック済みユーザ](kicked-user.md)
- [v1 API](v1.md)

添付画像の代替テキスト・音の説明の上限は2,000文字、音のタイトルは200文字です。[投稿リソース](timeline-post-resources.md)と[v1 API](v1.md)に保存形式と制限を記載しています。

- 代替テキストの共同編集APIと `expected_media_text`：[仕様](../../frontend/shared-alternative-text.md#apiと互換性)。ローカル試作。

共同編集のルーム設定 `collaborative_text_editing`（既定オフ）と文章専用の権限制御を追加。仕様の正本は ルートから `docs/spec/frontend/shared-alternative-text.md` を参照。フロア単位の編集者・履歴復元は今回未実装。

- ローカル追加: [対象別リアクションAPI](timeline-post-resources.md#対象別リアクションローカル試作) と [絵文字の仕様](../../frontend/update-notices-emoji.md)。
