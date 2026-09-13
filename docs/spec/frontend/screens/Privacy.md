# プライバシーポリシー（/privacy）

## 概要

- 現在の表示言語に対応するプライバシーポリシーを表示する
- AppMenuから遷移する場合は、現在位置にフロア／ルームIDがあれば`floor_id`／`room_id`クエリを引き継ぐ。画面自身はこのクエリを参照しない

## 利用条件・開き方

- AppMenuの「プライバシーポリシー」、または`/privacy`への直接アクセス

### URL

- パス: `/privacy`
- ルート名: `Privacy`
- コンポーネント: `frontend/src/views/StaticDocumentView.vue`
- メタ情報: `isPublic: true`, `title: 'プライバシーポリシー'`, `staticContentName: 'privacy'`

### 利用条件

- ログイン状態、ロール、メンバー権限、キック状態、ルーム設定による表示制限はない
- `BackButton`は直接アクセス時も表示し、フロア一覧へ戻る。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する

## 画面構成

- フロア一覧へ戻る`BackButton`
- 翻訳対象のH1「プライバシーポリシー」
- `frontend/src/content/static/{lang}/privacy.html`の本文を表示する`article`
- アカウント・認証情報、ユーザの投稿など、利用・端末情報、問い合わせ情報の取扱いと利用目的
- Cookie、ブラウザ保存、GA4を含む外部サービス処理の簡潔な要約とCookieポリシーへのリンク

## 操作と動作

### 本文の表示

- 16言語すべてに`frontend/src/content/static/{lang}/privacy.html`を配置する
- 取扱情報は、アカウント・認証・プロフィール、ユーザの入力・アップロード内容、利用・端末・Cookie・Analytics、問い合わせの4区分を明示する
- 利用目的は、認証、サービス・コンテンツ提供、翻訳・AI解析・プッシュ通知、サイトサービス改善、安全管理、通知、問い合わせ対応を説明する
- 生年月日・住所・電話番号等を登録必須項目として求めないことと、名称・投稿・メディア等へユーザが入力した情報は保存・処理されることを区別する
- Cookieや外部サービスの送信先・情報区分・発生条件は本文内で重複させず、[Cookieポリシー](CookiePolicy.md)へ一元参照する

### 表示と操作

入力フォームとバックエンドAPI通信はない。本文の取得、言語変更、フォールバック、サニタイズ、読み込み中・失敗時の表示は[言語別の静的HTML](../style-and-i18n.md#言語別の静的html)に従う。
`BackButton`はアプリがVuexで管理する直前ルートへ戻る。

## 関連資料

### 関連仕様

- [UI規約、アクセシビリティ、i18n](../style-and-i18n.md#言語別の静的html)
- [ルーティング](../routing.md#appmenuからの補助遷移)
- [Cookieポリシー](CookiePolicy.md)
- [Cookie・ブラウザ保存・外部送信](../cookies-and-external-transmissions.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/views/StaticDocumentView.vue`
- `frontend/src/features/static-content/loadStaticContent.js`
- `frontend/src/components/common/BackButton.vue`
- `frontend/src/content/static/{lang}/privacy.html`

### テスト

- `frontend/tests/unit/views/StaticDocumentView.spec.js`
- `frontend/tests/unit/features/static-content/loadStaticContent.spec.js`
- `frontend/tests/unit/content/cookiePolicyContent.spec.js`
- `frontend/tests/e2e/specs/screens/privacy/privacy.smoke.js`
