# フロアタグ管理（/management/floortag）

## 概要

- 全フロアに属する`FloorTag`をサイト管理者が横断参照し、既存タグの表示順と原文名を更新する。不要なタグは一覧から削除する
- この管理画面は既存タグの編集・削除用であり、作成、CSV入出力、共通タグからの初期化は行わない

## 利用条件・開き方

- 入口はアプリメニューの管理者向け「フロアタグ管理」、またはURLへの直接アクセスである

### URL

| 項目 | 値 |
| --- | --- |
| パス | `/management/floortag` |
| ルート名 | `FloorTagManagement` |
| コンポーネント | `frontend/src/views/management/FloorTagManagement.vue` |
| メタ情報 | `isManagement: true` |

- アプリメニューはVuex上のロールが`Administrator`の場合だけ「フロアタグ管理」を表示する
- ルートガードはログイン済みAdministratorだけを通過させ、未ログインまたは他ロールのURLへの直接アクセスをログイン画面へ送る
- Administrator以外のログイン状態で拒否した場合はログアウト処理も行う

### 利用条件

| 利用者 | アプリメニュー | 画面遷移 | バックエンド管理API |
| --- | --- | --- | --- |
| Administrator | 表示 | 可 | 可 |
| Editor／Author／developer | 非表示 | ログアウト後ログイン画面へ遷移 | 403 |
| ゲスト | 非表示 | ログイン画面へ遷移 | 401 |

- バックエンドはJWTと管理者ロールをミドルウェアで確認し、サービスでもJWTのユーザIDから有効なAdministratorを再確認する
- 管理更新はフロア作成者やタグ作成者本人に限定せず、現在のAdministratorなら全フロアのタグを対象にできる
- 現在ロールが`Editor`であるフロア作成者が個別フロア内で行うタグ操作とは別の管理者専用経路である
- 詳細な通常操作・管理API契約は[フロアタグAPI](../../backend/api/floor-tag.md)を参照する

## 画面構成

- H1「フロアタグ管理」
- 検索欄
- 全フロアを横断するタグ一覧テーブル
  - 表示順番
  - タグ名
  - 所属フロア名
  - 作成日
  - 更新日
  - 操作
- `EditFloorTagDialog`を管理モードで使用する「フロアタグを編集」ダイアログ。対象フロア名と保存済み対象タグ名を入力欄より先に表示する
- 共通の一覧状態・ページャと、編集エラー用スナックバー
- 作成ボタン、フロア絞り込み、CSV入出力はない

## 操作と動作

### タグの継承と同期範囲

```text
CategoryTag
  └─ Floor作成時またはFloor側の初期化でFloorTagへコピー・同期
       └─ Room作成時またはRoom側の初期化でRoomTagへコピー・同期
```

- フロア作成時は有効な共通タグの表示順と名前をコピーし、フロアの翻訳対象言語で翻訳を作成する
- この画面で1件のフロアタグを更新しても、対応する共通タグや作成済みルームタグへは伝播しない
- `source_category_tag`とルームタグ側の`source_floor_tag`はコピーの履歴である。共通タグまたはフロアタグの物理削除は子タグへ連鎖せず、保存済みコピー元IDも維持する
- 共通タグから対象フロアのタグを名前一致で再同期する`POST /api/floortag/init`は、この管理画面には実行導線がない
- ルーム作成時は、その時点で対象フロアに属する有効なフロアタグだけをルームタグへコピー・再翻訳する
- タグのライフサイクルは[ドメインモデル](../../domain-model.md)を参照する

### 初期表示・一覧・検索・ページング

- 一覧の共通状態、検索フォーム、ページャ、URL履歴、競合要求、ページ補正は[管理一覧・検索共通仕様](../management-list.md)に従う
- 初期表示は`GET /api/floortag/management/paginate?page=1&search=`を呼び出し、有効なタグだけを取得する。旧論理削除データは表示せず、自動復元しない
- 1ページ10件で、フロアタグを`created_at`降順で表示する
- 表示順番列は各フロア内で使用する`order`値であり、管理一覧自体の並び順ではない
- 検索は全フロアタグの原文名を対象とする、大文字・小文字を区別しない部分一致である
- フロントエンドは2〜10文字を入力条件とし、範囲外の検索要求を送らない。バックエンドの上限は100文字で、空検索は`search=`で送る
- バックエンドは作成者の`username`、所属フロアの`title`／`delete_flg`、保存済み継承元共通タグの`name`／`delete_flg`をpopulateし、画面はフロア名を表示する。作成者、継承元名、原文言語、翻訳は表示しない

### 編集・削除

- 有効な行の明示的な「編集」で、その行のフロアタグを編集ダイアログへ設定する。行全体は操作対象にしない
- 対象フロア名と対象タグ名は一覧行の表示値をそのまま渡す。タグ名を編集中も対象タグ表示はダイアログを開いた時点の保存済み名称を維持する
- 入力項目は表示順番とタグ名であり、論理削除チェックボックスは表示しない
- 表示順番は1〜100の整数で、未入力時は100を補完する
- タグ名は必須、最大50文字で、バックエンド保存前に前後空白を除去する
- 管理モードでの確定には一覧から渡された既存フロアタグの`_id`を必須とする。対象IDがない状態で確定しても、作成、更新、成功通知を行わない
- 保存は`POST /api/floortag/management/update`へ`_id`、`order`、`name`、既存フロアタグの`lang`を送る
- 各行は「削除」「編集」の順で操作を表示する。対象名と所属フロアと元に戻せないことを示す確認ダイアログの後、`POST /api/floortag/management/delete`へ`_id`だけを送る。タグを物理削除し、復元操作は提供しない
- 有効なフロアAI解析設定から直接参照中のフロアタグは削除できず、バックエンドは409と`ACTIVE_AI_ANALYSIS_REFERENCE`理由を返す。画面は「削除に失敗しました」に「有効なAI解析設定で使用されているため削除できません。先に関連するAI解析設定を削除してください」を連結し、対象と確認ダイアログを維持する
- 有効なルームタグの`source_floor_tag`から参照されていることだけでは削除を拒否しない。削除後もルームタグと来歴IDを維持する
- 管理更新では既存フロアタグの`lang`を維持して送る。Google Translateが有効で`name`または`lang`が変わった場合は所属フロアの`target_langs`へ`translations`を再生成し、無効な場合は保存済み翻訳を維持する
- 内容編集、削除の成功時は現在ページを再取得してダイアログを閉じる。削除の失敗時は対象とダイアログを維持する
- PCでは右下に「キャンセル」「保存」を隣接配置し、スマートフォンではヘッダー左の取消しと右の確定を使用する
- 未変更の取消し、Escape、外側クリックは直ちに閉じる。表示順番またはタグ名に未保存変更がある場合は破棄確認を表示し、確認の取消しでは編集へ戻り、破棄の確定では保存せず閉じる
- 保存中は表示順・名前、キャンセル、保存、Escape、外側クリックを抑止し、進捗率を示すバーを表示する
- 401ではログアウトしてログイン画面へ遷移し、それ以外の失敗は処理名と安全な利用者向け詳細をスナックバーへ表示する。削除の失敗には「削除に失敗しました」を使用する

## 通信・エラー時の動作

### 使用するAPI

| 目的 | Method / Path | 主な送信値 | 画面での扱い |
| --- | --- | --- | --- |
| ページング一覧 | `GET /api/floortag/management/paginate` | クエリ: `page`, `search` | `floor`と`source_category_tag`を含む`docs`、`page`、`pages`、`total`を一覧状態へ反映 |
| 更新 | `POST /api/floortag/management/update` | `_id`, `order`, `name`, `lang` | 成功後に現在ページを再取得 |
| 削除 | `POST /api/floortag/management/delete` | `_id` | 物理削除し、成功後に現在ページを再取得 |

- ページングルートはGET／POSTを受け付けるが、現行フロントエンドはGETを使用する
- 通常操作用の`POST /api/floortag/create`、`update`、`delete`、`import`、`init`はこの管理画面から呼ばない
- `/api/floortag/management/create`はバックエンドに存在せず、この画面にも作成導線はない。フロントエンドのフロアタグ create アダプタも通常の`/api/floortag/create`だけを使用する

### 読み込み中・データなし・エラー時

- 初回読込、更新中、空、取得失敗、前回結果を保った失敗、再試行は[管理一覧・検索共通仕様](../management-list.md)に従う
- 一覧取得の失敗は画面内に表示し、編集の失敗は共通ストアのスナックバーで通知する

## 関連資料

### 実装

- `frontend/src/routes/management.js`
- `frontend/src/components/app/AppMenu.vue`
- `frontend/src/api/tag.js`
- `backend/services/floor/floorTag.service.js`
- `backend/models/FloorTag.js`

### テスト

- `frontend/tests/unit/views/management/FloorTagManagement.spec.js`
- `backend/tests/integration/routes/floor.tag.route.int.test.js`
- `frontend/tests/e2e/specs/flows/management/management-list.common.e2e.js`
- `frontend/tests/unit/components/floor-tag/EditFloorTagDialog.spec.js`
- `frontend/tests/unit/components/management/ManagementListBase.spec.js`
