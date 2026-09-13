# ルームタグ管理（/management/roomtag）

## 概要

- 全ルームに属する`RoomTag`をサイト管理者が横断参照し、既存タグの表示順と原文名を更新する。論理削除状態は一覧の明示操作で変更する
- この管理画面は既存タグの更新専用であり、作成、CSV入出力、フロアタグからの初期化は行わない

## 利用条件・開き方

- 入口はアプリメニューの管理者向け「ルームタグ管理」、またはURLへの直接アクセスである

### URL

| 項目 | 値 |
| --- | --- |
| パス | `/management/roomtag` |
| ルート名 | `RoomTagManagement` |
| コンポーネント | `frontend/src/views/management/RoomTagManagement.vue` |
| メタ情報 | `isManagement: true` |

- アプリメニューはVuex上のロールが`Administrator`の場合だけ「ルームタグ管理」を表示する
- ルートガードはログイン済みAdministratorだけを通過させ、未ログインまたは他ロールのURLへの直接アクセスをログイン画面へ送る
- Administrator以外のログイン状態で拒否した場合はログアウト処理も行う

### 利用条件

| 利用者 | アプリメニュー | 画面遷移 | バックエンド管理API |
| --- | --- | --- | --- |
| Administrator | 表示 | 可 | 可 |
| Editor／Author／developer | 非表示 | ログアウト後ログイン画面へ遷移 | 403 |
| ゲスト | 非表示 | ログイン画面へ遷移 | 401 |

- バックエンドはJWTと管理者ロールをミドルウェアで確認し、サービスでもJWTのユーザIDから有効なAdministratorを再確認する
- 管理更新はフロア／ルーム作成者やタグ作成者本人に限定せず、現在のAdministratorなら全ルームのタグを対象にできる
- フロア作成者、フロアメンバーが個別ルーム内で行うタグ操作とは別の管理者専用経路である
- 詳細な通常操作・管理API契約は[ルームタグAPI](../../backend/api/room-tag.md)を参照する

## 画面構成

- H1「ルームタグ管理」
- 検索欄
- 状態絞り込み条件（すべて／未削除／削除済み）
- 全ルームを横断するタグ一覧テーブル
  - 表示順番
  - タグ名
  - 所属フロア名
  - 所属ルーム名
  - 作成日
  - 更新日
  - 削除日
  - 状態
  - 操作
- `EditRoomTagDialog`を管理モードで使用する「ルームタグを編集」ダイアログ。対象フロア名、対象ルーム名、保存済み対象タグ名を入力欄より先に表示する
- 共通の一覧状態・ページャと、編集エラー用スナックバー
- 作成ボタン、フロア／ルーム絞り込み、CSV入出力はない

## 操作と動作

### タグの継承と同期範囲

```text
CategoryTag
  └─ FloorTag
       └─ Room作成時またはRoom側の初期化でRoomTagへコピー・同期
```

- ルーム作成時は対象フロアに属する有効なフロアタグの表示順、名前、原文言語をコピーし、フロアの翻訳対象言語で翻訳を再作成する
- この画面で1件のルームタグを更新しても、元のフロアタグ、同じフロア内の別ルームタグ、投稿が参照するタグID以外のデータへは伝播しない
- フロアタグから対象ルームのタグを名前一致で再同期する`POST /api/roomtag/init`は、この管理画面には実行導線がない
- 同期時は同名の既存ルームタグIDを維持するため、投稿・返信が保持するタグ参照も維持する
- `source_floor_tag`はコピーの履歴である。フロアタグを物理削除してもルームタグを連鎖削除せず、保存済みコピー元IDも維持する
- タグのライフサイクルは[ドメインモデル](../../domain-model.md)を参照する

### 初期表示・一覧・検索・ページング

- 一覧の共通状態、検索フォーム、ページャ、URL履歴、競合要求、ページ補正は[管理一覧・検索共通仕様](../management-list.md)に従う
- 初期表示は`GET /api/roomtag/management/paginate?page=1&search=`を呼び出し、未削除と削除済みを取得する
- 1ページ10件で、ルームタグを`created_at`降順で表示する。状態の絞り込みは共通仕様に従う
- 表示順番列は各ルーム内で使用する`order`値であり、管理一覧自体の並び順ではない
- フロントエンドは2〜10文字の検索欄を表示し、実行時に`search` クエリを送る。バックエンドはタグ名の大文字・小文字を区別しない部分一致を状態条件と同時に適用する
- バックエンドは作成者の`username`、所属フロアの`title`／`delete_flg`、所属ルームの`title`／`delete_flg`／`floor`、保存済み継承元フロアタグの`name`／`delete_flg`／`floor`をpopulateし、画面はフロア名とルーム名を表示する。作成者、継承元名、原文言語、翻訳は表示しない

### 編集・論理削除・復元

- 有効な行の明示的な「編集」で、その行のルームタグを編集ダイアログへ設定する。行全体は操作対象にしない
- 対象フロア名、対象ルーム名、対象タグ名は一覧行の表示値をそのまま渡す。タグ名を編集中も対象タグ表示はダイアログを開いた時点の保存済み名称を維持する
- 入力項目は表示順番とタグ名であり、論理削除チェックボックスは表示しない
- 表示順番は1〜100の整数で、未入力時は100を補完する
- タグ名は必須、最大50文字で、バックエンド保存前に前後空白を除去する
- 管理モードでの確定には一覧から渡された既存ルームタグの`_id`を必須とする。対象IDがない状態で確定しても、作成、更新、成功通知を行わない
- 保存は`POST /api/roomtag/management/update`へ`_id`、`order`、`name`、既存ルームタグの`lang`、元の`delete_flg`を送る
- 有効な行は「削除」「編集」の順、削除済み行は「復元」だけを表示する。対象名と所属フロア／ルーム、復元可能であることを示す確認ダイアログの後、`POST /api/roomtag/management/delete-state`へ`_id`と`delete_flg`だけを送る
- 有効なルームAI解析設定から直接参照中のルームタグは削除できず、バックエンドは409を返す。画面は対象と確認ダイアログを維持し、参照元の設定を削除した後に再操作できる
- 直接参照中の409には`ACTIVE_AI_ANALYSIS_REFERENCE`理由があり、画面は「削除に失敗しました」に「有効なAI解析設定で使用されているため削除できません。先に関連するAI解析設定を削除してください」を連結する
- ルームタグの復元には有効で所属関係が一致するフロア／ルームだけを必要とする。画面は一覧レスポンスの`floor`と`room.floor`および各削除状態を使い、直接親の欠損・削除または所属フロアの不一致を事前判定して復元ボタンを無効化し、理由を関連付ける。保存済み`source_floor_tag`の欠損・削除状態・所属は復元可否に使用しない。取得後のフロア／ルーム状態競合はバックエンドの409で検出し、対象とダイアログを維持する
- 管理更新では既存ルームタグの`lang`を維持して送る。Google Translateが有効で`name`または`lang`が変わった場合は所属フロアの`target_langs`へ`translations`を再生成し、無効な場合は保存済み翻訳を維持する
- 内容編集、削除、復元の成功時は現在ページを再取得してダイアログを閉じる。状態変更の失敗時は対象とダイアログを維持する
- PCでは右下に「キャンセル」「保存」を隣接配置し、スマートフォンではヘッダー左の取消しと右の確定を使用する
- 未変更の取消し、Escape、外側クリックは直ちに閉じる。表示順番またはタグ名に未保存変更がある場合は破棄確認を表示し、確認の取消しでは編集へ戻り、破棄の確定では保存せず閉じる
- 保存中は表示順・名前、キャンセル、保存、Escape、外側クリックを抑止し、進捗率を示すバーを表示する
- 401ではログアウトしてログイン画面へ遷移し、それ以外の失敗は処理名と安全な利用者向け詳細をスナックバーへ表示する。状態変更では操作に応じて「削除に失敗しました」または「復元に失敗しました」を使用する

## 通信・エラー時の動作

### 使用するAPI

| 目的 | Method / Path | 主な送信値 | 画面での扱い |
| --- | --- | --- | --- |
| ページング一覧 | `GET /api/roomtag/management/paginate` | クエリ: `page`, `search`, 任意 `delete_flg` | 検索と状態を適用し、親階層と`source_floor_tag`を含む`docs`、`page`、`pages`、`total`を返す |
| 更新 | `POST /api/roomtag/management/update` | `_id`, `order`, `name`, `lang`, 元の`delete_flg` | 成功後に現在ページを再取得 |
| 削除・復元 | `POST /api/roomtag/management/delete-state` | `_id`, `delete_flg` | 状態だけを変更し、成功後に現在ページを再取得 |

- ページングルートはGET／POSTを受け付けるが、現行フロントエンドはGETを使用する
- 通常操作用の`POST /api/roomtag/create`、`update`、`delete`、`import`、`init`はこの管理画面から呼ばない
- `/api/roomtag/management/create`はバックエンドに存在せず、この画面にも作成導線はない。フロントエンドのルームタグ create アダプタも通常の`/api/roomtag/create`だけを使用する
- 更新対象が存在しない場合、バックエンドは404 `NOT_FOUND`を返す

### 読み込み中・データなし・エラー時

- 初回読込、更新中、空、取得失敗、前回結果を保った失敗、再試行は[管理一覧・検索共通仕様](../management-list.md)に従う
- 一覧取得の失敗は画面内に表示し、編集の失敗は共通ストアのスナックバーで通知する

## 関連資料

### 実装

- `frontend/src/routes/management.js`
- `frontend/src/components/app/AppMenu.vue`
- `frontend/src/api/tag.js`
- `backend/services/room/roomTag.service.js`
- `backend/models/FloorTag.js`

### テスト

- `frontend/tests/unit/views/management/RoomTagManagement.spec.js`
- `backend/tests/integration/routes/room.tag.route.int.test.js`
- `frontend/tests/e2e/specs/flows/management/management-list.common.e2e.js`
- `frontend/tests/e2e/specs/flows/management/roomtag-management.crud.e2e.js`
- `frontend/tests/unit/components/room-tag/EditRoomTagDialog.spec.js`
