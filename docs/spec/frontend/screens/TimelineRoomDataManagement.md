# ルームのタイムラインデータ管理（/management/timeline/floor/:floorId）

## 概要

- 指定フロアに属するルームをAdministratorが一覧し、フロア・ルームの論理削除状態にかかわらず、ルーム単位の有効なタイムラインデータをJSON、ルーム保存領域の全ファイルをメディアZIPとして取得する
- JSONとメディアZIPは抽出基準が異なり、同じ時点の完全な対としては保証しない

## 利用条件・開き方

- 入口は[フロア選択画面](TimelineDataManagement.md)の「ルーム一覧」、またはURLへの直接アクセスである

### URL

| 項目 | 値 |
| --- | --- |
| パス | `/management/timeline/floor/:floorId` |
| ルート名 | `TimelineRoomDataManagement` |
| コンポーネント | `frontend/src/views/management/TimelineRoomDataManagement.vue` |
| props | ルートパラメータの`floorId`を必須Stringとして渡す |
| メタ情報 | `isManagement: true` |

- 「タイムラインデータ管理へ戻る」は`TimelineDataManagement`へ遷移する
- ルートメタ情報に画面タイトルはなく、文書タイトルにはアプリ名だけを設定する
- 同じコンポーネントで`floorId`だけを変更すると、サイズ確認を無効化して確認ダイアログを閉じる。フロア詳細とルーム一覧は自動再取得しない

### 利用条件

| 利用者 | 画面遷移 | ルーム管理一覧API | JSON・ZIP API |
| --- | --- | --- | --- |
| Administrator | 可 | 可 | 可 |
| Editor／Author／developer | ログアウト後ログイン画面へ遷移 | 403 | 403 |
| ゲスト／未ログイン | ログイン画面へ遷移 | 401 | 401 |

- ルートガードはlocalStorageから状態を復元し、ログイン済みAdministratorだけを通過させる
- バックエンドはJWT検証時に有効なユーザと`session_version`を確認し、現在のDBロールで認証情報を上書きした後、ミドルウェアでAdministratorを確認する
- ルーム管理サービスはJWTのユーザIDから有効なAdministratorを再確認する。タイムラインJSON・ZIP サービスはミドルウェアの認可へ依存する
- 画面はAdministrator専用の`POST /api/floor/management/detail`を使用し、論理削除済みフロアも取得する
- API契約は[フロア API](../../backend/api/floor.md)、[ルーム API](../../backend/api/room.md)、[タイムラインAPI](../../backend/api/timeline.md)を参照する

## 画面構成

- H1
  - フロア詳細取得前または失敗時: 「タイムラインデータ管理 - ルーム一覧」
  - 取得成功後: 「タイムラインデータ管理 - {フロア名}」
- 「タイムラインデータ管理へ戻る」ボタン
- 管理一覧の共通配置に従う検索欄
- ルーム一覧テーブル
  - ルーム名
  - 作成ユーザ名
  - 作成・更新・削除日時
  - 状態（有効／削除済み、表示／非表示、公開／メンバー限定）
  - 単一の「操作」列に横並びの「JSON」「メディアZIP」塗りつぶしボタン
- 共通の一覧状態・ページャと、フロア詳細・ダウンロードエラー用スナックバー
- タイムライン件数、メディア件数・容量、出力履歴は表示しない

## 操作と動作

### 初期表示・フロア詳細・ルーム一覧

- 一覧の共通状態、検索フォーム、ページャ、URL履歴、競合要求、ページ補正は[管理一覧・検索共通仕様](../management-list.md)に従う
- 初期表示では、フロア詳細とルーム管理一覧を独立した要求として開始する
  - `POST /api/floor/management/detail`へURLの`floorId`を`_id`として送る
  - `GET /api/room/management/paginate`へ`page=1`、空`search`、`floor_id`を送る
- フロア詳細は論理削除済みフロアも返す。存在しないフロアなどで取得に失敗した場合は`floor=null`とし、ルーム一覧を取得できても全ダウンロードを無効にする
- ルーム管理一覧は対象フロアの存在・削除状態を確認せず、`floor_id`が一致するルームを論理削除状態にかかわらず返す
- 1ページ10件で、`created_at`降順に表示する
- 論理削除、表示／非表示、公開／メンバー限定は文字付き状態バッジで表示する。削除済みルーム行も中立色と通常の可読文字で表示し、データ回収対象として「JSON」「メディアZIP」を利用できる
- ルームのユーザ参照が欠損した場合は「参照先なし」を表示し、一覧とダウンロード操作を継続する
- フロア詳細要求には一覧と同じ競合制御がない

### 検索

- 検索語は指定フロア内のルームのタイトルまたは説明を、大文字・小文字を区別せず、正規表現の特殊文字を通常文字として部分一致検索する
- フロントエンドは入力の前後空白を保持し、2〜100文字の範囲外では検索要求を送らない
- バックエンドは100文字以内を受け付けるが、フロントエンドは2〜100文字の検索だけを送る
- ユーザ名、作成日、削除状態、`member_only`、ルームIDは検索対象ではない

### ダウンロード前の確認

「JSON」「メディアZIP」を押すと、管理者専用の`POST /api/chat/management/timeline/estimate`で概算サイズを確認する。本体をブラウザへ受信する前に、ルーム名・概算サイズをダイアログへ表示し、「ダウンロード」または「キャンセル」を選ぶ。

概算が100 MiB（104,857,600バイト）以上なら、メモリ不足・画面停止の可能性と、表示サイズ以上のメモリが必要になる場合があることを警告する。この値は警告の目安であり、それ未満の安全性を保証せず、大容量のダウンロードも禁止しない。概算失敗時は本体を取得せずエラーを表示し、同じボタンから再試行できる。対象フロア変更・画面離脱後の遅い応答は確認ダイアログを開かない。

JSONは実際の出力と同じ抽出・整形条件で投稿ごとに計数する。ZIPはファイル容量とヘッダ分を概算し、本体は読み込まない。取得時点の違いや更新で実際のサイズは変わる。期間指定・分割出力・容量による拒否は行わない。

### ダウンロード共通挙動

- 次のいずれかに該当する場合、JSONとメディアZIPの両ボタンを無効にする
  - ルーム一覧取得中
  - フロア詳細未取得または取得失敗
  - サイズ確認中、確認ダイアログ表示中、またはいずれかのルームでJSONまたはメディアZIPをダウンロード中
- `downloadingKey`は画面全体で1件だけ保持するため、ルームと種別をまたぐ同時ダウンロードを行わない
- 「タイムラインデータ管理へ戻る」、検索、ページャはダウンロード中も操作でき、通信自体をキャンセルしない
- 成功時はBlob URLを作り、一時的なa要素の`download`属性で保存を開始し、a要素を除去してBlob URLを直ちに解放する
- ダウンロード進捗、受信件数・容量、残り時間、キャンセル、完了通知は表示しない
- JSON・ZIP取得はSocket.IOイベントとWebプッシュ通知を送信しない。操作者・対象・結果などの出力履歴も記録しない
- 出力ファイルの保管、暗号化、共有、破棄はアプリ外で管理する

### タイムライン JSON

- `POST /api/chat/management/timeline`へ`floor_id`と`room_id`を送る
- バックエンドはルームの存在と指定フロアへの所属を検証する
- フロアまたはルームが論理削除済みでも取得対象を変えず、論理削除されていないChatを返す
- 指定フロア／ルームの論理削除されていないChatを全件取得し、`created_at`降順にする。ページング、期間指定、件数上限はない
- 論理削除済み返信、投稿付加情報、返信付加情報を配列から除外する
- フロア、ルーム、ルームタグ、投稿ユーザ、返信ユーザ、投稿付加情報ユーザを展開する。返信付加情報ユーザ、Reaction ユーザ、Translation ユーザはIDのまま返す
- Chatの項目選択を行わないため、本文、ゲストID・ゲスト名、言語、翻訳、Reaction、解析種別、メディアファイル名、作成・更新・削除情報を含む現行Chatスキーマを返す
- フロントエンドは応答全体を`JSON.stringify(data, null, '  ')`で2空白インデントの文字列へ変換し、`application/json`のBlobを作る。この処理もブラウザメモリ上で全件行う
- JSON出力中にタイムラインが更新された場合のスナップショット整合性や版番号は保証しない

### メディアZIP

- `POST /api/chat/management/timeline/media`へ`floor_id`と`room_id`を送り、Axiosの`responseType: 'blob'`を指定する
- バックエンドはルームの存在と指定フロアへの所属を検証するが、フロア・ルームの論理削除状態を確認しない
- `MEDIA_PATH/{floorId}/{roomId}`ディレクトリが存在する場合、その内容を階層ごとZIPストリームへ格納する
- DB参照による絞り込みを行わないため、論理削除済みデータ由来のファイル、JSONに含まれないファイル、孤立ファイル、一時的に残ったファイルも含み得る
- ディレクトリが存在しない場合は500となる。ディレクトリが存在してファイルが0件の場合は空ZIPを返す
- バックエンドは`Content-Disposition: timeline_media.zip`を設定するが、フロントエンドは受信Blobを独自ファイル名で保存する
- バックエンドは一時ZIPを作らず直接ストリーミングする一方、フロントエンドはAxios応答全体をBlobとして受信後に保存を開始する
- ZIP内にマニフェスト、JSONとの対応表、ハッシュ、作成日時、スキーマ版は付与しない

## 入力条件

### ファイル名

- JSON: `{Floor名}_{Room名}_timeline.json`
- メディアZIP: `{Floor名}_{Room名}_media.zip`
- フロア名とルーム名の`\ / : * ? " < > |`を`_`へ置換し、前後空白を除去する
- 置換・前後の空白除去後が空の場合は`unknown`を使用する
- 制御文字、先頭・末尾のピリオド、OS予約名、Unicode正規化、バイト長、同名ファイルの上書き規則は処理しない

## 通信・エラー時の動作

### 使用するAPI

| 目的 | Method / Path | 主な送信値 | 画面での扱い |
| --- | --- | --- | --- |
| フロア詳細 | `POST /api/floor/management/detail` | 本文: `_id` | 削除状態にかかわらずフロア名とダウンロード可否へ反映 |
| ルーム一覧 | `GET /api/room/management/paginate` | クエリ: `page`, `search`, `floor_id` | 一覧とページャへ反映 |
| サイズ確認 | `POST /api/chat/management/timeline/estimate` | 本文: `floor_id`, `room_id`, `type`（`json`／`media`） | 概算サイズを確認ダイアログへ表示 |
| タイムラインJSON | `POST /api/chat/management/timeline` | 本文: `floor_id`, `room_id` | JSON文字列とBlobをブラウザで生成 |
| メディアZIP | `POST /api/chat/management/timeline/media` | 本文: `floor_id`, `room_id` | `responseType: 'blob'`で受信して保存 |

### 読み込み中・データなし・エラー時

- 初回読込、更新中、空、取得失敗、前回結果を保った失敗、再試行は[管理一覧・検索共通仕様](../management-list.md)に従う
- ルーム一覧取得の失敗は「ルームを読み込めませんでした」とAPIエラーコードに対応する翻訳済みの詳細を画面内に表示する
- フロア詳細取得中の専用表示はなく、見出しは「ルーム一覧」のままで全ダウンロードを無効にする
- フロア詳細の取得失敗、JSON・ZIP取得失敗は処理別文言とAPIエラーコードに対応する翻訳済みの詳細をスナックバーで通知する
- JSON・ZIP取得失敗時は`downloadingKey`を解除する

## 関連資料

### 関連仕様

- [タイムラインデータ管理（TimelineDataManagement）](TimelineDataManagement.md)

### 実装

- `frontend/src/routes/management.js`
- `frontend/src/components/management/ManagementListBase.vue`
- `frontend/src/api/chat.js`
- `backend/services/floor/floor.service.js`
- `backend/middlewares/ensureJsonWebToken.js`

### テスト

- `frontend/tests/e2e/specs/flows/management/timeline-data-management.smoke.js`
- `frontend/tests/e2e/specs/flows/management/timeline-data-management.media.e2e.js`

- `frontend/tests/unit/views/management/TimelineRoomDataManagement.spec.js`
- `backend/tests/integration/routes/timeline.management.route.int.test.js`
- `frontend/tests/e2e/specs/flows/management/management-list.common.e2e.js`
- `frontend/tests/unit/components/management/ManagementListBase.spec.js`
- `frontend/tests/unit/api/chat.spec.js`
