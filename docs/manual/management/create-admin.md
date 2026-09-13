# 管理者アカウントの作成

環境管理者が、アプリへログインする管理者（`Administrator`）を新規作成する手順です。初期導入時にも使用できます。MongoDBへ接続するためのDBユーザは、このツールでは作成しません。

## 準備

- 対象バージョンのソースコードを取得してください。このCLIは配布アーカイブには含まれません。
- リポジトリルートで実行します。Node.jsとバックエンドの依存パッケージは[ローカル開発の準備](../../testing/local-development.md)に従って用意してください。アプリの起動は不要です。
- バックエンド用の環境ファイルに、対象DB名を含む`DB_CONNECT`を設定します。シェルの環境変数や別の環境ファイルでは補いません。
- 対象DBへの接続、ユーザの登録、Userモデルの索引作成に必要なDB権限を用意します。

| 登録項目 | 入力条件 |
| --- | --- |
| ユーザ名 | 1～20文字 |
| メールアドレス | 正しいメール形式で100文字以内。前後の空白を除き、小文字で保存 |
| パスワード | 8～16文字。端末で非表示入力 |

## 作成する

環境ファイルのパス、ユーザ名、メールアドレスを置き換え、対話端末で実行します。相対パスは現在の作業ディレクトリを基準にします。

```bash
node backend/scripts/create-admin.js \
  --env-file '<バックエンド用.env.stagingのパス>' \
  --username '管理者' \
  --mail 'admin@example.com'
```

本番用は`--env-file`を本番のバックエンド環境ファイルへ変更します。パスワードは表示される案内に従って2回入力します。コマンド引数や入力のリダイレクトでは指定できません。入力を中止する場合は`Ctrl+C`を押します。

入力条件と[Userモデルの索引](../../spec/backend/user-mail-index.md)を確認した後、パスワードをハッシュ化して管理者を保存します。索引がなければ作成し、作成に失敗した場合はユーザを登録しません。既存の索引やユーザは削除しません。

成功時は終了コード0で、作成したユーザIDを表示します。登録確認メールは送らず、日本語設定の本登録済みユーザとして作成します。アプリを起動し、指定したメールアドレスとパスワードで[ログイン](../features/login.md)して、管理メニューが表示されることを確認してください。

同じメールアドレスのユーザがいる場合は、削除済みでも作成しません。既存ユーザの昇格・復元・パスワード変更も行いません。

## 失敗した場合

失敗時は終了コード1で、標準エラーに理由を表示します。引数は`--help`で確認できます。

| 表示されるコード | 確認すること |
| --- | --- |
| `INVALID_ARGUMENTS` / `INVALID_ACCOUNT` | 必須引数と登録項目の入力条件 |
| `ENV_FILE_UNREADABLE` / `ENV_VALUE_REQUIRED` | 環境ファイルのパス、読取権限、`DB_CONNECT`の設定 |
| `INVALID_DB_CONNECT` / `DB_CONNECTION_FAILED` | DB名を含む接続文字列、MongoDBへの到達性と接続権限 |
| `TERMINAL_REQUIRED` / `PASSWORD_MISMATCH` / `INPUT_CANCELLED` | 対話端末でのパスワード入力と確認入力 |
| `INDEX_INITIALIZATION_FAILED` | 既存メールの重複、索引の競合、索引を作成する権限 |
| `USER_EMAIL_ALREADY_USED` | 同じメールアドレスの既存ユーザ |
| `USER_CREATION_FAILED` / `DB_DISCONNECTION_FAILED` | 登録結果が不明な場合があるため、再実行前にユーザの登録状況を確認 |

## 関連資料

- [ユーザ管理](user-management.md)
- [v1 APIトークンの発行](../api/v1-token.md)
- 実装: `backend/scripts/create-admin.js`
- テスト: `backend/tests/unit/scripts/create-admin.test.js`、`backend/tests/integration/scripts/management-cli.int.test.js`
