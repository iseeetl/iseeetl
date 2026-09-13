# タイムラインAPI：文字起こし・PushFilter・管理

## 概要

認証、入室権限、プッシュ通知、メディアの扱いは[タイムラインAPI共通仕様](timeline.md)を参照してください。

## API

### POST /api/chat/transcription/audio

音声ファイルを文字起こしする。
`EXTERNAL_OPENAI_ENABLED=true`かつ必要なOpenAI設定が揃う場合だけ利用できる。同じフラグは設定駆動AI解析にも適用されるが、解析設定の閲覧・編集条件ではない。

#### 認証・権限

- JWT必須
- ルームアクセス判定を適用し、メンバー限定ルームでは`Administrator`、対象フロアを作成した`Editor`、フロアメンバー、ルームメンバーのいずれかだけが利用可能
- 対象フロアでキック中のユーザは利用不可

#### リクエスト

- ボディ (multipart/form-data):
  - file: ファイル, 必須
  - room_id: 文字列(MongoId), 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
- ファイルは最大 6MB。許可 MIME: `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/mp4`, `audio/x-m4a`, `audio/webm`, `audio/ogg`, `audio/aac`

#### レスポンス

- 200 OK
- body: `{ text: string }`

#### エラー

- 400: INVALID_PARAMS / INVALID_FILE / INVALID_FILE_TYPE / FILE_REQUIRED
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED（メンバー限定ルームの権限不足、キック中、またはJWT不備）
- 413: FILE_TOO_LARGE
- 500: TRANSCRIPTION_FAILED
- 503: EXTERNAL_FEATURE_DISABLED（`feature: openaiTranscription`。multipart アップロードより前に拒否）

#### データ更新・通知

- 音声ファイルはメモリ上で処理し、保存しない

### POST /api/chat/pushfilter

プッシュ通知フィルタを作成する。

#### 認証・権限

- JWT必須
- `room_id`のルームについて、通常のルーム入室判定を行う
- 作成者にはJWTのユーザIDを使用する

#### リクエスト

- body:
  - floor_id: 文字列(MongoId), 必須
  - room_id: 文字列(MongoId), 必須
  - conditions: オブジェクト, 必須。次の全項目が必須
    - filterMode: `include` / `exclude`
    - showRange: `all` / `target`
    - keyword: 文字列（200文字以内）またはnull
    - keywordArray: 文字列[]（各200文字以内）
    - logicalOperator: `or` / `and`
    - tags: 文字列(MongoId)[]
    - tagSearchOperator: `or` / `and`
    - noTags: 真偽値
    - animation: 真偽値
    - displayOrder: `{ key: string, display: string }`[]
    - userName: 文字列（20文字以内）またはnull
- conditionsの追加プロパティは拒否せず、そのまま保存する
- ルーム認可には`room_id`を使用する。`floor_id`とルームの所属フロアの一致は確認せず、リクエスト値を`PushFilter`へ保存する
- tagsはMongoId形式だけを検証し、`RoomTag`の存在、論理削除状態、対象フロア・ルームへの所属は確認しない

#### レスポンス

- 200 OK
- body: `{ _id: string(MongoId) }`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED
- 409: CONFLICT（同じユーザ・ルーム・conditionsのフィルタが存在する）
- 503: EXTERNAL_FEATURE_DISABLED（`feature: oneSignalPush`。`PushFilter`作成前に拒否）

#### データ更新・通知

- `PushFilter`を作成する
- Socket.IO通知は送信しない

### PUT /api/chat/pushfilter/:id

プッシュ通知フィルタを更新する。

#### 認証・権限

- JWT必須
- JWTのユーザが所有する`PushFilter`だけを更新できる
- 保存済み`room`について、通常のルーム入室判定を行う

#### リクエスト

- params:
  - id: 文字列(MongoId), 必須
- body:
  - conditions: オブジェクト, 必須。作成APIと同じ制約

#### レスポンス

- 200 OK
- body: `{ _id: string(MongoId) }`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED（所有者でない、ルームへ入室できない、またはJWT不備）
- 404: NOT_FOUND

#### データ更新・通知

- conditionsだけを置換する
- 同じユーザ・ルーム・conditionsを持つ別フィルタとの重複は確認しない
- Socket.IO通知は送信しない

### DELETE /api/chat/pushfilter/:id

プッシュ通知フィルタを削除する。

#### 認証・権限

- JWT必須
- JWTのユーザが所有する`PushFilter`だけを削除できる
- メンバー削除、脱退、キックなどで対象ルームへのアクセス権を失った後も、本人所有の`PushFilter`削除にはルーム認可を要求しない

#### リクエスト

- params:
  - id: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: `{ ok: true }`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED（所有者でない、またはJWT不備）
- 404: NOT_FOUND

#### データ更新・通知

- `PushFilter`を物理削除する
- Socket.IO通知は送信しない

### GET/POST /api/chat/management/paginate

管理者が投稿一覧をページング取得する。

#### 認証・権限

- JWT必須
- 認証後の現在ユーザロールが`Administrator`であること

#### リクエスト

- GET:
  - query:
    - `page`: 整数（1以上）, 必須
    - `search`: 文字列（100文字以内）, 必須。空文字列も許可
- POST:
  - body:
    - `page`: 整数（1以上）, 必須
    - `search`: 文字列（100文字以内）またはnull, 必須。空文字列も許可
- GETではクエリをボディへコピーした後に共通処理を行う

#### レスポンス

- 200 OK
- body: ページング結果
  - `docs`: `Chat[]`
  - `total`: 全件数
  - `pages`: 総ページ数
  - `page`: 現在ページ
  - `limit`: 1ページの件数（10件）
  - `nextPage`, `prevPage`, `pagingCounter`, `hasPrevPage`, `hasNextPage`
- `docs`は`created_at`降順
- フロア・ルームのtitle、投稿・返信・投稿付加情報のユーザ名を展開
- `search`指定時は、大文字小文字を区別せず次を部分一致検索
  - 有効なユーザのユーザ名を基にした投稿者、返信者、投稿付加情報作成者、返信付加情報作成者
  - 投稿または返信のゲスト名

#### エラー

- 400: INVALID_PARAMS（入力不正）
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED（JWT不備、またはロール情報がない）
- 403: FORBIDDEN（`Administrator`以外）

#### 動作上の注意

- 投稿の`delete_flg`を検索条件に含めないため、論理削除済み投稿も一覧へ含む
- 論理削除済みの返信、投稿付加情報、返信付加情報も配列から除外しない
- 返信付加情報のユーザIDは名前検索対象になるが、`replies.supplementaries.user`をpopulateしないため、一覧応答ではユーザ名へ展開しない

### POST /api/chat/management/timeline/estimate

ダウンロード前の概算サイズを返す。

#### 認証・権限

- JWTと現在のサイト管理者権限が必須
- ルームの存在と、指定フロアへの所属を確認する。フロア・ルームの削除状態は取得可否に使用しない

#### リクエスト

- body:
  - `floor_id`、`room_id`: 文字列（MongoId）、必須
  - `type`: `json`または`media`、必須

#### レスポンス

- 200 OK
- body: `{ estimatedBytes, itemCount, type, approximate: true }`
- `estimatedBytes`はバイト単位、`itemCount`は投稿数またはファイル数
- JSONは本体取得と同じ抽出・展開・削除済み子要素の除外を行い、2空白で整形したサイズを投稿ごとに集計する。全件をメモリに保持しない
- ZIPは保存領域のファイルサイズとZIPヘッダ相当分を概算する。シンボリックリンクはリンク自体の長さを数え、リンク先を再帰走査しない
- データ更新と同時点の内容は保証しない。概算値はダウンロードの上限やメモリ使用量を示すものではない

#### エラー

- 400: 入力不正、ルーム不存在、または指定フロアへの所属不一致
- 401: 未認証
- 403: サイト管理者権限がない
- 500: 保存領域が存在しない、または読み取り失敗。本体ダウンロードは開始しない

### POST /api/chat/management/timeline

管理者が指定フロア/ルームのタイムラインを取得する。

#### 認証・権限

- JWT必須
- 認証後の現在ユーザロールが`Administrator`であること

#### リクエスト

- body:
  - `floor_id`: 文字列(MongoId), 必須
  - `room_id`: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- body: `Chat[]`
- 指定フロア・ルームに属する論理削除されていない投稿を`created_at`降順で返す
- フロア・ルームのtitleとdescription、`RoomTag`名、投稿・返信・投稿付加情報のユーザ情報を展開
- 返信付加情報、リアクション、翻訳のユーザは展開せず、ユーザIDのまま返す
- 項目選択を行わないため、ゲストID・ゲスト名、翻訳、リアクション、解析種別、メディアファイル名を含む現行`Chat`スキーマの全項目を返す
- 論理削除済みの返信、投稿付加情報、返信付加情報は配列から除外
- フロアまたはルームが論理削除済みでも取得対象を変えず、論理削除されていない投稿を返す
- ルームが指定フロアに所属することを確認してから投稿を取得する

#### エラー

- 400: INVALID_PARAMS（入力不正、ルームが存在しない、または指定フロアに所属しない）
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED（JWT不備、またはロール情報がない）
- 403: FORBIDDEN（`Administrator`以外）

#### データ更新・通知

- データ更新なし
- Socket.IOイベントとプッシュ通知は送信しない

#### 動作上の注意

- フロアの存在は単独では検証せず、ルームの存在とルームが指定フロアに所属することを検証する
- ページング、期間指定、件数上限、出力スキーマ版、更新中データに対するスナップショット保証はない

### POST /api/chat/management/timeline/media

管理者がタイムラインのメディア一式を ZIP で取得する。

#### 認証・権限

- JWT必須
- 認証後の現在ユーザロールが`Administrator`であること

#### リクエスト

- body:
  - `floor_id`: 文字列(MongoId), 必須
  - `room_id`: 文字列(MongoId), 必須

#### レスポンス

- 200 OK
- Content-Type: `application/zip`
- Content-Dispositionのファイル名: `timeline_media.zip`
- body: 指定フロア・ルームのメディアディレクトリを格納したZIPストリーム

#### エラー

- 400: INVALID_PARAMS（入力不正、ルームが存在しない、または指定フロアに所属しない）
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED（JWT不備、またはロール情報がない）
- 403: FORBIDDEN（`Administrator`以外）
- 500: INTERNAL_SERVER_ERROR（対象ディレクトリが存在しない、またはZIP生成・送信に失敗）

#### データ更新・通知

- ZIPを一時ファイルへ保存せず、レスポンスへ直接ストリーミング
- クライアント切断時はZIP生成を中止
- Socket.IOイベントとプッシュ通知は送信しない

#### 動作上の注意

- ルームの存在と指定フロアへの所属関係を検証するが、フロア・ルームの論理削除状態はZIP取得可否へ使用しない
- ディレクトリ内のファイルを一括格納するため、DBから参照されていないファイルや論理削除済みデータに由来するファイルも含む場合がある

### POST /api/chat/management/delete

管理者が投稿、返信、投稿付加情報、返信付加情報の論理削除状態を切り替える。

#### 認証・権限

- JWT必須
- 認証後の現在ユーザロールが`Administrator`であること

#### リクエスト

- body:
  - `post_id`: 文字列(MongoId), 必須
  - `reply_id`: 文字列(MongoId), 任意
  - `supplement_id`: 文字列(MongoId), 任意
  - `delete_flg`: 真偽値, 必須
- 対象はIDの組み合わせで決まる
  - `reply_id`と`supplement_id`を指定: 返信付加情報
  - `reply_id`だけを指定: 返信
  - `supplement_id`だけを指定: 投稿付加情報
  - どちらも省略: 投稿

#### レスポンス

- 200 OK
- body: 更新後の`Chat`
- ユーザやタグは展開せず、論理削除済みデータも除外しない

#### エラー

- 400: INVALID_PARAMS（入力不正、または更新対象を確定できない）
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED（JWT不備、またはロール情報がない）
- 403: FORBIDDEN（`Administrator`以外）
- 404: NOT_FOUND（投稿、返信、または付加情報が存在しない）

#### データ更新・通知

- 対象の`delete_flg`をリクエスト値へ変更し、`updated_at`を現在日時へ更新
- `delete_flg`がtrueの場合は`deleted_at`を現在日時、falseの場合はnullへ変更
- 論理削除へ変更した場合、対象に直接設定された画像、動画、字幕、音声ファイルを、他の有効なデータから参照されていない場合に削除。参照確認に失敗した場合は保持する
- Socket.IO通知を行わず、製品内の操作履歴も記録しない

#### 削除・復元するデータの範囲

- `delete_flg=false`への復元対象はDB上の本文、タグ、メディアファイル名等と削除状態であり、物理削除済みのメディアファイルは復元しない
- ファイルが物理削除されている場合、復元後も画像を表示できず、動画・音声を再生できない

#### 動作上の注意

- 投稿または返信を論理削除しても、内包する付加情報のメディアファイルは削除しない
- 親要素の`delete_flg`を確認しないため、投稿や返信を論理削除したまま子要素だけを復元できる

## 関連資料

### 実装

- `backend/routes/timeline/management.route.js`
- `backend/services/timeline/management.service.js`
- `backend/services/timeline/pushFilter.service.js`
- `backend/services/timeline/transcription.service.js`
- `backend/middlewares/ensureAdminUser.js`

### テスト

- `backend/tests/unit/routes/timeline/management.route.test.js`
- `backend/tests/integration/routes/timeline.transcription.route.int.test.js`
- `backend/tests/integration/routes/timeline.pushFilter.route.int.test.js`
- `backend/tests/integration/routes/timeline.management.route.int.test.js`
