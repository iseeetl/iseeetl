# 共通エラーと通知UI

## 概要

バックエンドのエラーJSON、ステータス、エラーコードは [REST API共通規約](../backend/api-conventions.md) を参照してください。この文書ではフロントエンドでの受け取り方と通知UIを扱います。

## 動作・適用条件

### 共通のエラー表示

- `error.message` を共通エラー領域として保持し、`errorMessage` getter で参照する
- `doUpdateErrorMessage` でエラー文言を更新する
- `error.message`はlocalStorageへ保存・復元し、入室拒否やキックなど遷移先で必要な通知を完全再読込後も一度だけ表示する
- ルーム／フロアは復元した通知をスナックバーへ表示した後、`error.message`をクリアする

### 通知UI（スナックバー）

- `message` に `snackbarVisible` / `snackbarMessage` / `snackbarPosition` / `snackbarDuration` / `snackbarIsInfinity` を保持
- `doShowSnackbar` / `doHideSnackbar` で表示制御する
- `role` に応じてスクリーンリーダー向けの `politeMessage` / `assertiveMessage` を切り替える
- `frontend/src/App.vue`は視覚表示用の共通`UiSnackbar`を常設する
- スクリーンリーダー用に`role="status"`／`aria-live="polite"`と`role="alert"`／`aria-live="assertive"`の不可視領域を常設し、スナックバーと同じVuex message基盤から通知する

### 画面個別の通知

- 管理画面の一部は`UiSnackbar`を使ってローカルに通知表示を行う
- 画面ごとのエラーハンドリングは分散しており、`appendApiErrorMessage` を使った文言整形が多い
- API応答の`error.message`、文字列本文、`statusText`、通信ライブラリのmessageは診断用の正規化結果にだけ保持し、利用者向け表示には直接使用しない
- 利用者向け詳細は安定した`error.code`をフロントエンドの翻訳キーへ変換する。未知コード、HTTPエラー、通信エラーは翻訳済みの「処理に失敗しました」を表示する
- 409 `CONFLICT`で認識済みの`error.details.reason`がある場合は、汎用コード文言よりreason固有の案内を優先する。`ACTIVE_AI_ANALYSIS_REFERENCE`は「有効なAI解析設定で使用されているため削除できません。先に関連するAI解析設定を削除してください」と表示する
- `details.reason`がない、または未知の409 `CONFLICT`は、汎用の「処理に失敗しました」を表示する
- 共通タグ・フロアタグ・ルームタグ管理の削除失敗は、「削除に失敗しました」を基本文言とし、上記のreason固有案内を連結する。ルームタグの復元失敗は「復元に失敗しました」を使用する
- タイムラインの非同期翻訳で一部または全部の対象言語が失敗した場合は、成功分を反映したうえで`TRANSLATION_ERROR`を受け取り、翻訳済みalertを表示する。提供元の技術詳細と失敗言語コードは表示しない
- [APIクライアント](api.md#apiクライアント)の共通処理では、認証エラーの401だけを認証回復と再試行の対象とし、権限不足の`INVALID_PERMISSION`では認証状態を維持する。画面側の`handleAuthError`も同じ条件で判定し、処理済みのログアウトを繰り返さずログイン画面へ遷移する
- `ManagementListBase`は画面側で401全般をログアウトの対象とする。詳細は[管理一覧・検索共通仕様](management-list.md#一覧の表示状態)を参照する

### 計画的なページ離脱と古い通信結果

- Manifest同期による再読込、現在タブでのトップリンク遷移、`pagehide`はメモリ上の計画的離脱状態を設定する
- `pageshow`では計画的離脱状態を解除し、BFCache復帰後の通常エラー通知を妨げない
- タイムラインの初期化・投稿取得・フォーカス投稿取得は画面世代を記録し、画面破棄後または計画的離脱後の結果を画面と共通エラーへ反映しない
- Axiosの`ERR_CANCELED`、`CanceledError`、`AbortError`など明示的なリクエストの中断は利用者エラーとして通知しない
- エラー文言が`Network Error`であることだけでは抑止せず、通常利用中の通信障害は通知する
- ルーム初期化エラーは利用者向け基本文言へ安全な共通詳細を一度だけ連結し、同一文言を重複表示しない

## 関連資料

### 実装

- `frontend/src/store/root.js`
- `frontend/src/components/ui/UiSnackbar.vue`
- `frontend/src/api/apiClient.js`
- `frontend/src/utils/authError.js`
- `frontend/src/views/management/UserManagement.vue`

### テスト

- `frontend/tests/unit/api/apiClient.spec.js`
- `frontend/tests/unit/api/apiErrorMessages.spec.js`
- `frontend/tests/unit/utils/authError.spec.js`
- `frontend/tests/unit/utils/snackbar.spec.js`
- `frontend/tests/unit/App.spec.js`
