# フロア一覧のページ表示（/page/:ページ）

## 概要

- ページ番号をURLへ保持し、フロア一覧の指定ページを直接表示できるようにする
- `/`と`/page/:page`は同じ`frontend/src/views/Floor.vue`を使用する
- 一覧、検索、フロア管理、権限、API、副作用、エラー表示の共通仕様は[フロア](Floor.md)を正とし、この文書ではページ番号付きルートの差分だけを定義する

## 利用条件・開き方

### URL

| 項目 | 値 |
| --- | --- |
| パス | `/page/:page` |
| ルート名 | `FloorPage` |
| コンポーネント | `frontend/src/views/Floor.vue` |
| ルートメタ情報 | `isPublic: true`, `title: 'フロア一覧'` |

- フロア一覧のページャ、検索実行、またはURLへの直接アクセスから遷移する
- 公開ルートであり、ゲストとログインユーザの双方が利用できる

### 利用条件

- 一覧へ含めるフロアと、作成・編集・削除・公開状態変更の権限は[フロアの権限・表示制御](Floor.md#利用条件)に従う
- `floor_display_hidden`は一覧表示条件であり、直接URLアクセスの認可条件ではない

## 操作と動作

### ページ番号とクエリの同期

- `:page`は先頭0のない1以上の10進整数で、JavaScriptの安全な整数に収まる値だけを有効とする
- `0`、負数、小数、文字列、先頭0付きの値、安全な整数を超える値は無効とし、既存クエリを維持して`/page/1`へ`replace`する
- 有効なページ番号は数値へ変換して`currentPage`へ反映する
- `q` クエリを検索入力へ反映してから、現在ページのフロア一覧を取得する
- 初期表示だけでなく`$route`変更時も同じ同期処理を行う。正規化が必要な場合は置換後のルート変更で一覧を取得し、置換前の不正ページでは取得しない

### 検索とページャ

- 検索実行時は1ページ目へ移動する
- 検索語がある場合は既存クエリを維持して`q`を更新し、`/page/1`へ移動する
- 空文字で検索した場合は検索を解除し、クエリなしの`/page/1`へ移動する
- ページ番号リンクは通常の`a`要素として生成し、検索中は`q`を遷移先へ引き継ぐ
- 検索入力の表示上限は100文字である。入力検証とバックエンドの検索対象は[フロアの検索仕様](Floor.md#検索)を参照する

## 通信・エラー時の動作

### API通信・画面状態

- ゲストは`POST /api/floor/guest/paginate`、ログイン中は`POST /api/floor/paginate`を使用する
- ページサイズ、並び順、古い応答の破棄、ローディング、空表示、エラー通知、管理操作後の再取得は[フロア](Floor.md)と同一である
- URLのページ番号がバックエンドの最終ページを超えた場合、フロントエンドは事前に補正せず、バックエンドが返すページ情報を表示へ反映する

## 関連資料

### 関連仕様

- [フロア](Floor.md)
- [ルーム](Room.md)
- [フロア作成からタイムラインの投稿操作まで](../flows/EditorFloorRoomTimelineCrud.md)
- [フロア API](../../backend/api/floor.md)
- [ロール・権限](../../roles-and-permissions.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/router.js`
- `frontend/src/views/Floor.vue`
- `frontend/src/api/floor.js`
- `backend/services/floor/floor.service.js`

### テスト

- `frontend/tests/unit/router.spec.js`
- `frontend/tests/e2e/specs/screens/floor/floor-list.smoke.js`
- `frontend/tests/unit/routes/public.spec.js`
- `frontend/tests/unit/views/Floor.spec.js`
- `frontend/tests/e2e/specs/flows/floor/floor.invalid-page.e2e.js`
