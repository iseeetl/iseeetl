# ファイルアップロードAPI

## 概要

この文書では、ファイル受信、保存、変換、未添付メディア破棄のAPI契約を扱う。レスポンスとエラーの共通形式は[REST API共通規約](../api-conventions.md)、各モデルのメディア項目は[ドメインモデル](../../domain-model.md)を参照する。

[外部連携用v1 API](v1.md#アップロード)も、同じアップロード・未添付メディア破棄のサービスと検証処理を使用する。

## 共通条件

### 認証・権限

- `/api/fileupload`の全エンドポイントで`ensureJsonWebToken`が必須（通常JWT必須）。
- `/api/v1/upload`の全エンドポイントで`ensureJsonWebTokenV1`と`ensureDeveloperUserV1`が必須（development JWT必須）。
- 対象ユーザ、フロア、ルームを使う認可判定では、リクエスト時点の有効なレコードと現在ロールを使用する。
- タイムライン系のルームアクセス判定では、キック済みユーザを拒否する。公開ルームは有効なユーザが利用でき、メンバー限定ルームは`Administrator`、現在ロールが`Editor`であるフロア作成者、フロアメンバー、ルームメンバーのいずれかに限る。

### リクエスト形式

- 画像・動画・音声アップロード: `multipart/form-data`
- 未添付メディア破棄: `application/json`
- `/api/fileupload`でフロア／ルームを対象にするアップロードは、本文受信前の認可に使用するIDをクエリへ指定する。multipartボディにも対象IDを指定し、クエリと一致しない場合は拒否する。
- 認証、クエリ形式、対象フロア／ルームの存在と権限を確認してからmultipartを受信する。

### 保存先

- プロフィール画像: `PROFILE_PATH/<user_id>/`
- フロア画像: `MEDIA_PATH/<floor_id>/`
- ルーム/タイムラインの画像・動画・音声: `MEDIA_PATH/<floor_id>/<room_id>/`
- 画像は認可後にメモリで受信し、実画像検証の成功後に保存する。
- 動画、音声、字幕は認可後に、認可済みのルームとその所属フロアから決定したディレクトリへ受信する。multipart ボディのIDは保存先の決定に使用しない。後続の検証や変換に失敗した場合は受信ファイルを削除する。
- 全媒体で元のファイル名を使用せず、同時ファイルアップロード間の衝突を避けるためのランダム要素を含むサーバ生成名を使用する。

### 公開URL

- プロフィール画像: `/profile/<user_id>/<image_name>`
- フロア画像: `/media/<floor_id>/<file_name>`（公開）
- ルーム/タイムライン媒体: `/media/<floor_id>/<room_id>/<file_name>`（ユーザまたはゲストのメディアアクセスCookieと現在のルーム権限が必要）
- 物理保存先（`MEDIA_PATH` / `PROFILE_PATH`）と公開URLは分離して運用する。
- `/profile` と `/media` の静的応答には `X-Content-Type-Options: nosniff` と、能動コンテンツの実行を禁止するCSPを付与する。

### ファイル種別・上限

- 画像: `IMAGE_LIMIT = 3MB`
  - 申告MIMEによる事前検証: `image/png`, `image/jpg`, `image/jpeg`
  - 実内容: PNG署名またはJPEG署名を持ち、`sharp`で対応形式としてデコードできること
  - 展開後画素数: `IMAGE_MAX_PIXELS = 40,000,000` 以下
  - デコード後にPNGまたはJPEGへ再エンコードし、メタデータを引き継がない
  - 元ファイル名と元拡張子は保存形式の判定に使用しない
  - 保存拡張子は実形式からサーバが `.png` または `.jpg` を決定する
- 動画: `VIDEO_LIMIT = 150MB`
  - MIME: `video/mp4`, `video/ogv`, `video/webm`, `video/quicktime`, `application/octet-stream`
  - 拡張子: `.mp4`, `.ogv`, `.webm`, `.mov`
- 音声: `AUDIO_LIMIT = 6MB`
  - MIME: `audio/x-m4a`, `audio/m4a`, `audio/mp4`, `audio/webm`, `audio/ogg`, `audio/mpeg`, `audio/mp3`, `audio/wav`
  - 申告MIMEだけを検証し、元の拡張子をサーバ生成名へ引き継ぐ
- 字幕: `SUBTITLE_LIMIT = 2MB`
  - MIME: `application/x-subrip`, `text/vtt`, `application/octet-stream`
  - 拡張子: `.srt`, `.vtt`
- multipart件数:
  - プロフィール画像: ファイル 1件、ボディ項目 0件
  - フロア画像: ファイル 1件、ボディ項目 1件
  - ルーム／タイムライン画像・音声: ファイル 1件、ボディ項目 2件
  - タイムライン動画: ファイル 2件まで、ボディ項目 2件
  - 未定義ファイル項目、上限を超えるファイル／項目／partを拒否する

### エラー（共通）

- `400 INVALID_PARAMS`
  - 必須ファイル未指定
  - MIME/拡張子不正
  - 画像署名、デコード結果、実形式、画素数が画像要件を満たさない
  - MongoID 不正、対象不整合（該当フロア/ルーム不存在）
  - クエリとmultipart ボディの対象IDが不一致
  - ファイル／項目／part件数、項目サイズ、ファイル項目名が不正
- `401 TOKEN_INVALID` / `TOKEN_EXPIRED`
  - JWTの欠落、不正、期限切れ、またはトークンに対応する有効なユーザが存在しない
- `401 INVALID_PERMISSION`
  - タイムライン系でキック済み、またはルームアクセス権不足（`authorizeRoomAccess`）
- `403 FORBIDDEN`
  - フロア画像またはルーム画像の更新権限不足
- `413 FILE_TOO_LARGE`
  - 各ファイルが対応するサイズ上限を超えた場合
  - `video_subtitle_file` が 2MB 超過時

### タイムラインへのメディア設定

- アップロードAPIが返したファイル名を、投稿、返信、投稿付加情報、返信付加情報へ設定できる。
- 作成時、および更新でファイル名を変更する時は、次をすべて満たす必要がある。満たさない場合は `400 INVALID_PARAMS` を返す。
  - ファイル名に含まれるユーザIDがJWTのユーザIDと一致する。
  - 対象フロア／ルームの保存ディレクトリに実ファイルが存在する。
  - 項目ごとに許可された拡張子であり、画像・動画は本体とサムネイルの組が一致する。
  - 有効なルーム画像、投稿、返信、投稿付加情報、返信付加情報から同じファイル名が参照されていない。
- 更新で既存のファイル名を変更しない場合は、再検証しない。
- メディアを更新または削除する時は、物理削除の直前に同じルーム内の有効な参照を再確認する。別レコードから参照中の場合、または参照確認に失敗した場合はファイルを保持する。
- multipart受信後に字幕上限、必須ファイル、ID、認可、変換等で失敗した場合は、受信済みの原本・字幕と生成途中の派生ファイルを削除する。
- アップロード成功後、投稿等が4xxで拒否されて未保存が確定した場合、フロントエンドは未添付メディア破棄APIを呼ぶ。破棄APIはJWTユーザが発行したファイル名だけを受け付け、有効なDB参照があるファイルを保持する。
- 通信断、5xx、ブラウザ終了など保存成否が確定できない場合は、保存済みデータを誤って削除しないため即時破棄しない。この場合に残る未添付ファイルの定期回収は未実装であり、自動回収を保証しない。
- ファイル名で参照を管理する。同じファイルに対する複数リクエストの同時添付は防止できない。

## API

### ルーム配下のタイムラインアップロード

ログインユーザのタイムラインでは、`/api/rooms/:room_id/timeline/uploads`を基準URL（以下`base`）として使用する。通常JWTを必須とし、URLのルームへのアクセス権を確認してからmultipartを受信する。フロア・ユーザはサーバで特定し、本文への表示情報・IDの指定やクエリパラメータは受け付けない。

| 操作 | メソッド・パス | body | 成功 |
| --- | --- | --- | --- |
| 画像 | `POST` base`/image` | multipartの`image_file`だけ | `201` |
| 動画・字幕 | `POST` base`/video` | multipartの`video_file`、`video_subtitle_file`。少なくとも一つ必要 | `201` |
| 音声 | `POST` base`/audio` | multipartの`audio_file`だけ | `201` |
| 未添付ファイルの一括破棄 | `POST` base`/discard` | JSONの`file_names`配列だけ（1〜6件） | `200` |

アップロードのファイル名応答、容量・形式・変換・保存・後始末は本書の共通条件に従う。破棄は全件の名前・発行者・参照状態を検証してから削除し、`discarded_file_names`・`retained_file_names`を返す。参照中ファイルは保持する。

不正入力は`400 INVALID_PARAMS`、JWT無効は`401`、ルームへのアクセス権不足は`403 FORBIDDEN`、有効なルーム・フロアがない場合は`404 NOT_FOUND`。ファイル容量など固有のエラーは本書の共通契約に従う。

v1固有のURL・認証・入力・成功ステータスは[外部連携用v1 API](v1.md#アップロード)を参照する。

### POST /api/fileupload/profile/image

プロフィール画像をアップロードする。

#### 認証・権限

- JWT 必須

#### リクエスト

- ボディ (multipart/form-data):
  - image_file: ファイル, 必須

#### レスポンス

- 200 OK
- body:
  - image_name: 文字列（保存されたファイル名）

#### データ更新・通知

- 実画像検証と再エンコードの成功後に、PROFILE_PATH配下へサーバ生成名で保存

### POST /api/fileupload/floor/image

フロア画像をアップロードする。

#### 認証・権限

- JWT 必須。有効なユーザであること。
- `Administrator`、または対象フロアを作成した`Editor`だけが実行可能（フロア更新APIと同一）。

#### リクエスト

- ボディ (multipart/form-data):
  - _id: 文字列(MongoId), 必須
  - image_file: ファイル, 必須
- query:
  - floor_id: 文字列(MongoId)、必須。ボディ `_id`と同一

#### レスポンス

- 200 OK
- body:
  - image_name: 文字列（保存されたファイル名）

#### データ更新・通知

- multipart画像はメモリで受信し、有効なユーザ・対象フロア・更新権限を確認してから実画像検証と再エンコードを行う。
- すべて成功した場合だけ、MEDIA_PATH/<floorId>配下へサーバ生成名で保存する。認可失敗時は物理ファイルを保存しない。

### POST /api/fileupload/room/image

ルーム画像をアップロードする。

#### 認証・権限

- JWT 必須。有効なユーザであること。
- `Administrator`、対象フロアを作成した`Editor`、または対象フロアの`FloorMember`だけが実行可能（ルーム更新APIと同一）。

#### リクエスト

- ボディ (multipart/form-data):
  - floor_id: 文字列(MongoId), 必須
  - _id: 文字列(MongoId), 必須
  - image_file: ファイル, 必須
- query:
  - floor_id: 文字列(MongoId)、必須。ボディ `floor_id`と同一
  - room_id: 文字列(MongoId)、必須。ボディ `_id`と同一

#### レスポンス

- 200 OK
- body:
  - image_name: 文字列（保存されたファイル名）

#### データ更新・通知

- multipart画像はメモリで受信し、有効なユーザ・ルーム所属フロア・入力floor_idとの整合性・更新権限を確認してから実画像検証と再エンコードを行う。
- すべて成功した場合だけ、MEDIA_PATH/<floorId>/<roomId>配下へサーバ生成名で保存する。認可失敗時は物理ファイルを保存しない。

### POST /api/rooms/:room_id/timeline/uploads/image

タイムライン画像をアップロードする。

#### 認証・権限

- JWT 必須
- `authorizeRoomAccess`による対象ルームのアクセス許可が必要

#### リクエスト

ルームIDはURLのパスに指定し、フロアIDはサーバで取得する。クエリパラメータは受け付けない。multipartの`image_file`だけ。

#### レスポンス

- 201 Created
- body:
  - image_name: 文字列（保存されたファイル名）
  - image_thumbnail_name: 文字列（表示用サムネイル）

#### データ更新・通知

- ルーム認可と実画像検証・再エンコードの成功後に、本体とサムネイルを`MEDIA_PATH/<floorId>/<roomId>`配下へ保存する。
- サムネイルは縦横400px以内に収め、元画像より拡大せず、実形式に対応するPNGまたはJPEGとして保存する。

### POST /api/rooms/:room_id/timeline/uploads/video

タイムライン動画または動画字幕をアップロードする。既存動画を維持した字幕だけの追加・置換にも使用する。

#### 認証・権限

- JWT 必須
- `authorizeRoomAccess`による対象ルームのアクセス許可が必要

#### リクエスト

ルームIDはURLのパスに指定し、フロアIDはサーバで取得する。クエリパラメータは受け付けない。multipartの`video_file`・`video_subtitle_file`。少なくとも一つ必要。

#### レスポンス

- 201 Created
- body:
  - video_name: 文字列 | null（保存された元動画名。字幕だけの場合は`null`）
  - video_thumbnail_name: 文字列 | null（保存されたサムネイル名。字幕だけの場合は`null`）
  - video_subtitle_name: 文字列 | null
    - 字幕が有効に受理された場合はファイル名、
      無効なら `null`

#### データ更新・通知

- 動画と字幕は認可後に`MEDIA_PATH/<floorId>/<roomId>`配下へ受信する。
- 動画指定時は約1秒地点のフレームから、回転情報を反映し長辺720px以内に収めたサムネイルを生成する。
- 字幕指定時は同ディレクトリへ字幕を保存する。字幕だけの場合は動画変換とサムネイル生成を行わない。
- 字幕が許可MIMEまたは拡張子を満たさず除外された場合、有効な動画があれば字幕名を`null`として動画処理を続行する。無効な字幕だけを指定した場合は必須ファイル不足として拒否する。
- 認可・入力検証・変換に失敗した場合は、受信済みの動画・字幕と生成途中のサムネイルを削除する。
- 投稿、返信、付加情報で新しい字幕名への更新が成功した後、同じ動画に設定されていた旧字幕を参照確認の上で物理削除する。

### POST /api/rooms/:room_id/timeline/uploads/audio

タイムライン音声をアップロードする。

#### 認証・権限

- JWT 必須
- `authorizeRoomAccess`による対象ルームのアクセス許可が必要

#### リクエスト

ルームIDはURLのパスに指定し、フロアIDはサーバで取得する。クエリパラメータは受け付けない。multipartの`audio_file`だけ。

#### レスポンス

- 201 Created
- body:
  - audio_name: 文字列（保存後のファイル名）
    - 拡張子が mp3 ならそのまま、非 mp3 は変換後の `*.mp3`

#### データ更新・通知

- 音声は認可後に`MEDIA_PATH/<floorId>/<roomId>`配下へ受信する。
- サーバ生成名の拡張子が`.mp3`の場合は、内容のデコードや再変換をせず、そのファイル名を返す。
- `.mp3`以外はffmpegでMP3（libmp3lame、128kbps）へ変換し、変換後のファイル名を返す。変換失敗時は原本と生成途中のファイルを削除する。
- 変換成功後は原本削除処理の完了を待つ。削除失敗は記録せず、成功応答を返すため、原本が残る場合がある。

### POST /api/rooms/:room_id/timeline/uploads/discard

アップロード成功後に投稿、返信、投稿付加情報、返信付加情報の保存が失敗した場合、未添付のタイムラインメディアを破棄する。

#### 認証・権限

- JWT必須
- `authorizeRoomAccess`による現在のルームアクセス権が必要
- 所属フロアは認可済みのルームからサーバで解決する

#### リクエスト

ルームIDはURLのパスに指定し、フロアIDはサーバで取得する。クエリパラメータは受け付けない。JSONの`file_names`配列だけ。1〜6件のファイル名文字列を指定する。

#### レスポンス

- 200 OK
- body:
  - `discarded_file_names`: 文字列[]（未参照のため削除した名前。既に実体がない名前を含む）
  - `retained_file_names`: 文字列[]（DB参照中のため保持した名前）

#### 検証・安全性

- 各ファイル名が管理対象のサーバ生成形式と許可拡張子を満たし、ファイル名内ユーザIDがJWTユーザIDと一致することを確認する。
- フロア／ルームの所属とルームアクセス権を確認する。
- 有効なルーム画像、投稿、返信、各付加情報からの参照を確認する。論理削除済みタイムラインデータのファイルは保持対象にしない。
- 参照確認に失敗した場合は物理削除しない。
- 保存先ディレクトリ外を指すファイル名は拒否する。

#### エラー

- `400 INVALID_PARAMS`: ID、フロア／ルームの所属、ファイル名、件数が不正
- `403 FORBIDDEN`: ルームアクセス権がない
- `500 INTERNAL_SERVER_ERROR`: DB参照確認または物理削除で予期しないエラーが発生

#### データ更新・通知

- DBから参照されていないファイルを`MEDIA_PATH/<floorId>/<roomId>`配下から削除する。
- 既に実体がないファイルも処理済みとして`discarded_file_names`へ含める。
- DBから参照中のファイルは削除せず、`retained_file_names`へ含める。

## 関連資料

### 実装

- `backend/routes/upload.route.js`
- `backend/controllers/upload.controller.js`
- `backend/services/upload.service.js`
- `backend/services/media/discard.service.js`
- `backend/middlewares/uploaders.js`

### テスト

- `backend/tests/unit/routes/upload.route.test.js`
- `backend/tests/integration/routes/upload.media.int.test.js`
- `backend/tests/integration/routes/media.access.int.test.js`
- `backend/tests/unit/middlewares/uploaders.test.js`
- `backend/tests/unit/services/upload/mediaFileName.test.js`
