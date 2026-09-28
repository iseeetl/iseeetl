jest.mock('../../../../models/FloorMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/KickedUser', () => ({ findOne: jest.fn() }));
const ROLES = require('../../../../constants/roles');
const FloorMember = require('../../../../models/FloorMember');
const KickedUser = require('../../../../models/KickedUser');
const { isAdminOrCreator, hasFloorAccess, canManageFloor } = require('../../../../services/_shared/floorAccess');

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

describe('フロアの管理権限', () => {
  const context = { role: ROLES.AUTHOR, floor: { _id: 'floor1', user: 'owner' }, uid: 'member' };
  beforeEach(() => {
    jest.resetAllMocks();
    FloorMember.findOne.mockResolvedValue(null);
    KickedUser.findOne.mockResolvedValue(null);
  });

  test('対象フロアの現在のメンバーだけを許可する', async () => {
    FloorMember.findOne.mockImplementation(async ({ floor, user }) =>
      floor === 'floor1' && user === 'member' ? { _id: 'membership' } : null);
    expect(await canManageFloor(context)).toBe(true);
    expect(await canManageFloor({ ...context, floor: { _id: 'other', user: 'owner' } })).toBe(false);
    FloorMember.findOne.mockResolvedValue(null);
    expect(await canManageFloor(context)).toBe(false);
  });

  test('以前のキック記録が残るメンバーは管理できない', async () => {
    FloorMember.findOne.mockResolvedValue({ _id: 'membership' });
    KickedUser.findOne.mockResolvedValue({ _id: 'kick' });
    expect(await canManageFloor(context)).toBe(false);
    expect(KickedUser.findOne).toHaveBeenCalledWith({ floor: 'floor1', user: 'member' });
  });

  test('ルーム作成者や他フロアの編集ユーザという理由だけでは許可しない', async () => {
    expect(await canManageFloor({ ...context, role: ROLES.EDITOR })).toBe(false);
    expect(await canManageFloor({ ...context, uid: 'owner' })).toBe(false);
  });

  test('管理者と現在のフロア編集者には既存の管理権限を維持する', async () => {
    expect(await canManageFloor({ ...context, role: ROLES.ADMINISTRATOR })).toBe(true);
    expect(await canManageFloor({ ...context, role: ROLES.EDITOR, uid: 'owner' })).toBe(true);
  });
});
