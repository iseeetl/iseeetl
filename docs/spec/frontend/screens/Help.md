# ヘルプ（/help）

## 概要

- 現在の表示言語に対応する操作説明とショートカット一覧を、固定ページと共通ダイアログで表示する

## 利用条件・開き方

- 固定ページ: アプリメニューの「ヘルプ」、または`/help`への直接アクセス
- ダイアログ: 入力中などの除外条件に該当しない状態で`?`キーを押す

### URL

- パス: `/help`
- ルート名: `Help`
- コンポーネント: `frontend/src/views/Help.vue`
- メタ情報: `isPublic: true`, `title: 'ヘルプ'`

### 利用条件

- ゲスト、未ログイン、ログインユーザ、各ロールのいずれも固定ページとダイアログを利用できる
- フロアメンバー、ルームメンバー、キック状態、ルーム設定による制限はない
- `?`キーは、入力要素、contenteditable、textbox相当、IME入力中、既に処理済みのイベント、Alt／Ctrl／Meta使用中、メニュー表示中、既存ダイアログ内では無視する
- `BackButton`は直接アクセス時も表示し、フロア一覧へ戻る。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する

## 画面構成

- フロア一覧へ戻る`BackButton`
- 翻訳対象のH1「ヘルプ及びショートカット一覧」
- `HelpContent`による本文、アコーディオン、ショートカット表
- ダイアログでは`aria-modal="true"`、タイトル・説明との関連付け、端末別の閉じるボタンを持つ

## 操作と動作

- 固定ページとダイアログは同じ`HelpContent`を使用する
- 全16言語の元HTMLは、10個の独立した`details`／`summary`による操作説明と1個のショートカット表を持つ。表示時は外部機能の有効状態に対応する説明だけを残す
- 操作説明は初期状態ですべて閉じ、複数項目を同時に開ける
- 本文はテキスト中心で、スクリーンショット、動画、画像を許可しない
- 言語変更時は表示中の本文をクリアし、変更後言語のHTMLを再取得する
- ダイアログはデスクトップ／モバイルの閉じるボタン、`Escape`、背景クリックで閉じる
- ダイアログを開いた直後は、PCではフッターの閉じるボタン、モバイルではヘッダーの閉じるボタンへフォーカスし、閉じた後は起点へフォーカスを戻す

### 外部機能に応じた本文表示

- サニタイズ済みHTML内の機能を示すclass属性を`HelpContent`が判定し、利用できない機能の要素をDOMへ描画する前に除去する
- `help-capability--mail-delivery`、`--google-login`、`--line-login`、`--google-translate`、`--openai-analysis`は対応する外部機能の有効状態に従う
- `help-capability--oauth-any`はGoogle／LINEのどちらか、`help-capability--oauth-both`は両方が利用可能な場合だけ残す
- メール配信が無効な場合は登録の見出し・導入・登録手順を隠すが、メール+パスワードのログイン説明は残す。OAuth 提供元名は個別に隠す
- Google Translateが無効な場合は翻訳機能の項目、OpenAI解析が無効な場合はAI解析機能の項目を隠す。AI解析の説明は固定タグ名や専用の表示切替を前提にしない
- 外部機能の有効状態の取得失敗時は全外部機能を無効として同じ除去規則を適用する

## 通信・エラー時の動作

### 使用するAPI

- この画面固有のバックエンドAPI通信はない。起動時に取得済みの外部機能の有効状態をVuexから参照する
- 固定ページ表示時またはダイアログ生成時に、同一オリジンの`/content/{lang}/help.html`を取得する
- HTTP成功時だけ本文を採用し、対象言語を取得できなければ`/content/ja/help.html`を取得する
- 日本語も取得できない場合は本文を表示せず、翻訳対象の「ヘルプ内容を読み込めませんでした」を`role="alert"`で表示する
- 取得したHTMLは、許可タグ、許可属性、`http`／`https`／`mailto`／`tel`だけを許可してサニタイズする。script、イベント属性、画像、`details`の`open`属性は除去する

### 読み込み中・データなし・エラー時

- 取得開始時は本文と直前のエラー状態をクリアする。専用ローディング表示はない
- HTTP成功時の本文が空なら、本文領域は空になる
- 対象言語と日本語の両方を取得できない場合だけエラー表示へ切り替える
- 利用者向けの再試行ボタンはない。言語が変わるかコンポーネントを再生成すると再取得する

## 関連資料

### 関連仕様

- [UI規約、アクセシビリティ、i18n](../style-and-i18n.md#言語別の静的html)
- [ルーティング](../routing.md)
- [外部機能の有効状態API](../../backend/api/capabilities.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/views/Help.vue`
- `frontend/src/components/help/HelpContent.vue`
- `frontend/src/components/help/HelpDialog.vue`
- `frontend/public/content/{lang}/help.html`

### テスト

- `frontend/tests/unit/views/Help.spec.js`
- `frontend/tests/unit/components/help/HelpContent.spec.js`
- `frontend/tests/unit/components/help/HelpDialog.spec.js`
- `frontend/tests/unit/components/app/AppMenu.spec.js`
- `frontend/tests/e2e/specs/screens/help/help.e2e.js`
