const ROLES = require('../../../../constants/roles');
const { isAdminOrCreator, hasFloorAccess } = require('../../../../services/_shared/floorAccess');

describe('フロア権限の判定', () => {
  test('管理者またはフロアを作成した編集ユーザならtrueを返す', () => {
    expect(isAdminOrCreator(ROLES.ADMINISTRATOR, 'u1', 'u2')).toBe(true);
    expect(isAdminOrCreator(ROLES.EDITOR, 'u1', 'u1')).toBe(true);
    expect(isAdminOrCreator('User', 'u1', 'u2')).toBe(false);
  });

  test('権限と所属に応じてフロアへのアクセスを判定する', () => {
    expect(hasFloorAccess({ role: ROLES.ADMINISTRATOR })).toBe(true);
    expect(hasFloorAccess({ role: ROLES.EDITOR, floor: { user: 'u1' }, uid: 'u1' })).toBe(true);
    expect(hasFloorAccess({ role: 'User', floorMember: { _id: 'fm1' } })).toBe(true);
    expect(hasFloorAccess({ role: 'User', floorMember: null })).toBe(false);
  });
});
