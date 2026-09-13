# フロアAPI

## 概要

フロアの取得・作成・更新・削除と、管理者向けの状態変更を提供します。

フロアのデータ構造と論理削除は [ドメインモデル](../../domain-model.md)、ロールの解決順と操作権限は [ロール・権限仕様](../../roles-and-permissions.md)、JWTとエラー応答の共通形式は [REST API共通規約](../api-conventions.md) を参照してください。

`floor_display_hidden`は一覧表示を制御する値であり、アクセス権限ではありません。フロア詳細APIは、非表示のフロアも取得対象にします。
JWT必須APIでは、トークン発行時のロールではなく、リクエスト時点の有効なユーザから再取得した現在ロールを使用します。
認証時にJWTのユーザが存在しない、論理削除済み、またはセッションバージョンが一致しない場合は401 `TOKEN_INVALID`を返します。

## 共通条件

- 作成、通常更新、表示一括更新、削除、管理更新、管理状態変更は、操作者と変更内容の操作履歴を製品内へ記録しない

### Google Translateの有効条件

- Google Translateが無効な場合、新規フロアはリクエストの`target_langs`を使用せず、`target_langs`と`translations`を空配列で作成する。初期作成する`FloorTag`とフロア単語の翻訳も空配列になる
- Google Translateが無効な場合、通常更新と管理更新は保存済みの`target_langs`と`translations`を保持し、配下リソースの再翻訳を行わない
- 有効状態は[外部機能の有効状態API](capabilities.md)の`googleTranslate`を参照する

### 更新時の処理

通常更新と管理更新では、次の順に処理する。

- Google Translateが有効で、タイトル・説明・原文言語・対象言語のいずれかが変わった場合は、タイトルと説明を再翻訳する
- フロア情報を保存する
- `image_name`が変わった場合は、変更前の画像を削除する。画像が既にない場合や削除に失敗した場合も、更新は成功として扱う
- Google Translateが有効で対象言語が変わった場合は、論理削除されていない`FloorTag`、対象フロアの単語、配下のルーム、`RoomTag`、ルーム単語も再翻訳する

配下の再翻訳に失敗してエラー応答となった場合も、保存済みのフロア情報は元に戻さない。Google Translateが無効な場合は保存済みの対象言語・翻訳を保持し、再翻訳しない。

### ページング応答

ページング結果は次の項目を返します。

- docs: フロアの配列
- total: 数値
- limit: 数値
- pages: 数値
- page: 数値
- pagingCounter: 数値
- hasPrevPage: 真偽値
- hasNextPage: 真偽値
- prevPage: 数値またはnull
- nextPage: 数値またはnull

## API

### POST /api/floor/guest/paginate

ゲスト向けに、表示対象のフロア一覧をページング取得する。

#### 認証・権限

- 不要

#### リクエスト

- body:
  - page: 数値（1以上）, 必須
  - search: 文字列（100文字以内）またはnull, 必須
- searchが空でない文字列の場合は、タイトルまたは説明を大文字・小文字を区別せず部分一致で検索する

#### レスポンス

- 200 OK
- body: 1ページ9件のページング結果
  - docs: floor_display_hiddenがtrueではなく、delete_flgがfalseのフロアの配列
  - docsのuser: ユーザID、username、image_name
- docsはcreated_atの降順

#### エラー

- 400: INVALID_PARAMS

### POST /api/floor/paginate

ログインユーザ向けに、ロールとメンバー関係に応じたフロア一覧をページング取得する。

#### 認証・権限

- JWT必須
- `Administrator`: 論理削除されていない全フロア
- `Editor`: 表示対象の全フロア、自分がメンバーである非表示フロア、自分が作成したフロア
- その他のユーザ: 表示対象の全フロアと、自分がメンバーである非表示フロア

#### リクエスト

- body:
  - page: 数値（1以上）, 必須
  - search: 文字列（100文字以内）またはnull, 必須
- searchが空でない文字列の場合は、タイトルまたは説明を大文字・小文字を区別せず部分一致で検索する

#### レスポンス

- 200 OK
- body: 1ページ9件のページング結果
  - docs: 認証/認可欄の条件を満たし、delete_flgがfalseのフロアの配列
  - docsのuser: ユーザID、username、image_name
- docsはcreated_atの降順

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED

### POST /api/floor/role

ログイン中ユーザの対象フロアにおけるロールを取得する。

#### 認証・権限

- JWT必須

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - role: 文字列（`Administrator` / FloorEditor / `FloorMember` / `Author`）
- 判定順は`Administrator`、フロア作成者本人の`Editor`、`FloorMember`、`Author`

#### エラー

- 400: INVALID_PARAMS（入力不正、フロアが存在しない・論理削除済み、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: TOKEN_INVALID / TOKEN_EXPIRED

### POST /api/floor/detail

フロア詳細を取得する。非表示フロアも取得対象とする。

#### 認証・権限

- 不要

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: delete_flgがfalseのフロア
- userはユーザIDとして返し、ユーザ情報への展開は行わない

#### エラー

- 400: INVALID_PARAMS
- 404: NOT_FOUND（対象フロアが存在しない、または論理削除済み）

### POST /api/floor/create

フロアを作成する。

#### 認証・権限

- JWT必須
- 現在ロールが`Administrator`または`Editor`

#### リクエスト

- body:
  - title: 文字列（1〜100文字）, 必須
  - description: 文字列（200文字以内）またはnull, 必須
  - floor_display_hidden: 真偽値, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
  - target_langs: 文字列[], 必須。空配列可、最大16件。各要素は[対応言語コード](../api-conventions.md#言語コード)とし、前後空白除去・小文字化後に重複を除外する

#### レスポンス

- 200 OK
- body: 作成済みフロア
- userにはユーザID、username、image_nameを含む

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION（許可されていないロール、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- Google Translateが有効な場合は、フロアを作成してタイトルと説明の対象言語への翻訳を試行する。無効な場合は`target_langs`と`translations`を空配列にする
- 論理削除されていない`CategoryTag`から、`source_category_tag`に実際の親IDを持つ`FloorTag`を作成
- 作成した`FloorTag`に対応する有効な共通AI解析設定を、作成時のフロア設定へ1回だけコピーする。以後の共通設定変更は自動同期しない
- 管理用単語のグループと項目を`FloorQuickTextGroup`と`FloorQuickTextItem`へコピー
- MEDIA_PATH配下にフロアIDのディレクトリを作成
- 作成処理全体はトランザクションではない。タグ・AI解析設定の初期作成に失敗した場合、作成済みの対象を可能な範囲で削除するが、フロア・単語・メディアディレクトリが残る場合がある

### POST /api/floor/update

フロアを更新する。

#### 認証・権限

- JWT必須
- `Administrator`、または現在ロールが`Editor`である対象フロアの作成者

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - title: 文字列（1〜100文字）, 必須
  - description: 文字列（200文字以内）またはnull, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
  - target_langs: 文字列[], 必須。空配列可、最大16件。各要素は[対応言語コード](../api-conventions.md#言語コード)とし、前後空白除去・小文字化後に重複を除外する
  - image_name: 文字列（timestamp_MongoIdを基部とするファイル名）またはnull, 必須
  - floor_display_hidden: 真偽値, 必須

#### レスポンス

- 200 OK
- body: 更新後フロア
- userにはユーザID、username、image_nameを含む

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION（対象フロアが存在しない・論理削除済み、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN（対象フロアの更新権限がない）

#### データ更新・通知

- フロアの指定項目とupdated_atを更新
- 翻訳と旧画像の削除は[更新時の処理](#更新時の処理)に従う

### POST /api/floor/update/floordisplayhidden

対象となる全フロアの表示・非表示を一括更新する。

#### 認証・権限

- JWT必須
- `Administrator`: 論理削除されていない全フロアを更新
- `Editor`: 自分が作成し、論理削除されていないフロアだけを更新

#### リクエスト

- body:
  - floor_display_hidden: 真偽値, 必須

#### レスポンス

- 200 OK
- body:
  - matched: 数値（条件に一致した件数）
  - modified: 数値（実際に変更された件数）

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION（許可されていないロール、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- 対象フロアのfloor_display_hiddenを一括更新

### POST /api/floor/delete

フロアを論理削除する。

#### 認証・権限

- JWT必須
- `Administrator`、または現在ロールが`Editor`である対象フロアの作成者

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: 論理削除後のフロア
- userにはユーザID、username、image_nameを含む

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION（対象フロアが存在しない・論理削除済み、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN（対象フロアの削除権限がない）

#### データ更新・通知

- delete_flgをtrueにし、updated_atとdeleted_atを現在日時へ更新
- フロアに属するルーム、タグ、単語、フロア／ルームのAI解析設定は連動して削除しない
- 有効なフロア／ルームのAI解析設定が存在しても削除できる。設定は対象フロアが論理削除中は利用されず、フロア復元後に既存状態のまま再び利用対象になる
- 削除への状態変更成功後、対象フロアの全Socketへ`ACCESS_REVOKED`（`floor_deleted`）を通知して切断する。Socket処理の例外はDB更新成功を失敗へ変えない

### GET /api/floor/management/paginate

サイト管理者がフロア一覧を削除状態の条件付きでクエリ指定によりページング取得する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- query:
  - page: 数値（1以上）, 必須
  - search: 文字列（100文字以内）, 必須。空文字列可
  - delete_flg: 真偽値を表す`true`または`false`, 任意
- searchが空でない文字列の場合は、タイトルまたは説明を大文字・小文字を区別せず部分一致で検索する
- delete_flgがfalseの場合は有効フロア、trueの場合は論理削除済みフロアだけを返し、省略時は両方を返す

#### レスポンス

- 200 OK
- body: 1ページ10件のページング結果
  - docs: delete_flgの条件に一致するフロアの配列。delete_flg省略時は論理削除済みも含む
  - docsのuser: ユーザIDとusername
- docsはcreated_atの降順

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN

### POST /api/floor/management/paginate

JSONボディで管理用のフロア一覧を取得します。認証・認可、検索条件、応答、エラー、副作用は[GET版](#get-apifloormanagementpaginate)と共通です。入力は次のとおりです。

| 項目 | 必須 | JSONボディの型・条件 | GET版との差 |
| --- | --- | --- | --- |
| `page` | はい | 1以上の数値 | GETはクエリの数値文字列 |
| `search` | はい | 100文字以内の文字列または`null`。空文字列可 | GETは文字列。検索なしは`search=` |
| `delete_flg` | いいえ | 真偽値 | GETは文字列`true`または`false` |

### POST /api/floor/management/detail

サイト管理者がタイムラインデータ回収対象のフロアを、論理削除状態にかかわらず1件取得する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - `_id`: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: 指定フロア。論理削除済みの場合も返す
- userにはユーザID、username、image_nameを含む

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

### POST /api/floor/management/update

サイト管理者がフロア情報を更新する。論理削除済みのフロアも、削除状態を維持したまま更新対象にできる。削除状態の変更は専用APIを使用する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - title: 文字列（1〜100文字）, 必須
  - description: 文字列（200文字以内）またはnull, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
  - target_langs: 文字列[], 必須。空配列可、最大16件。各要素は[対応言語コード](../api-conventions.md#言語コード)とし、前後空白除去・小文字化後に重複を除外する
  - image_name: 文字列（timestamp_MongoIdを基部とするファイル名）またはnull, 必須
  - floor_display_hidden: 真偽値, 必須
  - delete_flg: 真偽値, 必須。更新対象について呼出元が取得済みの削除状態を期待値として送る

#### レスポンス

- 200 OK
- body: 更新後フロア
- userにはユーザID、username、image_nameを含む

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象フロアが存在しない）
- 409: CONFLICT（delete_flgの期待状態不一致、または条件付き更新の競合）

#### データ更新・通知

- フロアの指定項目とupdated_atを更新する。delete_flgとdeleted_atは変更しない
- 読み取り後に削除状態が変わった場合も、delete_flgを条件にした更新により内容を上書きせず409を返す
- 翻訳と旧画像の削除は[更新時の処理](#更新時の処理)に従う

### POST /api/floor/management/delete-state

サイト管理者がフロアの論理削除状態だけを変更する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - delete_flg: 真偽値, 必須。trueは論理削除、falseは復元

#### レスポンス

- 200 OK
- body: 状態変更後のフロア
- 状態変更の有無にかかわらず、userにはユーザID、username、image_nameを含む
- すでに要求した状態である場合はDBを更新せず、関連情報を展開した保存済みフロアを返す

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象フロアが存在しない）
- 409: CONFLICT（条件付き状態更新の競合）

#### データ更新・通知

- title、description、画像名、翻訳、表示設定などの通常項目は変更せず、delete_flg、deleted_at、updated_atだけを変更する
- 論理削除時はdeleted_atを現在日時へ設定し、復元時はnullへ戻す
- 有効なフロア／ルームのAI解析設定が存在しても削除できる。設定は対象フロアが論理削除中は利用されず、フロア復元後に既存状態のまま再び利用対象になる
- 配下のルーム、`FloorTag`、フロア単語、フロア／ルームのAI解析設定の状態は連動して変更しない
- delete_flgを条件に原子的に状態を更新し、読み取り後の競合では上書きせず409を返す
- 削除への状態変更成功後、対象フロアの全Socketへ`ACCESS_REVOKED`（`floor_deleted`）を通知して切断する。復元時や同じ状態の再送では切断しない。Socket処理の例外はDB更新成功を失敗へ変えない

## 関連資料

### 実装

- `backend/middlewares/ensureJsonWebToken.js`
- `backend/middlewares/ensureAdminUser.js`
- `backend/validates/base.validate.js`
- `backend/validates/floor.validate.js`
- `backend/validates/media.validate.js`
- `backend/validates/user.validate.js`
- `backend/services/_shared/activeResource.js`
- `backend/services/_shared/floorAccess.js`
- `backend/services/_shared/updateHelpers.js`
- `backend/models/Floor.js`
- `backend/models/FloorMember.js`
- `backend/models/FloorTag.js`
- `backend/models/FloorQuickTextGroup.js`
- `backend/models/FloorQuickTextItem.js`
- `backend/routes/floor/floor.route.js`
- `backend/controllers/floor/floor.controller.js`
- `backend/services/floor/floor.service.js`
- `backend/services/_shared/paginationHelpers.js`
- `backend/services/analysis/settings/referenceIntegrity.js`

### テスト

- `backend/tests/unit/services/floor/floor.service.test.js`
- `backend/tests/integration/routes/floor-room.crud.int.test.js`
- `backend/tests/unit/routes/floor/floor.route.test.js`
- `backend/tests/unit/validates/floor.validate.test.js`
- `backend/tests/integration/models/floor.int.test.js`
