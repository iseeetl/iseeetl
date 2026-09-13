# ルーティングとガード

## 概要

この文書では、Vue Routerの構成、画面単位のアクセスメタデータ、ナビゲーションガード、遷移前後の共通処理を扱います。全ルートと対応する画面仕様は[画面仕様一覧](screens/README.md)を参照してください。

## 動作・適用条件

### ルーティング構成

- `frontend/src/router.js`は`createApplicationRouter(options)`を生成関数とし、ルート、認証アダプタ、画面タイトル翻訳、ブラウザ境界、任意のAnalyticsのページ計測処理を受け取ってガードと遷移後処理を登録したRouterを返す
- 既定の履歴方式は`createWebHistory('/')`、Viteの`base`は`'/'`であり、フロントエンドはオリジン直下への配置を前提とする
- `frontend/src/routes/public.js`の21ルートと`frontend/src/routes/management.js`の14ルートを`frontend/src/router.js`で結合する
- 公開側21ルートの内訳は、`meta.isPublic`が20ルート、`meta.requiresAuth`が1ルートである
- 管理側14ルートはすべて`meta.isManagement`を持つ
- 現在の35画面ルートレコードは、アクセス方針として`isPublic`、`requiresAuth`、`isManagement`のいずれか1つを持つ
- 各画面コンポーネントは動的に読み込む
- どの画面ルートにも一致しないフォールバックルートは`/`へリダイレクトし、画面を表示しないためアクセス制御のメタデータを持たない

バックエンドは`connect-history-api-fallback`を使ってhistoryモードの直接アクセスをフロントエンド成果物へ接続する。`/api`、`/media`、プロフィール画像配信用の`/profile`はリライトせず、フロントエンド成果物は`DIST_PATH`で解決したディレクトリから静的配信する。

### アクセスメタデータ

| メタデータ | ルートガードでの扱い |
| --- | --- |
| `meta.isPublic` | ログイン状態やユーザロールを確認せず通過させる |
| `meta.requiresAuth` | ローカル状態を復元し、`userIsLogin`が`true`の場合だけ通過させる |
| `meta.isManagement` | ローカル状態を復元し、`userIsLogin`が`true`かつ`userRole`が`Administrator`の場合だけ通過させる |

ガードは`to.matched`の各レコードを調べるため、親子ルートでは一致したいずれかのレコードにあるアクセス制御のメタデータが適用される。アクセス制御のメタデータが1つもないルートは、認証確認なしで通過する。

#### 主なルート固有設定

- `ChangePassword`（`/changepassword`）は`requiresAuth`を持つ。プロフィールは独立ルートを持たず、App共通ダイアログとして表示する
- `Help`（`/help`）は未ログインでも利用できる`isPublic`ルートである
- `Terms`、`Privacy`、`CookiePolicy`、`Accessibility`、`Contact`は同じ`StaticDocumentView`を使用し、`meta.staticContentName`で5種類の言語別本文を選択する
- タイムラインデータ管理は次の2つの`isManagement`ルートで構成する
  - `/management/timeline`: 対象フロアの一覧
  - `/management/timeline/floor/:floorId`: 指定フロアのルーム一覧とデータダウンロード。`floorId`を画面のpropsとして渡す
- `/management/ai-analysis-settings`はAdministratorが共通AI解析設定を管理する。フロア／ルーム設定はルーム画面内ダイアログで扱う

ルートメタデータは画面へ入る前のログイン・管理者判定だけを担う。フロア、ルーム、投稿など対象データ単位の閲覧・操作権限は、各画面とAPIの権限制御を正とする。

### 遷移前処理（beforeEach）

すべての遷移で、先に次のUI状態を初期化する。

- `doSetInertAppContainer(false)`を実行し、画面全体の`inert`状態を解除する
- アプリケーションルートまたはその直下の子コンポーネントが`menuVisible`を持つ場合、メニューを閉じる

その後、アクセスメタデータを次の順序で評価する。

1. `isPublic`があれば、そのまま遷移する。
2. `requiresAuth`または`isManagement`があれば、`doLoadState`でローカル状態を復元する。
3. `userIsLogin`が`false`なら`doLogout`をdispatchし、`/login`へ遷移する。
4. `isManagement`かつ`userRole !== 'Administrator'`の場合も`doLogout`をdispatchし、`/login`へ遷移する。
5. ログイン済みの一般ルート、またはAdministratorの管理ルートは遷移を許可する。

ログイン判定は`user.token`の有無ではなく、`store.getters.userIsLogin`を使用する。ガードは`doLogout`の完了を待たずに`/login`への遷移を開始する。

### 遷移後処理（afterEach）

1. 現在URLに合わせてWeb App Manifestのリンクを更新する。
2. iOS／iPadOS Safariの非standalone表示で、初回読込時と異なるショートカット用マニフェストが必要な場合は計画的離脱状態を設定してから現在ページを再読込し、その遷移では以降のタイトル処理を行わない。
3. `Vue.nextTick`で文書タイトルを更新する。
4. 同じ`nextTick`内でタイトル更新後にAnalyticsのページ計測処理へ遷移結果を渡す。計測処理が未指定なら通常の遷移後処理だけを行う。

文書タイトルは「アイシータイムライン」と`to.meta.title`の翻訳結果を組み合わせる。`meta.title`がない管理ルートなどでは基本タイトルだけを使用する。Web App Manifestの選択・再読込条件は[HTML、マニフェスト、外部サービス](build-and-config.md#htmlマニフェスト外部サービス)を参照する。

### 画面内の戻るボタン

戻り先は画面ごとに指定し、直前に閲覧した画面には依存しない。直接URLを開いた場合も、戻り先がある画面にはボタンを表示する。ツールチップと読み上げ名は実際の戻り先を示す。ブラウザの戻る・進むは、ブラウザの閲覧履歴に従う。

| 画面 | 戻り先 |
| --- | --- |
| ルーム一覧 | フロア一覧 |
| タイムライン・投稿を指定したタイムライン | URLで指定された所属フロアのルーム一覧 |
| ログイン、設定、ヘルプ、チュートリアル、利用規約、プライバシー、Cookieポリシー、アクセシビリティ、お問い合わせ | フロア一覧 |
| ユーザ登録 | ログイン。`floor_id`・`room_id`を引き継ぐ |
| パスワード変更 | プロフィールを開いた元の画面へ戻ってプロフィールを開く。元の画面が記録されていなければ、フロア一覧で開く |
| パスワード再設定リンク送信 | ログイン。`floor_id`・`room_id`を引き継ぐ。パスワード変更から開き、ログイン中の場合だけパスワード変更へ戻る |
| パスワード再設定 | ログイン。完了・トークン検証失敗時の案内リンクも同じ |
| タイムラインデータ管理のルーム一覧 | タイムラインデータ管理のフロア一覧 |

フロア一覧とその他の管理画面には戻るボタンを設けない。アクティベーション結果と招待完了画面は、結果に応じた既存の移動ボタンを使う。ダイアログを閉じると、元の画面でダイアログを開いたボタンへフォーカスを戻す。

ログイン・登録画面の規約類のリンクは別タブで開く。入力中の操作は元のタブで続ける。規約類のタブで戻るボタンを押すとフロア一覧へ移動する。

プロフィールからパスワード変更へ移動する場合は、次のように戻り先を管理する。

- プロフィールを開いた元の画面を、戻り先として`App.vue`のメモリに1件だけ保持する。
- パスワード変更から再設定リンク送信へは`from=ChangePassword`を付け、往復中は戻り先を上書きしない。
- パスワード変更と`from=ChangePassword`付きの再設定リンク送信以外へ移動すると、保持した戻り先を破棄する。ログアウト・再読み込み時も破棄する。
- 戻り先への移動と描画が終わってからプロフィールを開く。移動を取り消した場合は開かない。

パスワード変更に成功した場合は、ログアウトしてログイン画面へ移動する。

### Google Analyticsのページ計測

`frontend/src/features/analytics/contract.js`はルート名とAnalytics専用の仮想ページ識別子を次の固定分類へ変換します。
Router由来では現在Routerに存在する分類対象だけをページ計測処理が扱い、クエリ、ハッシュ、`fullPath`をページの計測状態へ使用しません。
ルーム／タイムラインのルートのparamsはリソース初期化トークンの候補にだけ使用し、APIから取得した翻訳前のリソースデータのIDと
一致する場合に限って対象リソースの計測状態を確定します。

| ルート名／仮想識別子 | `page_group` | 安全な`page_location`のパス |
| --- | --- | --- |
| `Floor`, `FloorPage` | `floor_list` | `/` |
| `Room` | `room_list` | `/floor/<floor ObjectId>` |
| `TimeLine`, `TimeLinePostDetail` | `timeline` | `/floor/<floor ObjectId>/room/<room ObjectId>` |
| `Login` | `login` | `/login` |
| `Register` | `register` | `/register` |
| `SendResetPasswordLink` | `password_reset_request` | `/user/sendresetpasswordlink` |
| `ResetPassword` | `password_reset_form` | `/user/resetpassword` |
| `Setting` | `setting` | `/setting` |
| `ChangePassword` | `change_password` | `/changepassword` |
| `Terms` | `terms` | `/terms` |
| `Privacy` | `privacy` | `/privacy` |
| `CookiePolicy` | `cookie_policy` | `/cookie` |
| `Accessibility` | `accessibility` | `/accessibility` |
| `Contact` | `contact` | `/contact` |
| `Tutorial` | `tutorial` | `/tutorial` |
| `Profile`（仮想識別子） | `profile` | `/profile` |

管理ルート、ヘルプ、招待完了、単語画面など表にないルートは計測対象外です。
`Profile`はルーターのルート名ではなく、プロフィールダイアログを計測するAnalytics専用識別子である。
`/profile`も画面URLではなく仮想`page_location`だけに使用する。

- Google タグは、最初の分類済みルートから送信可能な基本ページ情報を生成できるまで読み込まない。リソースを必要としないルートは画面遷移後、ルーム／タイムラインはAPI初期化成功後に`page_view`を手動送信する
- ルームルートは画面遷移時にリソーストークンを取得し、ロール・キック・フロア詳細・ルーム一覧の初期化がすべて成功した後、APIから取得したフロアとルートIDの一致を確認して計測を開始する
- `TimeLine`／`TimeLinePostDetail` ルートもリソーストークンを取得し、ルーム詳細とルームタグ等の初期化が成功した後、APIから取得したルーム・所属フロアとルートIDの一致を確認して計測を開始する
- ページの計測状態の項目と、`iseeetl_page_exit`、設定更新、`page_view`の送信順序は[Cookie・ブラウザ保存・外部送信](cookies-and-external-transmissions.md#送信イベントとパラメータ)に従う
- URLを変更しないプロフィールダイアログは`Profile`を仮想ページとして開始する。通常終了では同じ送信順序で背面コンテキストへ戻り、背面ルートの復帰`page_view`を1回送る。パスワード変更では背面を再送せず実ルートへ進む
- リソース遷移の開始、API失敗、取消では新しい設定を先行適用せず、新コンテキストの有効化または計測対象外ルートによる停止まで、最後に送信したページの計測状態を維持する
- リソース遷移開始時に操作イベントの世代トークンを無効化する。新リソースが未解決の間、旧ルームの遅延成功や新ルームの操作を送らず、成功した対象リソースの計測状態の世代トークンと一致するイベントだけを許可する
- `page_referrer`は同一オリジンで直前に送信成功した上表の安全なURLだけを使い、利用不能化または破棄時に消去する
- 同じリソース内のクエリ／ハッシュ変更、`Floor`／`FloorPage`間、同じルームの`TimeLine`／`TimeLinePostDetail`間は重複送信しない。別フロア／ルームへの移動は同じ`page_group`でも新しいページとして各1回送る
- ログイン／ログアウトによる識別情報再設定だけでは`page_view`を再送せず、次の分類済みルート遷移で送る
- 画面遷移の失敗では現在ルートと成功済みページ／対象リソースの計測状態を維持し、失敗した遷移先を計測しない。計測対象外ルートでは実行時処理を停止してページの計測状態を破棄し、Router処理から設定やイベントを`dataLayer`へ追加しない
- Analyticsの準備中は最新の分類済みルートとAPIで解決済みの対象リソースの計測状態だけをメモリへ保留し、準備完了時の現在ルート／リソースキーと一致する場合だけ1回送る。準備中のルート／リソース変更、外部機能の無効化、識別情報失敗、古いAPI応答では保留を破棄する

登録ユーザ／ゲストの識別情報準備と内部送信停止状態は[状態管理](state.md#google-analyticsのアプリ内状態)、
Google タグの公開設定取得は[ビルド・設定](build-and-config.md#フロントエンド公開環境変数)を参照してください。

### 完全なページ遷移と計画的離脱

- Manifest同期による再読込は、`window.location.reload()`の直前にメモリ上の計画的離脱状態を設定する
- ヘッダーのISeeeTimeLineリンクは`<a href="/">`による完全なページ遷移を維持し、現在タブで実際に遷移するクリック時だけ計画的離脱状態を設定する
- `pagehide`では完全なページ離脱を記録し、BFCacheからの復帰を含む`pageshow`では状態を解除する
- 修飾キー付きクリック、別タブ表示、ダウンロードリンクは計画的離脱として扱わない
- 計画的離脱に伴うリクエストの中断の通知方針は[共通エラーと通知UI](error-handling.md)を参照する

### AppMenuからの補助遷移

#### プロフィールダイアログ

ログイン中のアプリメニューにある「プロフィール」はルートリンクではなく、現在のルートを維持してApp共通のプロフィールダイアログを開く操作である。メニューを閉じた次の描画時点でダイアログを開き、メニューとダイアログのフォーカス管理を重ねない。ヘッダーのプロフィール画像も同じダイアログをURL変更なしで開く。Analyticsでは開閉を仮想ページ遷移として扱い、背面画面とプロフィールの滞在区間を分ける。

プロフィールダイアログからパスワード変更を選んだ場合だけ、ダイアログを閉じてから`ChangePassword`へ遷移する。Analyticsの背面復帰は遷移結果まで保留し、Routerが`afterEach`前に例外終了した場合も元のページの計測状態を明示的に復元する。

#### ルーム情報のクエリ

`frontend/src/components/app/AppMenu.vue`のルームコンテキスト補助関数は、`Login`、`Register`、`Terms`、`Privacy`、`CookiePolicy`への遷移で、現在位置の`floor_id`と`room_id`をクエリへ引き継ぐ。

- 既存の遷移先クエリは維持し、同名の`floor_id`、`room_id`を上書きしない
- 取得元はルートparams、クエリ、`/floor/:floor_id/room/:room_id`形式のpathnameの順に確認する
- 対象外の名前付きルートにはIDを追加しない

### HTTP 401との責務分担

画面へ入る前の保護は`router.beforeEach`が担当する。画面表示後のAPIリクエストで発生した401、ログアウトの重複防止、ゲストトークンの更新と再試行は[フロントエンドAPI](api.md#apiクライアント)に従う。

## 関連資料

### 実装

- `frontend/src/router.js`
- `frontend/src/routes/public.js`
- `frontend/src/routes/management.js`
- `frontend/src/features/analytics/contract.js`
- `frontend/src/features/analytics/pageTracking.js`

### テスト

- `frontend/tests/unit/router.spec.js`
- `frontend/tests/unit/App.navigation.spec.js`
- `frontend/tests/unit/components/common/BackButton.spec.js`
- `frontend/tests/e2e/specs/flows/account/back-navigation.e2e.js`
- `frontend/tests/unit/features/analytics/pageTracking.spec.js`
- `frontend/tests/unit/features/analytics/contract.spec.js`
- `frontend/tests/unit/routes/public.spec.js`
- `frontend/tests/unit/routes/management.spec.js`
