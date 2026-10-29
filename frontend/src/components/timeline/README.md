# タイムラインの編集UI

`SourceLanguageField.vue` は投稿・返信・付加情報の本文言語を選ぶ共通フィールドです。`modelValue` と `update:modelValue` で選択言語を渡し、`controlId` でラベル・説明とネイティブselectを関連付けます。nullは言語不明を示します。画面言語は変更しません。選択欄は既存の入力欄と同じ白背景・濃色文字・フォーカス色を使用します。

利用方法と保存規則は[本文言語の仕様](../../../../docs/spec/frontend/source-language.md)を参照してください。検証は `cd frontend` の後、`npm run test:unit:ci -- tests/unit/components/timeline/SourceLanguageField.spec.js tests/unit/components/timeline/TimelineSupplementTextEdit.spec.js tests/unit/components/timeline/dialogs` です。

### 言語訂正専用操作

`TimelineSourceLanguageEdit.vue` はログイン利用者向けの言語訂正。投稿・返信・付加情報と停止中の流れる投稿に共通表示する。原文は読み取り専用、ゲストや閲覧専用の画面には出さない。翻訳アイコンに名前を付け、ダイアログの言語選択へフォーカスし、保存結果をstatusで通知する。入力色は既存フォームと統一する。権限・API・競合条件の正本は [本文言語仕様](../../../../docs/spec/frontend/source-language.md)。
