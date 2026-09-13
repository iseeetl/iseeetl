# Google Analytics検証

## 目的

テスト用のGoogle Analyticsプロパティで、設定と収集結果を確認し、レポートを解釈する手順です。Google側設定、バックエンド設定、フロントエンド、レポートは変更しません。

製品が送信できるイベント・パラメータ、正規化、除外条件は[Cookie・ブラウザ保存・外部送信](../spec/frontend/cookies-and-external-transmissions.md#送信イベントとパラメータ)を参照してください。

ローカルE2Eは固定ダミーのGoogleタグとローカルCDPモックを使用します。実際のプロパティ、`Realtime`／`DebugView`、保持、削除、緊急停止は検証しません。

## 前提

- テスト用の非本番環境プロパティ／Webストリームと、対象環境との対応を確認します。
- 対象範囲と、設定画面、`Network`、`DebugView`、レポートの閲覧について承認を得ておきます。

前提を確認できない場合は開始しません。

### 情報の取り扱い

- `Measurement ID`、アカウント名、元のUser-ID・仮名User-ID、イベントの送信データ、利用者データを一般ログ、画面共有、作業記録へ転記しません。設定画面や送信データのスクリーンショットも作業記録へ添付しません。
- 記録は対象期間、環境、確認項目、期待値との一致・不一致、照合日時、実行者に限り、アクセス制限された場所へ残します。秘密値や利用者データは含めません。

### 中止条件

- 設定の不一致や、自動`page_view`・ブラウザ履歴による重複イベントがあれば、検証を中止します。環境管理者に設定内容と変更の要否を確認し、解消するまで本番環境での検証は行いません。
- 元のユーザID、ゲストID、秘密値、トークン、メール、本文、クエリ・ハッシュ、許可リスト外のイベント・パラメータの送信が疑われる場合は、追加確認・集計・再掲を止め、プライバシー管理の責任者へ引き継ぎます。
- 個人データの削除や計測の即時停止が必要な場合も、照合不成立として追加操作を止めます。

## 非本番環境設定の照合

次の期待値を設定画面と`Network`で照合します。

| 項目 | 期待する現行設定 |
| --- | --- |
| 環境分離 | 非本番環境専用のプロパティ／Webストリームであり、ステージング・本番環境の`Measurement ID`を相互利用していない |
| アカウント保護 | 二要素認証、復旧手段、所有者、最小権限、定期的なアクセス権の見直しが有効または定義済みである |
| プロパティ | タイムゾーンが`Asia/Tokyo`、通貨が`JPY`、`Reporting identity`が`Observed`である |
| Googleタグ | 専用タグ、送信先1件であり、複数ドメインにまたがる計測や他サイト／プロパティとの結合がない |
| 広告・識別情報の拡張 | `Google Signals`、`Google Ads`連携、`User-provided data`がすべて`OFF`である |
| 実行時の送信フラグ | `allow_google_signals=false`、`allow_ad_personalization_signals=false`である |
| 端末・位置情報 | `Granular location and device data collection`が全地域で`ON`である |
| URL保護 | `email data redaction`が`ON`、`query parameter redaction`が`q`、`floor_id`、`room_id`である |
| 自動収集 | `Enhanced Measurement`が全項目`OFF`で、`Page views`とブラウザ履歴によるページ変更の計測も無効である |
| データ共有・保持 | `account-level data sharing`がすべて`OFF`、`event／user-level retention`が`14 months`、`Reset user data on new activity`が`OFF`である |
| カスタムディメンション | 送信契約の19件がイベントのスコープで登録され、`user_id`、カスタム指標、結合ディメンション、許可リスト外のディメンションがない |
| IP | 元のIPアドレスが独自イベントのパラメータに含まれず、Googleタグの標準処理だけを使用している |

`Enhanced Measurement`は全項目を確認します。

19件のカスタムディメンションは、名称とスコープが送信契約に一致すること、プロパティに必要な空きがあることを確認します。値の種類やレポートの行数の増加、`(other)`を確認した場合は、その影響を確認します。

## 収集結果の照合

1. 前節の設定を照合します。
2. `Network`／`DebugView`で、送信イベントとパラメータが仕様の許可リストに一致し、禁止情報を含まないことを確認します。
3. 画面遷移で自動`page_view`やブラウザ履歴による重複がなく、旧ページの終了、新しいページの計測状態、手動`page_view`の順序が維持されていることを確認します。
4. レポートを次節の基準で読み取り、[情報の取り扱い](#情報の取り扱い)に従って結果を記録します。

## レポートの解釈

- 登録ユーザはバックエンド生成の仮名User-IDとGoogle標準の端末識別情報、ゲストは標準の端末識別情報だけを使用します。`Total users`を実人数やゲストトークンの数と表現しません。
- 対象データはIDを主軸とし、タイトル・名前・ラベルは取得時点の状態を判別するための記録として扱います。名称変更前後のイベントを別の対象データとして単純集計しません。
- 名称パラメータの形式検査は、一般文字列中の氏名、住所、病名等を検出する保証ではありません。これらの情報が疑われる場合も[中止条件](#中止条件)に従います。
- 公開`Measurement ID`、偽装イベント、広告ブロッカー、オフライン、ブラウザの終了による誤差があるため、GA4を操作監査、課金、法的記録、厳密な件数の根拠にしません。

| 目的 | 対象イベント | 主なディメンション | 指標 |
| --- | --- | --- | --- |
| 画面の閲覧・滞在 | `page_view`、`iseeetl_page_exit`、`user_engagement` | `page_group` | `Views`、`Total users`、`Average engagement time` |
| フロア別ルーム一覧 | 同上 | `floor_id`／`floor_title` | 同上 |
| ルーム別タイムライン | 同上、`timeline_view` | `floor_id`／`room_id`と名称 | 同上、`Event count` |
| 投稿等の作成・更新・削除 | `timeline_content_change` | ルーム、`content_type`、`action_type`、`presentation_type` | `Event count` |
| メディア添付 | `timeline_media_attach` | ルーム、`content_type`、`action_type`、`media_type` | `Event count` |
| タグ・リアクション・単語 | 対応する3つの変更・使用イベント | ルーム、種別、操作、対象ID／名称 | `Event count` |
| 絞り込み | `timeline_filter_change`、`timeline_filter_setting`、`timeline_filter_tag` | ルーム、操作、設定、タグ | `Event count` |
| タイムライン表示設定 | `timeline_display_save`、`timeline_display_setting` | ルーム、設定 | `Event count` |

`timeline_filter_setting`と`timeline_display_setting`は一回の保存で複数イベントを送るため、保存回数には使用しません。保存回数は`timeline_filter_change`と`timeline_display_save`で確認します。`timeline_filter_tag`の件数は保存した状態にタグが含まれた回数であり、絞り込みの適用回数ではありません。

## 成功判定

次のすべてを満たした場合に非本番環境の照合を完了とします。

- 対象プロパティ・Webストリームと環境の対応が明確です。
- 現行設定が期待値と一致しています。
- 送信イベント・パラメータ、遷移順、重複、除外条件を確認し、禁止情報がありません。
- レポートの数値を用途と限界に従って解釈できています。
- 秘密値や利用者データを含めず、結果を記録しています。

## Google公式参照

- [Measure single-page applications](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
- [Reporting identity](https://support.google.com/analytics/answer/10976610?hl=en)
- [Data retention](https://support.google.com/analytics/answer/7667196?hl=en)
- [User deletion API migration](https://developers.google.com/analytics/devguides/config/userdeletion/migration)
- [Data deletion requests](https://support.google.com/analytics/answer/9940393?hl=en)

## 関連文書

- [テスト・検証手順](README.md)
- [フロントエンドE2Eテスト実行](e2e-testing.md)
- [Cookie・ブラウザ保存・外部送信](../spec/frontend/cookies-and-external-transmissions.md)
- [Google Analytics設定・仮名ID API](../spec/backend/api/analytics.md)

## 参照コード（代表）

- `frontend/src/features/analytics/runtime.js`
- `frontend/src/features/analytics/pageTracking.js`
- `frontend/src/features/analytics/timelineTracking.js`
- `backend/routes/analytics.route.js`
- `backend/services/analytics/identity.service.js`
