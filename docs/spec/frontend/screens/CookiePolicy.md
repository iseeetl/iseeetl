# Cookieポリシー（/cookie）

## 概要

- 現在の表示言語に対応するCookie・ブラウザ保存・外部送信の説明を表示する

## 利用条件・開き方

- AppMenu、ログイン画面、ユーザ登録、ゲスト利用ルール、プライバシーポリシー、または`/cookie`への直接アクセス

### URL

- パス: `/cookie`
- ルート名: `CookiePolicy`
- コンポーネント: `frontend/src/views/StaticDocumentView.vue`
- メタ情報: `isPublic: true`, `title: 'Cookieポリシー'`, `staticContentName: 'cookie'`

### 利用条件

- ログイン状態とロールにかかわらず表示できる
- Cookieポリシー本文は外部機能の有効状態やAnalytics公開設定にかかわらず表示する
- Analyticsの停止・再開操作は提供しない

## 画面構成

- フロア一覧へ戻る`BackButton`
- 翻訳対象H1「Cookieポリシー」
- `frontend/src/content/static/{lang}/cookie.html`の本文を表示する`article`

## 操作と動作

### 本文の表示

- 16言語すべてに`frontend/src/content/static/{lang}/cookie.html`を配置する
- 本文の取得、フォールバック、サニタイズ、読み込み中・失敗時の表示は[言語別の静的HTML](../style-and-i18n.md#言語別の静的html)に従う
- 各言語は本文内にH1を置かず、機能必須Cookie／ブラウザ保存、GA4、第三者サービス、利用者による管理の4節を同じ順序で配置する
- GA4の節は、送信する情報と送信しない情報の区分、サイトサービス改善という利用目的、保持・削除、Google公式情報へのリンクを説明する
- 第三者サービスの節は、送信先、情報の区分、目的、送信される場面を説明する。ログイン・共有等の利用者操作と、画面表示・有効機能に伴う通信を区別する
- 公開本文は利用者が判断するための平易な説明に限定し、Cookie／Storageの内部キー、API、実行時処理、GA4管理画面の設定名、イベント／パラメータ名を掲載しない
- 実装・運用の詳細契約は[Cookie・ブラウザ保存・外部送信](../cookies-and-external-transmissions.md)へ一元化し、公開本文の意味と矛盾させない

### 同意の扱い

- Cookie バナー、Analytics専用チェックボックス、専用ダイアログを表示しない
- ユーザ登録の必須チェックボックス、メール+パスワード／Google／LINEログインとゲスト利用ルールの「同意したとみなす」対象には、利用規約・プライバシーポリシーと同列にCookieポリシーを含める。Analytics専用の同意操作は設けない
- Cookieポリシーリンクは、Cookieと外部送信の通知・公表内容を確認する導線である

## 関連資料

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/views/StaticDocumentView.vue`
- `frontend/src/features/static-content/loadStaticContent.js`
- `frontend/src/content/static/{lang}/cookie.html`

### テスト

- `frontend/tests/unit/views/StaticDocumentView.spec.js`
- `frontend/tests/unit/features/static-content/loadStaticContent.spec.js`
- `frontend/tests/unit/content/cookiePolicyContent.spec.js`
- `frontend/tests/unit/routes/public.spec.js`
