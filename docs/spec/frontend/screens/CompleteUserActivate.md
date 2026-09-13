# ユーザ本登録（/user/activate/:invite_token）

## 概要

- 仮登録メールのトークンでユーザを作成し、ログインまたはトップページへ誘導する

## 利用条件・開き方

- 仮登録メール内のアクティベーションURL、またはURLへの直接アクセス

### URL

- パス: `/user/activate/:invite_token`
- ルート名: `CompleteUserActivate`
- コンポーネント: `frontend/src/views/CompleteUserActivate.vue`
- メタ情報: `isPublic: true`, `title: 'ユーザアクティベーション結果'`

### 利用条件

- ゲスト、未ログイン、ログインユーザ、各ロールのいずれも利用できる公開画面である
- フロアメンバー、ルームメンバー、キック状態、フロア／ルーム設定による画面アクセス制限はない
- アクティベーションAPIもJWTを要求しない

## 操作と動作

- `created`で直ちにアクティベーションAPIを1回実行する
- API処理中は読み込み状態だけを表示し、結果の`ConfirmDialog`を表示しない。処理中の再呼び出しはAPIを重複実行しない
- 成功時はユーザを作成して仮ユーザを削除し、API完了後に成功メッセージを`ConfirmDialog`へ表示する
- 成功ダイアログの確定ラベルは「ログインページへ」である
- 成功レスポンスに`floorId`と`roomId`がある場合、確定時に両方をログイン画面のクエリへ付与する。それ以外はクエリなしでログイン画面へ遷移する
- `floorId`、`floorTitle`、`roomId`、`roomTitle`が揃う場合は、ダイアログ本文に「ルームへ入室する」リンクを表示する
- フロントエンドでのパラメータ不正またはAPI失敗時はエラーメッセージをダイアログに表示し、確定ラベルを「トップページへ」にする
- エラー時の確定は名前付きルート`Floor`へ遷移し、失敗した場合は`/floor`を試す
- ダイアログはEscape、背景クリック、キャンセルで閉じず、利用者は成功または失敗に応じた確定操作を行う

### 再試行

- ユーザ作成後の仮ユーザ削除に失敗した場合は、有効期限内に同じURLを再読込すると同じ本登録の残りの処理を再開できる。有効化トークンと登録済みユーザの対応情報がないデータは自動復旧できない

## 入力条件

### パラメータ

| パラメータ | 取得元 | フロントエンド処理 | バックエンド検証 |
| --- | --- | --- | --- |
| `invite_token` | 必須パスパラメータ | 文字列でなければAPIを呼ばずエラー。文字列ならそのまま送信 | 48文字のhex文字列 |
| `room_id` | 任意クエリ | 文字列なら前後空白を除去し、空でなければ送信 | MongoDB ObjectId |

- 通常のルート一致では`invite_token`は文字列になるため、形式不正や期限切れは主にバックエンドで判定する

## 通信・エラー時の動作

### 使用するAPI

- `POST /api/auth/activate`
- `withCredentials: true`で、`invite_token`と任意の`room_id`を送信する
- トークンが存在しない場合は`404 TOKEN_NOT_FOUND`、既定60分の有効期間を超えた場合は`410 SIGNUP_TOKEN_EXPIRED`、同じメールのユーザが存在し、今回の有効化との対応を確認できない場合は`409 USER_ALREADY_EXISTS`とする
- 成功時は`roomId`、`roomTitle`、`floorId`、`floorTitle`を返す。`room_id`なし、または有効なルーム／フロアを解決できない項目は`null`になる
- 仮ユーザ削除後も、有効期限内で登録済みユーザとの対応を確認できれば同じトークンを再利用できる。ユーザを重複作成しない
- 失敗時は「アカウントのアクティベーションに失敗しました」にAPIエラー詳細を追記する

### 読み込み中・データなし・エラー時

- API実行中は`.view-content`を`aria-busy=true`とし、`role=status`の「読み込み中です」を表示する。結果ダイアログとルームリンクは表示しない
- 結果は成功・失敗ともにAPI完了後の`ConfirmDialog`へ集約する
- API失敗後に同じ画面内で再実行する操作はない
- 結果ダイアログにはキャンセルや単独の閉じる操作を表示せず、成功時はログイン画面、失敗時はトップページへの操作だけを表示する

## 関連資料

### 関連仕様

- [ユーザ登録から本登録まで](../flows/RegisterAndActivate.md)
- [ユーザ登録](Register.md)
- [ログイン画面](Login.md)
- [認証API](../../backend/api/auth.md)

### 実装

- `frontend/src/routes/public.js`
- `frontend/src/api/auth.js`
- `frontend/src/components/common/ConfirmDialog.vue`
- `backend/services/auth.service.js`
- `backend/models/UserTemp.js`

### テスト

- `frontend/tests/unit/views/CompleteUserActivate.spec.js`
- `backend/tests/integration/routes/auth.register-reset.int.test.js`
- `frontend/tests/e2e/specs/flows/account/account-lifecycle.e2e.js`
- `frontend/tests/e2e/specs/flows/account/activate.e2e.js`
