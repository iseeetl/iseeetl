# アクセシビリティ（/accessibility）

## 概要

- 現在の表示言語に対応する本システムのアクセシビリティ方針を表示する

## 利用条件・開き方

- AppMenuの「アクセシビリティ」、または`/accessibility`への直接アクセス

### URL

- パス: `/accessibility`
- ルート名: `Accessibility`
- コンポーネント: `frontend/src/views/StaticDocumentView.vue`
- メタ情報: `isPublic: true`, `title: 'アクセシビリティ'`, `staticContentName: 'accessibility'`

### 利用条件

- ログイン状態、ロール、メンバー権限、キック状態、ルーム設定による表示制限はない
- `BackButton`は直接アクセス時も表示し、フロア一覧へ戻る。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する

## 画面構成

- フロア一覧へ戻る`BackButton`
- 翻訳対象のH1「アクセシビリティ」
- `frontend/src/content/static/{lang}/accessibility.html`の本文を表示する`article`
- 本文中の表は狭い画面で横スクロール可能とし、セル内の長いURLや単語を折り返す
- 本文中のリンクとボタンは`:focus-visible`でアウトラインを表示する

## 操作と動作

入力フォームとバックエンドAPI通信はない。本文の取得、言語変更、フォールバック、サニタイズ、読み込み中・失敗時の表示は[言語別の静的HTML](../style-and-i18n.md#言語別の静的html)に従う。
`BackButton`はアプリがVuexで管理する直前ルートへ戻る。

## 関連資料

### 関連仕様

- [UI規約、アクセシビリティ、i18n](../style-and-i18n.md#言語別の静的html)
- [ルーティング](../routing.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/views/StaticDocumentView.vue`
- `frontend/src/features/static-content/loadStaticContent.js`
- `frontend/src/components/common/BackButton.vue`
- `frontend/src/content/static/{lang}/accessibility.html`

### テスト

- `frontend/tests/unit/views/StaticDocumentView.spec.js`
- `frontend/tests/unit/features/static-content/loadStaticContent.spec.js`
- `frontend/tests/unit/content/staticDocumentContent.spec.js`
- `frontend/tests/e2e/specs/screens/accessibility/accessibility.smoke.js`
