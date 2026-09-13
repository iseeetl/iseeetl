const ROLES = require('../../../constants/roles');

describe('ロールの定義', () => {
  test('ユーザ/フロア/ルームロールが定義されている', () => {
    expect(ROLES.ADMINISTRATOR).toBe('Administrator');
    expect(ROLES.EDITOR).toBe('Editor');
    expect(ROLES.AUTHOR).toBe('Author');
    expect(ROLES.DEVELOPER).toBe('developer');

    expect(ROLES.FLOOR_EDITOR).toBe('FloorEditor');
    expect(ROLES.FLOOR_MEMBER).toBe('FloorMember');

    expect(ROLES.ROOM_MEMBER).toBe('RoomMember');
  });
});
