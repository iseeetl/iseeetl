# ルーム配下のタイムラインAPI

## 概要

指定したルームの投稿・返信・付加情報を取得・作成・更新・削除します。

## 共通条件

### URL・認証・認可

基準となるURLは`/api/rooms/:room_id/timeline/posts`で、以下では`base`と表記します。通常JWTを`Authorization: Bearer <JWT>`で指定します。対象IDは24桁のMongoIdとし、URLのパスに指定します。実行者は認証情報から、所属フロアはルームから取得します。

| 操作 | メソッド・パス | 成功応答 |
| --- | --- | --- |
| 作成 | `POST` base | `201`、作成した投稿 |
| 部分更新 | `PATCH` base`/:post_id` | `200`、更新した投稿 |
| 論理削除 | `DELETE` base`/:post_id` | `204`、本文なし |

有効なユーザ・ルーム・フロアが存在し、フロアでキックされていないことが必要です。メンバー限定ルームでは管理者、対象フロアを作成したフロア編集ユーザ、フロアメンバー、ルームメンバーのいずれかである必要があります。更新・削除は、入室条件に加えて管理者、対象フロアを作成したフロア編集ユーザ、フロアメンバー、投稿者本人のいずれかに限ります。ルームメンバーであることだけでは他者の投稿を編集できません。

### 作成・部分更新のリクエスト本文

以下の項目を持つJSONオブジェクトを受け付けます。未定義の項目は指定できません。フロア・ルームの表示名、ユーザ情報、`keyup`、`target_langs`、URLと重複するID、日時、翻訳、返信などは送信しません。DELETEではリクエスト本文は不要で、項目を含む本文は拒否します。

| 項目 | 型・条件 | 省略・解除 |
| --- | --- | --- |
| `content` | 400文字以内の文字列またはnull。空文字・空白だけは不可 | 作成時省略はnull。PATCH省略は維持、nullは本文解除 |
| `lang` | [対応言語コード](../api-conventions.md#言語コード) | 作成時必須、PATCH省略は維持。null不可 |
| `room_tags` | 有効な対象RoomTagのID配列、最大100件。重複は除去 | 作成時省略は空配列、PATCH省略は維持、空配列は全解除 |
| `animation` | `move-and-erase`またはnull | 作成時省略はnull、PATCH省略は維持、nullは解除 |
| `media` | 下記のオブジェクトまたはnull | PATCH省略は維持、nullは全種類を解除 |

作成・更新後の投稿には、本文または添付ファイルが必要です。更新では、権限を確認して取得した現在の値に指定項目を反映して検証し、指定項目だけを保存します。変更のないPATCHは、検証後に現在の投稿を返します。保存日時・内部の更新番号は変更せず、通知も行いません。

本文だけの更新例:

```json
{ "content": "更新した本文" }
```

#### メディア

`media`は`image`、`video`、`audio`を持つオブジェクトです。各種類を省略した場合は現在の設定を維持し、nullを指定した場合はその種類全体を解除します。種類ごとの項目も、省略時は維持し、nullで解除します。同時に設定できる添付ファイルは1種類までで、種類を切り替える際は以前の種類の解除も指定します。

| 種類 | 項目 |
| --- | --- |
| `image` | `file_name`、`thumbnail_name`、`caption` |
| `video` | `file_name`、`thumbnail_name`、`subtitle` |
| `audio` | `file_name`、`title`、`description` |

`subtitle`は`file_name`と`original_name`を持つオブジェクトで、nullを指定すると字幕全体を解除します。`caption`・`title`・`description`は200文字以内、`original_name`は100文字以内、保存ファイル名は255文字以内です。画像とサムネイル、動画とサムネイル、字幕の保存名と元名は、それぞれ対で指定します。保存名・所属・発行者・参照保護は[メディア共通検証](timeline.md#メディア参照の共通検証)に従います。変更しない既存メディアは保持します。

### 投稿の成功応答

`_id`、`room_id`、`user`、`content`、`lang`、`room_tags`、`animation`、`media`、`created_at`、`updated_at`を返します。IDは文字列、日時はISO 8601形式です。`user`には`_id`・`username`・`image_name`を含み、利用できない作成者はnullで返します。`media`は上記3種類の項目を持ち、未設定の種類はnullです。

DB内部の更新番号、翻訳、返信・付加情報などの配列は含みません。画面のタイムライン更新にはSocket.IOイベントを使用します。

### エラーと副作用

- `400 INVALID_PARAMS`: 未定義の項目、形式不正、空の投稿、ルームタグ・メディアの不整合。
- `401 TOKEN_INVALID / TOKEN_EXPIRED`: 通常JWTが無効、期限切れ、現在のユーザ・セッションが無効。
- `403 FORBIDDEN`: ルーム入室または対象投稿の編集権限がない。
- `404 NOT_FOUND`: 有効なルーム・フロア、またはそのルーム内の有効な投稿がない。
- `409 CONFLICT`: 検証から保存までの競合を検出した。最新情報を取得して再編集する。

投稿処理では、スパムワードの置換、メディアの整理、`POST_CREATE`・`POST_UPDATE`・`POST_DELETE`のルーム配信を行います。プッシュ通知・翻訳・AI解析は、外部機能の有効状態に従います。翻訳先はフロア設定と接続中クライアントの言語から決定します。詳細は[タイムライン共通契約](timeline.md)と[投稿のデータ更新・通知](timeline-posts.md)を参照してください。

[v1 API](v1.md)は、専用の認証・入力・親投稿JSON応答・エラー形式を使用します。保存と通知には本APIと共通のサービスを使用し、通常画面向けSocket.IO通知も一度だけ行います。

## API

### 返信・付加情報

作成には、以下のパスへの`POST`を使用します。更新・削除では末尾に対象IDを追加し、更新は`PATCH`、削除はリクエスト本文なしの`DELETE`を使用します。成功ステータス、必要な入力、部分更新・nullによる解除、メディア検証、エラー形式は上記投稿APIと共通です。

| 対象 | パス（`base`からの相対パス） | 対象ID |
| --- | --- | --- |
| 返信 | `/:post_id/replies` | `:reply_id` |
| 投稿付加情報 | `/:post_id/supplements` | `:supplement_id` |
| 返信付加情報 | `/:post_id/replies/:reply_id/supplements` | `:supplement_id` |

親投稿・親返信と操作対象が有効で、URLのパスに指定した親子関係が一致していることが必要です。作成は対象ルームへ入室できるログインユーザに許可します。更新・削除は管理者、対象フロアを作成したフロア編集ユーザ、フロアメンバー、対象の返信・付加情報の作成者本人に限ります。

返信は投稿と同じ入力項目に加え、真偽値の`notify_all`を任意で指定できます。省略・falseは通常の配信、trueはルーム内の画面に返信通知を表示します。内容の変更がなくtrueだけを送った場合も通知しますが、DBの保存日時や内容は変更しません。通知イベントIDと通知日時はSocket.IOの送信データにだけ付加し、DBへ保存しません。

付加情報のリクエスト本文は`content`・`lang`・`media`だけを受け付け、`room_tags`・`animation`・`notify_all`は指定できません。作成時は`lang`が必須です。作成・更新時に省略した項目は、投稿と同じ扱いになります。本文または添付ファイルが必要です。

成功応答では、操作した返信・付加情報を返します。投稿の応答と共通の項目に`post_id`を加え、返信付加情報には`reply_id`も含めます。付加情報には`room_tags`・`animation`を含めません。親投稿全体や、同じ親に属するほかの返信・付加情報は返しません。v1は親投稿JSONを返します。

Socket.IO配信は`REPLY_CREATE/UPDATE/DELETE`、`SUPPLEMENT_CREATE/UPDATE/DELETE`、`REPLY_SUPPLEMENT_CREATE/UPDATE/DELETE`を使用します。外部機能の有効状態に応じた通知・翻訳・解析の条件は[返信](timeline-replies.md)、[投稿付加情報](timeline-post-supplements.md)、[返信付加情報](timeline-reply-supplements.md)を参照してください。

### タグの置換

`PUT` base`/:post_id/tags`、`PUT` base`/:post_id/replies/:reply_id/tags`で対象のタグを置き換えます。リクエスト本文は必須の`room_tags`配列だけで、空配列を指定すると全解除します。同じタグの組み合わせを送った場合はDB更新・通知を行いません。

対象ルームへ入室できるログインユーザに許可し、本文の編集権限は要求しません。成功応答は`200`と`{post_id, room_tags}`で、返信の場合は`reply_id`も含みます。配列の各要素はタグIDの文字列です。タイムライン全体の更新には`TAG_UPDATE`通知を使用します。

### 一覧・検索・詳細

| 操作 | メソッド・パス | 入力 |
| --- | --- | --- |
| 通常一覧 | `GET` base | クエリパラメータの`from`、`to`だけ |
| 複合検索 | `POST` base`/search` | JSONの`from`、`to`、`globalServerQuery`、`serverQuery`だけ |
| 詳細 | `GET` base`/:post_id` | クエリパラメータなし |

成功時は`200`で、一覧・検索は親投稿の配列、詳細は親投稿JSONを返します。返信・付加情報・翻訳・リアクションも含み、論理削除された子データは除外します。更新APIと異なり、タイムライン表示に必要なデータをまとめて返します。

日時はISO 8601形式の文字列で指定します。`from`は作成日時の上限（含まない）、`to`は下限（含む）です。作成日時の降順で通常10件、`to`を指定した範囲取得では最大200件を返します。

検索の共通条件`globalServerQuery`とカラム条件`serverQuery`は、両方を満たす投稿を取得します。各オブジェクトで指定できる項目は次のとおりです。

| 項目 | 型・指定できる値 |
| --- | --- |
| `filterMode` | `include`または`exclude` |
| `logicalOperator`、`tagSearchOperator` | `or`または`and` |
| `keywordArray`、`tags` | 文字列配列。100件以内で、各要素は1～200文字 |
| `keyword` | 1～200文字の文字列 |
| `userName` | 1～20文字の文字列 |
| `noTags`、`animation` | 真偽値 |

任意項目のnullは省略として扱います。未定義の項目、型の違い、snake_caseによる別名の指定は拒否します。検索対象と条件の意味は[検索条件](timeline-posts.md#一覧検索)を参照してください。

### ルームタグ一覧

`GET /api/rooms/:room_id/tags`で取得します。リクエスト本文・クエリパラメータに対象IDや表示情報は送信しません。成功時は`200`で、表示順に並んだ`RoomTag`配列を返します。認証と入室条件は[ルームタグAPI](room-tag.md)を参照してください。

### メディアのアップロード

フロントエンドは[ルーム配下のアップロードAPI](upload.md#ルーム配下のタイムラインアップロード)を使用します。URLのルームIDから保存先を決定するため、フロアIDの送信は不要です。

## 関連資料

### テスト

- `backend/tests/integration/routes/timeline.resource-post.int.test.js`
- `backend/tests/unit/validates/timelineResource.test.js`
- `frontend/tests/unit/components/timeline/dialogs/EditPostDialog.spec.js`
- `frontend/tests/unit/components/timeline/dialogs/EditReplyDialog.spec.js`
- `frontend/tests/unit/components/timeline/dialogs/EditSupplementDialog.spec.js`
