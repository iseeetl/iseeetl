# 投稿詳細（/floor/:floor_id/room/:room_id/post/:post_id）

## 概要

- 共有URLの投稿を、通常のタイムラインの条件なしカラムへ表示する。条件なしカラムがある場合は、絞り込み条件にかかわらず先頭の専用枠で確認できる
- 独立した投稿詳細ビューではなく、[タイムライン](Timeline.md)と同じ`frontend/src/views/Timeline.vue`を使用する
- 投稿、返信、付加情報、リアクション、絞り込み、ルームメンバーなどの操作仕様はタイムラインと共通である

## 利用条件・開き方

- 投稿の「リンクをコピー」、共有URL、またはURLへの直接アクセス

### URL

- パス: `/floor/:floor_id/room/:room_id/post/:post_id`
- ルート名: `TimeLinePostDetail`
- コンポーネント: `frontend/src/views/Timeline.vue`
- メタ情報: `isPublic: true`, `title: 'タイムライン'`
- `:floor_id`と`:room_id`は表示するタイムラインの初期化に、`:post_id`はフォーカス投稿の個別取得に使用する

### 利用条件

- ルート自体は公開ルートだが、表示するルームへの入室判定はタイムラインと同じである
- ログインユーザ向け詳細APIは、取得した投稿が属するルームに対して実行時点のユーザ、システムロール、フロア／ルーム所属を検査する
- ゲスト向け詳細APIは、投稿が属するフロア／ルームが有効かつ公開ルームである場合だけ取得を許可する
- メンバー限定ルーム、キック、削除済みユーザ／フロア／ルーム／投稿、無効なセッションに対する制御はバックエンドAPIとSocket.IOでも行う
- フォーカス後の編集、削除、タグ更新、付加情報、リアクション、キックの権限は[タイムラインの権限表](Timeline.md#利用条件)に従う

## 操作と動作

- 保存済みのカラムがすべてタグで絞り込まれている場合、詳細URLの投稿を表示するカラムがなく、投稿が表示されないことがあります。

### 初期化と表示

1. `created`で`:post_id`を`ui.focusedPostId`へ保存し、同じ画面コンポーネントの再利用中もルートパラメータのwatchで同期する
2. タイムラインと同じ処理で、キック状態、ルームとフロアの組み合わせ、現在ロール、メンバー限定ルームへの入室権限を検査する
3. ルームタグ、ルーム単語、音を鳴らすタグを取得した後、フォーカス投稿の詳細APIを呼ぶ
4. Socket.IO接続時に保存済みカラムまたは条件なしカラムを組み立て、全カラムの通常投稿を取得する
5. Socket.IO接続後にもフォーカス投稿を再取得し、`conditions === null`の各カラムへ重複しないよう先頭挿入する
6. `TimelineColumn`は条件なしカラムでフォーカス投稿を通常一覧から分離し、専用枠へ表示する

- Socket.IO接続前と接続後に詳細APIを呼ぶ。初回はカラムが未構築なら挿入先がなく、接続後の再取得で表示される
- フォーカス投稿はグローバル条件を含む絞り込み判定から分離するため、条件なしカラムがあれば絞り込みに一致しなくても表示する
- 同一カラム内に同じ投稿IDがすでにある場合は追加しない
- フォーカス投稿の専用枠の左端に青い線を表示し、背景色は通知カードとそろえる
- 専用枠では返信を新しい順に並べ、その後に元の投稿を表示する
- 通常投稿一覧からは同じ投稿IDを除外し、二重表示を防ぐ
- `reply=no`と`info=no`を含む表示クエリ、AR表示、タイムライン設定、URLの絞り込みはタイムラインと同じように適用する

- フォーカス投稿とその返信・付加情報・リアクションは、通常のタイムライン項目と同じ操作を提供する
- 「ルームへ戻る」、絞り込み、タイムライン設定、投稿、流す、ルームメンバー本人の脱退など、投稿詳細以外の画面操作もタイムラインと同じである。ルームメンバー招待と一覧は通常のタイムラインと同様に配置せず、ルーム一覧の対象カードから開く
- 絞り込みを追加・削除しても`ui.focusedPostId`は維持する。Socket.IOを再接続した場合は投稿詳細を再取得する
- 同一コンポーネントのまま`:post_id`が変わると`ui.focusedPostId`を更新し、タイムライン初期化済みなら新しい投稿詳細を取得する。通常のタイムラインURLへ戻るとフォーカスIDを`null`へ戻す

## 通信・エラー時の動作

### 使用するAPI

| 利用者 | Method / Path | Request | 正常時 |
| --- | --- | --- | --- |
| ログインユーザ | `GET /api/rooms/:room_id/timeline/posts/:post_id` | pathの`room_id`と`post_id` | 投稿と有効な返信・付加情報・リアクションを返す |
| ゲスト | `POST /api/chat/guest/detail` | `{ post_id }` | 公開ルームの投稿を返す。対象がなければ`200 null` |

- ログインユーザ向けAPIはJWT、ゲスト向けAPIはゲストトークンを必要とする
- `post_id`はMongoDB ObjectId形式で検証する
- ログインユーザはURLのルームへのアクセス権を確認し、そのルーム内の投稿を取得する。別ルームの投稿IDは404となる。ゲストは本文の`post_id`から投稿のルームを認可する。どちらも`floor_id`は送信しない
- タイムライン一覧、ルーム初期化、更新系REST API、Socket.IO通信は[タイムライン](Timeline.md#使用するapi)を参照する

### 読み込み中・データなし・エラー時

- 投稿詳細専用のローディング表示はなく、通常のタイムライン接続・投稿取得と並行してフォーカス投稿を取得する
- ログインユーザ向けAPIで投稿が存在しない、削除済み、またはアクセスできない場合は、「投稿の取得に失敗しました」を先頭とするalertスナックバーを表示する
- ゲスト向けAPIが`200 null`を返した場合や、条件なしカラムがない場合は、フォーカス枠と理由の通知を表示しない
- 無効な`post_id`、ゲストトークン失効、対象ルームへの権限不足などのAPIエラーはalertスナックバーへ表示する
- ルーム自体の初期化失敗、入室拒否、401、キック、Socket.IO切断の扱いはタイムラインと共通である

## 関連資料

### 関連仕様

- [タイムライン](Timeline.md)
- [ルーム](Room.md)
- [フロントエンドルーティング](../routing.md)
- [フロントエンドAPIクライアント](../api.md)
- [ロール・権限](../../roles-and-permissions.md)
- [タイムラインAPI](../../backend/api/timeline.md)
- [ゲスト向けタイムラインAPI](../../backend/api/timeline-guest.md)
- [Socket.IO接続・イベント契約](../../socket-events.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/views/Timeline.vue`
- `frontend/src/components/timeline/core/TimelineColumn.vue`
- `frontend/src/features/timeline/bootstrap.js`
- `frontend/src/api/chat.js`

### テスト

- `frontend/tests/unit/views/Timeline.spec.js`
- `backend/tests/integration/routes/timeline.core.int.test.js`
- `frontend/tests/e2e/specs/flows/timeline/post-detail.e2e.js`
- `frontend/tests/unit/components/timeline/core/TimelineColumn.spec.js`
- `frontend/tests/unit/features/timeline/socket.spec.js`
