# 画面仕様（screens/）

このディレクトリは、**画面・ダイアログ単位**の仕様をまとめます。
各画面の利用条件、操作、入力条件、通信・エラー時の動作を確認できます。

## 使い分け

- 画面単体の仕様: `screens/`
- 画面横断の操作フロー: [flows/](../flows/README.md)

## 画面一覧

### 認証必須ルート（meta.requiresAuth）

- [パスワード変更（ChangePassword）](ChangePassword.md): `/changepassword`

### 一般ルート（meta.isPublic）

- [ログイン（Login）](Login.md): `/login`
- [ユーザ登録（Register）](Register.md): `/register`
- [パスワード再設定メール（SendResetPasswordLink）](SendResetPasswordLink.md): `/user/sendresetpasswordlink`
- [パスワード再設定（ResetPassword）](ResetPassword.md): `/user/resetpassword/:reset_token`
- [ユーザ本登録（CompleteUserActivate）](CompleteUserActivate.md): `/user/activate/:invite_token`
- [表示設定（Setting）](Setting.md): `/setting`
- [フロア一覧（Floor）](Floor.md): `/`
- [フロア一覧のページ表示（FloorPage）](FloorPage.md): `/page/:page`
- [ルーム一覧（Room）](Room.md): `/floor/:floor_id`
- [タイムライン（TimeLine）](Timeline.md): `/floor/:floor_id/room/:room_id`
- [投稿詳細（TimeLinePostDetail）](TimeLinePostDetail.md): `/floor/:floor_id/room/:room_id/post/:post_id`
- [フロア招待の参加完了（CompleteFloorInvite）](CompleteFloorInvite.md): `/floor/:floor_id/invite/:invite_token`
- [ルーム招待の参加完了（CompleteRoomInvite）](CompleteRoomInvite.md): `/floor/:floor_id/room/:room_id/invite/:invite_token`
- [利用規約（Terms）](Terms.md): `/terms`
- [プライバシーポリシー（Privacy）](Privacy.md): `/privacy`
- [Cookieポリシー（CookiePolicy）](CookiePolicy.md): `/cookie`
- [アクセシビリティ（Accessibility）](Accessibility.md): `/accessibility`
- [お問い合わせ（Contact）](Contact.md): `/contact`
- [チュートリアル（Tutorial）](Tutorial.md): `/tutorial`
- [ヘルプ（Help）](Help.md): `/help`

### 管理ルート（meta.isManagement）

- [AI解析設定管理（AIAnalysisSettingManagement）](AIAnalysisSettingManagement.md): `/management/ai-analysis-settings`
- [フロアタグ管理（FloorTagManagement）](FloorTagManagement.md): `/management/floortag`
- [共通タグ管理（CategoryTagManagement）](CategoryTagManagement.md): `/management/categorytag`
- [ルームタグ管理（RoomTagManagement）](RoomTagManagement.md): `/management/roomtag`
- [フロア管理（FloorManagement）](FloorManagement.md): `/management/floor`
- [投稿管理（PostManagement）](PostManagement.md): `/management/post`
- [スパム管理（SpamManagement）](SpamManagement.md): `/management/spam`
- [ユーザ管理（UserManagement）](UserManagement.md): `/management/user`
- [タイムラインデータ管理（TimelineDataManagement）](TimelineDataManagement.md): `/management/timeline`
- [ルームのタイムラインデータ管理（TimelineRoomDataManagement）](TimelineRoomDataManagement.md): `/management/timeline/floor/:floorId`
- [フロアメンバー管理（FloorMemberManagement）](FloorMemberManagement.md): `/management/floormember`
- [ルームメンバー管理（RoomMemberManagement）](RoomMemberManagement.md): `/management/roommember`
- [ルーム管理（RoomManagement）](RoomManagement.md): `/management/room`
- [共通の単語管理（QuickTextManagement）](QuickTextManagement.md): `/management/quicktext`

### 独立ルートを持たないダイアログ

- [フロア単語](FloorQuickText.md): ルーム一覧上部の「フロア単語」から開く
- [ルーム単語](RoomQuickText.md): ルーム一覧の対象ルームにある「ルーム単語」から開く

- [プロフィール（Profile）](Profile.md)は独立ルートを持たず、アプリメニューまたはヘッダーから開く共通ダイアログです
- ルート定義は [ルーティング](../routing.md) とあわせて参照してください
