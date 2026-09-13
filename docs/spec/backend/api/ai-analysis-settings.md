# AI解析設定API

## 概要

共通のJWT、JSON、成功・エラー応答形式は[REST API共通規約](../api-conventions.md)、データ・実行契約は[AI解析設定・実行仕様](../../ai-analysis.md)を参照してください。共通・フロア・ルームのAI解析設定を管理します。設定が0件の場合は空の一覧を返します。

## 共通条件

### 共通項目

#### 入力

| 項目 | 契約 |
| --- | --- |
| `analysis_kind` | `vision`、`audioScene`、`speech`、`video`、`conversation` |
| `additional_prompt` | 必須の文字列。最大2000文字・8000バイト以内。`speech`は224バイト以内。[数え方](../../ai-analysis.md#文字数容量の数え方)を参照 |
| `result_user` | 有効なユーザのObjectId。共通設定では`Administrator`、フロア／ルーム設定では`Administrator`または対象フロアを作成した`Editor`が送信する必須項目 |
| `revision` | 更新・削除対象の現在の`revision`。1以上の安全な整数。競合防止に使う |

各エンドポイントは許可していない項目を400 `INVALID_PARAMS`として拒否します。フロア／ルーム設定の作成・更新では、許可されたロールの違いにかかわらず`result_user`を必要とします。

#### 設定レスポンス

設定オブジェクトは次を返します。

- `_id`、`scope`、`analysis_kind`、`additional_prompt`、`revision`。設定自身の`delete_flg`は返さない
- `tag`: `_id`、`name`、`lang`、`translations[].lang`／`name`
- `result_user`: `_id`、`username`、`image_name`
- フロア設定は`floor`、ルーム設定は`floor`と`room`
- 親からコピーした設定は、来歴として`source.setting_id`とコピー時の`source.revision`を返す。来歴がない場合は`source: null`

参照先のタグまたはユーザが存在しない保存済み設定も安全に公開し、該当する`tag`または`result_user`は`{ "_id": "" }`として返します。文字列化したオブジェクトや参照先の非公開項目は返しません。論理削除済みの参照先が存在する場合は公開項目を維持し、共通設定の管理ページングに限って参照先の`delete_flg`も返します。

外部サービスへのリクエスト、認証値、ユーザのメールアドレス、AI付加情報の内部メタデータ、内部の作成者・更新者は返しません。一覧順はタグ基準名、`analysis_kind`、`_id`の昇順です。

### 初期ユーザの応答

各範囲の`default-result-user`は、`SUPPORT_USER_ID`に対応する未削除ユーザの`_id`、`username`、`image_name`だけを返します。未設定、不正なID、存在しないユーザ、論理削除済みユーザの場合は200とJSONの`null`を返します。設定範囲の権限確認は、環境変数の設定有無にかかわらず実施します。

新規作成画面の初期選択用であり、DB更新や外部サービスへの送信は行いません。取得に失敗した場合はエラー応答とし、未設定として扱いません。作成・更新APIの`result_user`は引き続き必須です。

### 主なエラーと副作用

| 状態 | 主な条件 |
| --- | --- |
| 400 | 許可リスト・入力形式違反、適用範囲不一致、操作対象の無効・削除済み直接参照、追加指示などの保存時の入力条件違反 |
| 401 | JWTなし・無効 |
| 403 | 対象適用範囲を管理できないユーザ |
| 404 | 指定した設定が存在しない |
| 409 | revision競合、有効な設定の重複、上限、削除状態競合 |

作成・更新・削除は、対象の設定レコードだけを変更します。

- 既存の子設定へ同期せず、過去の投稿・返信のAI解析を起動しない。
- フロア・ルーム作成時にコピーした子設定の`source`は来歴として保持する。親の削除や子の更新・削除を制限しない。共通設定の物理削除後もコピー元IDとコピー時のリビジョンを維持する。
- フロア・ルーム設定を物理削除しても、既存の投稿・返信、タグ、保存済みAI結果は削除しない。
- 外部サービスへの送信開始後は、送信時の設定に基づく結果を1件保存する場合がある。

## API

### 共通設定

共通設定は`Administrator`専用です。

#### POST /api/aianalysissetting/management

有効な共通設定を配列で返します。ボディは空オブジェクトだけを許可します。

#### POST /api/aianalysissetting/management/default-result-user

ボディは空オブジェクトだけです。管理者に[初期ユーザの応答](#初期ユーザの応答)を返します。

#### GET /api/aianalysissetting/management/paginate

| クエリ | 必須 | 契約 |
| --- | ---: | --- |
| `page` | はい | 先頭0を含まない1以上の十進文字列 |
| `search` | はい | 前後空白除去後100文字以内の文字列。検索しない場合も`search=`を送る |

有効な設定だけを返します。旧版で論理削除された設定は含めません。検索対象はタグの基準名・翻訳名、解析種別、結果ユーザのユーザ名です。追加指示とメールアドレスは検索しません。正規表現の制御文字は通常文字として扱います。

- 取得条件と並び順: 有効な設定を対象に、共通タグとユーザを参照して検索する。タグ基準名、`analysis_kind`、`_id`の昇順に並べ、日本語の照合規則を使用する。検索、全件数の算出、ページの切り出しは、公開形式へ変換する前にDBの単一集約処理で行う。
- ページング応答: 1ページ10件。`docs`、`total`、`limit`、`pages`、`page`、`pagingCounter`、`hasPrevPage`、`hasNextPage`、`prevPage`、`nextPage`を返す。
- 参照先の欠損・削除: 参照先がない設定も一覧に含め、欠損参照は`{ "_id": "" }`とする。参照先が存在する場合は、論理削除済みを含め`docs[].tag.delete_flg`と`docs[].result_user.delete_flg`を真偽値で返す。欠損参照にはこの項目を付けない。

#### POST /api/aianalysissetting/management/create

ボディは`category_tag`、`analysis_kind`、`additional_prompt`、`result_user`です。有効な`CategoryTag`とユーザを必要とし、作成時revisionは1です。同じタグ・解析種別の有効設定、適用範囲上限超過は409です。

#### POST /api/aianalysissetting/management/update

ボディは`_id`、`category_tag`、`analysis_kind`、`additional_prompt`、`result_user`、`revision`です。有効な設定の内容を更新し、リビジョンを1増やします。revision不一致、有効な設定の重複は409です。存在しない設定、旧版で論理削除された設定は404です。`delete_flg`は受け付けません。

#### POST /api/aianalysissetting/management/delete

ボディは`_id`、`revision`です。現在のリビジョンと一致した場合だけレコードを物理削除し、`{ "_id": "削除した設定のID" }`を返します。削除時にリビジョンは増やしません。競合は409、対象なし・再削除は404です。復元APIはありません。

コピー元として参照されていても削除できます。コピー済み設定、タグ、結果ユーザ、投稿・返信、保存済みAI結果は変更しません。参照先が欠損・論理削除済みの場合や、旧版で論理削除された共通設定も削除できます。

### フロア設定

`Administrator`または対象フロアを作成した`Editor`が利用できます。

#### POST /api/flooraianalysissetting

ボディは`floor_id`だけです。有効な設定だけを配列で返し、論理削除済み設定は返しません。

#### POST /api/flooraianalysissetting/default-result-user

ボディは`floor_id`だけです。対象フロアを管理する権限を確認して[初期ユーザの応答](#初期ユーザの応答)を返します。

#### POST /api/flooraianalysissetting/create

ボディは`floor_id`、`floor_tag`、`analysis_kind`、`additional_prompt`、`result_user`です。有効な`FloorTag`と結果ユーザを必要とし、親タグ・親設定は参照しません。手動で作成した設定のコピー元の来歴はnullです。

#### POST /api/flooraianalysissetting/update

ボディは`_id`、`floor_id`、`floor_tag`、`analysis_kind`、`additional_prompt`、`result_user`、`revision`です。`Administrator`と対象フロアを作成した`Editor`は結果ユーザを変更できます。revision不一致または有効な設定の重複は409です。

#### POST /api/flooraianalysissetting/delete

ボディは`_id`、`floor_id`、`revision`です。現在のリビジョンが一致した場合だけ物理削除し、`{ "_id": "削除した設定のID" }`を返します。削除時にリビジョンは増やしません。競合は409、対象なし・再削除は404です。ルーム設定がコピー元の来歴として参照していてもフロア設定を削除できます。フロア設定の復元エンドポイントは提供しません。同じフロアタグ・解析種別の設定が再び必要な場合は、新しい設定として作成できます。

#### POST /api/flooraianalysissetting/result-users/search

ボディは`floor_id`と`search`です。`Administrator`または対象フロアを作成した`Editor`だけが利用できます。`search`は前後空白除去後100文字以下の文字列で、有効なユーザのusernameを大文字・小文字を区別しない部分一致で検索します。返却項目、並べ替え、メールアドレス非公開の契約は共通設定用の結果ユーザ検索と同じです。

### ルーム設定

`Administrator`または対象ルームが所属するフロアを作成した`Editor`が利用できます。`floor_id`と、`room_id`から解決したフロアが一致しない場合は400です。

#### POST /api/roomaianalysissetting

ボディは`floor_id`、`room_id`だけです。有効な設定だけを配列で返し、論理削除済み設定は返しません。

#### POST /api/roomaianalysissetting/default-result-user

ボディは`floor_id`、`room_id`だけです。対象ルームが所属するフロアの管理権限とIDの組合せを確認して[初期ユーザの応答](#初期ユーザの応答)を返します。

#### POST /api/roomaianalysissetting/create

ボディは`floor_id`、`room_id`、`room_tag`、`analysis_kind`、`additional_prompt`、`result_user`です。有効な`RoomTag`と結果ユーザを必要とし、親タグ・親設定は参照しません。手動で作成した設定のコピー元の来歴はnullです。

#### POST /api/roomaianalysissetting/update

ボディは`_id`、`floor_id`、`room_id`、`room_tag`、`analysis_kind`、`additional_prompt`、`result_user`、`revision`です。`Administrator`と対象フロアを作成した`Editor`は結果ユーザを変更できます。

#### POST /api/roomaianalysissetting/delete

ボディは`_id`、`floor_id`、`room_id`、`revision`です。現在のリビジョンが一致した場合だけ物理削除し、`{ "_id": "削除した設定のID" }`を返します。削除時にリビジョンは増やしません。競合は409、対象なし・再削除は404です。ルーム設定の復元エンドポイントは提供しません。同じルームタグ・解析種別の設定が再び必要な場合は、新しい設定として作成できます。

#### POST /api/roomaianalysissetting/result-users/search

ボディは`floor_id`、`room_id`、`search`です。`Administrator`または対象ルームが所属するフロアを作成した`Editor`だけが利用でき、`floor_id`とルームから解決したフロアの一致も確認します。検索と返却の契約はフロアのエンドポイントと同じです。

### POST /api/user/ai-analysis-result-users/search

`Administrator`専用です。ボディは`search`だけを許可し、前後空白除去後100文字以下の文字列とします。有効なユーザのusernameを大文字・小文字を区別しない部分一致で検索し、`username`、`_id`の順で順序が一意に定まるように並べ替えします。返却項目は`_id`、`username`、`image_name`だけで、mailは検索も返却もしません。

## 関連資料

### 実装

- `backend/routes/aiAnalysisSetting.route.js`
- `backend/routes/_shared/scopedAIAnalysisSettingRoutes.js`
- `backend/routes/user.route.js`
- `backend/services/analysis/settings/setting.service.js`
- `backend/validates/aiAnalysisSetting.validate.js`

### テスト

- `backend/tests/integration/routes/aiAnalysisSettings.route.int.test.js`
- `backend/tests/unit/routes/aiAnalysisSetting.route.test.js`
- `backend/tests/unit/routes/scopedAIAnalysisSettingRoutes.test.js`
- `backend/tests/unit/services/analysis/settings/setting.service.test.js`
- `backend/tests/unit/validates/aiAnalysisSetting.validate.test.js`
