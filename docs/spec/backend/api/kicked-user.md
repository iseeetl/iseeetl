# キック済みユーザAPI

## 概要

`KickedUser`は、対象ユーザをフロア単位で利用不可にする関係です。作成時には操作対象のルームも記録し、対象フロアへ認証済みSocketで接続中の場合は同一フロア内の全接続を切断します。ロールと入室制御は [ロール・権限仕様](../../roles-and-permissions.md) を参照してください。
共通の入力形式、認証ヘッダ、成功・エラー応答は [REST API共通規約](../api-conventions.md) を参照してください。

## 共通条件

### 共通事項

- すべてのエンドポイントでJWT必須
- 一覧・作成・解除はサイト管理者、または現在ロールが`Editor`である対象フロアの作成者だけが実行できる
- 作成と解除は物理作成・物理削除であり、論理削除フラグは使用しない
- 同じユーザ・フロアの組み合わせは起動時に作成する一意索引で保証し、同時作成の競合も`ALREADY_KICKED`で返す

### 一意索引の作成

KickedUserモデルは`autoIndex: true`で、起動時に`kickedusers`コレクションへ`{ floor: 1, user: 1 }`、名前`uniq_kickedusers_floor_user`、`unique: true`の索引を作成します。同じ定義の索引がある場合は維持し、作成に失敗した場合は受付を開始せず終了します。

既存DBへの反映前に、同じフロア・ユーザの重複、参照IDの型、既存索引の定義を確認します。索引だけでは参照IDの型や参照先の存在を保証しません。バックアップと起動失敗時の対処は[起動時の索引作成](../overview.md#起動時の索引作成)に従います。データや既存索引の自動修正・削除は行いません。

## API

### POST /api/kickeduser/

対象フロアのキック済みユーザ一覧を取得する。

#### 認証・権限

- Bearer JWTが必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者だけが実行できる

#### リクエスト

- body:
  - floor_id: 文字列（MongoId）、必須

#### レスポンス

- 200 OK
- body: `KickedUser[]`
  - user: `username`、`image_name`を含む
  - kicked_by: `username`を含む
  - room: `title`を含む
- 並び順: `kicked_at`の降順

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED

### POST /api/kickeduser/check

ログインユーザ自身が対象フロアでキック済みか確認する。

#### 認証・権限

- Bearer JWTが必須
- ログインユーザ自身のキック状態を確認するAPIであり、一覧・作成・解除に必要な管理権限は要求しない

#### リクエスト

- body:
  - floor_id: 文字列（MongoId）、任意
  - room_id: 文字列（MongoId）、任意
  - 少なくともどちらか一方が必須

`room_id`を指定した場合は、ルームから所属フロアを取得して判定します。`floor_id`も同時に指定した場合、現在の実装は`room_id`を優先し、両者の一致を確認しません。

#### レスポンス

- 200 OK
- body: 真偽値
  - true: 対象フロアでキック済み
  - false: 未キック

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED

### POST /api/kickeduser/create

指定ルームを起点に、対象ユーザをフロア単位でキックする。

#### 認証・権限

- Bearer JWTが必須
- サイト管理者、または現在ロールが`Editor`である対象ルーム所属フロアの作成者
- 操作者、対象ユーザ、ルーム、フロアが論理削除されていない
- 対象ユーザがサイト管理者ではない
- 対象ユーザが対象フロアの作成者である編集者ではない
- 同じユーザ・フロアの`KickedUser`が存在しない

対象ユーザがフロア・ルームのメンバーであることは確認しません。

#### リクエスト

- body:
  - user_id: 文字列（MongoId）、必須
  - room_id: 文字列（MongoId）、必須

#### レスポンス

- 200 OK
- body: 作成済みの`KickedUser`
  - user: キック対象
  - kicked_by: 操作者
  - floor: ルームから取得した所属フロア
  - room: 操作対象のルーム
  - kicked_at: キック日時

#### エラー

- 400: INVALID_PARAMS
- 400: ALREADY_KICKED
- 400: CANT_KICK
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- `KickedUser`を作成する
- 対象フロア・対象ユーザ専用のサーバが管理する配信グループ（Socket.IO room）へ`KICKED_USER`イベントを送信する
- 専用の配信グループに所属するSocketをサーバ側からすべて強制切断するため、同じフロアの別ルームや複数タブの接続も切断対象になる
- 切断時の通常処理により、各ルームの参加者一覧から対象Socketを削除する
- 別フロアの配信グループは異なるため、対象ユーザの別フロアへの接続は切断しない
- 再接続時はフロア単位のキック判定により拒否する
- 通知が失敗しても切断を試みる。通知と切断の失敗は個別に記録し、保存したキックをAPIエラーへ変えない。通知・切断の自動再試行は行わず、同じキックの再登録は引き続き`ALREADY_KICKED`となる

### POST /api/kickeduser/delete

対象ユーザのフロア単位のキックを解除する。

#### 認証・権限

- Bearer JWTが必須
- サイト管理者、または現在ロールが`Editor`である対象フロアの作成者だけが実行できる

#### リクエスト

- body:
  - user_id: 文字列（MongoId）、必須
  - floor_id: 文字列（MongoId）、必須

#### レスポンス

- 200 OK
- body: 物理削除した`KickedUser`

#### エラー

- 400: INVALID_PARAMS
- 401: INVALID_PERMISSION / TOKEN_INVALID / TOKEN_EXPIRED

#### データ更新・通知

- ユーザ・フロアが一致する`KickedUser`を全件物理削除する。重複データがあっても解除後に制限を残さず、別フロアの制限は維持する。認可はフロアで検証するため、記録元ルームの削除後も解除できる

## 関連資料

### 実装

- `backend/models/KickedUser.js`
- `backend/routes/kickedUser.route.js`
- `backend/controllers/kickedUser.controller.js`
- `backend/services/kickedUser.service.js`

### テスト

- `backend/tests/unit/services/kickedUser.service.test.js`
- `backend/tests/integration/routes/kickedUser.route.int.test.js`
- `backend/tests/unit/routes/kickedUser.route.test.js`
