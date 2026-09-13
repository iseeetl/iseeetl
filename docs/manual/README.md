# 操作マニュアル

このマニュアルでは、利用者が画面上で行う操作、外部APIの利用手順、環境管理者向けのアカウント作成・トークン発行を説明します。

## このマニュアルの使い方

外部システムから投稿する場合は、[v1 API利用ガイド](api/v1.md)を参照してください。画面を操作する場合は、次の順に読み進めます。

操作できる範囲は、ユーザ種別だけではなく、対象フロア・ルームでの立場とルーム設定によって変わります。

1. 下の「自分の立場から探す」で自分のユーザ種別を確認する
2. フロアメンバーやルームメンバーの場合は、対象ごとの立場も確認する
3. 「やりたいことから探す」から具体的な操作手順を開く
4. ボタンが表示されない場合は、[ロールと利用できる機能](roles/README.md)を確認する

## 自分の立場から探す

### システム全体のユーザ種別

| 自分の状態 | ガイド |
| --- | --- |
| ログインしていない | [ゲストユーザ](roles/guest.md) |
| ログインしていて追加権限がない | [一般ユーザ](roles/user.md) |
| ユーザロールがフロア編集ユーザ | [フロア編集ユーザ](roles/editor.md) |
| ユーザロールが管理者 | [管理者](roles/admin.md) |

### 対象ごとに決まる立場

| 対象との関係 | ガイド |
| --- | --- |
| フロア編集ユーザとして自分が作成したフロア | [対象フロアの作成者（FloorEditor）](roles/floor-editor.md) |
| フロア招待へ参加した | [フロアメンバー（FloorMember）](roles/floor-member.md) |
| ルーム招待へ参加した | [ルームメンバー（RoomMember）](roles/room-member.md) |

複数の立場に該当する場合の扱いは、[ロールと利用できる機能](roles/README.md#利用できる機能が決まる順序)を参照してください。

## 初めて利用する

- [はじめて使う・画面の移動](getting-started.md)
- [ロールと利用できる機能](roles/README.md)
- [用語集](glossary.md)

## やりたいことから探す

### アカウント

- [ログイン](features/login.md)
- [ユーザ登録](features/register.md)
- [ユーザ本登録（有効化）](features/user-activate.md)
- [パスワード再設定リンクの送信・再設定](features/password-reset.md)
- [パスワード変更](features/change-password.md)

### フロア・ルーム・タイムライン

- [フロア一覧の閲覧・検索・管理](features/floors.md)
- [ルーム一覧の閲覧・管理](features/rooms.md)
- [ルームの表示・入室・ゲスト操作を設定する](features/room-access-settings.md)
- [タイムラインの閲覧・ルーム内設定](features/timeline.md)
- [投稿の絞り込み・通知](features/timeline-filters.md)
- [タイムライン共有URL](features/timeline-query-parameters.md)
- [投稿・流す・リアクション](features/timeline-post.md)

### メンバー

- [フロアメンバーを招待・確認・削除・脱退](features/floor-members.md)
- [ルームメンバーを招待・確認・削除・脱退](features/room-members.md)
- [招待リンクからフロア・ルームへ参加](features/invite.md)

### アクセス制限

- [ユーザをキック・解除](features/kicked-users.md)

### タグ・単語

- [AI解析設定を管理する](features/ai-analysis-settings.md)
- [フロアタグの管理](features/floor-tags.md)
- [ルームタグの管理](features/room-tags.md)
- [フロア単語の管理](features/floor-quicktext.md)
- [ルーム単語の管理](features/room-quicktext.md)

### プロフィール・表示設定

- [プロフィール更新](features/profile.md)
- [タイムラインのフォント・文字サイズ設定](features/settings.md)
- [ゲストプロフィール設定](features/guest-profile.md)
- [ゲスト利用ルール](features/guest-rules.md)
- [Cookieポリシー](features/cookie-policy.md)

### 管理者向け

- [管理画面](management/README.md)
- [管理者アカウントの作成](management/create-admin.md)

### 外部API

- [v1 APIで投稿・返信・メディア添付を行う](api/v1.md)
- [v1 APIトークンの発行](api/v1-token.md)

## 困ったとき

- ボタンがない、入室できない: [ロールと利用できる機能](roles/README.md)
- 操作が完了しない: [よくある質問・困ったとき](troubleshooting.md)
- 用語の意味を確認したい: [用語集](glossary.md)

## マニュアルと仕様の分担

- このマニュアルには、画面操作、外部APIの利用、管理者アカウント作成・トークン発行の準備・実行例・失敗時の対処を記載します。
- APIの詳細な入力条件・応答、内部状態、認可条件は[仕様](../spec/README.md)を参照してください。
