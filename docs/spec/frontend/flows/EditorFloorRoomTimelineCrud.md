# フロア作成からタイムラインの投稿操作まで

## 概要

- Editorが自分のフロアを作成し、ルーム作成、タイムライン入室、投稿・返信・付加情報・リアクション操作まで進む操作の流れを定義する
- 個別画面仕様を横断して、各操作の権限と保存後の動作を説明する

## 利用条件

### 対象ロール

- 主対象: 現在のシステムロールが`Editor`であるログインユーザ
- 作成したフロアでは、そのEditorがフロア作成者としてFloorEditor相当の管理権限を持つ
- `Administrator`も同じ操作を実行できるが、全フロアを管理できる点がEditorと異なる
- 共同利用では一般ログインユーザとゲストもタイムラインへ入り、本人データの操作、共同タグ編集、リアクションを行う

### 前提

- Editorが`/login`からログインできる
- フロア／ルーム作成に必要な入力が有効で、対象ルームが論理削除されていない
- `member_only=true`のルームへ一般ユーザを入室させる場合は、フロアメンバーまたは対象ルームメンバーとして参加済みである
- ゲストが操作する場合は公開ルームであり、必要に応じて画面内のゲスト利用ルールへ同意する

## 操作の流れ

### 1. ログインとフロア作成

1. Editorが`/login`で認証し、フロア一覧へ移動する
2. `/`または`/page/:page`でフロア作成ダイアログを開き、タイトル、説明、言語、一覧での表示／非表示、任意画像を設定する
3. 作成後、Editorはそのフロアの作成者として編集・削除と配下のルーム管理を行える
4. 作成したフロアカードから`/floor/:floor_id`へ移動する

- フロア作成時は翻訳、共通タグ由来のフロアタグ、共通の単語由来のフロア単語、メディアディレクトリを作成する
- 画像付き作成はフロア保存と画像アップロード・画像名更新を複数要求で行い、単一トランザクションではない
- フロアの変更処理はSocket.IO更新イベントを送信しない

### 2. ルーム作成とタイムラインへの遷移

1. ルーム一覧がフロア詳細、ログインユーザの現在ロール、キック状態、ルーム一覧を取得する
2. フロア作成者であるEditorがルーム作成ダイアログからルームを作成する
3. ルームカードのリンクから`/floor/:floor_id/room/:room_id`へ移動する
4. タイムラインがフロア／ルームと入室権限を検証し、初期データ取得後にSocket.IOへ接続する

- ルーム作成時は翻訳とメディアディレクトリを作成し、所属フロアのタグと単語をルームのタグと単語へコピーする
- ルームの変更処理はSocket.IO更新イベントを送信しない
- `room_display_hidden`はルーム一覧への表示条件であり、直接入室の認可条件ではない。`member_only`、現在の所属、キック状態が入室可否を決める

### 3. 投稿の作成・閲覧・編集・削除と協働操作

1. FloorEditorが投稿を作成する
2. 投稿へ返信し、投稿と返信のそれぞれへ付加情報を作成する
3. 投稿、返信、双方の付加情報へリアクションを追加し、本人分を同じUIから解除する
4. 自分が作成した投稿、返信、付加情報を編集・削除する
5. 共同利用では一般ユーザとゲストが許可された操作を行い、FloorEditorが他者データを管理する

| 操作 | ゲスト | 一般ログインユーザ | FloorEditor／Administrator |
| --- | --- | --- | --- |
| 公開ルームでの投稿・返信 | ゲストのリアクション限定が無効な場合に可 | 可 | 可 |
| 付加情報作成 | 不可 | 入室可能なら可 | 可 |
| リアクション追加・本人分解除 | 可 | 可 | 可 |
| 本人データの編集・削除 | 不可 | 可 | 可 |
| 他者データの編集・削除 | 不可 | 通常不可 | 可 |
| 他者の投稿・返信の専用タグ更新 | 不可 | 入室可能なら可 | 可 |

- ゲストのリアクション限定が有効な場合、本文・タグ・メディアを使う通常投稿は制限され、許可されたリアクション文字だけを扱う。詳細は[タイムライン](../screens/Timeline.md)を参照する
- フロアメンバーも他者データの編集・削除権限を持つが、ルームメンバーであることだけではその権限を得ない
- 投稿・返信への付加情報作成と専用タグ更新は、対象データの作成者へ限定せず、ルームへ入室できるログインユーザに許可する
- 投稿、返信、付加情報の保存は、送信者を含む対象ルームへSocket.IOイベントを配信する。条件に応じてプッシュ通知、翻訳、解析も起動する
- メディアアップロード、DB更新、メディア削除、通知、Socket.IO、翻訳・解析は単一トランザクションではない

## 完了時・失敗時の動作

### 完了時

- Editorがフロアを作成し、そのフロアの管理権限でルームを作成してタイムラインへ到達できる
- タイムラインで本人データの作成・閲覧・編集・削除とリアクションの追加・解除が行える
- FloorEditorが他者の投稿、返信、付加情報を編集・削除でき、一般ユーザとルームメンバーだけのユーザは同じ管理権限を持たない
- 保存結果がREST応答とSocket.IOで現在ルームへ反映される
- 個別削除後は対象が通常画面・通常取得APIから除外される。ただし論理削除と非連鎖削除のため、関連データやファイルの全消去は行わない

### 失敗時

- 認証エラーの401はログアウト後にログイン画面へ遷移する。`INVALID_PERMISSION`は認証失効として扱わない
- キックを検出した場合はフロア一覧へ戻す。画面側の入室判定でメンバー限定ルームへの権限がない場合は、ルーム一覧へ戻す
- 接続後にフロア・ルームの削除や入室制限によるアクセス失効通知を受けた場合は、通知の対象範囲に応じた一覧へ戻す
- 上記以外の初期化中のデータ取得失敗では、現在の画面にとどまり、読み上げ用のエラーを通知する。視覚的なエラー表示と再試行ボタンはない。詳細は[タイムラインのエラー時の動作](../screens/Timeline.md#読み込み中データなしエラー時)を参照する
- リアクションAPI失敗は現在コンポーネント内で利用者へ通知しない
- 複数要求・非同期副作用の途中失敗に対する一括ロールバックや補償処理はない

## 関連資料

### 関連仕様

- [ログイン画面](../screens/Login.md)
- [フロア](../screens/Floor.md)
- [フロア一覧のページ表示（FloorPage）](../screens/FloorPage.md)
- [ルーム](../screens/Room.md)
- [タイムライン](../screens/Timeline.md)
- [フロア API](../../backend/api/floor.md)
- [ルーム API](../../backend/api/room.md)
- [タイムラインAPI](../../backend/api/timeline.md)
- [ゲスト向けタイムラインAPI](../../backend/api/timeline-guest.md)
- [アップロードAPI](../../backend/api/upload.md)
- [Socket.IO接続・イベント契約](../../socket-events.md)
- [ロール・権限](../../roles-and-permissions.md)

### 実装

- `frontend/src/views/Login.vue`
- `frontend/src/views/Floor.vue`
- `frontend/src/components/timeline/core/TimelineDialogs.vue`
- `frontend/src/api/floor.js`
- `backend/services/floor/floor.service.js`

### テスト

- `frontend/tests/unit/views/Floor.spec.js`
- `backend/tests/integration/routes/floor-room.crud.int.test.js`
- `frontend/tests/e2e/specs/flows/floor/floor.crud.e2e.js`
- `frontend/tests/unit/views/Timeline.spec.js`
- `frontend/tests/unit/components/timeline/core/TimelineDialogs.spec.js`
- `frontend/tests/e2e/specs/flows/room/room.crud.e2e.js`
- `frontend/tests/e2e/specs/flows/room/room-to-timeline.e2e.js`
- `frontend/tests/e2e/specs/screens/timeline/timeline-dialogs.crud.js`
- `frontend/tests/e2e/specs/flows/roles/role-story-post-reply-supplement-reaction.e2e.js`
