# ルームAPI

## 概要

ルームの取得・作成・更新・削除と、管理者向けの状態変更を提供します。

ルームのデータ構造と論理削除は [ドメインモデル](../../domain-model.md)、フロアアクセスとルーム入室の権限は [ロール・権限仕様](../../roles-and-permissions.md)、JWTとエラー応答の共通形式は [REST API共通規約](../api-conventions.md) を参照してください。

room_display_hiddenは一覧表示、member_onlyは入室権限、guest_reaction_onlyはゲストの投稿・返信内容を制御します。これらは独立した設定です。

JWT必須APIでは、トークン発行時のロールではなく、リクエスト時点の有効なユーザから再取得した現在ロールを使用します。JWTのユーザが存在しない、論理削除済み、または`session_version`が一致しない場合は401 `TOKEN_INVALID`を返します。

## 共通条件

- 作成、通常更新、表示・並び順更新、削除、管理更新、管理状態変更は、操作者と変更内容の操作履歴を製品内へ記録しない

### Google Translateの有効条件

- Google Translateが無効な場合、新規ルームと同時に作成する`RoomTag`の翻訳は空配列になる。ルーム単語は初期化元フロア単語の保存済み翻訳を引き継ぐ
- Google Translateが無効な場合、通常更新と管理更新は保存済みのルーム翻訳を保持する
- 有効状態は[外部機能の有効状態API](capabilities.md)の`googleTranslate`を参照する

### 画像の更新

通常更新と管理更新に、次の条件を適用する。

- 新しい画像は、操作ユーザが対象ルームへアップロードしたjpg/jpeg/pngの主画像で、実体が存在し、他の有効なデータから参照されていないことを確認する。不正な指定は400 `INVALID_PARAMS`を返す
- 変更しない既存画像は、他の編集者も維持できる
- ルーム情報の保存後に、旧画像を削除する。有効なルーム・投稿・返信・付加情報からの参照が残る場合は保持する。画像が既にない場合や削除に失敗した場合も、更新は成功として扱う

### 一覧の並び順

ルーム一覧では次の順に並べ、各ルームへlast_post_dateを追加します。

1. display_orderの昇順
2. display_orderが同じ場合はcreated_atの降順

last_post_dateは、対象ルームで論理削除されていない最新投稿の作成日時です。投稿がない場合はnullです。認証済み一覧では、これに加えて現在のログインユーザが各ルームのルームメンバーであるかを示す`current_user_is_room_member`を付加します。

## API

### POST /api/room/guest

ゲスト向けに、対象フロアの表示対象ルーム一覧を取得する。

#### 認証・権限

- 不要
- member_onlyは一覧の絞り込み条件に使用しない。入室時に別途判定する
- 所属フロアのfloor_display_hiddenは絞り込み条件に使用しない。フロアIDを指定できれば、非表示フロアでも表示対象ルームを取得する

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: room_display_hiddenがtrueではなく、delete_flgがfalseのルームの配列
- userにはユーザID、username、image_nameを含む
- 各ルームへlast_post_dateを追加
- ゲスト向け一覧では現在のログインユーザを識別しないため、`current_user_is_room_member`は追加しない

#### エラー

- 400: INVALID_PARAMS
- 404: NOT_FOUND（対象フロアが存在しない、または論理削除済み）

### POST /api/room/

ログインユーザ向けに、フロアアクセスに応じたルーム一覧を取得する。

#### 認証・権限

- JWT必須
- `Administrator`、対象フロアを作成した`Editor`、対象フロアの`FloorMember`は非表示ルームも取得
- その他のユーザはroom_display_hiddenがtrueではないルームだけを取得
- `RoomMember`であることだけでは非表示ルームの取得権限にならない
- member_onlyは一覧の絞り込み条件に使用しない。入室時に別途判定する

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: 認証/認可欄の条件を満たし、delete_flgがfalseのルームの配列
- userにはユーザID、username、image_nameを含む
- 各ルームへlast_post_dateを追加
- 各ルームへ`current_user_is_room_member: boolean`を追加する。現在のログインユーザに対象ルームのルームメンバーレコードが存在する場合は`true`、存在しない場合は`false`とする
- `current_user_is_room_member`は一覧応答用に計算する値であり、ルームモデルへ保存しない。`member_only`の値にかかわらず所属の有無を表す

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND（対象フロアが存在しない、または論理削除済み）

### POST /api/room/detail

- 認証不要の詳細APIは、room_display_hiddenとmember_onlyにかかわらずルーム情報を返す

ルーム詳細を取得する。非表示ルームとメンバー限定ルームも取得対象とする。

#### 認証・権限

- 不要
- room_display_hiddenとmember_onlyはこのAPIの取得制限に使用しない

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: delete_flgがfalseで、所属フロアも論理削除されていないルーム
- floorにはフロアID、title、target_langs、translations、floor_display_hiddenを含む
- userにはユーザID、username、image_nameを含む

#### エラー

- 400: INVALID_PARAMS
- 404: NOT_FOUND（対象ルームまたは所属フロアが存在しない、または論理削除済み）

### POST /api/room/create

対象フロアにルームを作成する。

#### 認証・権限

- JWT必須
- `Administrator`、対象フロアを作成した`Editor`、または対象フロアの`FloorMember`
- `RoomMember`であることだけでは作成権限にならない

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - title: 文字列（1〜100文字）, 必須
  - description: 文字列（200文字以内）またはnull, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
  - guest_reaction_only: 真偽値, 必須
  - member_only: 真偽値, 必須
  - room_display_hidden: 真偽値, 必須
  - notification: 真偽値, 必須
  - external_sns_button: 真偽値, 必須

#### レスポンス

- 200 OK
- body: 作成済みルーム
- userにはユーザID、username、image_nameを含む
- floorはフロアIDとして返す

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN（対象フロアの管理権限がない）
- 404: NOT_FOUND（対象フロアが存在しない、または論理削除済み）

#### データ更新・通知

- Google Translateが有効な場合は、ルームを作成してタイトルと説明のフロアの対象言語への翻訳を試行する。無効な場合は新規ルームの`translations`を空配列にする
- display_orderはモデル既定値の0で作成
- 論理削除されていない`FloorTag`から、`source_floor_tag`に実際の親IDを持つ`RoomTag`を作成
- 作成した`RoomTag`に対応する有効なフロアAI解析設定を、作成時のルーム設定へ1回だけコピーする。以後のフロア設定変更は自動同期しない
- 対象フロアの`FloorQuickTextGroup`と`FloorQuickTextItem`を`RoomQuickTextGroup`と`RoomQuickTextItem`へコピー
- MEDIA_PATH配下のフロアID/ルームIDにディレクトリを作成
- 作成処理全体はトランザクションではない。タグ・AI解析設定の初期作成に失敗した場合、作成済みの対象を可能な範囲で削除するが、ルーム・単語・メディアディレクトリが残る場合がある

### POST /api/room/update

ルームを更新する。

#### 認証・権限

- JWT必須
- `Administrator`、対象フロアを作成した`Editor`、または対象フロアの`FloorMember`
- `RoomMember`であることだけでは更新権限にならない

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - title: 文字列（1〜100文字）, 必須
  - description: 文字列（200文字以内）またはnull, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
  - image_name: 文字列（timestamp_MongoIdを基部とするファイル名）またはnull, 必須
  - guest_reaction_only: 真偽値, 必須
  - member_only: 真偽値, 必須
  - room_display_hidden: 真偽値, 必須
  - notification: 真偽値, 必須
  - external_sns_button: 真偽値, 必須

#### レスポンス

- 200 OK
- body: 更新後ルーム
- userにはユーザID、username、image_nameを含む

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN（対象フロアの管理権限がない）
- 404: NOT_FOUND（対象ルームまたは所属フロアが存在しない、または論理削除済み）

#### データ更新・通知

- 公開から`member_only=true`へ変更した後、既存Socketを再評価する。ゲストと権限を失ったユーザへ`ACCESS_REVOKED`（`room_restricted`）を通知して切断し、認可済みユーザは維持する。Socket処理の例外はDB更新成功を失敗へ変えない

- ルームの指定項目とupdated_atを更新
- Google Translateが有効で、タイトル、説明、言語のいずれかが変わった場合は、フロアの対象言語へタイトルと説明を再翻訳する。無効な場合は保存済みの`translations`を保持する
- 画像の検証と旧画像の削除は[画像の更新](#画像の更新)に従う

### POST /api/room/update/roomdisplayhidden

対象フロアに属する全ルームの表示・非表示を一括更新する。

#### 認証・権限

- JWT必須
- `Administrator`、対象フロアを作成した`Editor`、または対象フロアの`FloorMember`

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - room_display_hidden: 真偽値, 必須

#### レスポンス

- 200 OK
- body:
  - matched: 数値（条件に一致した件数）
  - modified: 数値（実際に変更された件数）

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN（対象フロアの管理権限がない）
- 404: NOT_FOUND（対象フロアが存在しない、または論理削除済み）

#### データ更新・通知

- 対象フロアに属し、delete_flgがfalseのルームのroom_display_hiddenを一括更新

### POST /api/room/update/displayorder

対象フロアのルーム表示順を一括更新する。

#### 認証・権限

- JWT必須
- `Administrator`、対象フロアを作成した`Editor`、または対象フロアの`FloorMember`

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - displayorders: 配列, 必須。空配列も許可
  - displayorders.*._id: 文字列(MongoId), 必須
  - displayorders.*.display_order: 数値（0以上の整数）, 必須

#### レスポンス

- 200 OK
- body: 200（JSONの数値）

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN（対象フロアの管理権限がない）
- 404: NOT_FOUND（対象フロアが存在しない、または論理削除済み）

#### データ更新・通知

- displayordersの各要素について、指定したフロアに属し、delete_flgがfalseのルームだけを更新
- 指定したルームが存在しない、論理削除済み、または別フロアに属する場合、その要素は更新せず処理を継続

### POST /api/room/delete

ルームを論理削除する。

#### 認証・権限

- JWT必須
- `Administrator`、対象フロアを作成した`Editor`、または対象フロアの`FloorMember`
- `RoomMember`であることだけでは削除権限にならない

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: 論理削除後のルーム
- floorとuserはIDとして返し、関連情報への展開は行わない

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN（対象フロアの管理権限がない）
- 404: NOT_FOUND（対象ルームまたは所属フロアが存在しない、または論理削除済み）

#### データ更新・通知

- delete_flgをtrueにし、updated_atとdeleted_atを現在日時へ更新
- ルームに属する投稿、タグ、単語、ルームのAI解析設定などは連動して削除しない
- 有効なルームAI解析設定が存在しても削除できる。設定は対象ルームが論理削除中は利用されず、ルーム復元後に既存状態のまま再び利用対象になる
- 削除への状態変更成功後、対象ルームの全Socketへ`ACCESS_REVOKED`（`room_deleted`）を通知して切断する。Socket処理の例外はDB更新成功を失敗へ変えない

### GET/POST /api/room/management/paginate

サイト管理者がルーム一覧をページング取得する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- GET:
  - query:
    - page: 数値（1以上）, 必須
    - search: 文字列（100文字以内）, 必須
    - floor_id: 文字列（MongoId）, 任意
    - delete_flg: 真偽値を表す`true`または`false`, 任意
- POST:
  - body:
    - page: 数値（1以上）, 必須
    - search: 文字列（100文字以内）またはnull, 必須
    - floor_id: 文字列（MongoId）, 任意
    - delete_flg: 真偽値, 任意
- searchが空でない文字列の場合は、タイトルまたは説明を大文字・小文字を区別せず部分一致で検索する
- floor_idを指定した場合は、そのフロアに属するルームだけを返す
- delete_flgがfalseの場合は有効ルーム、trueの場合は論理削除済みルームだけを返し、省略時は両方を返す

#### レスポンス

- 200 OK
- body: 1ページ10件のページング結果
  - docs: delete_flgの条件に一致するルームの配列。delete_flg省略時は論理削除済みも含む
  - total: 数値
  - limit: 数値
  - pages: 数値
  - page: 数値
  - pagingCounter: 数値
  - hasPrevPage: 真偽値
  - hasNextPage: 真偽値
  - prevPage: 数値またはnull
  - nextPage: 数値またはnull
- docsのuserにはユーザIDとusername、floorにはフロアID、title、delete_flgを含む
- docsはcreated_atの降順

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN

### POST /api/room/management/update

サイト管理者がルーム情報を更新する。論理削除済みのルームも、削除状態を維持したまま更新対象にできる。削除状態の変更は専用APIを使用する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - title: 文字列（1〜100文字）, 必須
  - description: 文字列（200文字以内）またはnull, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
  - image_name: 文字列（timestamp_MongoIdを基部とするファイル名）またはnull, 必須
  - guest_reaction_only: 真偽値, 必須
  - member_only: 真偽値, 必須
  - room_display_hidden: 真偽値, 必須
  - notification: 真偽値, 必須
  - external_sns_button: 真偽値, 必須
  - delete_flg: 真偽値, 必須。更新対象について呼出元が取得済みの削除状態を期待値として送る

#### レスポンス

- 200 OK
- body: 更新後ルーム
- userにはユーザID、username、image_nameを含む

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象ルームまたは所属フロアが存在しない）
- 409: CONFLICT（delete_flgの期待状態不一致、または条件付き更新の競合）

#### データ更新・通知

- 公開から`member_only=true`へ変更した後、既存Socketを再評価する。ゲストと権限を失ったユーザへ`ACCESS_REVOKED`（`room_restricted`）を通知して切断し、認可済みユーザは維持する。Socket処理の例外はDB更新成功を失敗へ変えない

- ルームの指定項目とupdated_atを更新する。delete_flgとdeleted_atは変更しない
- 読み取り後に削除状態が変わった場合も、delete_flgを条件にした更新により内容を上書きせず409を返す
- Google Translateが有効で、title、description、langのいずれかが変わった場合は、所属フロアのtarget_langsへtranslationsを再生成する。変更がない場合、またはGoogle Translateが無効な場合は既存translationsを保持する
- 画像の検証と旧画像の削除は[画像の更新](#画像の更新)に従う
- 製品内の操作履歴は記録しない

### POST /api/room/management/delete-state

サイト管理者がルームの論理削除状態だけを変更する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - delete_flg: 真偽値, 必須。trueは論理削除、falseは復元

#### レスポンス

- 200 OK
- body: 状態変更後のルーム
- 状態変更の有無にかかわらず、userにはユーザID、username、image_name、floorにはフロアID、title、delete_flgを含む
- すでに要求した状態である場合はDBを更新せず、関連情報を展開した保存済みルームを返す

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象ルームが存在しない）
- 409: CONFLICT（復元に必要な有効フロアが存在しない、または条件付き状態更新の競合）

#### データ更新・通知

- title、description、画像名、翻訳、表示設定などの通常項目は変更せず、delete_flg、deleted_at、updated_atだけを変更する
- 論理削除時はdeleted_atを現在日時へ設定し、復元時はnullへ戻す
- 有効なルームAI解析設定が存在しても削除できる。設定は対象ルームが論理削除中は利用されず、ルーム復元後に既存状態のまま再び利用対象になる
- 復元時は、ルームが直接所属するフロアが存在し、かつ論理削除されていないことを必要とする
- ルームに属する投稿、`RoomTag`、ルーム単語、ルームのAI解析設定などの状態は連動して変更しない
- delete_flgを条件に原子的に状態を更新し、読み取り後の競合では上書きせず409を返す
- 削除への状態変更成功後、対象ルームの全Socketへ`ACCESS_REVOKED`（`room_deleted`）を通知して切断する。復元時や同じ状態の再送では切断しない。Socket処理の例外はDB更新成功を失敗へ変えない

## 関連資料

### 実装

- `backend/middlewares/ensureJsonWebToken.js`
- `backend/middlewares/ensureAdminUser.js`
- `backend/validates/base.validate.js`
- `backend/validates/media.validate.js`
- `backend/validates/room.validate.js`
- `backend/validates/user.validate.js`
- `backend/services/_shared/activeResource.js`
- `backend/services/_shared/floorAccess.js`
- `backend/services/_shared/updateHelpers.js`
- `backend/models/Room.js`
- `backend/models/Chat.js`
- `backend/models/RoomTag.js`
- `backend/models/RoomQuickTextGroup.js`
- `backend/models/RoomQuickTextItem.js`
- `backend/routes/room/room.route.js`
- `backend/controllers/room/room.controller.js`
- `backend/services/room/room.service.js`
- `backend/services/_shared/paginationHelpers.js`
- `backend/services/analysis/settings/referenceIntegrity.js`

### テスト

- `backend/tests/unit/services/room/room.service.test.js`
- `backend/tests/integration/routes/floor-room.crud.int.test.js`
- `frontend/tests/e2e/specs/flows/room/room.crud.e2e.js`
- `backend/tests/unit/routes/room/room.route.test.js`
- `backend/tests/unit/validates/room.validate.test.js`
