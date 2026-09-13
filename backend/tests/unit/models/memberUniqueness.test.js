test('通常のモデル初期化でメンバー関係の一意索引を作成する', () => {
  for (const [model, key, name] of [
    [require('../../../models/FloorMember'), { floor: 1, user: 1 }, 'uniq_floormembers_floor_user'],
    [require('../../../models/RoomMember'), { room: 1, user: 1 }, 'uniq_roommembers_room_user'],
  ]) {
    expect(model.schema.options.autoIndex).toBe(true);
    expect(model.schema.indexes()).toContainEqual([key, expect.objectContaining({ unique: true, name })]);
  }
});
