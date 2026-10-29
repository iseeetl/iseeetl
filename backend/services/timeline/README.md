# タイムライン更新処理

`sourceLanguage.service.js` は言語属性だけを変更する専用処理。入室権限を確認し、原文と言語の期待値で競合を防ぐ。本文・添付・作成者・AI解析設定は変更しない。投稿・返信では既存の解析元revisionを進め、処理中の古いAI結果を無効化するが、再解析は起動しない。翻訳の実行と遅延結果の照合には `timelineTranslation.service.js` を使う。

仕様とAPIは [本文言語仕様](../../../docs/spec/frontend/source-language.md) と [投稿リソースAPI](../../../docs/spec/backend/api/timeline-post-resources.md) を参照。検証は `tests/integration/services/sourceLanguagePermission.int.test.js`。
