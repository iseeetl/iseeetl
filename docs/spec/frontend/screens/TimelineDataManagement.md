# タイムラインデータ管理（/management/timeline）

## 概要

- タイムラインデータを出力する対象フロアをAdministratorが選択し、フロア別のルーム一覧へ進む
- この画面自体ではタイムラインJSONまたはメディアZIPを生成・ダウンロードしない

## 利用条件・開き方

- 入口はアプリメニューの管理者向け「タイムラインデータ管理」、[ルーム選択・出力画面](TimelineRoomDataManagement.md)の「タイムラインデータ管理へ戻る」、またはURLへの直接アクセスである

### URL

| 項目 | 値 |
| --- | --- |
| パス | `/management/timeline` |
| ルート名 | `TimelineDataManagement` |
| コンポーネント | `frontend/src/views/management/TimelineDataManagement.vue` |
| メタ情報 | `isManagement: true` |

- アプリメニューはVuex上のロールが`Administrator`の場合だけ「タイムラインデータ管理」を表示する
- ルートガードはlocalStorageから状態を復元し、ログイン済みAdministratorだけを通過させる
- 未ログインまたはAdministrator以外が直接アクセスした場合はログアウト処理を行い、`/login`へ遷移する
- ルートメタ情報に画面タイトルはなく、文書タイトルにはアプリ名だけを設定する

### 利用条件

| 利用者 | アプリメニュー | 画面遷移 | フロア管理一覧API |
| --- | --- | --- | --- |
| Administrator | 表示 | 可 | 可 |
| Editor／Author／developer | 非表示 | ログアウト後ログイン画面へ遷移 | 403 |
| ゲスト／未ログイン | 非表示 | ログイン画面へ遷移 | 401 |

- バックエンドはJWT検証時に有効なユーザと`session_version`を確認し、現在のDBロールで認証情報を上書きした後、ミドルウェアでAdministratorを確認する
- フロア管理サービスでもJWTのユーザIDから有効なAdministratorを再確認する
- API契約は[フロア API](../../backend/api/floor.md)を参照する

## 画面構成

- H1「タイムラインデータ管理」
- 管理一覧の共通配置に従う検索欄
- フロア一覧テーブル
  - フロア名
  - 作成ユーザ名
  - 作成・更新・削除日時
  - 状態（有効／削除済み、表示／非表示）
  - 「ルーム一覧」操作
- 共通の一覧状態・ページャ
- タイムライン件数、ルーム件数、メディア容量、出力履歴は表示しない

## 操作と動作

### 初期表示・一覧・ページング

- 一覧の共通状態、検索フォーム、ページャ、URL履歴、競合要求、ページ補正は[管理一覧・検索共通仕様](../management-list.md)に従う
- 初期表示は`GET /api/floor/management/paginate?page=1&search=`を呼び出す
- 1ページ10件で、`created_at`降順に表示する
- `delete_flg`と`floor_display_hidden`を絞り込みに使用しないため、論理削除済みフロアと非表示フロアも一覧へ含む
- 論理削除と表示／非表示は文字付き状態バッジで表示する。削除済みフロア行も中立色と通常の可読文字で表示し、データ回収対象として「ルーム一覧」を利用できる
- フロアの削除状態にかかわらず「ルーム一覧」は`/management/timeline/floor/:floorId`へ遷移する
- 「ルーム一覧」は主要な行操作として塗りつぶしボタンで表示する
- 取得中は検索欄、ページャ、各行の「ルーム一覧」を無効にする
- ユーザ参照が欠損したフロアだけを抽出する機能はない
- フロアのユーザ参照が欠損した場合は「参照先なし」を表示し、一覧とルーム選択を継続する

### 検索

- 検索語はフロアのタイトルまたは説明を、大文字・小文字を区別せず、正規表現の特殊文字を通常文字として部分一致検索する
- フロントエンドは入力の前後空白を保持し、2〜10文字の範囲外では検索要求を送らない
- バックエンドは100文字以内を受け付けるが、フロントエンドは2〜10文字の検索だけを送る
- ユーザ名、作成日、削除状態、フロアIDは検索対象ではない

## 通信・エラー時の動作

### 使用するAPI

| 目的 | Method / Path | 主な送信値 | 画面での扱い |
| --- | --- | --- | --- |
| フロア一覧 | `GET /api/floor/management/paginate` | クエリ: `page`, `search` | `docs`、`total`、`pages`、`page`を一覧とページャへ反映 |

- バックエンドはGET／POSTを受け付け、フロントエンドはGETを使用する

### 読み込み中・データなし・エラー時

- 初回読込、更新中、空、取得失敗、前回結果を保った失敗、再試行は[管理一覧・検索共通仕様](../management-list.md)に従う
- 一覧取得の失敗は「フロアの取得に失敗しました」とAPIエラーコードに対応する翻訳済みの詳細を画面内に表示する
- 一覧取得中は共通の検索とページャに加え、各行の「ルーム一覧」も無効にする

## 関連資料

### 関連仕様

- [ルームのタイムラインデータ管理（TimelineRoomDataManagement）](TimelineRoomDataManagement.md)

### 実装

- `frontend/src/routes/management.js`
- `frontend/src/components/app/AppMenu.vue`
- `frontend/src/api/floor.js`
- `backend/services/floor/floor.service.js`
- `backend/middlewares/ensureJsonWebToken.js`

### テスト

- `frontend/tests/unit/views/management/TimelineDataManagement.spec.js`
- `backend/tests/integration/routes/floor-room.crud.int.test.js`
- `frontend/tests/e2e/specs/flows/management/management-list.common.e2e.js`
- `frontend/tests/unit/components/management/ManagementListBase.spec.js`
- `frontend/tests/unit/api/floor.spec.js`
