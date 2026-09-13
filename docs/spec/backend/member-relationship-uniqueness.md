# メンバー関係の一意制約

## 概要

同じユーザがフロアやルームへ重複して所属することを防ぐ索引と、起動時の作成を説明します。

## 動作・適用条件

### 索引と製品の動作

同じユーザが同じフロア・ルームへ重複所属しないよう、モデルに次の索引を定義しています。

| モデル | 名前 | キー | オプション |
| --- | --- | --- | --- |
| `FloorMember` | `uniq_floormembers_floor_user` | `{floor: 1, user: 1}` | `unique: true` |
| `RoomMember` | `uniq_roommembers_room_user` | `{room: 1, user: 1}` | `unique: true` |

同時受諾の競合では、後から競合した要求にHTTP 400の`ALREADY_FLOOR_MEMBER`または`ALREADY_ROOM_MEMBER`を返します。別のDBエラーを参加済みとして扱いません。脱退後は、有効な共有招待URLで再参加できます。

複合一意索引は参照先の存在やルームメンバーに記録したフロアと、ルームの所属フロアの一致を保証しません。これらの整合性は、アプリの所属操作とデータ管理で維持する必要があります。

### 起動時の作成

両モデルは`autoIndex: true`で、上記の索引を起動時に自動作成します。既存の同じ索引は維持し、作成に失敗した場合は受付を開始せず終了します。既存DBでは重複や参照関係を確認し、反映前の確認と失敗時の対処は[起動時の索引作成](overview.md#起動時の索引作成)に従います。

[テスト環境](../../testing/test-environment.md)では専用DBの初期化時に索引を作成します。同名の異なる索引や重複データで作成に失敗した場合は停止し、既存索引やデータを自動修復しません。

## 関連資料

### 実装

- `backend/models/FloorMember.js`
- `backend/models/RoomMember.js`
- `backend/services/floor/floorMember.service.js`
- `backend/services/room/roomMember.service.js`

### テスト

- `backend/tests/integration/models/test-indexes.int.test.js`
- `backend/tests/integration/models/startup-indexes.int.test.js`
- `backend/tests/integration/routes/member.crud.int.test.js`
