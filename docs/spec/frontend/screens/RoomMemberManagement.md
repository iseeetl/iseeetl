# ルームメンバー管理（/management/roommember）

## 概要

- サイト全体のルームメンバーをAdministratorが横断参照し、選択した所属関係を削除する
- この画面は一覧と削除専用であり、フロア／ルームの選択、メンバーの追加・招待・脱退、所属の復元は行わない
- ルームメンバーの削除は論理削除ではなく、所属レコードの物理削除である

## 利用条件・開き方

- 入口はアプリメニューの管理者向け「ルームメンバー管理」、またはURLへの直接アクセスである

### URL

| 項目 | 値 |
| --- | --- |
| パス | `/management/roommember` |
| ルート名 | `RoomMemberManagement` |
| コンポーネント | `frontend/src/views/management/RoomMemberManagement.vue` |
| メタ情報 | `isManagement: true` |

- アプリメニューはVuex上のロールが`Administrator`の場合だけ「ルームメンバー管理」を表示する
- ルートガードは遷移時にlocalStorageから状態を復元し、ログイン済みAdministratorだけを通過させる
- 未ログインまたはAdministrator以外が直接アクセスした場合はログアウト処理を行い、`/login`へ遷移する
- ルートメタ情報に画面タイトルはなく、文書タイトルにはアプリ名だけを設定する

### 利用条件

| 利用者 | アプリメニュー | 画面遷移 | バックエンド管理一覧・削除API |
| --- | --- | --- | --- |
| Administrator | 表示 | 可 | 可 |
| Editor／Author／developer | 非表示 | ログアウト後ログイン画面へ遷移 | 403 |
| ゲスト | 非表示 | ログイン画面へ遷移 | 401 |

- 管理一覧・管理削除APIはJWT上のAdministratorをミドルウェアで確認し、サービスでもJWTのユーザIDに対応する有効なユーザと現在のDBロールがAdministratorであることを再確認する
- 現在のAdministratorは対象フロア／ルームの作成者やメンバーかどうかにかかわらず、任意のルームメンバーを削除できる
- 通常のルームメンバー削除APIはAdministrator、対象フロア作成者であるEditor、または対象ルーム作成者を許可するが、この画面はAdministrator専用の`management/delete`を使用する
- 横断的な権限は[ロール・権限仕様](../../roles-and-permissions.md)、API契約は[ルームメンバー API](../../backend/api/room-member.md)を参照する

## 画面構成

- H1「ルームメンバー管理」
- 全ルームメンバーを横断する一覧テーブル
  - ルーム名
  - ユーザ名
  - 作成日
  - 削除操作
- 対象のルーム名とユーザ名をアクセシブルな名前に含む、危険色で塗りつぶした「削除」ボタンで削除確認ダイアログを開く。行全体は操作対象にしない
  - タイトル「ルームメンバー削除」
  - 「対象ルーム」とルーム名、および「対象ユーザ」とユーザ名を独立した文脈として表示する
  - PCは右下に隣接した「キャンセル」「削除」、スマートフォンはヘッダー左のキャンセルと右の削除
  - 初期フォーカスは表示中のキャンセル操作
  - 削除中はタイトルで名前付けした処理中の案内
- 共通の一覧状態・ページャと、削除エラー用スナックバー
- フロア名、フロア／ルーム／ユーザID、`member_only`は表示しない
- 検索、フロア／ルーム／ユーザ絞り込み、追加・招待・復元、複数選択、一括削除はない

## 操作と動作

### 初期表示・一覧・ページング

- 一覧の共通状態、ページャ、URL履歴、競合要求、ページ補正は[管理一覧・検索共通仕様](../management-list.md)に従う
- 初期表示は`GET /api/roommember/management/paginate?page=1`を呼び出す
- 1ページ10件で、全ルームメンバーを`created_at`降順で表示する
- バックエンドは所属ルームの`title`と対象ユーザの`username`をpopulateする。ルームメンバーが保持するフロアはpopulateせず画面にも表示しない
- ルームメンバーモデルに論理削除フラグはなく、存在する所属レコードをすべて一覧対象とする
- 親フロア、ルーム、ユーザの`delete_flg`やルームの`member_only`を一覧条件へ使用しないため、論理削除済み親データや公開ルームに紐づく所属も表示される
- 検索用`q`は使用しない
- 同名ルームが別フロアに存在する場合、画面上はルーム名とユーザ名だけでは所属先を区別できない

### 削除確認と送信

- 行内の「削除」で、対象のメンバーID、ルーム名、ユーザ名を保持して確認ダイアログを開く
- 「削除」は`_id`だけを管理専用削除APIへ送る
- 変更APIの開始から、成功後の一覧再取得が成功または失敗で終了するまで`sending=true`とし、再度呼ばれても新しいAPI要求を送らない
- `sending=true`の間は削除・キャンセルボタンを無効化し、Escapeと背景クリックによる閉じる操作を抑止する。ダイアログと対象情報を維持し、タイトルで名前付けした処理中の案内を表示する
- 変更APIの成功時は同じページの一覧再取得を待ち、成功または失敗で終了した後に`sending=false`としてからダイアログを閉じ、保持していた対象情報をクリアする
- 削除成功後の一覧再取得失敗は削除失敗のスナックバーへ変換せず、一覧エラーと再試行を共通一覧へ委ねたうえでダイアログを閉じる
- 変更APIの失敗時は一覧を再取得せず、`ルームメンバーの削除に失敗しました`とAPIエラーコードに対応する翻訳済みの詳細を表示する。`sending`だけを解除し、ダイアログと対象情報は維持して再操作を許可する
- 401では共通エラー処理がログアウトし、ログイン画面へ遷移する

### 物理削除と親データの状態

- バックエンドは指定メンバーIDのルームメンバーを`findOneAndDelete`で物理削除し、復元データや削除日時を保持しない
- 管理削除はメンバーIDだけで削除し、対象ルーム、保持しているフロア、両者の所属一致、親データの有効状態を検査しない
- そのため論理削除済みルーム／フロアに紐づくメンバーも削除でき、親データが物理的に欠損した孤立メンバーもIDを特定できれば削除できる
- 削除対象が存在しない場合は404を返す
- ルームメンバーは`room + user`の複合一意制約を持ち、索引はバックエンド起動時に作成する。ルームとフロアの一致はDB制約では保証しない
- ルームやユーザへの参照が欠損した場合は「参照先なし」を表示し、メンバーIDによる削除を利用できる

### Socket.IO接続への影響

- 所属を物理削除した後、バックエンドはルームメンバーに保存されていたフロアIDとユーザIDを使い、同じフロア内で接続中の認証済みSocketを列挙する
- 接続先ルームごとに現在の入室権限を再評価し、権限を失ったSocketへ`RECEIVE_COMPLETE_DELETE_ROOM_MEMBER`を通知して強制切断する
- 公開ルーム、または対象ユーザが別途フロアメンバーであるなど、削除後も入室権限が残る接続は維持する
- Socket再認可の共通契約は[Socket.IOイベント仕様](../../socket-events.md)を参照する
- 削除操作は製品内の操作履歴を記録しない

## 通信・エラー時の動作

### 使用するAPI

| 目的 | Method / Path | 主な送信値 | 画面での扱い |
| --- | --- | --- | --- |
| ページング一覧 | `GET /api/roommember/management/paginate` | クエリ: `page` | `docs`, `total`, `pages`, `page`を一覧とページャへ反映 |
| ルームメンバー削除 | `POST /api/roommember/management/delete` | 本文: `_id` | 成功後に現在ページを再取得 |

- ページングルートはGETとPOSTだけを受け付け、現行フロントエンドはGETを使用する
- 通常画面用の一覧、招待、参加、削除、脱退、所属確認APIはこの画面から呼ばない

### 読み込み中・データなし・エラー時

- 初回読込、更新中、空、取得失敗、前回結果を保った失敗、再試行は[管理一覧・検索共通仕様](../management-list.md)に従う
- 一覧取得の失敗は画面内に表示し、メンバー削除の失敗はスナックバーで通知する
- 削除成功後の一覧再取得失敗は一覧取得の失敗として画面内に表示し、削除失敗のスナックバーは表示しない

## 関連資料

### 実装

- `frontend/src/routes/management.js`
- `frontend/src/components/management/ManagementMemberDeleteDialog.vue`
- `frontend/src/utils/managementDateFormat.js`
- `frontend/src/api/roomMember.js`
- `backend/models/RoomMember.js`

### テスト

- `frontend/tests/unit/views/management/RoomMemberManagement.spec.js`
- `frontend/tests/unit/components/management/ManagementMemberDeleteDialog.spec.js`
- `backend/tests/integration/routes/member.crud.int.test.js`
- `frontend/tests/e2e/specs/flows/management/management-list.common.e2e.js`
- `frontend/tests/unit/views/management/ManagementRowAccessibility.spec.js`
