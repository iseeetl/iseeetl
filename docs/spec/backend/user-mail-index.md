# ユーザメールの一意索引

## 概要

同じメールアドレスで複数のユーザが登録されることを防ぐ索引と、起動時の作成を説明します。

## 動作・適用条件

### 制約と定義

Userのメールは、文字列値だけに一意制約を設けます。null・未設定は複数保存でき、文字列メールは論理削除済みユーザを含めて重複を拒否します。

`backend/models/User.js`に次の索引を定義しています。

| 名前 | キー | オプション |
| --- | --- | --- |
| `uniq_users_mail_string` | `{mail: 1}` | `unique: true`、`partialFilterExpression: {mail: {$type: 'string'}}` |
| `users_password_reset_token_hash` | `{'password_reset.token_hash': 1}` | `sparse: true` |

### 起動時の作成

Userモデルは`autoIndex: true`で、上記の索引を起動時に自動作成します。既存の同じ索引は維持し、作成に失敗した場合は受付を開始せず終了します。既存DBへの反映前の確認と失敗時の対処は[起動時の索引作成](overview.md#起動時の索引作成)を参照してください。

[テスト環境](../../testing/test-environment.md)では専用DBの初期化時に索引を作成します。索引作成に失敗した場合、E2Eの初期化は固定ユーザを登録せず失敗します。この準備処理は既存索引の削除や既存DBの移行を行いません。

参照: [ドメインモデル](../domain-model.md)、[テスト環境](../../testing/test-environment.md)、[E2E手順](../../testing/e2e-testing.md)。

## 関連資料

### テスト

- `backend/tests/integration/models/test-indexes.int.test.js`
- `backend/tests/integration/models/startup-indexes.int.test.js`
- `backend/tests/unit/scripts/reset-e2e-database.test.js`
