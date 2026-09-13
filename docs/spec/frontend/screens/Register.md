# ユーザ登録（/register）

## 概要

- 新規ユーザを仮登録し、メールから本登録へ進む
- ログイン画面からの遷移では、保持している`floor_id`と`room_id`をクエリで引き継ぐ

## 利用条件・開き方

- メール配信が利用可能な場合に表示するログイン画面の「ユーザ登録へ」、または`/register`への直接アクセス

### URL

- パス: `/register`
- ルート名: `Register`
- コンポーネント: `frontend/src/views/Register.vue`
- メタ情報: `isPublic: true`, `title: 'ユーザ登録'`

### 利用条件

- 公開ルートだが、メール配信機能が有効な場合だけフォームを表示・送信できる
- メール配信が無効または外部機能の有効状態の取得に失敗した状態で直接アクセスした場合は、フォームを表示せず`floor_id`／`room_id` クエリを保持してログイン画面へ置換遷移する
- フロアメンバー、ルームメンバー、キック状態、フロア／ルーム設定による制限はない
- 登録APIもJWTを要求しない
- `BackButton`は直接アクセス時も表示し、ログイン画面へ戻る。詳細は[画面内の戻るボタン](../routing.md#画面内の戻るボタン)を参照する

## 画面構成

- `BackButton`、翻訳対象のH1「ユーザ登録」
- ユーザ名、メール、パスワードの入力欄
- パスワード表示／非表示ボタン
- 別タブで開く利用規約、プライバシーポリシー、Cookieポリシーへのリンク
- 利用規約、プライバシーポリシー、Cookieポリシーへの同意チェック、登録用「OK」ボタン
- 仮登録成功後の`ConfirmDialog`
- 利用規約、プライバシーポリシー、Cookieポリシーへのリンクには、画面が保持する`floor_id`と`room_id`をクエリで付与する
- 必須チェックボックスのラベルと`aria-label`は3文書を同意対象として明示する。Analytics専用の別同意は追加しない

## 操作と動作

- パスワード表示ボタンは入力欄の`type`を`password`と`text`で切り替える
- 送信時は入力検証、規約同意、二重送信防止の順に確認する
- 送信直前にもメール配信機能を確認し、無効ならAPIを呼ばずログイン画面へ置換遷移する
- `room_id`だけを登録ペイロードへ引き継ぎ、`floor_id`は登録APIへ送信しない
- 送信中は3入力欄、パスワード表示ボタン、「OK」を無効化する。規約チェックは無効化しない
- 成功時は入力値、規約同意、Vuelidate状態を初期化し、「ユーザ仮登録完了」ダイアログを表示する
- 成功ダイアログの操作ボタンは「ログインページへ」のみとする
- 成功ダイアログはEscapeと背景クリックで閉じず、確定するとクエリを付けずにログイン画面へ遷移する

## 入力条件

| 項目 | フロントエンド | バックエンド |
| --- | --- | --- |
| ユーザ名 | 必須、1〜20文字、入力時に前後空白を除去 | 必須の文字列、空文字不可、20文字以下 |
| メール | 必須、メール形式、100文字以下、入力時に前後空白を除去 | 必須の文字列、前後空白除去・小文字化後に100文字以下、メール形式 |
| パスワード | 必須、8〜16文字、入力時に前後空白を除去 | 必須の文字列、8〜16文字 |
| `lang` | 現在の対応言語を送信 | ISO 639-1の対応言語コード、必須 |
| `room_id` | クエリの文字列を前後空白除去し、空でなければ送信 | 任意のMongoDB ObjectId |
| 規約同意 | チェック必須。未同意時は送信せずalertのスナックバーを表示 | APIへ送信せず、同意結果・版・日時を記録しない |

- 入力欄のblurまたは送信時にVuelidateを更新し、項目別エラーを`role="alert"`で表示する
- 入力検証に失敗した送信では「入力を確認してください」をalertのスナックバーで表示する

## 通信・エラー時の動作

### 使用するAPI

- `POST /api/auth/register/`
- `withCredentials: true`で、`username`、`mail`、`password`、現在の`lang`、任意の`room_id`を送信する
- バックエンドは仮登録を受け付け、登録時の言語で有効化メールを送る。トークン発行と仮ユーザの保存は[認証API](../../backend/api/auth.md)を参照する
- 本登録前に同じメールで再登録すると、複数の仮ユーザとトークンを作成できる
- 本ユーザに同じメールが存在する場合は、論理削除済みでも`409 USER_EMAIL_ALREADY_USED`とする
- アクティベーショントークンの有効期間は`SIGNUP_TOKEN_TTL_MINUTES`で設定し、既定値は60分である
- 有効な`room_id`がある場合は、アクティベーションURLのクエリとメール内のルームリンクへ引き継ぐ
- メール配信機能が無効な環境では`503 EXTERNAL_FEATURE_DISABLED`となり、仮ユーザとトークンを作成しない
- 失敗時は「ユーザ登録に失敗しました」に安定したエラーコードから解決した翻訳済み詳細を追記し、alertのスナックバーで表示する

### 読み込み中・データなし・エラー時

- 仮ユーザ作成後のメール送信に失敗すると、APIは失敗を返す一方で仮ユーザとトークンは残る

- 専用ローディング表示はなく、送信中は入力欄と送信ボタンの無効化だけで示す
- 入力エラーは各項目とスナックバー、規約未同意とAPIエラーはスナックバーで通知する
- API失敗時は入力値と規約同意を保持し、再送信できる
- 成功ダイアログを閉じるためのキャンセル操作は表示しない

## 関連資料

### 関連仕様

- [ユーザ登録から本登録まで](../flows/RegisterAndActivate.md)
- [ログイン画面](Login.md)
- [利用規約](Terms.md)
- [プライバシーポリシー](Privacy.md)
- [Cookieポリシー](CookiePolicy.md)
- [認証API](../../backend/api/auth.md)
- [外部機能の有効状態API](../../backend/api/capabilities.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/api/auth.js`
- `frontend/src/components/common/BackButton.vue`
- `backend/services/auth.service.js`
- `backend/models/UserTemp.js`

### テスト

- `frontend/tests/unit/views/Register.spec.js`
- `backend/tests/integration/routes/auth.register-reset.int.test.js`
- `frontend/tests/e2e/specs/flows/account/register.validation.e2e.js`
- `frontend/tests/e2e/specs/flows/account/account-lifecycle.e2e.js`
