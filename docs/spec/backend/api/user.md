# ユーザAPI

## 概要

本人のプロフィール・パスワードと、管理者によるユーザ情報・状態の更新を提供します。JWTとエラー応答の共通形式は [REST API共通規約](../api-conventions.md) を参照してください。

## API

### GET /api/user/detail

ログイン中ユーザの詳細を取得する。

#### 認証・権限

- JWT必須

#### リクエスト

- header:
  - Authorization: Bearer JWT

#### レスポンス

- 200 OK
- body:
  - _id: 文字列(MongoId)
  - username: 文字列
  - image_name: 文字列またはnull
  - lang: 文字列またはnull
  - eye_friendly_mode: 真偽値
  - push_enabled: 真偽値
  - reply_push_enabled: 真偽値
  - replied_post_push_enabled: 真偽値

#### エラー

- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 404: NOT_FOUND（認証後の再確認でログインユーザが存在しない、または論理削除済み）

### POST /api/user/update

ログイン中ユーザのプロフィールと表示・通知設定を更新する。

#### 認証・権限

- JWT必須

#### リクエスト

- body:
  - username: 文字列（1〜20文字）, 必須
  - image_name: 文字列（timestamp_MongoIdを基部とするファイル名）またはnull, 必須
  - lang: 文字列（[対応言語コード](../api-conventions.md#言語コード)）, 必須
  - eye_friendly_mode: 真偽値, 必須
  - push_enabled: 真偽値, 必須
  - reply_push_enabled: 真偽値, 必須
  - replied_post_push_enabled: 真偽値, 必須

#### レスポンス

- 200 OK
- body: GET /api/user/detailと同じ項目を持つ更新後ユーザ

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION（認証後の再確認でログインユーザが存在しない、または論理削除済み）
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 503: EXTERNAL_FEATURE_DISABLED（`feature: oneSignalPush`。OneSignal無効時に、保存済みのfalseからtrueへPush設定を新規有効化しようとした場合）

#### データ更新・通知

- ユーザ情報とupdated_atを更新
- OneSignal無効時は3つのPush設定を保存済みの値に固定する。新規有効化を含むリクエストはプロフィール全体を更新せず503で拒否し、それ以外のプロフィール更新でもPush設定は変更しない
- 変更前のimage_nameがあり、新しい値と異なる場合は古いプロフィール画像を削除。削除に失敗してもプロフィール更新は成功し、ファイルが残る場合がある

### POST /api/user/changepassword

ログイン中ユーザのパスワードを変更する。

#### 認証・権限

- JWT必須

#### リクエスト

- body:
  - old_password: 文字列（8〜16文字）, 必須
  - new_password: 文字列（8〜16文字）, 必須

#### レスポンス

- 200 OK
- body:
  - 空オブジェクト`{}`（新しいJWTは発行しない）

#### エラー

- 400: INVALID_PARAMS（入力不正、現在のパスワード不一致、または認証後の再確認でログインユーザが存在しない・論理削除済み）
- 401: INVALID_PERMISSION（認証・パスワード照合後、更新時にログインユーザが存在しない・論理削除済み）
- 401: TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- パスワードをハッシュ化して更新し、`updated_at`と`session_version`を更新する
- 変更前に発行された全JWTを失効させる
- DB更新後、通知メールより先に対象ユーザの全Socketへ`SESSION_REVOKED`を送り切断する。操作中の端末もログアウトし、ログイン画面へ遷移する
- メール送信が有効な場合は、更新後に通知を1回試行する。通知失敗でも変更成功の200と空オブジェクトを返す。未送信記録は保存せず、再配送は行わない。詳細は[認証処理の競合と復旧](../auth-recovery.md)を参照

### GET/POST /api/user/management/paginate

サイト管理者がユーザ一覧を削除状態の条件付きでページング取得する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- GET:
  - query:
    - page: 数値（1以上）, 必須
    - search: 文字列（20文字以内）, 必須
    - delete_flg: 真偽値を表す`true`または`false`, 任意
- POST:
  - body:
    - page: 数値（1以上）, 必須
    - search: 文字列（20文字以内）またはnull, 必須
    - delete_flg: 真偽値, 任意
- searchが文字列の場合は、ユーザ名またはメールアドレスを大文字・小文字を区別せず部分一致で検索する
- delete_flgがfalseの場合は有効なユーザ、trueの場合は論理削除済みユーザだけを返し、省略時は両方を返す

#### レスポンス

- 200 OK
- body: 1ページ10件のページング結果
  - docs: ユーザの配列（パスワードを除く）
  - total: 数値
  - limit: 数値
  - pages: 数値
  - page: 数値
  - pagingCounter: 数値
  - hasPrevPage: 真偽値
  - hasNextPage: 真偽値
  - prevPage: 数値またはnull
  - nextPage: 数値またはnull
- docsはcreated_atの降順で、delete_flgを省略した場合は論理削除済みユーザも含む

#### エラー

- 400: INVALID_PARAMS
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（認証後の再確認で操作中の管理者が存在しない、または論理削除済み）

### POST /api/user/management/update

サイト管理者がユーザ情報とロールを更新する。削除状態の変更は専用APIを使用する。

#### 認証・権限

- JWTとサイト管理者権限が必須

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - username: 文字列（1〜20文字）, 必須
  - mail: 文字列（メールアドレス、100文字以内）またはnull（認証プロバイダから未取得）, 必須
  - password: 文字列（8〜16文字）, 任意
  - role: 文字列（`Administrator` / `Editor` / `Author` / `developer`）, 必須。新たに割り当て可能なのは`Editor` / `Author` / `developer`。既存`Administrator`の情報更新では`Administrator`を維持して指定
  - delete_flg: 真偽値, 必須。更新対象について呼出元が取得済みの削除状態を期待値として送る

#### レスポンス

- 200 OK
- body: 更新後ユーザ（パスワードを除く）

#### エラー

- 400: INVALID_PARAMS（入力不正または対象ユーザ不存在）
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（認証後の再確認で操作中の管理者が存在しない、または論理削除済み）
- 409: USER_EMAIL_ALREADY_USED（メールアドレス重複）
- 409: CONFLICT（delete_flgの期待状態不一致、`Administrator`を新たに割り当てる変更、または既存`Administrator`のロール変更）

#### データ更新・通知

- 変更されたusername、mail、パスワード、roleとupdated_atを更新する。delete_flgとdeleted_atは変更しない
- 読み取り後に削除状態が変わった場合も、delete_flgを条件にした更新により内容を上書きせず409を返す
- mailがnullの場合は重複確認を行わずnullを保存し、文字列の場合だけメールアドレスの重複を確認する
- ロールを変更する場合、変更先は`Author`、`Editor`、`developer`に限る
- ロール変更だけでは`session_version`を増分せず、既存JWTを変更後ロールのセッションとして継続する
- パスワードを変更しない管理更新の成功後は、ロールが同値の再送であっても対象ユーザの全Socketへ現在ロールを`USER_ROLE_UPDATED`で通知し、DB上の現在ロールとルームアクセス条件で全接続を再評価する。DB更新後にSocket再評価だけが失敗した場合は、同じペイロードの再送で再評価を再試行できる
- 再評価でアクセス不能になったSocketだけへ`RECEIVE_COMPLETE_DELETE_ROOM_MEMBER`を通知して切断し、公開ルームや別の有効なメンバー権限で許可されるSocketは維持する
- 既存`Administrator`も、ロールとdelete_flgの期待状態を維持すればusername、mail、パスワードを更新できる
- パスワードを指定した場合はハッシュ化して保存し、同じ更新で`session_version`を増分して対象ユーザに発行済みの全JWTを失効させる
- パスワードを変更した場合は、DB更新直後に対象ユーザの全Socketへ`SESSION_REVOKED`を送り切断する。Socket処理の失敗は更新済みAPI応答を失敗へ変えない
- 管理更新APIは対象ユーザ用の新しいJWTを発行しない
- 本人用パスワード変更APIと異なり、管理更新ではパスワード変更通知メールを送信しない

### POST /api/user/management/delete-state

サイト管理者がユーザの論理削除状態だけを変更する。

#### 認証・権限

- JWTとサイト管理者権限が必須
- `Administrator`である対象ユーザの削除状態は変更できない

#### リクエスト

- body:
  - _id: 文字列(MongoId), 必須
  - delete_flg: 真偽値, 必須。trueは論理削除、falseは復元

#### レスポンス

- 200 OK
- body: 状態変更後のユーザ（パスワードを除く）
- すでに要求した状態である場合も200を返す

#### エラー

- 400: INVALID_PARAMS（入力不正）
- 401: TOKEN_INVALID / TOKEN_EXPIRED
- 403: FORBIDDEN
- 404: NOT_FOUND（対象ユーザが存在しない、または認証後の再確認で操作中の管理者が存在しない・論理削除済み）
- 409: CONFLICT（対象が`Administrator`、有効なAI解析設定から参照中、または条件付き状態更新の競合）

#### データ更新・通知

- username、mail、パスワード、roleなどの通常項目は変更せず、delete_flg、deleted_at、updated_atだけを変更する
- 論理削除時はdeleted_atを現在日時へ設定し、復元時はnullへ戻す
- 共通、フロア、ルームのいずれかの有効なAI解析設定でresult_userとして参照されているユーザは削除しない
- 有効なユーザを論理削除する場合は、delete_flgの条件付き更新と同時にsession_versionを1回だけ増分する。対象ユーザの全Socketへ`SESSION_REVOKED`を通知し、接続を切断する
- すでに論理削除済みのユーザへ削除を再要求した場合はDBとsession_versionを変更せず、Socketへの通知と切断だけを再試行する
- 復元ではsession_versionを変更しないため、削除前JWTは失効したままとなる。対象ユーザ用の新しいJWTは発行しない

## 関連資料

### 実装

- `backend/routes/user.route.js`
- `backend/controllers/user.controller.js`
- `backend/services/user.service.js`
- `backend/services/_shared/paginationHelpers.js`
- `backend/services/analysis/settings/referenceIntegrity.js`

### テスト

- `backend/tests/unit/services/user.service.test.js`
- `backend/tests/integration/routes/user.route.int.test.js`
- `backend/tests/integration/routes/user.session-revocation.int.test.js`
- `backend/tests/unit/routes/user.route.test.js`
