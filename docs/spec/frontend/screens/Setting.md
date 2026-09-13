# 表示設定（/setting）

## 概要

- 現在のブラウザで使用するタイムライン本文のフォント種別と文字サイズをブラウザに保存する

## 利用条件・開き方

- アプリメニューの「設定」、または`/setting`への直接アクセス
- アプリメニューの入口はログイン状態にかかわらず表示する

### URL

- パス: `/setting`
- ルート名: `Setting`
- コンポーネント: `frontend/src/views/Setting.vue`
- メタ情報: `isPublic: true`, `title: '設定'`

### 利用条件

- ゲスト、未ログイン、ログインユーザ、各ロールのいずれも利用できる公開画面である
- フロアメンバー／ルームメンバー、キック状態、フロア／ルーム設定による制限はない
- 保存先はユーザアカウントではなく同一オリジンの`localStorage`であり、同じブラウザプロファイルを使うゲストとログインユーザで共有される
- `BackButton`は直接アクセス時も表示し、フロア一覧へ戻る。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する

## 画面構成

- `BackButton`、翻訳対象のH1「設定」
- タイムラインフォント種別の選択欄
  - デフォルト
  - メイリオ
  - ＭＳ Ｐゴシック
  - ヒラギノ角ゴPro W3
  - Helvetica
- タイムラインフォントサイズの選択欄
  - デフォルト
  - 16px
  - 18px
  - 20px
- 設定を保存する「決定」ボタン

## 操作と動作

### 初期表示と保存形式

- 初期表示で`localStorage`の`iseeetl_setting`を`readTimelineSettings()`から読み込む
- 保存値は次のJSON形式である

```json
{
  "timelineFontFamily": "Helvetica",
  "timelineFontSize": "18px"
}
```

- キーがない、空、JSONとして不正、解析結果がオブジェクトでない場合は空設定として扱う
- 読み込んだ各値が空でない文字列の場合だけ画面モデルへ反映する
- 「決定」で現在の2値を同じキーへ上書きし、保存後に`Floor`へ遷移する
- API通信、JWT、サーバ側保存、ユーザ間同期は行わない

### タイムラインへの反映

- タイムライン画面の`getLocalStorage()`が`applyTimelineSettings()`を呼び、保存値からCSS文字列を組み立てる
- `timelineFontFamily`があれば`font-family:<value>;`、`timelineFontSize`があれば`font-size:<value>;`としてタイムライン状態へ設定する
- プロフィールで保存した目にやさしいモード、またはタイムラインURLの`eyeFriendlyMode=on`が有効な場合は、ローカル保存したフォントサイズより20pxを優先する
- 目にやさしいモードはフォント種別を上書きしない
- 保存内容は同じオリジン・同じブラウザプロファイル内だけで有効であり、別ブラウザ、別端末、別オリジンへ同期しない

## 入力条件

- Vuelidateやバックエンドによる入力検証はない
- 画面操作では固定の選択肢から値を選ぶ
- 「デフォルト」の値は空文字であり、タイムラインへフォント指定を追加しない
- 保存済み値を読み込む際の許可リスト検証はなく、空でない文字列であればモデルへ反映を試みる

## 通信・エラー時の動作

- ローディング表示、保存中状態、成功スナックバー、エラースナックバーはない
- `window.localStorage`が存在しない場合、読込・保存とも何もせず終了する。保存後のフロア遷移も行わない
- JSON解析エラーは空設定へフォールバックする
- `localStorage`の取得または`getItem`／`setItem`自体が例外を投げた場合のcatch処理はなく、画面上のエラー案内もない

## 関連資料

### 関連仕様

- [プロフィール](Profile.md)
- [タイムライン](Timeline.md)
- [フロントエンド状態管理](../state.md)
- [UI規約、アクセシビリティ、i18n](../style-and-i18n.md)
- [Cookieポリシー](CookiePolicy.md)
- [Cookie・ブラウザ保存・外部送信](../cookies-and-external-transmissions.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/components/app/AppMenu.vue`
- `frontend/src/views/Setting.vue`
- `frontend/src/features/timeline/settings.js`

### テスト

- `frontend/tests/unit/views/Setting.spec.js`
- `frontend/tests/e2e/specs/flows/settings/local-storage.e2e.js`
- `frontend/tests/unit/features/timeline/settings.spec.js`
