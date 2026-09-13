# ドメインモデル

## 概要

この文書では、フロントエンドとバックエンドで扱う主要エンティティ、所有関係、埋め込み構造、ライフサイクルを説明します。
利用者向けの短い用語説明は [用語集](../manual/glossary.md) を参照してください。

フィールド単位の型・長さ・必須条件は `backend/models/`、APIから見える入出力と副作用は [バックエンドAPI詳細](backend/api/README.md) を参照してください。
ロール解決とアクセス可否は [ロール・権限仕様](roles-and-permissions.md) を参照してください。

## 構成・設定項目

### 関係の全体像

```text
User
├─ Floor（作成者）
├─ Room（作成者）
├─ FloorMember / RoomMember
├─ FloorInvite / RoomInvite（発行者）
├─ AuthIdentity
└─ tags / QuickText / PushFilter など

Floor
├─ Room
├─ FloorMember / FloorInvite / FloorTag
├─ FloorAIAnalysisSetting
├─ FloorQuickTextGroup ─ FloorQuickTextItem
├─ KickedUser（フロア全体への入室制限）
└─ Room配下の関連データ

Room
├─ RoomMember / RoomInvite / RoomTag
├─ RoomAIAnalysisSetting
├─ RoomQuickTextGroup ─ RoomQuickTextItem
├─ Chat（投稿）
└─ SoundTag / PushFilter

Chat（投稿）
├─ Reply[]
│  ├─ Supplement[]
│  ├─ Reaction[]
│  └─ Translation[]
├─ Supplement[]
│  ├─ Reaction[]
│  └─ Translation[]
├─ Reaction[]
└─ Translation[]

CategoryTag ─ AIAnalysisSetting
FloorTag ─ FloorAIAnalysisSetting
RoomTag ─ RoomAIAnalysisSetting
```

この図は所有・参照・埋め込みの概要です。件数や取得条件は個別API仕様に従います。
`KickedUser`の制限は対象フロア全体に適用します。保存するルームIDは、キック操作が行われたルームを示します。

### 中心エンティティ

| モデル | 位置付け | 主な関係 |
| --- | --- | --- |
| `User` | ログイン可能な利用者 | フロア・ルームの作成者、メンバー、投稿者、設定所有者 |
| `Floor` | ルームを束ねる最上位の利用単位 | `user` が作成者。複数のルームとフロア単位データを持つ |
| `Room` | タイムラインを提供する単位 | `floor` に所属し、`user` が作成者 |
| `Chat` | 1件の投稿を表すデータ | `floor` と `room` に所属し、返信などを埋め込む |

モデル名`Chat`はコレクション上の名称であり、1件が「タイムライン上の投稿」を表します。

#### `User`

- `role` に永続的なユーザロールを保持する
- パスワードは外部ログインを考慮して任意とする。設定する場合はハッシュ化して保存する
- メールアドレスは文字列値だけを対象とする部分一意索引で重複を防ぐ。null・未設定は複数保存でき、論理削除済みユーザの文字列メールも一意制約の対象となる
- Userモデルの索引は起動時に自動作成し、[メール一意索引](backend/user-mail-index.md)を含む索引の作成完了後に受付を開始する
- 言語、画像名、表示モード、Webプッシュ通知設定を保持する
- `session_version`はJWTの一括失効世代を表し、既定値は0とする
- パスワード変更・再設定、および有効状態から論理削除への遷移時に`session_version`を1増やし、以前の世代のJWTを失効させる
- パスワード更新成功後は対象ユーザの全Socketを失効させる。本人変更も新JWTを返さず、再ログインを必要とする
- `activation_token_hash`と`activation_expires_at`は有効化の再試行を照合する情報、`password_reset`は再設定トークンのハッシュ・発行先メール・期限・消費状態であり、通常のUser検索応答から除外する。`password_reset_delivery`・`password_change_notice`は既存データを応答へ出さないための非公開フィールドとし、新規保存しない。保存と再試行の条件は[認証処理の競合と復旧](backend/auth-recovery.md)を参照してください
- 論理削除したユーザを復元しても`session_version`は戻さず、復元後は新しいログインでJWTを発行する
- `delete_flg`、`deleted_at` による論理削除を使用する

#### `Floor`

- `user` はフロア作成者を表す
- タイトル、説明、言語、対象言語、翻訳、画像名を保持する
- `floor_display_hidden` は一覧表示の制御であり、アクセス権限ではない
- `delete_flg`、`deleted_at` による論理削除を使用する

#### `Room`

- `floor` で所属フロア、`user` でルーム作成者を示す
- `display_order` でフロア内の表示順を保持する
- `member_only`、`guest_reaction_only`、`room_display_hidden` などの利用条件を保持する
- 設定の意味と組み合わせは [ロール・権限仕様](roles-and-permissions.md) を参照してください
- `delete_flg`、`deleted_at` による論理削除を使用する

## 動作・適用条件

### 基本原則

- MongoDBの各コレクションに保存するデータは、原則としてMongooseが生成するObjectIdの `_id` で識別する
- `ref` を持つObjectIdは関連先を示すが、リレーショナルDBの外部キー制約や連鎖削除を自動では提供しない
- `Floor`、`Room`、`Chat` は階層を示すIDを保持し、サービス層で組み合わせの整合性を検証する
- ログインユーザは `User` 参照、ゲストは `guest_id` と必要に応じた `guest_name` で識別する
- 返信、付加情報、リアクション、翻訳は独立コレクションではなく、`Chat`（投稿）またはその子要素へ埋め込む
- 非表示、入室制限、論理削除を混同しない

### アカウントと認証補助

| モデル | 関係・用途 |
| --- | --- |
| `UserTemp` | メール登録の有効化前データ。固有トークンとハッシュ済みパスワードを保持する |
| `AuthIdentity` | `User` とパスワード認証・Google・LINEのプロバイダIDを関連付ける |
| `ResetPassword` | 既存の再設定リンクを読むためのモデル。新規発行は`User.password_reset`へ保存する |

- `AuthIdentity` はプロバイダとプロバイダ内ユーザIDの組み合わせを一意とする
- LINE初回ログインは`AuthIdentity.provisioning`でUser作成途中を記録し、予約したUser IDを同時要求・再試行で共有する
- `ResetPassword`はメールアドレス・トークンをそれぞれ一意とする。`User.password_reset`が存在する場合は、`ResetPassword`のリンクを利用できない
- パスワード再設定はUser上のトークン消費とパスワード・セッション世代を同じ更新で確定し、`ResetPassword`のリンクの回収に失敗しても再利用は拒否する
- 登録、有効化、ログイン、再設定の遷移は [認証API](backend/api/auth.md) を参照してください

### ログインユーザとゲスト

- ログインユーザが作成した投稿・返信・リアクションは `user` で `User` を参照する
- ゲストが作成したデータは `guest_id` と表示用の `guest_name` を保持する
- 投稿・返信・リアクションでは `user` が任意であり、ゲスト識別子との整合性はサービス層で扱う
- ゲストは`User`として登録されず、永続的なユーザロールを持たない

### アクセス関係と招待

| モデル | 主な参照 | 意味 |
| --- | --- | --- |
| `FloorMember` | フロア、ユーザ | ユーザが対象フロアのメンバーである関係 |
| `RoomMember` | フロア、ルーム、ユーザ | ユーザが対象ルームのメンバーである関係 |
| `FloorInvite` | フロア、ユーザ | 発行者、対象フロア、期限付きトークン |
| `RoomInvite` | フロア、ルーム、ユーザ | 発行者、対象ルーム、期限付きトークン |
| `KickedUser` | ユーザ、`kicked_by`、フロア、ルーム | キック対象、実行者、対象範囲、実行日時 |

- 招待受諾後は、受諾したログインユーザに対応するメンバー関係を作成する
- メンバー関係と招待には共通の論理削除フラグを持たない
- メンバーの優先順位、招待可否、キック時の入室制御は [ロール・権限仕様](roles-and-permissions.md) を参照してください

- `FloorMember`の`floor + user`と`RoomMember`の`room + user`は、起動時に作成する[メンバー関係の一意索引](backend/member-relationship-uniqueness.md)で重複を防ぐ

### タイムラインコンテンツ

`Chat`が投稿本体であり、次の要素を配列として埋め込みます。

| 要素 | 配置 | 主な内容 |
| --- | --- | --- |
| `Reply` | `Chat`直下 | 返信者、本文、タグ、メディア、付加情報、リアクション、翻訳 |
| `Supplement` | `Chat`または返信 | 追加本文、メディア、リアクション、翻訳。AI結果は非公開の内部メタデータも保持 |
| `Reaction` | `Chat`、返信、付加情報 | ログインユーザまたはゲスト、リアクション種別、作成日時 |
| `Translation` | フロア、ルーム、タグ、単語、投稿内要素 | 翻訳者、言語、翻訳内容、作成日時 |

- 返信や付加情報の更新・削除は、親の`Chat`を取得して埋め込み要素を操作する
- 投稿と返信は `RoomTag` のObjectId配列を保持できる
- 投稿と返信は`analysis_source_revision`を持ち、本文・言語・`RoomTag`・主要メディアが実際に変わった場合だけ増加する。フィールドがない既存データは0、新規作成は1として扱う
- 本文とメディアは同じ投稿要素へ保持でき、ファイル本体ではなく保存後のファイル名を記録する
- メディアファイルの保存先と制約は [ファイルアップロードAPI](backend/api/upload.md) を参照する
- `Chat`、返信、付加情報は `delete_flg` と削除日時による論理削除に対応する
- `Chat`、返信、付加情報を論理削除する時は、対象に直接設定されたメディアファイルを即時に物理削除する。他の有効なデータが同じファイルを参照している場合、または参照確認に失敗した場合は削除しない
- 管理画面で論理削除を解除すると、DB上の本文、タグ、メディアファイル名等を維持して削除状態を戻す。物理削除済みのメディアファイルは復元されず、URLが404となる場合がある

### タグと通知条件

| モデル | 所属範囲 | 関係 |
| --- | --- | --- |
| `FloorTag` | フロア | フロア、作成者、表示順、名前、言語、翻訳 |
| `RoomTag` | フロア + ルーム | ルーム内の投稿・返信から参照するタグ |
| `CategoryTag` | 全体 | 作成者、表示順、名前を持つ管理用分類 |
| `SoundTag` | フロア + ルーム + ユーザ | 複数の`RoomTag`を音関連の選択条件として保持する |
| `PushFilter` | フロア + ルーム + ユーザ | Webプッシュ通知の対象を絞り込む条件をオブジェクトとして保持する |
| `AIAnalysisSetting` | 全体 | `CategoryTag`、解析種別、プロンプト、結果ユーザを関連付ける共通設定 |
| `FloorAIAnalysisSetting` | フロア | `FloorTag`へ対応し、共通設定からコピーした場合はその来歴を持つ |
| `RoomAIAnalysisSetting` | フロア + ルーム | `RoomTag`へ対応し、フロア設定からコピーした場合はその来歴を持つ |

- `FloorTag`と`CategoryTag`は物理削除し、復元は提供しない。削除フラグは旧版の削除済みデータを除外するために保持する。`RoomTag`は論理削除し、復元できる
- `FloorTag`は任意の`source_category_tag`、`RoomTag`は任意の`source_floor_tag`を持つ。これらはコピー元を示す来歴であり、作成時のコピーで実際の親タグIDを記録し、既存の有効参照を名前一致だけで上書きしない
- 来歴参照は親タグの削除を妨げる参照整合性制約ではない。`CategoryTag`または`FloorTag`を物理削除しても子タグを連鎖削除せず、子タグに保存したコピー元IDを維持する
- 3階層のAI解析設定は同一適用範囲／タグ／解析種別の有効なレコードを部分一意索引で1件に限定し、更新・削除にリビジョン一致を必要とする。全階層とも物理削除し、削除時のリビジョン加算と復元は行わない
- 旧版で論理削除されたAI解析設定は一覧へ返さず、復元も提供しない。同じ組合せが必要になった場合は新規作成する。詳細は[AI解析設定・実行仕様](ai-analysis.md)を参照する
- `FloorTag`と`RoomTag`のインポート・初期化、および`CategoryTag`のインポートは、タグ名の完全一致を同一タグとして同期する
- 同名の有効タグはObjectIdを維持して更新する。`FloorTag`と`CategoryTag`は削除済みタグを復元せず、新しいIDで作成し、同期元にない有効タグは物理削除する。`RoomTag`は同名の削除済みタグを元のIDで復元し、同期元にない有効タグは論理削除する
- 同階層の有効なAI解析設定が直接参照するタグは削除できない。CSV同期・初期化も、除外対象が同階層のAI解析設定で使用中なら書込み前に全体を拒否する。`RoomTag`は投稿・返信（削除済みを含む）、`SoundTag.tags`、`PushFilter.conditions.tags`で使用中でも論理削除・復元でき、参照を維持する
- `RoomTag`の復元には所属関係が一致する有効なフロアとルームが必要であり、コピー元タグの存在・有効状態は条件にしない
- 同一同期元または対象範囲に完全一致するタグ名が複数ある場合、同期は開始しない
- 同期書き込みはMongoDBトランザクションを使用せず、同名タグの`upsert`を先に、新規タグへの設定コピーと未指定タグの削除を最後に順次実行する。途中のDBエラーで一部更新された場合は、同じ同期元を再実行して収束させる
- `SoundTag`と`PushFilter`はフロア、ルーム、ユーザを同時に保持する。`PushFilter`の作成時は、フロアとルームの所属関係を検証しないため、呼出側が一致するIDを指定する
- `SoundTag`は有効なユーザ・ルーム・フロアとルームアクセス可否を確認し、ルームから解決したフロアを使用する
- `SoundTag`が保持する`RoomTag`は、対象フロア・ルームに所属し、論理削除されていないデータに限定する
- `SoundTag`は`floor + room + user`を一意とし、作成時は同じ組み合わせの設定を`upsert`する
- `SoundTag`に削除APIと論理削除フラグはなく、選択解除時は`tags`を空配列へ更新する
- `PushFilter`の `conditions` の構造はフロントエンドの絞り込み仕様とAPI仕様を参照してください

### 単語（QuickText）

単語は「グループ」と「アイテム」を別々のデータとして保存します。

| 範囲 | グループ | アイテム | 所属関係 |
| --- | --- | --- | --- |
| 共通 | `QuickTextGroup` | `QuickTextItem` | グループはユーザ、アイテムはグループを参照 |
| フロア | `FloorQuickTextGroup` | `FloorQuickTextItem` | グループはフロアとユーザ、アイテムはフロアとグループを参照 |
| ルーム | `RoomQuickTextGroup` | `RoomQuickTextItem` | グループはフロア、ルーム、ユーザ、アイテムはフロア、ルーム、グループを参照 |

- 各グループとアイテムは表示順、言語、表示文字列を保持する
- フロア単語・ルーム単語は翻訳配列を持つ
- 所属IDの組み合わせと操作権限は単語サービスで検証する
- フロア単語・ルーム単語のグループを削除するときは、対象フロア・ルームへの所属を先に確認する
- 認可・存在・所属を確認し、配下単語を削除してから最後にグループを削除する。途中失敗はエラーとして返し、画面を再取得して残ったグループから再試行する。専用の削除記録は保存しない。詳細は[単語グループ削除の復旧](backend/quicktext-deletion.md)を参照
- グループが存在しない、または所属が一致しない場合は関連データを変更しない

### 運用・補助モデル

| モデル | 用途 |
| --- | --- |
| `Spam` | 置換対象のスパムワードと登録ユーザを保持する |
| `GoogleApiUsage` | API種別と年月単位の利用量を保持する |
| `GoogleTranslateAPI` | 翻訳APIの月次カウントと利用日時を保持する |

保持期間、個人情報、監視、外部連携の運用条件は [バックエンドの運用上の注意](backend/considerations.md) を参照してください。

### ライフサイクル

- フロアやルームを論理削除しても、関連データとメディアを一定期間後に自動削除する処理はありません。

#### 論理削除

次のデータまたは埋め込み要素は、`delete_flg` と必要に応じて `deleted_at` を使用します。

- ユーザ、フロア、ルーム、`Chat`
- `Chat`内の返信、付加情報
- `RoomTag`

共通・フロアタグとAI解析設定にも旧版の削除済みデータを除外するためのフラグを保持しますが、新たな削除操作は物理削除です。

論理削除済みデータを一覧・詳細へ含めるかは、対象サービスとAPI仕様で定義します。

フロアまたはルームを論理削除しても、配下のデータとAI解析設定の削除状態は変更しません。有効なAI解析設定が存在しても親の論理削除を拒否せず、親が論理削除中は通常操作とAI解析の対象から除外します。親を復元すると、個別に論理削除されていない配下データとAI解析設定を既存状態のまま再び利用できます。

#### 共通論理削除を持たないモデル

- メンバー、招待、キック
- 単語のグループとアイテム
- `SoundTag`、`PushFilter`
- 認証補助と運用補助モデル

これらの削除、失効、保持方法は各サービスの実装に従います。親となるデータの削除によって関連データが自動削除されるわけではありません。

#### 日時

- 多くのモデルは `created_at` を持つ
- 更新・論理削除に対応するモデルは `updated_at`、`deleted_at` を個別に持つ
- Mongooseの共通 `timestamps` は一律に使用していないため、日時フィールドの有無はモデルごとに確認する

### 整合性を保つ責務

整合性を保つため、サービス層では操作に応じて少なくとも次の関係を確認する必要があります。確認しない関係は各データの説明に記載します。

- ルームが指定されたフロアに所属する
- `Chat`が指定されたフロアとルームに所属する
- `RoomTag`、単語、メンバー関係が対象フロア・ルームと一致する
- ログインユーザまたはゲストが対象操作を実行できる
- 論理削除された親・対象を通常操作から除外する
- 埋め込み要素のIDが対象`Chat`内に存在する
- AI解析設定と対象タグが有効で、対象フロア・ルームの所属に一致する。結果ユーザは有効であることを確認し、メンバーとしての所属は要求しない

APIクライアントから送られたIDの組み合わせだけを信頼せず、バックエンドで関連データを取得して検証します。

## 関連資料

### 関連仕様

- [用語集](../manual/glossary.md)
- [ロール・権限仕様](roles-and-permissions.md)
- [バックエンド概要](backend/overview.md)
- [バックエンドAPI詳細](backend/api/README.md)
- [フロントエンド状態管理](frontend/state.md)
- [メディア入力制約](frontend/media-input.md)
- [バックエンドの運用上の注意](backend/considerations.md)

### 実装

- `backend/models/User.js`
- `backend/models/UserTemp.js`
- `backend/models/AuthIdentity.js`
- `backend/models/ResetPassword.js`
- `backend/services/floor/floorMember.service.js`

### テスト

- `backend/tests/unit/models/models.schema.test.js`
- `backend/tests/integration/routes/floor-room.crud.int.test.js`
- `backend/tests/integration/routes/timeline.core.int.test.js`
- `backend/tests/unit/models/aiAnalysisSetting.schema.test.js`
- `backend/tests/unit/models/timelineAnalysisFields.schema.test.js`
