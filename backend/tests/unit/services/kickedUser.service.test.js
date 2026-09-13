jest.mock(
  '../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

jest.mock('../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ warn: jest.fn(), error: jest.fn() }));
jest.mock('../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/KickedUser', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndDelete: jest.fn(),
  deleteMany: jest.fn(),
}));

const service = require('../../../services/kickedUser.service');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const User = require('../../../models/User');
const KickedUser = require('../../../models/KickedUser');
const AppError = require('../../../utils/appError');

const getIoMock = () => {
  const emit = jest.fn();
  const disconnectSockets = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const inRoom = jest.fn(() => ({ disconnectSockets }));
  return { to, in: inRoom, _emit: emit, _disconnectSockets: disconnectSockets };
};

beforeEach(() => jest.clearAllMocks());

describe('キックされたユーザの一覧取得', () => {
  const body = { floor_id: 'floor1' };
  const floorDoc = { _id: 'floor1', user: 'editor' };
  const jwtAdmin = { user_id: 'admin', user_role: 'Administrator' };
  const jwtEditor = { user_id: 'editor', user_role: 'Editor' };
  const jwtUser = { user_id: 'user', user_role: 'User' };
  const demotedOwners = [
    { user_id: 'editor', user_role: 'Author' },
    { user_id: 'editor', user_role: 'developer' },
  ];

  beforeEach(() => {
    User.findOne.mockResolvedValue({ _id: 'u' });
    Floor.findOne.mockResolvedValue(floorDoc);
    const __chain = { populate: jest.fn(() => __chain), sort: jest.fn().mockResolvedValue([]) };
    KickedUser.find.mockReturnValue(__chain);
  });

  test('管理者取得成功', async () => {
    await service.getKickedUserList(body, jwtAdmin);
    expect(KickedUser.find).toHaveBeenCalledWith({ floor: 'floor1' });
  });

  test('フロア作成者取得成功', async () => {
    await service.getKickedUserList(body, jwtEditor);
    expect(KickedUser.find).toHaveBeenCalled();
  });

  test('一般ユーザは 401', async () => {
    await expect(service.getKickedUserList(body, jwtUser)).rejects.toBeInstanceOf(AppError);
  });

  test.each(demotedOwners)('所有者でも現在ロールが $user_role なら拒否', async (jwtOwner) => {
    await expect(service.getKickedUserList(body, jwtOwner)).rejects.toBeInstanceOf(AppError);
    expect(KickedUser.find).not.toHaveBeenCalled();
  });
});

describe('キック状態の確認', () => {
  const jwt = { user_id: 'u1' };
  beforeEach(() => User.findOne.mockResolvedValue({ _id: 'u1' }));

  test('Kick ありの場合 true', async () => {
    Room.findOne.mockResolvedValue({ _id: 'room1', floor: 'floor1', delete_flg: false });
    Floor.findOne.mockResolvedValue({ _id: 'floor1' });
    KickedUser.findOne.mockResolvedValue({ _id: 'k1' });

    const res = await service.checkKickedUser({ room_id: 'room1' }, jwt);
    expect(res).toBe(true);
  });

  test('Kick 無しの場合 false', async () => {
    Floor.findOne.mockResolvedValue({ _id: 'floorX' });
    KickedUser.findOne.mockResolvedValue(null);

    const res = await service.checkKickedUser({ floor_id: 'floorX' }, jwt);
    expect(res).toBe(false);
  });
});

describe('キックの登録', () => {
  const body = { user_id: 'target', room_id: 'room1' };
  const floorDoc = { _id: 'floor1', user: 'editor' };
  const roomDoc = { _id: 'room1', floor: 'floor1', delete_flg: false };
  const jwtAdmin = { user_id: 'admin', user_role: 'Administrator' };
  const jwtEditor = { user_id: 'editor', user_role: 'Editor' };
  const demotedOwners = [
    { user_id: 'editor', user_role: 'Author' },
    { user_id: 'editor', user_role: 'developer' },
  ];

  const io = getIoMock();

  beforeEach(() => {
    User.findOne.mockImplementation(({ _id }) => {
      if (_id === 'admin') return Promise.resolve({ _id: 'admin' });
      if (_id === 'target') return Promise.resolve({ _id: 'target', role: 'User' });
      return Promise.resolve({ _id });
    });
    Room.findOne.mockResolvedValue(roomDoc);
    Floor.findOne.mockResolvedValue(floorDoc);
    KickedUser.findOne.mockResolvedValue(null);
    KickedUser.create.mockResolvedValue({ _id: 'kickId' });
  });

  test('管理者がキック成功し、対象フロアの全Socketへ通知して切断する', async () => {
    const res = await service.createKickedUser(body, jwtAdmin, io);

    expect(KickedUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'target',
        room: 'room1',
        floor: 'floor1',
        kicked_by: 'admin',
      })
    );
    expect(io.to).toHaveBeenCalledWith('__access__:floor-user:floor1:target');
    expect(io._emit).toHaveBeenCalledWith('KICKED_USER');
    expect(io.in).toHaveBeenCalledWith('__access__:floor-user:floor1:target');
    expect(io._disconnectSockets).toHaveBeenCalledWith(true);
    expect(res).toEqual({ _id: 'kickId' });
  });

  test('現在ロールがフロア編集ユーザのフロア所有者はキックできる', async () => {
    await expect(service.createKickedUser(body, jwtEditor, io)).resolves.toEqual({ _id: 'kickId' });
  });

  test.each(['to', 'emit'])('通知の%s失敗を記録し、キック保存後の切断を続行する', async (stage) => {
    const faultIo = getIoMock();
    (stage === 'to' ? faultIo.to : faultIo._emit).mockImplementation(() => { throw new Error('notify failed'); });
    await expect(service.createKickedUser(body, jwtAdmin, faultIo)).resolves.toEqual({ _id: 'kickId' });
    expect(KickedUser.create).toHaveBeenCalledTimes(1);
    expect(faultIo._disconnectSockets).toHaveBeenCalledWith(true);
    expect(require('../../../utils/logger').warn).toHaveBeenCalledWith('[SOCKET] publication failed', { event: 'KICKED_USER' });
  });

  test('キック保存後の通知と切断の失敗をそれぞれ記録する', async () => {
    const faultIo = getIoMock();
    faultIo._emit.mockRejectedValue(new Error('notify failed'));
    faultIo._disconnectSockets.mockRejectedValue(new Error('disconnect failed'));
    await expect(service.createKickedUser(body, jwtAdmin, faultIo)).resolves.toEqual({ _id: 'kickId' });
    const logger = require('../../../utils/logger');
    expect(logger.warn).toHaveBeenCalledWith('[SOCKET] publication failed', { event: 'KICKED_USER' });
    expect(logger.error).toHaveBeenCalledWith('[SOCKET] revocation disconnect failed', { event: 'KICKED_USER' });
  });

  test('キック保存失敗は伝播し、通知や切断を開始しない', async () => {
    const faultIo = getIoMock();
    KickedUser.create.mockRejectedValueOnce(new Error('save failed'));
    await expect(service.createKickedUser(body, jwtAdmin, faultIo)).rejects.toThrow('save failed');
    expect(faultIo.to).not.toHaveBeenCalled();
    expect(faultIo.in).not.toHaveBeenCalled();
  });

  test.each(demotedOwners)('所有者でも現在ロールが $user_role なら拒否', async (jwtOwner) => {
    await expect(service.createKickedUser(body, jwtOwner, io)).rejects.toBeInstanceOf(AppError);
    expect(KickedUser.create).not.toHaveBeenCalled();
  });

  test('既にキック済みはエラー', async () => {
    KickedUser.findOne.mockResolvedValue({ _id: 'existing' });
    await expect(service.createKickedUser(body, jwtAdmin, io)).rejects.toBeInstanceOf(AppError);
  });

  test('管理者へのキックを拒否する', async () => {
    User.findOne.mockImplementation(({ _id }) =>
      _id === 'target' ? Promise.resolve({ _id: 'target', role: 'Administrator' }) : Promise.resolve({ _id })
    );
    await expect(service.createKickedUser(body, jwtAdmin, io)).rejects.toBeInstanceOf(AppError);
  });
});

describe('キックの解除', () => {
  const jwtAdmin = { user_id: 'admin', user_role: 'Administrator' };
  const jwtEditor = { user_id: 'editor', user_role: 'Editor' };
  const demotedOwners = [
    { user_id: 'editor', user_role: 'Author' },
    { user_id: 'editor', user_role: 'developer' },
  ];
  const body = { user_id: 'target', floor_id: 'floor1' };

  beforeEach(() => {
    User.findOne.mockResolvedValue({ _id: 'admin' });
    KickedUser.findOne.mockResolvedValue({ _id: 'kick1', user: 'target', floor: 'floor1', room: 'room1' });
    Room.findOne.mockResolvedValue({ _id: 'room1', floor: 'floor1' });
    Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'editor' });
    KickedUser.deleteMany.mockResolvedValue({ deletedCount: 2 });
  });

  test('管理者が解除成功', async () => {
    const res = await service.deleteKickedUser(body, jwtAdmin);
    expect(KickedUser.findOne).toHaveBeenCalledWith({ user: 'target', floor: 'floor1' });
    expect(KickedUser.deleteMany).toHaveBeenCalledWith({ user: 'target', floor: 'floor1' });
    expect(res).toMatchObject({ _id: 'kick1' });
  });

  test('現在ロールがフロア編集ユーザのフロア所有者は解除できる', async () => {
    await expect(service.deleteKickedUser(body, jwtEditor)).resolves.toMatchObject({ _id: 'kick1' });
  });

  test.each(demotedOwners)('所有者でも現在ロールが $user_role なら拒否', async (jwtOwner) => {
    await expect(service.deleteKickedUser(body, jwtOwner)).rejects.toBeInstanceOf(AppError);
    expect(KickedUser.deleteMany).not.toHaveBeenCalled();
  });

  test('指定フロアのキック情報が無ければ 400', async () => {
    KickedUser.findOne.mockResolvedValue(null);
    await expect(service.deleteKickedUser({ user_id: 'target', floor_id: 'floorX' }, jwtAdmin)).rejects.toBeInstanceOf(
      AppError
    );
  });

  test('該当 Kick 無しで 400', async () => {
    KickedUser.deleteMany.mockResolvedValue({ deletedCount: 0 });
    await expect(service.deleteKickedUser(body, jwtAdmin)).rejects.toBeInstanceOf(AppError);
  });
});

test('DBの並行キック競合を業務エラーへ変換する', async () => {
  User.findOne.mockResolvedValue({ _id: 'target', role: 'Author' });
  Room.findOne.mockResolvedValue({ _id: 'room1', floor: 'floor1' });
  Floor.findOne.mockResolvedValue({ _id: 'floor1', user: 'owner' });
  KickedUser.findOne.mockResolvedValue(null);
  KickedUser.create.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
  await expect(service.createKickedUser({ user_id: 'target', room_id: 'room1' },
    { user_id: 'admin', user_role: 'Administrator' }, getIoMock())).rejects.toMatchObject({ message: { code: 'ALREADY_KICKED' } });
});
