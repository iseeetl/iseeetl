# Cookie・ブラウザ保存・外部送信

## 概要

- この文書は、製品が使用するCookie・ブラウザ保存と、ブラウザまたはバックエンドから第三者サービスへ送信する情報をまとめる。
- Cookie／Storageの内部キーとAnalyticsの送信順序・イベント／パラメータ・管理設定はこの文書で管理する。
- APIの取得処理は[APIクライアント](api.md#google-analytics公開設定identity-api)、一時状態は[状態管理](state.md#google-analyticsのアプリ内状態)、画面遷移は[ルーティング](routing.md#google-analyticsのページ計測)を参照する。
- 利用者向けの公開本文は、これらを平易な情報区分と利用目的へまとめた16言語の`frontend/src/content/static/{lang}/cookie.html`、確認手順は[Cookieポリシー](../../manual/features/cookie-policy.md)を参照する。

Cookieポリシーの表示と確認操作は[表示・導線契約](#表示導線契約)に従う。正式な提供地域やUser-ID利用条件を満たさない環境では、バックエンドのGoogle Analytics機能と公開設定を有効にしない。

## 動作・適用条件

### 本システムのCookie

| Cookie | 発行条件 | 属性・パス | 目的 | 既定の期限 |
| --- | --- | --- | --- | --- |
| `guest_refresh` | ゲスト認証の初期化・更新 | HttpOnly、SameSite=Lax、productionだけSecure | ゲストアクセストークン更新 | 30日。JWT自体の満了は再設定で延長しない |
| `iseeetl_media_user` | ユーザログインまたはユーザJWTを検証した通常API | HttpOnly、SameSite=Strict、productionだけSecure、`/media` | 現在のルーム権限を再検査して媒体を表示 | 元ユーザJWTと同じ。既定30日 |
| `iseeetl_media_guest` | ゲストトークン発行・更新またはゲストトークンを検証した通常API | HttpOnly、SameSite=Strict、productionだけSecure、`/media` | 現在のルーム権限を再検査して媒体を表示 | 元ゲストアクセストークンと同じ。既定15分 |
| `line_oauth_state`、`line_oauth_nonce`、`line_lang`、`line_floor_id`、`line_room_id` | LINEログイン開始 | HttpOnly、SameSite=Lax、productionだけSecure | OAuth照合、言語・戻り先維持 | 10分。コールバックでstateの一致を確認後に削除。後続のログイン処理が失敗した場合も削除済み |
| `_ga`、対象Measurement ID用`_ga_*` | GA4の起動条件成立後にGoogle タグが発行 | host-only、パス `/` | GA4標準端末／クライアントの識別情報とセッション状態 | GA4既定の最大2年 |

ユーザ／ゲストのメディアCookieを切り替える際は反対側のCookieを削除する。ログアウトでは`POST /api/auth/logout`の成功応答でユーザ用Cookieを独立に削除し、後続ゲスト認証が失敗してもログアウトを完了する。通信失敗時は完了扱いせず再試行を案内する。`GET /api/analytics/identity`はユーザJWTを検証してもメディアCookieを発行しない。機能必須Cookieをブラウザでブロックまたは削除すると、ゲスト認証更新、保護メディア表示、LINEログイン等が利用不能になる場合がある。

### ブラウザ保存

| 保存先・キー | 主な内容 | 破棄条件 |
| --- | --- | --- |
| localStorage `iseeetl_store` | ユーザのログイン状態・JWT、ゲスト表示情報、言語、フロア／ルーム、タグ、タイムライン設定等。ゲストアクセストークン、外部機能の有効状態、タグのクリップボード、投稿一覧は除外 | ログアウトまたはブラウザデータ削除 |
| localStorage `iseeetl_setting` | タイムラインのフォントと文字サイズ | ブラウザデータ削除 |
| sessionStorage `iseeetl:safe-reload:<release ID>` | チャンク読み込み失敗後の再読み込みを1回に制限するマーカー | 起動成功またはタブ・セッション終了 |

ブラウザ保存は認証状態、画面設定、読込失敗からの復旧に必要である。利用者がブラウザ設定でブロックまたは削除すると、ログアウト、保存済み設定の初期化、または自動復旧の無効化が発生し得る。Analytics専用のlocalStorageのキーは使用しない。
AI解析結果だけを隠す端末設定は使用せず、保存データに値があっても復元しない。

### Google Analytics

#### 起動条件と障害時動作

- GA4はバックエンドの`googleAnalytics=true`確認後、公開Analytics設定APIの応答とMeasurement IDをフロントエンドで検証し、許可リスト済みページの計測状態と現在の識別情報を準備できた場合だけGoogle タグを読み込む。
- 外部機能が無効、公開設定の取得／検証失敗、タグの読み込み失敗、識別情報準備失敗、許可リスト外のコンテキストではGA4への送信を停止する。Analytics障害はログイン、閲覧、投稿等の通常機能を止めない。
- フロントエンドビルド時のMeasurement IDや有効化フラグには依存しない。

#### 利用目的と識別子

- 利用目的は、ページ、ルーム、タイムライン操作の利用状況を把握し、**サイトサービスを改善すること**である。
- 登録ユーザはバックエンド生成の仮名`analytics_user_id`だけをGA4予約済み`user_id`へ設定する。UserのID、ゲストID、単純なハッシュ値を送らない。User-IDによる認証済み／未認証セッション関連付けに必要な同意が確認済みの環境だけで実GAへ送信する。
- 初回ゲストはIdentity APIを呼ばず、アプリ独自のUser-IDを設定しない。GA4標準端末／クライアントの識別情報と`visitor_type=guest`を使用し、ゲスト資格情報数や実人数と表現しない。

#### 送信イベントとパラメータ

製品がGoogle Analyticsへ送信できるカスタムイベントとパラメータは、この節で一元管理する。表の「必須」は送信時のイベントに必ず含める値、「任意」は値が存在し、かつ検証を通過した場合だけ含める値である。`visitor_type`は画面や操作ペイロードから受け取らず、Analyticsの実行処理が送信時の識別情報から付与する。

すべてのタイムラインイベントは、共通必須パラメータとして`floor_id`、`room_id`、`visitor_type`を含む。共通任意パラメータは`floor_title`と`room_title`である。

| イベント | 送信契機 | イベント固有の必須パラメータ | イベント固有の任意パラメータ |
| --- | --- | --- | --- |
| `iseeetl_page_exit` | 初回を除くSPA内の仮想ページ遷移。直前ページの滞在時間を新ページへ切り替える前に確定する | 直前の`page_group`、`page_location`、`page_title`、`visitor_type`と、フロア／ルームの4項目 | 直前の安全な`page_referrer` |
| `page_view` | 許可リスト済みルートグループへの画面遷移。ルーム／タイムラインはリソースAPI初期化成功後 | `page_group`、`page_location`、`page_title`、`visitor_type`と、下記のリソース別必須パラメータ | `page_referrer`と、下記のリソース別任意パラメータ |
| `timeline_view` | ルーム詳細の初期化成功 | なし | なし |
| `timeline_content_change` | 投稿・返信・付加情報の作成・更新・削除成功 | `content_type`、`action_type`、`presentation_type` | なし |
| `timeline_media_attach` | 投稿・返信・付加情報の作成・更新時に主メディアの新規添付成功 | `content_type`、`action_type`、`media_type` | なし |
| `timeline_tag_change` | 投稿・返信のタグ追加・解除成功 | `content_type`、`tag_action`、`tag_id` | `tag_name` |
| `timeline_reaction_change` | リアクションの追加・解除成功 | `content_type`、`reaction_action`、`reaction_type` | なし |
| `timeline_quick_text_use` | 単語ボタンで投稿・返信・付加情報へ文字列を挿入 | `content_type`、`quick_text_id` | `quick_text_label` |
| `timeline_filter_change` | 絞り込みの作成・更新・削除成功 | `action_type` | なし |
| `timeline_filter_setting` | 絞り込みの作成・更新成功後に安全な設定値を送信 | `setting_key`、`setting_value` | なし |
| `timeline_filter_tag` | 絞り込みの作成・更新成功後、最終状態で選択中のタグごとに送信 | `action_type`、`tag_id` | `tag_name` |
| `timeline_display_save` | タイムライン表示設定の保存成功 | なし | なし |
| `timeline_display_setting` | タイムライン表示設定の保存成功後に安全な設定値を送信 | `setting_key`、`setting_value` | なし |

`page_view`のパラメータは次の契約に従う。

- `page_group`は`floor_list`、`room_list`、`timeline`、`login`、`register`、`password_reset_request`、`password_reset_form`、`setting`、`profile`、`change_password`、`terms`、`privacy`、`cookie_policy`、`accessibility`、`contact`、`tutorial`のいずれかとする。
- `page_location`は現在オリジンと許可リスト済みパスだけで構成する。ルーム一覧は`/floor/<floor ObjectId>`、タイムライン／投稿詳細は`/floor/<floor ObjectId>/room/<room ObjectId>`とし、リソースIDはルートとAPI応答が一致した小文字24桁16進数だけを含める。クエリ、ハッシュ、投稿ID、名称、ユーザ名、パスワードを含めない。
- `page_title`は画面上の任意タイトルではなく、`page_group`と同じ固定値とする。
- `page_referrer`は同一オリジンで直前に送信した許可リスト済みの安全なURLだけを使用する。別オリジンまたは不正な値はパラメータごと省略する。
- `page_group=room_list`は`floor_id`を必須、`floor_title`を任意とし、`room_id`と`room_title`は`null`にする。ロール・キック・フロア詳細・ルーム一覧の初期化がすべて成功し、ルートのフロアIDとAPIで取得したフロアIDが一致した場合だけ送る。
- `page_group=timeline`は`floor_id`と`room_id`を必須、`floor_title`と`room_title`を任意とする。ルーム詳細とルームタグ等の初期化が成功し、ルートのフロア／ルームIDとAPIで取得したルーム情報が一致した場合だけ送る。
- 上記以外の`page_group`は`floor_id`、`floor_title`、`room_id`、`room_title`をすべて`null`にする。名称だけが不正な場合は対応する名称スロットを`null`にし、必須IDが欠落、不正、ルート不一致の場合は`page_view`自体を送らない。
- すべての手動`page_view`はフロア／ルームの4項目をイベント範囲で明示する。初回を除くSPA内のページ切替では、直前の送信済みページ設定を維持したまま`iseeetl_page_exit`へ旧ページの計測状態をイベント範囲で明示し、次に同じ4項目を含む設定を新ページの計測状態へ`update:true`で更新してから、新コンテキストの`page_view`を送信待ちへ追加する。更新した設定は後続イベントにも適用する。
- `iseeetl_page_exit`へ`engagement_time_msec`を手動指定しない。Google タグが未送信の滞在時間を次の収集イベントへ自動付与する動作を使用する。予約済みの自動収集イベントである`user_engagement`は手動送信しない。
- `iseeetl_page_exit`はGoogleの予約イベント名との衝突を避けた製品固有の接頭辞の固定カスタムイベント名とする。仮想ページ遷移ごとにイベント数を1件増やすが、`page_view`件数と表示回数は増やさず、キーイベントにも指定しない。
- 未解決のリソース遷移では新しい`null` 設定を先行適用せず、新コンテキスト有効化時の`iseeetl_page_exit`と設定更新、または計測対象外ルートで実行時処理を停止するまで最後の送信済みページの計測状態を維持する。新しいリソースの操作イベントと古い非同期成功は世代トークンで遮断する。
- リソースの表示の重複判定は安全なリソースURLと接頭辞なしの`floor_id`／`room_id`で行う。別フロア／ルームは別のページ表示、同じルームの投稿詳細、クエリ／ハッシュ変更、識別情報再設定だけでは同じページ表示とする。

選択式パラメータは次の値だけを許可する。

| パラメータ | 許可値 |
| --- | --- |
| `visitor_type` | `guest`、`registered` |
| `content_type` | `post`、`reply`、`post_supplement`、`reply_supplement` |
| `action_type` | `create`、`update`、`delete` |
| `presentation_type` | `static`、`flow`。付加情報は`static`だけ |
| `media_type` | `image`、`video`、`audio` |
| `tag_action`、`reaction_action` | `add`、`remove` |
| `reaction_type` | `いいね`、`超いいね`、`拍手`、`笑顔`、`びっくり` |

設定イベントの`setting_key`と`setting_value`は次の組合せだけを許可する。キーワードとユーザ名は送らず、設定を使用しているかを固定値へ変換する。絞り込みで選択中のタグは設定イベントへ含めず、別の`timeline_filter_tag`として送る。

| イベント | `setting_key` | 許可する`setting_value` |
| --- | --- | --- |
| `timeline_filter_setting` | `filter_mode` | `include`、`exclude` |
| `timeline_filter_setting` | `show_range` | `all`、`target` |
| `timeline_filter_setting` | `keyword_used`、`user_name_used`、`tag_used`、`no_tags`、`animation`、`web_push`、`show_user_icon` | `true`、`false` |
| `timeline_filter_setting` | `keyword_operator`、`tag_operator` | `or`、`and` |
| `timeline_display_setting` | `speech_speed_bucket` | `off`、`slow`、`normal`、`fast` |
| `timeline_display_setting` | `display_name`、`display_date`、`display_tag`、`display_supplement`、`display_action_button`、`enable_text_animation`、`display_user_kick_button` | `true`、`false` |
| `timeline_display_setting` | `animation_speed` | `slow`、`normal`、`fast`、`very_fast` |

`timeline_filter_tag`は、絞り込みの作成・更新に成功した時点で選択中のタグを対象とする。正規化・重複除外したタグごとに1件送る。`action_type`は`create`または`update`だけを許可し、削除時は送らない。
キーワード、対象ユーザ名、その他の条件全体は含めない。このイベントの件数は、保存時に各タグが選択されていた回数であり、保存済み絞り込みの適用回数や現在有効な絞り込み数を表さない。

#### ID・名称の正規化と除外

| パラメータ | 正規化・検証 | 不正時の扱い |
| --- | --- | --- |
| `floor_id` | 24桁16進ObjectIdを小文字化し、接頭辞は付けない | 必須のためイベントを送らない |
| `room_id` | 24桁16進ObjectIdを小文字化し、接頭辞は付けない | 必須のためイベントを送らない |
| `tag_id` | 24桁16進ObjectIdを小文字化し、`tag_`を付与 | 必須のためイベントを送らない |
| `quick_text_id` | 24桁16進ObjectIdを小文字化し、`quick_`を付与 | 必須のためイベントを送らない |
| `floor_title`、`room_title`、`tag_name`、`quick_text_label` | Unicode NFC化、前後の空白除去、Unicodeコードポイント単位で先頭100文字まで | 空値または禁止形式なら名称パラメータだけを省略する |

名称の禁止形式は、改行・制御文字、対になっていないサロゲート文字、メールアドレス、絶対URL、10〜15桁の電話番号候補、JWT、`authorization`／`bearer`／`token`等の割当形式、識別用の接頭辞付きトークン、長い16進数・Base64候補、UUIDである。タイムラインではAPIから取得したフロア・ルーム・ルームタグの原文の名前を、取得時点の情報として保持し、翻訳後表示値やコンポーネント由来の任意名称を使用しない。

この禁止形式は既知の資格情報・連絡先形式を減らす追加防御であり、一般文字列から氏名、住所、病名等を判定する
PII検出ではない。フロア／ルームタイトル、タグ名、単語ラベルは入力者が個人情報・秘密情報を含めない運用を前提とし、
単語ラベルは後で投稿等の本文へ挿入され得る文字列である。したがって「本文パラメータを送らない」ことと
「単語ラベルに本文相当の文字列が絶対に含まれない」ことを同一の保証として扱わない。実環境で名称パラメータを
有効にするには、データ管理者による既存値の確認、入力ルール、プライバシーポリシー責任者の承認、誤送信時の停止・削除手順を用意する。満たせない環境ではバックエンドの外部機能を有効にしない。

必須パラメータが欠落または不正な場合はイベント自体を送らない。任意パラメータが欠落または不正な場合は、そのパラメータだけを省略してイベントを維持する。ルーム変更、初期化失敗、入室拒否、画面破棄後の遅延成功は、世代付きルームトークンと現在コンテキストの照合により送らない。

#### カスタムパラメータへ送信しない情報

- UserのID、ゲストID、ゲスト資格情報、メール、ユーザ名、ゲスト名
- 投稿・返信・付加情報本文、翻訳・文字起こし本文、ファイル名、キャプション
- ルートのクエリ／ハッシュ／認証情報、絞り込みのキーワード、絞り込み条件対象ユーザ名
- トークン、認証Cookie値、API本文、エラー、スタックトレース、キー入力
- フロア／ルームの説明、単語グループタイトル、翻訳後の名称

IPアドレス、ブラウザヘッダー等の通常通信情報とGA4標準情報はカスタムパラメータとは別にGoogleが処理し得る。製品はこれらを独自パラメータとして追加しない。Analyticsイベントの検証、変換、送信処理に失敗しても、製品の保存・削除結果、表示、Socket、通知を変更しない。

#### Google側の標準処理と設定

- HTTPS通信時にはIPアドレス、ブラウザヘッダー等の通常通信情報がGoogleへ到達する。製品はIPをカスタムパラメータへ設定しない。Googleの公開説明に基づき、IPは大まかな地域等の処理に使われるが未加工のIPアドレスはGA4へ記録・保存されないものとして利用者へ説明する。
- GA4は標準のクライアント／端末の識別情報、ブラウザ、OS、端末の種類、言語、大まかな地域、利用時間などの情報を処理し得る。
- `Granular location and device data collection`は全地域で`ON`、`Reporting identity`は`Observed`とする。
- `Google Signals`、`User-provided data`、`Google Ads`連携、広告のパーソナライズ、`Enhanced Measurement`全項目、`data-sharing settings`全項目は`OFF`とし、クロスドメイン計測を使用しない。
- 実行時処理も`allow_google_signals=false`と`allow_ad_personalization_signals=false`へ固定する。
- Google側の`Data redaction`はメールアドレスを`ON`とし、URLのクエリパラメータの`q`、`floor_id`、`room_id`を対象にする。このクエリのマスキングはURL内の値を保護する追加防御であり、本仕様で定義するカスタムイベントパラメータの`floor_id`、`room_id`はこの文書のイベント契約どおり送信する。
- イベント／ユーザ単位のデータ保持は14か月、`Reset user data on new activity`は`OFF`とする。期限到達データはGoogleの月次処理で削除される。同じ保持制限は標準集計レポートへ適用されず、Analytics Cookieの最大2年とも区別する。
- イベントスコープのカスタムディメンションは次節の19件だけを登録する。`user_id`、カスタム指標、IDと名称を結合したディメンション、許可リスト外のディメンションを追加しない。
- 利用者向け本文には、Googleのプライバシーポリシーと、Googleが提携サイトやアプリから収集した情報を扱う方法の公式リンクを記載する。Google Analyticsのデータ保護説明は必要に応じて併記できる。

#### イベントスコープのカスタムディメンション

次の19件をすべてイベント範囲で登録する。

| 分類 | カスタムディメンション |
| --- | --- |
| ページ／利用者 | `page_group`, `visitor_type` |
| フロア／ルーム | `floor_id`, `floor_title`, `room_id`, `room_title` |
| 内容操作 | `content_type`, `action_type`, `presentation_type`, `media_type` |
| タグ／リアクション | `tag_id`, `tag_name`, `tag_action`, `reaction_type`, `reaction_action` |
| 単語／設定 | `quick_text_id`, `quick_text_label`, `setting_key`, `setting_value` |

- レポートではリソースIDを集計軸とし、タイトル・名称・ラベルは送信時点の表示名として扱う。名称変更前後のイベントを別リソースとして単純集計しない。
- 公開Measurement ID、偽装イベント、広告ブロッカー、オフライン、ブラウザ終了による欠落があるため、GA4を操作監査、課金、法的記録、厳密件数の根拠に使用しない。

### 第三者サービスの棚卸し

| 送信先 | 送信契機 | 主な送信情報 | 目的・回避境界 |
| --- | --- | --- | --- |
| Google Analytics | GA4起動条件成立、許可リスト画面、ルーム初期化成功または対象操作成功 | 前節のAnalyticsの許可リスト、GA4標準通信情報 | ページ・ルーム・タイムライン操作の利用状況を把握し、サイトサービスを改善 |
| Google Fonts | `index.html`表示 | IPアドレス、ブラウザヘッダー等の通常通信情報 | フォント・アイコン表示。常時取得 |
| Google Identity Services | Googleログイン利用可能なログイン画面表示とログイン操作 | 通常通信情報、Googleの認証情報 | Googleログイン。外部機能が無効な場合はスクリプトを読み込まない |
| LINEログイン | 利用者がLINEログインを開始 | OAuth 状態／nonce、言語、戻り先、LINEアカウント認証情報 | LINEログイン。利用者操作後だけ開始 |
| OneSignal | OneSignal利用可能時のSDKの読み込み、プッシュ通知の許可・通知送信 | プッシュ通知の購読情報、仮名External ID、通知見出し・本文、通常通信情報 | Webプッシュ通知。プロフィール／ブラウザ通知設定で停止 |
| Google Cloud Translation | 翻訳機能有効時に翻訳対象を保存・更新 | フロア／ルームのタイトル・説明、タグ名、単語、投稿・返信・付加情報本文等 | 翻訳。外部機能が無効な場合は送信しない |
| OpenAI | OpenAI機能有効時の設定駆動解析・文字起こし | 対象の画像・動画・音声または投稿・返信本文、解析プロンプト、出力言語 | AI解析・文字起こし。外部機能が無効な場合は送信しない |
| 環境で設定されたメール配送サービス | 仮登録の案内、パスワード再設定・変更等 | 宛先メール、案内本文、一時URL／トークン | アカウントに関するメール。メール配信機能無効時は対象導線を閉じる |
| X | 利用者が投稿のX共有を押す | ルームURL、投稿本文、ハッシュタグ | 利用者操作による共有。送信前にX画面で確認 |
| iOSの共有機能で利用者が選択した送信先 | iOSのホーム画面から起動したアプリで利用者が画像のダウンロード／共有を選択 | 画像ファイルと画像名 | OSのWeb Share機能を介した利用者操作による共有。送信先での取扱いは製品の管理外 |

チュートリアル動画はすべて同一オリジンのMP4を使用し、外部動画サービスへ通信しない。

### 表示・導線契約

- `CookiePolicy`は`/cookie`の公開ルートで、ログイン状態・外部機能の有効状態にかかわらず表示する。
- ログイン画面、ユーザ登録、ゲスト利用規則、AppMenu、プライバシーポリシーからCookieポリシーへ到達できる。
- ユーザ登録の必須チェックボックスと、ログイン画面／ゲストの「同意したとみなす」文には、利用規約・プライバシーポリシーと同列にCookieポリシーを明示する。ログイン画面の案内はメール+パスワード、Google、LINEのすべてを対象とする。Analytics専用の別チェックボックスは設けない。
- Cookieポリシーは静的本文だけを表示し、Analyticsの停止／再開操作部品を表示しない。
- フロア／ルームタイトル、タグ名、単語項目ラベルの入力欄、およびタグCSV ファイル入力欄には、Analytics専用の案内や入力欄ごとのCookieポリシーリンクを表示しない。これは表示だけの契約であり、前節の送信条件やパラメータ契約を変更しない。
- 利用者向けの送信先、情報の区分、目的、送信場面は公開Cookieポリシーにまとめている。各入力画面には同じ詳細を繰り返さない。
- 公開Cookieポリシーには内部キー、API、実行時処理、Analyticsのイベント／パラメータ・管理画面設定を列挙しない。運用担当が必要とする具体的な送信値と送信を停止する条件はこの文書で管理する。
- プライバシーポリシーは取扱情報と利用目的を説明し、Cookie・ブラウザ保存・第三者サービスの詳細を公開Cookieポリシーへ参照する。両文書で同じ技術説明を重複させない。

## 関連資料

### 実装

- `backend/services/analytics/identity.service.js`
- `frontend/src/features/analytics/contract.js`
- `frontend/src/features/analytics/runtime.js`
- `frontend/src/features/analytics/timelineTracking.js`
- `frontend/src/content/static/{lang}/cookie.html`

### テスト

- `frontend/tests/unit/content/cookiePolicyContent.spec.js`
- `frontend/tests/unit/features/analytics/contract.spec.js`
- `frontend/tests/unit/features/analytics/runtime.spec.js`
- `frontend/tests/unit/features/analytics/pageTracking.spec.js`
- `frontend/tests/unit/features/analytics/timelineTracking.spec.js`
