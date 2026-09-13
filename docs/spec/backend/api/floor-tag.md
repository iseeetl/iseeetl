# フロアタグAPI

## 概要

フロアタグの一覧、作成・更新・削除、CSV同期、親階層からの同期を提供します。

フロアタグの所属関係とライフサイクルは [ドメインモデル](../../domain-model.md)、操作できるロールは [ロール・権限仕様](../../roles-and-permissions.md) を参照してください。

## 共通条件

### Google Translateの有効条件

- Google Translateが無効な場合、新規`FloorTag`の`translations`は空配列になる
- 更新、インポート、初期化で同名の既存`FloorTag`を扱う場合、Google Translateが無効なら保存済みの`translations`を保持する
- 有効状態は[外部機能の有効状態API](capabilities.md)の`googleTranslate`を参照する

### 削除と旧データ

未使用タグは物理削除します。復元APIはありません。旧版で論理削除されたタグは一覧・更新・同期の対象に含めず、自動復元・一括削除もしません。同名のタグが必要な場合は新しいIDで作成します。

## API

### POST /api/floortag/

フロアタグ一覧を取得する。

#### 認証・権限

- JWT必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - `FloorTag[]`（`delete_flg: false` のみ）

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

### POST /api/floortag/create

フロアタグを作成する。

#### 認証・権限

- JWT必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - order: 数値（1〜100）, 必須
  - name: 文字列（1〜50文字）, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須

#### レスポンス

- 200 OK
- body:
  - 作成済み `FloorTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN

#### データ更新・通知

- `FloorTag`を作成
- Google Translateが有効な場合はフロアの対象言語に応じて翻訳を作成し、無効な場合は`translations`を空配列にする

### POST /api/floortag/update

フロアタグを更新する。

#### 認証・権限

- JWT必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - order: 数値（1〜100）, 必須
  - name: 文字列（1〜50文字）, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須

#### レスポンス

- 200 OK
- body:
  - 更新後 `FloorTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

#### データ更新・通知

- `FloorTag`を更新
- Google Translateが有効な場合は`name`または`lang`の変更時に翻訳を再作成し、無効な場合は保存済みの`translations`を保持する

### POST /api/floortag/delete

フロアタグを削除する。

#### 認証・権限

- JWT必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - `{ "_id": "削除したタグのID" }`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND
- 409: CONFLICT（有効なフロアAI解析設定から直接参照中）
  - `error.details`に`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "floor-tag" }`を含む

#### データ更新・通知

- レコードを物理削除する。復元はできない
- 有効なフロアAI解析設定の`floor_tag`から直接参照されている場合は削除しない
- `RoomTag`の`source_floor_tag`はコピー時の来歴であり、有効な`RoomTag`から参照されていても`FloorTag`を削除できる。`RoomTag`を連鎖削除せず、保存済み`source_floor_tag`も変更しない

### POST /api/floortag/import

フロアタグを CSV で一括登録する。

#### 認証・権限

- JWT必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - csv: 配列（1〜100行）, 必須
  - 各行: `[order, name]`
  - order: 数値（1〜100）
  - name: 文字列（1〜50文字）
  - 同一CSV内で完全一致するタグ名は重複不可（前後の空白は除去して比較）

#### レスポンス

- 200 OK
- body:
  - インポート後のタグ配列（`FloorTag[]`）

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 409: CONFLICT（CSVにない有効`FloorTag`が有効なフロアAI解析設定から直接参照中）
  - `error.details`に`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "floor-tag" }`を含む

#### データ更新・通知

- CSVのタグ名から前後の空白を除去し、対象フロアの既存タグ名と完全一致で照合する。Google Translateが有効な場合だけ翻訳を作成する
- 同名の有効な既存タグは`_id`を維持して内容を更新する。Google Translateが有効な場合は翻訳も更新し、無効な場合は保存済みの翻訳を保持する
- 新しい名前のタグは新規作成し、CSVにない有効タグは参照制約を満たす場合に物理削除する
- CSVにない有効`FloorTag`が有効なフロアAI解析設定の`floor_tag`から直接参照されている場合は、同期を409で拒否して書込みを開始しない
- `RoomTag`の`source_floor_tag`は参照制約に使用しない。同期で`FloorTag`を物理削除しても`RoomTag`を連鎖削除せず、保存済み来歴IDを維持する
- CSVまたは対象フロアの有効タグに同名タグが複数ある場合は`INVALID_PARAMS`とし、同期処理を開始しない

### POST /api/floortag/init

フロアタグを初期化する。

#### 認証・権限

- JWT必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body:
  - 初期化後のタグ配列（`FloorTag[]`）

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 409: CONFLICT（初期化元にない有効`FloorTag`が有効なフロアAI解析設定から直接参照中）
  - `error.details`に`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "floor-tag" }`を含む

#### データ更新・通知

- 論理削除されていない`CategoryTag`を基に対象フロアの既存タグとタグ名の完全一致で照合し、Google Translateが有効な場合だけ翻訳を作成する
- 同名の有効な既存タグは`_id`を維持して更新し、新しい名前のタグは新規作成する
- 初期化元にない有効タグは参照制約を満たす場合に物理削除する
- 初期化元にない有効`FloorTag`が有効なフロアAI解析設定の`floor_tag`から直接参照されている場合は、初期化を409で拒否して書込みを開始しない
- `RoomTag`の`source_floor_tag`は参照制約に使用しない。初期化で`FloorTag`を物理削除しても`RoomTag`を連鎖削除せず、保存済み来歴IDを維持する
- 初期化元または対象フロアの有効タグに同名タグが複数ある場合は`INVALID_PARAMS`とし、同期処理を開始しない

### GET/POST /api/floortag/management/paginate

管理者がフロアタグ一覧をページング取得する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- GET:
  - query:
    - page: 数値（1以上）, 必須
    - search: 文字列（100文字以内）, 必須
- POST:
  - body:
    - page: 数値（1以上）, 必須
    - search: 文字列（100文字以内）または null, 必須
- searchが空でない文字列の場合は、名前を大文字・小文字を区別せず部分一致で検索する
- 有効なタグだけを返す。旧引数`delete_flg`を指定した場合は400を返す

#### レスポンス

- 200 OK
- body:
  - 1ページ10件のページング結果
  - docs、total、limit、pages、page、pagingCounter、hasPrevPage、hasNextPage、prevPage、nextPage
  - 旧版で論理削除されたタグは含めない
  - docsのuserにはユーザIDとusername、floorにはフロアID、title、delete_flgを含む
  - 保存済みの継承元を参照解決できる場合、docsの`source_category_tag`には`CategoryTag`のID、name、delete_flgを含む。保存値がない場合または参照先が存在しない場合はnullである
  - docsはcreated_atの降順

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND

### POST /api/floortag/management/update

管理者がフロアタグの編集項目を更新する。削除には専用APIを使用し、更新時の`delete_flg`指定は400で拒否する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - order: 数値（1〜100）, 必須
  - name: 文字列（1〜50文字）, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須

#### レスポンス

- 200 OK
- body:
  - 更新後の`FloorTag`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象`FloorTag`または直接所属するフロアが存在しない）
- 409: CONFLICT（条件付き更新の競合）

#### データ更新・通知

- `order`、`name`、`lang`、`updated_at`を更新する。`delete_flg`と`deleted_at`は変更しない
- 存在しないタグと旧版の削除済みタグは更新しない
- Google Translateが有効で`name`または`lang`が変わった場合は、所属フロアの`target_langs`へ翻訳を再生成する。無効な場合は保存済みの`translations`を保持する

### POST /api/floortag/management/delete

JWTとサイト管理者権限が必要です。ボディは`_id`（MongoId）だけを指定し、`delete_flg`は受け付けません。

- 200: レコードを物理削除し、`{ "_id": "削除したタグのID" }`を返す
- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象なし・再削除）
- 409: CONFLICT（有効なフロアAI解析設定から直接参照中）
  - `error.details`は`{ "reason": "ACTIVE_AI_ANALYSIS_REFERENCE", "resource_type": "floor-tag" }`

復元APIはありません。コピー済みの下位タグ・設定と、そこに保存されたコピー元IDは変更しません。

## 関連資料

### 実装

- `backend/routes/floor/floorTag.route.js`
- `backend/controllers/floor/floorTag.controller.js`
- `backend/services/floor/floorTag.service.js`
- `backend/services/_shared/tagServiceHelpers.js`
- `backend/services/analysis/settings/referenceIntegrity.js`

### テスト

- `backend/tests/unit/services/floor/floorTag.service.test.js`
- `backend/tests/unit/routes/floor/floorTag.route.test.js`
- `backend/tests/integration/routes/floor.tag.route.int.test.js`
- `backend/tests/unit/services/analysis/settings/referenceIntegrity.test.js`
