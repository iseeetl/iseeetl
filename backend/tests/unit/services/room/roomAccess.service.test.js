jest.mock('../../../../models/User', () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/FloorMember', () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock('../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/RoomMember', () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock('../../../../models/KickedUser', () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock('../../../../services/_shared/activeResource', () => ({
  findActiveUser: jest.fn(),
  findActiveRoom: jest.fn(),
  findActiveFloor: jest.fn(),
}));

jest.mock('../../../../constants/roles', () => ({
  ADMINISTRATOR: 'Administrator',
  EDITOR: 'Editor',
}));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(input) {
      this.code = input?.code;
      this.message = input?.code;
    }
);

const {
  authorizeRoomAccess,
  authorizeRoomMetadataAccess,
  ensureRoomContext,
  filterAuthorizedRoomUserIds,
} = require('../../../../services/room/roomAccess.service');

const User = require('../../../../models/User');
const FloorMember = require('../../../../models/FloorMember');
const RoomMember = require('../../../../models/RoomMember');
const KickedUser = require('../../../../models/KickedUser');
const { findActiveUser, findActiveRoom, findActiveFloor } = require('../../../../services/_shared/activeResource');
const AppError = require('../../../../utils/appError');

const selectOf = (val) => ({ select: jest.fn().mockResolvedValue(val) });
const selectManyOf = (val) => ({ select: jest.fn().mockResolvedValue(val) });

describe('ルームへのアクセス認可', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setup = ({
    user = { _id: 'u1', username: 'U' },
    room = { _id: 'r1', floor: 'f1', member_only: false, title: 'R' },
    floor = { _id: 'f1', user: 'owner', title: 'F' },
    kicked = null,
    floorMember = null,
    roomMember = null,
  } = {}) => {
    if (user === null) {
      findActiveUser.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
    } else {
      findActiveUser.mockResolvedValue(user);
    }
    if (room === null) {
      findActiveRoom.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
    } else {
      findActiveRoom.mockResolvedValue(room);
    }
    if (floor === null) {
      findActiveFloor.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
    } else {
      findActiveFloor.mockResolvedValue(floor);
    }
    KickedUser.findOne.mockImplementation(() => selectOf(kicked));
    FloorMember.findOne.mockImplementation(() => selectOf(floorMember));
    RoomMember.findOne.mockImplementation(() => selectOf(roomMember));
  };

  test('公開ルーム（member_only=false）は通常ユーザでもアクセス可', async () => {
    setup();
    const res = await authorizeRoomAccess('uX', 'User', 'r1');
    expect(res.foundRoom._id).toBe('r1');
    expect(res.foundFloor._id).toBe('f1');
  });

  test('ユーザ未検出 → 400', async () => {
    setup({ user: null });
    await expect(authorizeRoomAccess('uX', 'User', 'r1')).rejects.toBeInstanceOf(AppError);
  });

  test('ルーム未検出 → 400', async () => {
    setup({ room: null });
    await expect(authorizeRoomAccess('uX', 'User', 'r1')).rejects.toBeInstanceOf(AppError);
  });

  test('フロア未検出 → 400', async () => {
    setup({ floor: null });
    await expect(authorizeRoomAccess('uX', 'User', 'r1')).rejects.toBeInstanceOf(AppError);
  });

  test('キック済みユーザ → 401', async () => {
    setup({ kicked: { _id: 'k1' } });
    await expect(authorizeRoomAccess('uX', 'User', 'r1')).rejects.toBeInstanceOf(AppError);
  });

  describe('限定ルーム（member_only=true）の権限', () => {
    test('管理者はアクセス可', async () => {
      setup({ room: { _id: 'r1', floor: 'f1', member_only: true, title: 'R' } });
      const res = await authorizeRoomAccess('admin', 'Administrator', 'r1');
      expect(res.foundRoom._id).toBe('r1');
    });

    test('フロア編集ユーザかつフロア作成者はアクセス可', async () => {
      setup({
        room: { _id: 'r1', floor: 'f1', member_only: true, title: 'R' },
        floor: { _id: 'f1', user: 'e1', title: 'F' },
      });
      const res = await authorizeRoomAccess('e1', 'Editor', 'r1');
      expect(res.foundFloor.user).toBe('e1');
    });

    test('フロアメンバーはアクセス可', async () => {
      setup({
        room: { _id: 'r1', floor: 'f1', member_only: true, title: 'R' },
        floorMember: { _id: 'fm1' },
      });
      const res = await authorizeRoomAccess('u2', 'User', 'r1');
      expect(res.foundFloorMember).toEqual({ _id: 'fm1' });
    });

    test('ルームメンバーはアクセス可', async () => {
      setup({
        room: { _id: 'r1', floor: 'f1', member_only: true, title: 'R' },
        roomMember: { _id: 'rm1' },
      });
      const res = await authorizeRoomAccess('u3', 'User', 'r1');
      expect(res.foundRoomMember).toEqual({ _id: 'rm1' });
    });

    test('上記いずれにも該当しない場合は 401', async () => {
      setup({
        room: { _id: 'r1', floor: 'f1', member_only: true, title: 'R' },
        floor: { _id: 'f1', user: 'owner', title: 'F' },
        floorMember: null,
        roomMember: null,
      });
      await expect(authorizeRoomAccess('someone', 'User', 'r1')).rejects.toBeInstanceOf(AppError);
    });
  });
});

describe('ルーム情報の閲覧認可', () => {
  const room = { _id: 'r1', floor: 'f1', member_only: false, title: 'R' };
  const floor = { _id: 'f1', user: 'owner', title: 'F' };

  const setup = ({ memberOnly = false, kicked = null, floorMember = null, roomMember = null } = {}) => {
    findActiveRoom.mockResolvedValue({ ...room, member_only: memberOnly });
    findActiveFloor.mockResolvedValue(floor);
    findActiveUser.mockResolvedValue({ _id: 'user-1', username: 'User' });
    KickedUser.findOne.mockImplementation(() => selectOf(kicked));
    FloorMember.findOne.mockImplementation(() => selectOf(floorMember));
    RoomMember.findOne.mockImplementation(() => selectOf(roomMember));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setup();
  });

  test.each([
    ['匿名', undefined],
    ['ゲスト', { guest: { id: 'guest-1' } }],
  ])('公開ルームは%sで閲覧できる', async (_label, identity) => {
    await expect(authorizeRoomMetadataAccess('r1', identity)).resolves.toEqual({ room, floor });
    expect(findActiveUser).not.toHaveBeenCalled();
    expect(KickedUser.findOne).not.toHaveBeenCalled();
  });

  test.each([
    ['匿名', undefined, 'TOKEN_INVALID'],
    ['ゲスト', { guest: { id: 'guest-1' } }, 'INVALID_PERMISSION'],
  ])('限定ルームの%sを%sとして拒否する', async (_label, identity, code) => {
    setup({ memberOnly: true });

    await expect(authorizeRoomMetadataAccess('r1', identity)).rejects.toMatchObject({ code });
    expect(findActiveUser).not.toHaveBeenCalled();
  });

  test('公開ルームでも明示ユーザがkick済みなら拒否する', async () => {
    setup({ kicked: { _id: 'kick-1' } });

    await expect(
      authorizeRoomMetadataAccess('r1', {
        jwtPayload: { user_id: 'user-1', user_role: 'Author' },
        guest: { id: 'guest-1' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_PERMISSION' });
    expect(findActiveRoom).toHaveBeenCalledTimes(1);
    expect(findActiveFloor).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['管理者', 'admin', 'Administrator', null, null],
    ['Floor所有Editor', 'owner', 'Editor', null, null],
    ['フロアメンバー', 'floor-member', 'Author', { _id: 'fm-1' }, null],
    ['ルームメンバー', 'room-member', 'Author', null, { _id: 'rm-1' }],
  ])('限定ルームは%sなら閲覧できる', async (_label, userId, userRole, floorMember, roomMember) => {
    setup({ memberOnly: true, floorMember, roomMember });

    const result = await authorizeRoomMetadataAccess('r1', {
      jwtPayload: { user_id: userId, user_role: userRole },
    });

    expect(result.room.member_only).toBe(true);
    expect(findActiveRoom).toHaveBeenCalledTimes(1);
    expect(findActiveFloor).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['無所属User', {}],
    ['kick済みUser', { kicked: { _id: 'kick-1' }, floorMember: { _id: 'fm-1' } }],
  ])('限定ルームの%sを拒否する', async (_label, options) => {
    setup({ memberOnly: true, ...options });

    await expect(
      authorizeRoomMetadataAccess('r1', {
        jwtPayload: { user_id: 'user-1', user_role: 'Author' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_PERMISSION' });
  });

  test.each([
    ['無所属User', {}, 'FORBIDDEN'],
    ['kick済みUser', { kicked: { _id: 'kick-1' }, floorMember: { _id: 'fm-1' } }, 'FORBIDDEN'],
  ])('呼出し元が指定したエラー構成で%sを拒否する', async (_label, options, code) => {
    setup({ memberOnly: true, ...options });

    await expect(
      authorizeRoomMetadataAccess('r1', {
        jwtPayload: { user_id: 'user-1', user_role: 'Author' },
        errors: {
          kicked: { code: 'FORBIDDEN' },
          permission: { code: 'FORBIDDEN' },
        },
      })
    ).rejects.toMatchObject({ code });
  });

  test('ルームとフロアの不在はNOT_FOUNDの仕様を使う', async () => {
    findActiveRoom.mockRejectedValue(new AppError({ code: 'NOT_FOUND' }));

    await expect(authorizeRoomMetadataAccess('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findActiveRoom).toHaveBeenCalledWith(
      'missing',
      expect.objectContaining({ error: { code: 'NOT_FOUND' } })
    );
  });

  test('フロア不在もNOT_FOUNDの仕様を使う', async () => {
    findActiveFloor.mockRejectedValue(new AppError({ code: 'NOT_FOUND' }));

    await expect(authorizeRoomMetadataAccess('r1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findActiveFloor).toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({ error: { code: 'NOT_FOUND' } })
    );
  });
});

describe('ルームへアクセスできるユーザの抽出', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findActiveRoom.mockResolvedValue({ _id: 'r1', floor: 'f1', member_only: false, title: 'R' });
    findActiveFloor.mockResolvedValue({ _id: 'f1', user: 'owner', title: 'F' });
    User.find.mockReturnValue(
      selectManyOf([
        { _id: 'u1', role: 'Author' },
        { _id: 'u2', role: 'Author' },
      ])
    );
    KickedUser.find.mockReturnValue(selectManyOf([]));
    FloorMember.find.mockReturnValue(selectManyOf([]));
    RoomMember.find.mockReturnValue(selectManyOf([]));
  });

  test('公開ルームでは有効ユーザだけを残し、キック済みユーザを除外する', async () => {
    KickedUser.find.mockReturnValue(selectManyOf([{ user: 'u2' }]));

    const result = await filterAuthorizedRoomUserIds(['u1', 'u2', 'deleted', 'u1'], 'r1');

    expect(result).toEqual(['u1']);
    expect(User.find).toHaveBeenCalledWith({
      _id: { $in: ['u1', 'u2', 'deleted'] },
      delete_flg: false,
    });
    expect(KickedUser.find).toHaveBeenCalledWith({
      floor: 'f1',
      user: { $in: ['u1', 'u2'] },
    });
  });

  test('限定ルームでは管理者・フロア作成者フロア編集ユーザ・フロアメンバー・ルームメンバーだけを残す', async () => {
    findActiveRoom.mockResolvedValue({ _id: 'r1', floor: 'f1', member_only: true, title: 'R' });
    findActiveFloor.mockResolvedValue({ _id: 'f1', user: 'editor', title: 'F' });
    User.find.mockReturnValue(
      selectManyOf([
        { _id: 'admin', role: 'Administrator' },
        { _id: 'editor', role: 'Editor' },
        { _id: 'floor-member', role: 'Author' },
        { _id: 'room-member', role: 'Author' },
        { _id: 'outsider', role: 'Author' },
      ])
    );
    FloorMember.find.mockReturnValue(selectManyOf([{ user: 'floor-member' }]));
    RoomMember.find.mockReturnValue(selectManyOf([{ user: 'room-member' }]));

    const result = await filterAuthorizedRoomUserIds(
      ['admin', 'editor', 'floor-member', 'room-member', 'outsider'],
      'r1'
    );

    expect(result).toEqual(['admin', 'editor', 'floor-member', 'room-member']);
  });

  test('限定ルームでは別の有効な所属があってもキック済みユーザを除外する', async () => {
    findActiveRoom.mockResolvedValue({ _id: 'r1', floor: 'f1', member_only: true, title: 'R' });
    User.find.mockReturnValue(selectManyOf([{ _id: 'member', role: 'Author' }]));
    KickedUser.find.mockReturnValue(selectManyOf([{ user: 'member' }]));
    FloorMember.find.mockReturnValue(selectManyOf([{ user: 'member' }]));
    RoomMember.find.mockReturnValue(selectManyOf([{ user: 'member' }]));

    await expect(filterAuthorizedRoomUserIds(['member'], 'r1')).resolves.toEqual([]);
  });

  test('有効ユーザがいなければ所属を検索せず空配列を返す', async () => {
    User.find.mockReturnValue(selectManyOf([]));

    await expect(filterAuthorizedRoomUserIds(['deleted'], 'r1')).resolves.toEqual([]);
    expect(KickedUser.find).not.toHaveBeenCalled();
    expect(FloorMember.find).not.toHaveBeenCalled();
    expect(RoomMember.find).not.toHaveBeenCalled();
  });

  test('ルームが無効ならエラーを伝播する', async () => {
    findActiveRoom.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));

    await expect(filterAuthorizedRoomUserIds(['u1'], 'r1')).rejects.toBeInstanceOf(AppError);
  });
});

describe('ルームとフロアの取得・確認', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ルームと所属フロアを返す', async () => {
    findActiveRoom.mockResolvedValue({ _id: 'r1', floor: 'f1', member_only: false, title: 'R' });
    findActiveFloor.mockResolvedValue({ _id: 'f1', user: 'u1', title: 'F' });

    const res = await ensureRoomContext('r1');

    expect(findActiveRoom).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ select: '_id floor member_only title', error: { code: 'INVALID_PARAMS' } })
    );
    expect(findActiveFloor).toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({ select: '_id user title target_langs', error: { code: 'INVALID_PARAMS' } })
    );
    expect(res).toEqual({
      room: { _id: 'r1', floor: 'f1', member_only: false, title: 'R' },
      floor: { _id: 'f1', user: 'u1', title: 'F' },
    });
  });

  test('取得項目とエラーを指定できる', async () => {
    findActiveRoom.mockResolvedValue({ _id: 'r2', floor: 'f2' });
    findActiveFloor.mockResolvedValue({ _id: 'f2' });

    await ensureRoomContext('r2', {
      roomSelect: '_id',
      floorSelect: '_id',
      errors: { room: { code: 'ROOM_NOT_FOUND' }, floor: { code: 'FLOOR_NOT_FOUND' } },
    });

    expect(findActiveRoom).toHaveBeenCalledWith(
      'r2',
      expect.objectContaining({ select: '_id', error: { code: 'ROOM_NOT_FOUND' } })
    );
    expect(findActiveFloor).toHaveBeenCalledWith(
      'f2',
      expect.objectContaining({ select: '_id', error: { code: 'FLOOR_NOT_FOUND' } })
    );
  });
});
