const { buildFloorUserAccessRoom, buildUserAccessRoom } = require('../../../socket/accessRooms');

describe('Socketの認可用ルーム', () => {
  test('フロアIDとユーザIDから専用ルーム名を生成する', () => {
    expect(buildFloorUserAccessRoom('floor-1', 'user-1')).toBe('__access__:floor-user:floor-1:user-1');
  });

  test('同一ユーザでも別フロアは異なる専用ルームになる', () => {
    expect(buildFloorUserAccessRoom('floor-1', 'user-1')).not.toBe(buildFloorUserAccessRoom('floor-2', 'user-1'));
  });

  test('同一フロアでも別ユーザは異なる専用ルームになる', () => {
    expect(buildFloorUserAccessRoom('floor-1', 'user-1')).not.toBe(buildFloorUserAccessRoom('floor-1', 'user-2'));
  });

  test('ユーザIDからフロア横断の専用ルーム名を生成する', () => {
    expect(buildUserAccessRoom('user-1')).toBe('__access__:user:user-1');
  });

  test('ユーザ専用ルームはフロア専用ルームと衝突しない', () => {
    expect(buildUserAccessRoom('user-1')).not.toBe(buildFloorUserAccessRoom('floor-1', 'user-1'));
  });
});
