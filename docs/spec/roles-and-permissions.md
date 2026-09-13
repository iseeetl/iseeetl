# ロール・権限仕様

## 概要

この文書では、フロントエンドとバックエンドにまたがるロール解決、表示制御、API認可、ルーム入室制御を説明します。
利用者向けの操作可否は [ロールと利用できる機能](../manual/roles/README.md) を参照してください。

共通の認証ヘッダーとエラー形式は [REST API共通規約](backend/api-conventions.md) を参照してください。個別エンドポイントの入出力や認可条件は [バックエンドAPI詳細](backend/api/README.md)、画面固有のボタン表示は [画面仕様](frontend/screens/README.md) を参照してください。

## 動作・適用条件

### 基本原則

- フロントエンドのボタン非表示やルートガードは操作案内のための制御であり、セキュリティ境界ではない
- データ更新、管理操作、メンバー限定ルーム入室の最終認可はバックエンドで行う
- ロール名が同じでも、ユーザ全体に保存されるロールと、フロア・ルーム内で解決されるロールを混同しない
- 非表示設定は一覧表示の制御であり、入室制限は `member_only` が担う
- 不明な権限を推測で許可せず、バックエンドでは権限不足として扱う
- ルーム画像とタイムラインの画像・動画・音声を取得する場合も、REST／Socket.IOと同じ現在のルームアクセス権とキック状態をバックエンドで再確認する

### 認証状態

| 状態 | 認証情報 | ユーザロール |
| --- | --- | --- |
| ゲスト | ゲストアクセストークン | なし |
| ログインユーザ | Bearer JWTと有効なユーザ | DB上の現在の`User.role` |
| Socket.IOのゲスト | `guest_token` | なし |
| Socket.IOのログインユーザ | `user_token`と有効なユーザ | DB上の現在の`User.role` |

ゲストは `User.role` を持つユーザではありません。ゲスト用トークンによって識別され、ログインユーザ向けの有効ロール解決APIは使用しません。

ログイン時に発行するJWTには`user_id`、発行時点の`user_role`、`session_version`を格納します。通常の認証必須APIではリクエストごとにDB上の有効ユーザと`session_version`を確認し、`jwtPayload.user_role`をDB上の現在のロールへ置き換えます。そのため、ユーザ管理で変更したロールは次回リクエストから反映されます。パスワード変更・再設定と有効ユーザの論理削除では`session_version`を増やし、変更前のJWTを失効させます。

### ユーザロール

ユーザロールは`User.role`に保存され、ログイン時にJWTへ引き継がれます。モデルの既定値は`Author`で、enum制約はありません。管理APIの入力検証はロール定数にない値を拒否し、サービス層は新規割り当てを`Author`、`Editor`、`developer`に限定します。

| ロール | 位置付け | 主な権限 |
| --- | --- | --- |
| `Administrator` | 管理者 | 管理画面、管理API、全体管理 |
| `Editor` | フロア編集ユーザ | フロア作成、自分が作成したフロアの管理 |
| `Author` | 一般ログインユーザの既定値 | 通常利用。個別権限はメンバー関係から解決 |
| `developer` | 外部API向けロール | `/api/v1` 系の外部API。管理者権限とは別 |

#### `Administrator`

- フロントエンドの `meta.isManagement` ルートへ遷移できる
- バックエンドの `ensureAdminUser` を通過できる唯一のユーザロール
- フロア・ルーム内の有効ロール解決では常に `Administrator` が優先される
- ユーザ管理で新たに割り当てられるロールは `Author`、`Editor`、`developer` で、`Administrator` への変更はできない
- 既存の `Administrator` はロールと論理削除状態を変更できないが、ユーザ名・メール・パスワードは更新できる

#### `Editor`

- `Administrator` とともにフロアを作成できる
- 自分が作成したフロアでは `FloorEditor` として解決される
- 他ユーザが作成したフロアでは、メンバー関係がなければ `Author` として扱われる
- フロアの更新・削除は、自分が作成したフロアに限定される
- 自分が作成したフロアのAI解析設定と、そのフロア配下のルームAI解析設定を、結果ユーザの検索・指定を含めて管理できる。共通設定は管理できない

#### `Author`

- `User.role` の既定値
- フロア・ルーム内で上位の有効ロールに該当しない場合のフォールバック
- 公開ルームの通常利用は可能だが、フロア・ルーム管理権限は持たない

#### `developer`

- 外部APIの`/api/v1`系ルートで使用される
- `Administrator` と同義ではなく、`ensureAdminUser` は通過できない
- 通常の有効ロール解決では、メンバー関係がなければ `Author` へフォールバックする
- `developer` は管理画面のユーザ管理から付与できる
- v1 JWTは通常JWTとは別の`JWT_DEV_SECRET`で検証し、各v1ルートはトークンのペイロードの`user_role === 'developer'`を確認する
- 有効なユーザとDB上の現在のロール`developer`を確認する。`session_version`はv1で照合しない
- メンバー限定ルームは通常APIと同じメンバー条件を満たす場合だけ利用でき、キック済みユーザは拒否する
- タイムラインの作成はルームへアクセスできるユーザに許可する。更新・削除は作成者本人またはフロアメンバーに許可し、ルームメンバーであることだけでは他ユーザが作成した対象を変更できない

エンドポイントと個別の認可・検証・副作用は[v1 API仕様](backend/api/v1.md)を参照してください。

### 有効ロール

有効ロールは対象フロア・ルームとログインユーザの関係から都度解決します。通常APIでは認証ミドルウェアがDBから再取得した現在のユーザロールを使用し、永続的なユーザロール自体は書き換えません。

#### 解決順序

タイムラインのロール解決は次の優先順です。

1. 認証後の現在のユーザロールが `Administrator` → `Administrator`
2. 認証後の現在のユーザロールが `Editor` かつフロア作成者本人 → `FloorEditor`
3. 対象フロアの `FloorMember` が存在 → `FloorMember`
4. 対象ルームの `RoomMember` が存在 → `RoomMember`
5. いずれにも該当しない → `Author`

同じユーザが複数条件を満たす場合は、上にあるロールだけを返します。例えばフロアメンバーかつルームメンバーの場合は `FloorMember` です。

フロア一覧からルーム一覧へ遷移する際のフロアロール解決では、`RoomMember` を評価せず、`Administrator`、`FloorEditor`、`FloorMember`、`Author` のいずれかを返します。

#### 有効ロールの根拠

| 有効ロール | 判定根拠 | 保存方法 |
| --- | --- | --- |
| `Administrator` | 認証後の現在のユーザロールが `Administrator` | `User.role` |
| `FloorEditor` | `Editor` かつ `Floor.user` と本人が一致 | 派生値。メンバーモデルには保存しない |
| `FloorMember` | `FloorMember`として登録済み | フロアとユーザの関連 |
| `RoomMember` | `RoomMember`として登録済み | フロア、ルーム、ユーザの関連 |
| `Author` | 上記以外 | `User.role` の既定値または有効ロールのフォールバック |

### フロア単位の認可

フロア配下の多くの操作は、共通判定 `hasFloorAccess` を使用します。許可される条件は次のいずれかです。

- `Administrator`
- `Editor` かつ対象フロアの作成者本人
- 対象フロアの `FloorMember` が存在する

この判定は、非表示ルームを含むルーム一覧、ルーム作成・更新・削除・並び替え、ルームタグとルーム単語の変更操作などで使用されます。ルームタグ／ルーム単語の一覧閲覧は、後述するルームアクセス判定を使用します。

#### フロアメンバー管理

- 一覧: フロアアクセスを持つユーザ
- 招待発行・メンバー削除: `Administrator` またはフロア作成者本人の `Editor`
- 脱退: 対象の `FloorMember` 本人
- フロア作成者は `FloorMember` へ参加する必要がなく、招待受諾もできない

### ルームメンバー管理

- ルームメンバーの一覧・招待・脱退APIは、サービス層で `member_only=true` を必須条件にしていない

- 一覧: フロアアクセスを持つユーザ、または対象ルームの `RoomMember`
- 招待発行: フロアアクセスを持つユーザ
- メンバー削除API: `Administrator`、フロア作成者本人の `Editor`、または対象ルームの作成者
- 脱退: 対象の `RoomMember` 本人
- フロア作成者と `FloorMember` は、ルーム招待を受諾して `RoomMember` になる必要がない

画面のメンバー削除ボタンは、`Administrator`と`FloorEditor`以外では、対象ルームの作成者が現在も`FloorMember`である場合に表示します。APIでは、この作成者に`FloorMember`であることを要求していません。

`RoomMember` はメンバー限定ルームへの入室権限です。ルームメンバーであることだけでは、ルーム作成・編集・削除など、フロア内の管理権限は得られません。

### ルーム入室判定

#### ログインユーザ

バックエンドのルームアクセス判定は次の順で実行します。

1. ユーザ、ルーム、フロアが有効であることを確認する
2. 対象フロアでキック済みユーザではないことを確認する
3. `FloorMember` と `RoomMember` の存在を確認する
4. `member_only=true` の場合は、次のいずれかを要求する
   - `Administrator`
   - `Editor` かつフロア作成者本人
   - `FloorMember`
   - `RoomMember`

`member_only=false` の場合も、ログインユーザのキック状態は確認されます。

#### ルーム情報一覧

ルームタグ一覧とルーム単語のグループ／項目一覧は、同じルームアクセス判定を使用します。

- 公開ルームは匿名または有効ゲストでも閲覧できる
- ユーザのJWTが明示されている場合は公開ルームでも現在のユーザとキック状態を確認する
- メンバー限定ルームは`Administrator`、現在のロールが`Editor`である対象フロアの作成者、`FloorMember`、または`RoomMember`であるログインユーザだけが閲覧できる
- 有効ゲストはメンバー限定ルームで`INVALID_PERMISSION`となる
- 不正または期限切れのユーザ／ゲストトークンは、匿名や別の認証情報へ切り替えず`TOKEN_INVALID`／`TOKEN_EXPIRED`となる
- ユーザの`Authorization`とゲストトークンが同時にある場合はユーザを優先する

#### ゲスト

- `member_only=true` のルームには入室できない
- `member_only=false` のルームは、ルームとフロアが有効であれば利用できる
- Socket.IO接続でもゲストトークンを検証し、メンバー限定ルームへの接続を拒否する

#### Socket.IO

Socket.IO接続はREST APIと同じルームアクセス判定を使用します。ユーザのJWT・セッション世代、ゲストトークン、キック状態、メンバー限定ルームの権限を確認します。

ロールやメンバー関係の変更後は、接続先ごとに権限を再評価し、許可された接続だけを維持します。パスワード更新とユーザ削除では全接続を失効させます。ルームの限定化・削除、フロア削除による切断ではログイン状態を維持します。

通知イベント、対象範囲、再評価に失敗した場合の切断条件は[Socket.IO接続・イベント契約](socket-events.md#アクセスセッションイベント)を参照してください。

### ルーム設定との組み合わせ

| 設定 | 一覧表示 | 入室 | 投稿・返信 |
| --- | --- | --- | --- |
| `room_display_hidden=true` | ゲストとフロアアクセスのないログインユーザには表示しない | この設定単独では制限しない | この設定単独では制限しない |
| `member_only=true` | 一覧に表示されていても権限判定が必要 | ゲスト不可。所定の有効ロールが必要 | 入室できたログインユーザのみ |
| `guest_reaction_only=true` | 影響なし | 影響なし | ゲストの投稿・返信内容を許可された絵文字に限定 |
| キック済み | ログインユーザはフロントエンドでも検出する | バックエンドで拒否 | 不可 |

`room_display_hidden` と `member_only` は独立した設定です。非表示ルームでも `member_only=false` なら、直接URLを知る利用者に対する入室制限にはなりません。

キックは作成元のルームIDも記録しますが、入室・一覧・Socket切断の判定はフロアIDとユーザIDで行うため、対象フロア全体へ適用されます。

### AI解析設定

- 共通設定の一覧・作成・更新・物理削除、および共通設定用の結果ユーザ検索は管理者（`Administrator`）だけに許可する。
- フロア／ルーム設定は管理者と、現在のロールがフロア編集ユーザ（`Editor`）である対象フロアの作成者だけに許可する。`FloorMember`、`RoomMember`、ルーム作成者であることだけでは許可しない。
- フロア／ルーム設定では、管理者と、現在のロールがフロア編集ユーザである対象フロアの作成者が適用範囲付きの結果ユーザ検索を利用し、作成・更新リクエストへ有効な`result_user`を明示する。親設定の有無は設定操作の可否に影響しない。
- フロントエンドは同じ条件でボタンと入力を制御するが、バックエンドが現在のユーザ・フロア作成者・適用範囲所属を最終確認する。

詳細は[AI解析設定・実行仕様](ai-analysis.md#権限と結果ユーザ)と[AI解析設定API](backend/api/ai-analysis-settings.md)を参照してください。

### フロントエンドの責務

- Vuexの `user.role` にログイン時のユーザロールを保持し、`USER_ROLE_UPDATED`受信時は現在のロールへ更新する
- Vuexの `room.role` に対象ルームで解決した有効ロールを保持し、ユーザロール変更時はAPIから再取得する
- `meta.isManagement` ルートでは `Administrator` 以外をログアウトさせ、ログイン画面へ遷移する
- ルーム一覧ではフロアロールに応じて管理ボタンと非表示ルームを制御する
- AI解析共通設定は管理メニュー、フロア／ルーム設定はルーム画面で、上記の権限を満たす場合だけ操作入口を表示する
- タイムライン初期化時に有効ロールを取得し、メンバー操作ボタンを制御する
- `member_only` の入室前チェックと `guest_reaction_only` の入力UI制御を行う

フロントエンドで操作が非表示でも、APIを直接呼び出せる可能性を前提とし、バックエンド側の認可を省略しません。

### バックエンドの責務

- `FloorMember`・`RoomMember`と`KickedUser`には関係単位の一意索引を定義している。[所属の索引](backend/member-relationship-uniqueness.md)と[キックの索引](backend/api/kicked-user.md#一意索引の作成)を起動時に自動作成し、作成完了後に受付を開始する

- `ensureJsonWebToken` でBearer JWTの署名・期限・ユーザの有効性・`session_version`を検証し、現在のロールを含む`jwtPayload`を設定する
- ルーム情報一覧用の任意認証では、明示されたユーザ／ゲストトークンだけを検証し、リクエスト本文やメディアアクセスCookieを変更しない
- `ensureAdminUser` で管理APIを `Administrator` のみに限定する
- `ensureJsonWebTokenV1`でv1 JWTの署名・期限を検証する。現行18エンドポイントでは後段の`ensureDeveloperUserV1`がペイロードの`developer`ロール、有効ユーザ、DB上の現在のロール`developer`を確認する。v1では`session_version`を照合しない
- サービス層で対象リソース、所有者、メンバー関係を確認する
- ゲスト用サービスでメンバー限定ルームとゲスト投稿制限を確認する
- Socket.IO接続でもユーザの`session_version`とREST API同等のルームアクセス判定を確認する
- ユーザの論理削除時は対象ユーザ専用の配信グループへ失効を通知して全接続を切断し、復元後も削除前JWTを拒否する
- ユーザのロール変更時は対象ユーザの既存Socketを現在のロールとルームアクセス条件で再評価し、権限を失った接続だけをサーバ側で切断する
- メンバー関係の削除後は、既存Socketについても現在のルームアクセス権を再評価し、権限を失った接続をサーバ側で切断する
- 権限不足時は [REST API共通規約](backend/api-conventions.md) に従って拒否する

## 関連資料

### 関連仕様

- [ドメインモデル](domain-model.md)
- [ロールと利用できる機能](../manual/roles/README.md)
- [ルーティング、ガード](frontend/routing.md)
- [ルーム画面仕様](frontend/screens/Room.md)
- [タイムライン画面仕様](frontend/screens/Timeline.md)
- [認証API](backend/api/auth.md)
- [フロアAPI](backend/api/floor.md)
- [フロアメンバーAPI](backend/api/floor-member.md)
- [ルームAPI](backend/api/room.md)
- [ルームメンバーAPI](backend/api/room-member.md)
- [タイムラインAPI](backend/api/timeline.md)
- [Socket.IO接続・イベント契約](socket-events.md)
- [v1 API](backend/api/v1.md)

### 実装

- `backend/constants/roles.js`
- `backend/models/User.js`
- `backend/services/auth.service.js`
- `backend/routes/v1.js`
- `frontend/src/components/timeline/core/TimelineHeader.vue`

### テスト

- `backend/tests/integration/routes/auth.middleware.int.test.js`
- `backend/tests/integration/routes/media.access.int.test.js`
- `frontend/tests/e2e/specs/flows/role-permissions/role-permissions.e2e.js`
- `backend/tests/unit/services/_shared/floorAccess.test.js`
- `backend/tests/integration/routes/aiAnalysisSettings.route.int.test.js`
