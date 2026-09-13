# API仕様（入口）

## 概要

機能別のAPI仕様と、認証・入出力の共通規約への入口です。

## 動作・適用条件

### 読み方

共通の入力形式、認証情報、成功・エラー応答は[REST API共通規約](api-conventions.md)を参照してください。個別エンドポイントのMethod・Path、入出力、権限、副作用は下記の機能別仕様に記載しています。

ルートの登録順は[バックエンド概要](overview.md#apiルートマウント)、所属関係は[ドメインモデル](../domain-model.md)、認可は[ロール・権限仕様](../roles-and-permissions.md)、更新後の配信は[Socket.IO接続・イベント契約](../socket-events.md)、クライアント側の通信処理は[フロントエンドAPI](../frontend/api.md)を参照してください。

公開プレフィックスの判定は`backend/routes/apiMounts.js`の`buildApiMounts()`、個別Method／Pathは各ルート定義を基準とします。

### 認証境界

通常の`/api/*`にはバージョンを付けません。`/api/v1`は外部連携用APIであり、専用の`developer`認証を使用します。

| 利用区分 | 認証情報・ミドルウェア | 補足 |
| --- | --- | --- |
| 認証不要 | 認証ミドルウェアなし | 登録・ログイン、公開フロア／ルーム情報など。公開範囲は各詳細仕様を参照 |
| ゲスト | `X-Guest-Token`、`guestAuth` | ゲストIDとアクセストークンを検証し、ゲスト専用サービスでルーム条件と所有者を判定 |
| ゲストトークン更新 | リフレッシュトークンを格納したCookie | `/api/guest/refresh`でアクセストークンを更新 |
| ログインユーザ | `Authorization: Bearer <JWT>`、`ensureJsonWebToken` | 署名・期限、有効なユーザ、`session_version`を検証し、DB上の現在ロールを使用 |
| `Administrator` | 通常JWT＋`ensureAdminUser` | 認証後の現在ロールが`Administrator`の場合だけ許可 |
| v1 `developer` | `Authorization: Bearer <development JWT>`、`ensureJsonWebTokenV1`、`ensureDeveloperUserV1` | 通常JWTとは別の`JWT_DEV_SECRET`を使用する。ペイロードの`developer`ロールに加え、有効なユーザとDB上の現在ロールも確認 |

認証ミドルウェアは本人確認までを担当します。フロア、ルーム、投稿の所有関係、メンバー関係、キック状態などはコントローラ／サービスでも判定するため、一覧の「認証要否」だけで操作権限を判断しません。

v1では`session_version`を照合しません。提供範囲、入力変換、認可は[v1 API仕様](api/v1.md)、通常画面での`developer`の権限は[ロール・権限仕様](../roles-and-permissions.md#developer)を参照してください。

### 機能別仕様

| 機能領域 | 主なベースパス | 詳細仕様 |
| --- | --- | --- |
| 外部機能の有効状態 | `/api/capabilities` | [外部機能の有効状態](api/capabilities.md) |
| Google Analytics設定・仮名ID | `/api/analytics` | [Google Analytics設定・仮名ID](api/analytics.md) |
| 認証・ユーザ | `/api/auth`, `/api/guest`, `/api/user` | [認証](api/auth.md)、[ゲスト認証](api/guest.md)、[ユーザ](api/user.md) |
| フロア | `/api/floor`, `/api/floormember`, `/api/floortag`, `/api/floors/:floorId/quick-text` | [フロア](api/floor.md)、[フロアメンバー](api/floor-member.md)、[フロアタグ](api/floor-tag.md)、[フロア単語](api/floor-quicktext.md) |
| ルーム | `/api/room`, `/api/roommember`, `/api/roomtag`, `/api/rooms/:roomId/quick-text` | [ルーム](api/room.md)、[ルームメンバー](api/room-member.md)、[ルームタグ](api/room-tag.md)、[ルーム単語](api/room-quicktext.md) |
| タイムライン・メディア | `/api/rooms/:room_id/timeline`, `/api/chat`, `/api/chat/guest`, `/api/fileupload` | [タイムライン](api/timeline.md)、[ゲストタイムライン](api/timeline-guest.md)、[ファイルアップロード](api/upload.md) |
| 管理・共通機能 | `/api/management/quick-text`, `/api/categorytag`, `/api/soundtag`, `/api/spam`, `/api/kickeduser` | [単語管理](api/quicktext-admin.md)、[共通タグ](api/category-tag.md)、[音を鳴らすタグ](api/sound-tag.md)、[スパムワード](api/spam.md)、[キック済みユーザ](api/kicked-user.md) |
| v1 `developer` | `/api/v1` | [v1 API](api/v1.md) |

## 関連資料

### 実装

- `backend/app.js`
- `backend/routes/apiMounts.js`
- `backend/routes/`
- `backend/middlewares/ensureJsonWebToken.js`
- `backend/middlewares/ensureAdminUser.js`

### テスト

- `backend/tests/integration/routes/app.mount-prefix.int.test.js`
- `backend/tests/integration/routes/analytics.config.route.int.test.js`
- `backend/tests/integration/routes/analytics.identity.route.int.test.js`
- `backend/tests/integration/routes/auth.middleware.int.test.js`
- `backend/tests/unit/middlewares/ensureJsonWebToken.test.js`
