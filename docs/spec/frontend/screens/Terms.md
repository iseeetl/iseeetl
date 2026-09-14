# 利用規約（/terms）

## 概要

- 現在の表示言語に対応する利用許諾、著作権、禁止事項、免責事項を表示する
- 全16言語の本文に、運営サービスの利用規約と公開コード・文書のライセンスの適用範囲を記載する。ライセンスに基づく利用等に追加の制限を課さず、運営サービスへのアクセスを伴わない独立した環境での性能評価・結果公表には本規約による事前承諾が不要であることを明記する
- AppMenuから遷移する場合は、現在位置にフロア／ルームIDがあれば`floor_id`／`room_id`クエリを引き継ぐ。画面自身はこのクエリを参照しない

## 利用条件・開き方

- AppMenuの「利用許諾・著作権・禁止事項・免責事項」、または`/terms`への直接アクセス

### URL

- パス: `/terms`
- ルート名: `Terms`
- コンポーネント: `frontend/src/views/StaticDocumentView.vue`
- メタ情報: `isPublic: true`, `title: '利用許諾・著作権・禁止事項・免責事項'`, `staticContentName: 'terms'`

### 利用条件

- ログイン状態、ロール、メンバー権限、キック状態、ルーム設定による表示制限はない
- `BackButton`は直接アクセス時も表示し、フロア一覧へ戻る。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する

## 画面構成

- フロア一覧へ戻る`BackButton`
- 翻訳対象のH1「利用許諾・著作権・禁止事項・免責事項」
- `frontend/src/content/static/{lang}/terms.html`の本文を表示する`article`

## 操作と動作

入力フォームとバックエンドAPI通信はない。本文の取得、言語変更、フォールバック、サニタイズ、読み込み中・失敗時の表示は[言語別の静的HTML](../style-and-i18n.md#言語別の静的html)に従う。
`BackButton`はアプリがVuexで管理する直前ルートへ戻る。

## 関連資料

### 関連仕様

- [UI規約、アクセシビリティ、i18n](../style-and-i18n.md#言語別の静的html)
- [ルーティング](../routing.md#appmenuからの補助遷移)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/views/StaticDocumentView.vue`
- `frontend/src/features/static-content/loadStaticContent.js`
- `frontend/src/components/common/BackButton.vue`
- `frontend/src/content/static/{lang}/terms.html`

### テスト

- `frontend/tests/unit/views/StaticDocumentView.spec.js`
- `frontend/tests/unit/features/static-content/loadStaticContent.spec.js`
- `frontend/tests/unit/content/staticDocumentContent.spec.js`
- `frontend/tests/e2e/specs/screens/terms/terms.smoke.js`
