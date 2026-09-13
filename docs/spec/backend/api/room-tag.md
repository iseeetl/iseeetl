# ルームタグAPI

## 概要

ルームタグの一覧、作成・更新・削除、CSV同期、親階層からの同期を提供します。

ルームタグの所属関係とライフサイクルは [ドメインモデル](../../domain-model.md)、操作できるロールは [ロール・権限仕様](../../roles-and-permissions.md) を参照してください。

## 共通条件

### Google Translateの有効条件

- Google Translateが無効な場合、通常作成とインポートで新規作成する`RoomTag`の`translations`は空配列になる
- 更新、インポート、初期化で同名の既存`RoomTag`を扱う場合、Google Translateが無効なら保存済みの`translations`を保持する
- 初期化で新規作成する`RoomTag`は、Google Translateの有効状態にかかわらず初期化元`FloorTag`の保存済み翻訳を引き継ぐ
- 有効状態は[外部機能の有効状態API](capabilities.md)の`googleTranslate`を参照する

投稿・返信・通知で使用中でも論理削除でき、参照元は変更しません。削除済みタグは管理画面、同名タグのCSV取込、フロアタグからの同期で元のIDのまま復元できます。

### 復元条件

ルームタグを復元するには、所属フロアとルームが存在し、どちらも論理削除されておらず、所属関係が一致していることが必要です。コピー元の`source_floor_tag`は来歴として保持し、参照先の存在・削除状態・所属を復元条件にはしません。

## API

### GET /api/rooms/:room_id/tags

ルームタグ一覧を取得する。公開ルームは匿名・ゲストでも取得でき、メンバー限定ルームはルームへアクセス可能なログインユーザだけが取得できる。

#### 認証・権限

`Authorization`がある場合はユーザJWTを優先し、なければ`X-Guest-Token`を検証します。不正・期限切れのトークンを匿名や別の認証へ切り替えず、`TOKEN_INVALID`／`TOKEN_EXPIRED`を返します。

| 認証状態 | 公開ルーム | メンバー限定ルーム |
| --- | --- | --- |
| 両ヘッダなし | 許可 | `TOKEN_INVALID` |
| 有効なゲストトークン | 許可 | `INVALID_PERMISSION` |
| 有効なユーザJWT | 対象フロアでキック済みなら`FORBIDDEN` | キック済みなら拒否。それ以外は`Administrator`、対象フロアの作成者である現在ロール`Editor`、`FloorMember`、`RoomMember`だけ許可し、所属要件を満たさない場合は`FORBIDDEN` |

この一覧用の任意認証は、リクエストボディへ認証情報を追加せず、メディアアクセスCookieも設定しません。

#### リクエスト

`room_id`をpathに指定する。body・queryは不要。

#### レスポンス

- 200 OK
- body:
  - `RoomTag[]`（`delete_flg: false`のみ）
  - 返却ソート: `order` 昇順、`created_at` 降順

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION（Guest） / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN（通常JWT）
- 404: NOT_FOUND

### POST /api/roomtag/create

ルームタグを作成する。

#### 認証・権限

- JWT必須
- サイト管理者、現在ロールが`Editor`である対象フロアの作成者、または対象フロアの`FloorMember`

#### リクエスト

- body:
  - room_id: 文字列(MongoId), 必須
  - order: 数値（1〜100）, 必須
  - name: 文字列（1〜50文字）, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須

#### レスポンス

- 200 OK
- body:
  - 作成済み `RoomTag`（`translations` 含む）

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- 対象ルームと所属フロアのIDを保持した`RoomTag`を作成
- Google Translateが有効な場合はフロアの対象言語に応じて翻訳を作成し、無効な場合は`translations`を空配列にする

### POST /api/roomtag/update

ルームタグを更新する。

#### 認証・権限

- JWT必須
- サイト管理者、現在ロールが`Editor`である対象フロアの作成者、または対象フロアの`FloorMember`

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - order: 数値（1〜100）, 必須
  - name: 文字列（1〜50文字）, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須

#### レスポンス

- 200 OK
- body:
  - 更新後 `RoomTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `RoomTag`を更新
- Google Translateが有効な場合は`name`または`lang`の変更時に翻訳を再作成し、無効な場合は保存済みの`translations`を保持する

### POST /api/roomtag/delete

ルームタグを削除する。

#### 認証・権限

- JWT必須
- サイト管理者、現在ロールが`Editor`である対象フロアの作成者、または対象フロアの`FloorMember`

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - 論理削除済み `RoomTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND
- 409: CONFLICT（有効なルームAI解析設定から参照中）
  - `error.details`に`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "room-tag" }`を含む

#### データ更新・通知

- `delete_flg`を`true`にし、`updated_at`と`deleted_at`を更新
- 有効なルームAI解析設定の`room_tag`から参照されている場合は削除しない

### POST /api/roomtag/import

ルームタグを CSV で一括登録する。

#### 認証・権限

- JWT必須
- サイト管理者、現在ロールが`Editor`である対象フロアの作成者、または対象フロアの`FloorMember`

#### リクエスト

- body:
  - room_id: 文字列(MongoId), 必須
  - csv: 配列（1〜100行）, 必須
  - 各行: `[order, name]`
  - order: 数値（1〜100）
  - name: 文字列（1〜50文字）
  - 同一CSV内で完全一致するタグ名は重複不可（前後の空白は除去して比較）

#### レスポンス

- 200 OK
- body:
  - インポート後のタグ配列（`RoomTag[]`）

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND
- 409: CONFLICT（CSVにない有効`RoomTag`が有効なルームAI解析設定から直接参照中）
  - `error.details`に`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "room-tag" }`を含む

#### データ更新・通知

- CSVのタグ名から前後の空白を除去し、対象ルームの既存タグ名と完全一致で照合する。Google Translateが有効な場合だけ翻訳を作成する
- 同名の既存タグは`_id`を維持して内容を更新し、論理削除済みの場合は復元する。Google Translateが有効な場合は翻訳も更新し、無効な場合は保存済みの翻訳を保持する
- 新しい名前のタグは新規作成し、CSVにない有効タグは参照制約を満たす場合に論理削除する。物理削除は行わない
- 復元は[復元条件](#復元条件)に従う
- CSVにない有効`RoomTag`が有効なルームAI解析設定の`room_tag`から参照されている場合は、同期を409で拒否して書込みを開始しない
- CSVまたは対象ルームの既存データに同名タグが複数ある場合は`INVALID_PARAMS`とし、同期処理を開始しない

### POST /api/roomtag/init

ルームタグを初期化する。

#### 認証・権限

- JWT必須
- サイト管理者、現在ロールが`Editor`である対象フロアの作成者、または対象フロアの`FloorMember`

#### リクエスト

- body:
  - room_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - 初期化後のタグ配列（`RoomTag[]`）

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND
- 409: CONFLICT（初期化元にない有効`RoomTag`が有効なルームAI解析設定から直接参照中）
  - `error.details`に`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "room-tag" }`を含む

#### データ更新・通知

- 論理削除されていない`FloorTag`を基に、対象ルームの既存タグとタグ名の完全一致で照合する
- 同名の既存タグは`_id`を維持して更新・復元する。Google Translateが有効な場合は元の`FloorTag`の翻訳を反映し、無効な場合は`RoomTag`に保存済みの翻訳を保持する。新規タグは初期化元の保存済み翻訳を引き継ぐ
- 新しい名前のタグは新規作成し、初期化元にない有効タグは参照制約を満たす場合に論理削除する。物理削除は行わない
- 復元は[復元条件](#復元条件)に従う
- 初期化元にない有効`RoomTag`が有効なルームAI解析設定の`room_tag`から参照されている場合は、初期化を409で拒否して書込みを開始しない
- 初期化元または対象ルームの既存データに同名タグが複数ある場合は`INVALID_PARAMS`とし、同期処理を開始しない

### GET/POST /api/roomtag/management/paginate

管理者がルームタグ一覧をページング取得する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- GET:
  - query:
    - page: 数値（1以上）, 必須
    - search: 文字列（100文字以内）, 任意
    - delete_flg: 真偽値を表す`true`または`false`, 任意
- POST:
  - body:
    - page: 数値（1以上）, 必須
    - search: 文字列（100文字以内）またはnull, 任意
    - delete_flg: 真偽値, 任意
- searchが空でない文字列の場合は、正規表現の制御文字を通常文字として扱い、名前を大文字・小文字を区別せず部分一致で検索する
- delete_flgがfalseの場合は有効`RoomTag`、trueの場合は論理削除済み`RoomTag`だけを返し、省略時は両方を返す

#### レスポンス

- 200 OK
- body:
  - 1ページ10件のページング結果
  - docs、total、limit、pages、page、pagingCounter、hasPrevPage、hasNextPage、prevPage、nextPage
  - delete_flg省略時は論理削除済みの`RoomTag`も含む
  - docsのuserにはユーザIDとusername、floorにはフロアID、title、delete_flgを含む
  - docsのroomにはルームID、title、delete_flg、所属フロアのIDを含む
  - 保存済みの継承元を参照解決できる場合、docsの`source_floor_tag`には`FloorTag`のID、name、delete_flg、所属フロアのIDを含む。保存値がない場合または参照先が存在しない場合はnullである
  - docsはcreated_atの降順

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN

### POST /api/roomtag/management/update

管理者がルームタグの編集項目を更新する。削除状態の変更は専用APIを使用する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - order: 数値（1〜100）, 必須
  - name: 文字列（1〜50文字）, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
  - delete_flg: 真偽値, 必須。更新対象について呼出元が取得済みの削除状態を期待値として送る

#### レスポンス

- 200 OK
- body:
  - 更新後の`RoomTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象`RoomTag`、直接所属するルーム、またはそのフロアが存在しない）
- 409: CONFLICT（delete_flgの期待状態不一致、または条件付き更新の競合）

#### データ更新・通知

- `order`、`name`、`lang`、`updated_at`を更新する。`delete_flg`と`deleted_at`は変更しない
- 読み取り後に削除状態が変わった場合も、delete_flgを条件にした更新により内容を上書きせず409を返す
- Google Translateが有効で`name`または`lang`が変わった場合は、所属フロアの`target_langs`へ翻訳を再生成する。無効な場合は保存済みの`translations`を保持する

### POST /api/roomtag/management/delete-state

管理者が`RoomTag`の論理削除状態だけを変更する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - delete_flg: 真偽値, 必須。trueは論理削除、falseは復元

#### レスポンス

- 200 OK
- body:
  - 状態変更後の`RoomTag`
  - すでに要求した状態である場合はDBを更新せず、保存済み`RoomTag`を返す

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象`RoomTag`が存在しない）
- 409: CONFLICT（有効なルームAI解析設定から参照中、復元に必要な直接親が有効でない、または条件付き状態更新の競合）
  - 直接参照中の場合は`error.details`に`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "room-tag" }`を含む

#### データ更新・通知

- `order`、`name`、`lang`、翻訳などの編集項目は変更せず、`delete_flg`、`deleted_at`、`updated_at`だけを変更する
- 論理削除時は`deleted_at`を現在日時へ設定し、復元時は`null`へ戻す
- 有効なルームAI解析設定の`room_tag`から参照されている場合は削除しない
- 復元は[復元条件](#復元条件)に従う
- delete_flgを条件に原子的に状態を更新し、読み取り後の競合では上書きせず409を返す

## 関連資料

### 実装

- `backend/routes/room/roomTag.route.js`
- `backend/controllers/room/roomTag.controller.js`
- `backend/services/room/roomTag.service.js`
- `backend/services/_shared/tagServiceHelpers.js`
- `backend/services/analysis/settings/referenceIntegrity.js`

### テスト

- `backend/tests/unit/services/room/roomTag.service.test.js`
- `backend/tests/unit/routes/room/roomTag.route.test.js`
- `backend/tests/integration/routes/room.tag.route.int.test.js`
