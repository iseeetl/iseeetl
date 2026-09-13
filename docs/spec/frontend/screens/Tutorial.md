# チュートリアル（/tutorial）

## 概要

- 主要操作のチュートリアル動画を、環境で利用可能な機能に合わせて一覧表示する
- アプリメニューの項目はログイン状態にかかわらず表示する

## 利用条件・開き方

- アプリメニューの「チュートリアル」、または`/tutorial`への直接アクセス

### URL

- パス: `/tutorial`
- ルート名: `Tutorial`
- コンポーネント: `frontend/src/views/Tutorial.vue`
- メタ情報: `isPublic: true`, `title: 'チュートリアル'`

### 利用条件

- ゲスト、未ログイン、ログインユーザ、各ロールのいずれも利用できる
- フロアメンバー、ルームメンバー、キック状態、フロア／ルーム設定による制限はない
- フロア／ルームIDなどのクエリは付与せず、画面も現在のフロア／ルームを参照しない
- `BackButton`は直接アクセス時も表示し、フロア一覧へ戻る。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する

## 画面構成

- フロア一覧へ戻る`BackButton`
- 翻訳対象のH1「チュートリアル」
- `tutorials`の表示対象だけを配列順に連番、翻訳対象のH2、16:9の動画領域として縦に表示する
- 現在は全項目に`localFile`が設定され、Git管理下のローカルMP4を使用する

| 元項目 | 見出しの翻訳キー | 動画 | 表示条件 |
| --- | --- | --- | --- |
| 1 | ユーザ登録、ログイン | `/assets/video/1.mp4` | 常時 |
| 2 | 投稿の作成、更新、削除 | `/assets/video/2.mp4` | 常時 |
| 3 | 「流す」投稿の作成、削除 | `/assets/video/3.mp4` | 常時 |
| 4 | 返信の作成、更新、削除 | `/assets/video/4.mp4` | 常時 |
| 5 | 「流す」返信の作成、削除 | `/assets/video/5.mp4` | 常時 |
| 6 | 付加情報の作成、更新、削除 | `/assets/video/6.mp4` | 常時 |
| 7 | 絞り込みの作成、更新、削除 | `/assets/video/7.mp4` | 常時 |
| 8 | タイムラインの読み上げ機能 | `/assets/video/8.mp4` | 常時 |
| 9 | 翻訳機能 | `/assets/video/9.mp4` | Google Translateが利用可能 |
| 10 | AI解析機能 | `/assets/video/10.mp4` | OpenAI解析が利用可能 |

## 操作と動作

- 各`video`はブラウザ標準の`controls`で再生、一時停止、シーク、音量などを操作する
- 初期読み込みは`preload="metadata"`を指定し、自動再生は行わない
- `localFile`がある項目は`/assets/video/{file}`を表示する
- 言語変更時は見出しを翻訳するが、動画ファイル自体の切り替えは行わない
- 外部機能の有効状態の取得失敗時は外部機能を無効として扱い、翻訳とAI解析の動画を表示しない

### ヘルプとの役割分担

- チュートリアルは操作を動画で確認する画面であり、一覧は`Tutorial.vue`の`tutorialItems`配列で管理し、動画ファイルは`frontend/public/assets/video/`に配置する
- ヘルプは操作をテキストで確認する画面であり、本文は`frontend/public/content/{lang}/help.html`で管理する
- 両画面は同じ順番の10分野を扱うが、データや本文は共有せず、チュートリアルからヘルプへの直接リンクも設けない
- 1〜9番の日本語見出しは一致する。10番はチュートリアルが概要、ヘルプが5つの解析種別とタグ設定・通常の付加情報としての結果を詳しく説明する

### アクセシビリティ

- 各項目は番号付きH2で区切り、動画にはブラウザ標準の操作UIを表示する
- 16:9の動画領域は画面幅に合わせて伸縮する
- 各`video`の`aria-label`には翻訳済み項目名を設定する
- 動画自体に字幕用`track`、動画ごとのトランスクリプト、文章説明への直接リンクはない

## 通信・エラー時の動作

### 使用するAPI

- この画面固有のバックエンドAPI通信はない。起動時に取得済みの外部機能の有効状態をVuexから参照する
- 動画は同一オリジンのMP4を読み込む。動画再生による外部送信はない。アプリ共通の通信は[Cookie・外部送信仕様](../cookies-and-external-transmissions.md)を参照する

### 読み込み中・データなし・エラー時

- 専用のローディング、空、エラー、再試行表示はない
- 動画ファイルの欠落、取得失敗、再生非対応はブラウザ標準の動画表示に委ねる
- 動画の存在確認や再生可否に応じて一覧項目を非表示にはしない。翻訳とAI解析の項目だけは外部機能の有効状態に応じて非表示にする

## 関連資料

### 関連仕様

- [UI規約、アクセシビリティ、i18n](../style-and-i18n.md)
- [ルーティング](../routing.md)
- [ヘルプ](Help.md)
- [外部機能の有効状態API](../../backend/api/capabilities.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/views/Tutorial.vue`
- `frontend/src/components/app/AppMenu.vue`
- `frontend/src/locales/{lang}.json`
- `frontend/public/assets/video/{1..10}.mp4`

### テスト

- `frontend/tests/unit/views/Tutorial.spec.js`
- `frontend/tests/e2e/specs/screens/tutorial/tutorial.smoke.js`
- `frontend/tests/unit/components/common/BackButton.spec.js`
