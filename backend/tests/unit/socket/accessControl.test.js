jest.mock('../../../services/room/roomAccess.service', () => ({
  filterAuthorizedRoomUserIds: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({ warn: jest.fn(), error: jest.fn() }));

const { filterAuthorizedRoomUserIds } = require('../../../services/room/roomAccess.service');
const {
  ROOM_ACCESS_REVOKED_EVENT,
  USER_SESSION_REVOKED_EVENT,
  USER_ROLE_UPDATED_EVENT,
  disconnectUserSessionSockets,
  revalidateFloorUserSockets,
  revalidateUserSockets,
} = require('../../../socket/accessControl');

const buildSocket = (roomId) => ({
  data: roomId ? { accessContext: { room_id: roomId } } : {},
  emit: jest.fn(),
  disconnect: jest.fn(),
});

const buildIo = (sockets) => {
  const scope = {
    fetchSockets: jest.fn().mockResolvedValue(sockets),
    emit: jest.fn(),
    disconnectSockets: jest.fn(),
  };
  return {
    io: { in: jest.fn(() => scope) },
    scope,
  };
};

describe('Socket接続のアクセス制御', () => {
  test('他ルームの認可結果が未確定でも拒否が確定した接続は切断する', async () => {
    const denied = buildSocket('room-denied');
    const pending = buildSocket('room-pending');
    const { io } = buildIo([denied, pending]);
    let finish;
    filterAuthorizedRoomUserIds.mockImplementation(async (_ids, room) => {
      if (room === 'room-denied') return [];
      return new Promise((resolve) => { finish = resolve; });
    });
    const revalidation = revalidateUserSockets(io, { userId: 'user-1' });
    await new Promise((resolve) => setImmediate(resolve));
    try {
      expect(denied.disconnect).toHaveBeenCalledWith(true);
      expect(pending.disconnect).not.toHaveBeenCalled();
    } finally {
      finish(['user-1']);
      await revalidation;
    }
  });
  test.each(['room-denied', null])('一接続の切断失敗後も全拒否対象を切断し、%sの失敗は呼出元へ返す', async (roomId) => {
    const failed = buildSocket(roomId);
    const denied = buildSocket(roomId);
    const allowed = buildSocket('room-allowed');
    const { io } = buildIo([failed, denied, allowed]);
    filterAuthorizedRoomUserIds.mockImplementation(async (_ids, room) => room === 'room-allowed' ? ['user-1'] : []);
    failed.disconnect.mockRejectedValue(new Error('disconnect failed'));
    await expect(revalidateUserSockets(io, { userId: 'user-1' })).rejects.toThrow('disconnect failed');
    expect(denied.disconnect).toHaveBeenCalledWith(true);
    expect(allowed.disconnect).not.toHaveBeenCalled();
    expect(require('../../../utils/logger').error).toHaveBeenCalledWith('[SOCKET] revocation disconnect failed', { event: ROOM_ACCESS_REVOKED_EVENT });
  });

  test('セッション切断失敗は伝播し、同じ要求で切断を再試行できる', async () => {
    const { io, scope } = buildIo([]);
    scope.disconnectSockets.mockRejectedValueOnce(new Error('disconnect failed'));
    await expect(disconnectUserSessionSockets(io, 'user-1')).rejects.toThrow('disconnect failed');
    await expect(disconnectUserSessionSockets(io, 'user-1')).resolves.toBeUndefined();
    expect(scope.disconnectSockets).toHaveBeenCalledTimes(2);
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('権限を失ったルームの全Socketだけを通知して切断する', async () => {
    const deniedA = buildSocket('room-denied');
    const deniedB = buildSocket('room-denied');
    const allowed = buildSocket('room-allowed');
    const { io } = buildIo([deniedA, deniedB, allowed]);
    filterAuthorizedRoomUserIds.mockImplementation(async (_userIds, roomId) =>
      roomId === 'room-allowed' ? ['user-1'] : []
    );

    await revalidateFloorUserSockets(io, { floorId: 'floor-1', userId: 'user-1' });

    expect(io.in).toHaveBeenCalledWith('__access__:floor-user:floor-1:user-1');
    expect(filterAuthorizedRoomUserIds).toHaveBeenCalledTimes(2);
    for (const socket of [deniedA, deniedB]) {
      expect(socket.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    }
    expect(allowed.emit).not.toHaveBeenCalled();
    expect(allowed.disconnect).not.toHaveBeenCalled();
  });

  test('公開ルームや代替権限により認可されたSocketは維持する', async () => {
    const allowed = buildSocket('room-allowed');
    const { io } = buildIo([allowed]);
    filterAuthorizedRoomUserIds.mockResolvedValue(['user-1']);

    await revalidateFloorUserSockets(io, { floorId: 'floor-1', userId: 'user-1' });

    expect(allowed.emit).not.toHaveBeenCalled();
    expect(allowed.disconnect).not.toHaveBeenCalled();
  });

  test('ルーム認可の再評価に失敗したSocketは安全側で切断する', async () => {
    const socket = buildSocket('room-error');
    const { io } = buildIo([socket]);
    filterAuthorizedRoomUserIds.mockRejectedValue(new Error('database error'));

    await revalidateFloorUserSockets(io, { floorId: 'floor-1', userId: 'user-1' });

    expect(socket.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  test('接続メタデータが無いSocketは安全側で切断する', async () => {
    const socket = buildSocket(null);
    const { io } = buildIo([socket]);

    await revalidateFloorUserSockets(io, { floorId: 'floor-1', userId: 'user-1' });

    expect(filterAuthorizedRoomUserIds).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  test('Socket一覧取得に失敗した場合は対象フロア・ユーザの全Socketを切断する', async () => {
    const { io, scope } = buildIo([]);
    scope.fetchSockets.mockRejectedValue(new Error('adapter error'));

    await revalidateFloorUserSockets(io, { floorId: 'floor-1', userId: 'user-1' });

    expect(scope.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(scope.disconnectSockets).toHaveBeenCalledWith(true);
  });

  test('Socket一覧取得後の通知に失敗しても対象フロア・ユーザの全Socket切断を成功扱いにする', async () => {
    const { io, scope } = buildIo([]);
    scope.fetchSockets.mockRejectedValue(new Error('adapter error'));
    scope.emit.mockImplementation(() => {
      throw new Error('emit failed');
    });

    await expect(
      revalidateFloorUserSockets(io, { floorId: 'floor-1', userId: 'user-1' })
    ).resolves.toBeUndefined();

    expect(scope.disconnectSockets).toHaveBeenCalledWith(true);
  });

  test('ユーザ単位で全フロアのSocketを再評価し、ロール変更を通知する', async () => {
    const denied = buildSocket('room-denied');
    const allowed = buildSocket('room-allowed');
    const { io, scope } = buildIo([denied, allowed]);
    filterAuthorizedRoomUserIds.mockImplementation(async (_userIds, roomId) =>
      roomId === 'room-allowed' ? ['user-1'] : []
    );

    await revalidateUserSockets(io, { userId: 'user-1', userRole: 'Author' });

    expect(io.in).toHaveBeenCalledWith('__access__:user:user-1');
    expect(scope.emit).toHaveBeenCalledWith(USER_ROLE_UPDATED_EVENT, { role: 'Author' });
    expect(filterAuthorizedRoomUserIds).toHaveBeenCalledTimes(2);
    expect(denied.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(denied.disconnect).toHaveBeenCalledWith(true);
    expect(allowed.emit).not.toHaveBeenCalled();
    expect(allowed.disconnect).not.toHaveBeenCalled();
  });

  test('ユーザ単位のSocket一覧取得に失敗した場合は全接続を安全側で切断する', async () => {
    const { io, scope } = buildIo([]);
    scope.fetchSockets.mockRejectedValue(new Error('adapter error'));

    await revalidateUserSockets(io, { userId: 'user-1', userRole: 'Author' });

    expect(scope.emit).toHaveBeenCalledWith(USER_ROLE_UPDATED_EVENT, { role: 'Author' });
    expect(scope.emit).toHaveBeenCalledWith(ROOM_ACCESS_REVOKED_EVENT);
    expect(scope.disconnectSockets).toHaveBeenCalledWith(true);
  });

  test('ロール変更通知に失敗してもユーザ単位のアクセス再評価を続行する', async () => {
    const denied = buildSocket('room-denied');
    const { io, scope } = buildIo([denied]);
    scope.emit.mockImplementationOnce(() => {
      throw new Error('emit failed');
    });
    filterAuthorizedRoomUserIds.mockResolvedValue([]);

    await revalidateUserSockets(io, { userId: 'user-1', userRole: 'Author' });

    expect(filterAuthorizedRoomUserIds).toHaveBeenCalledWith(['user-1'], 'room-denied');
    expect(denied.disconnect).toHaveBeenCalledWith(true);
  });

  test('アクセス失効通知に失敗しても拒否対象Socketの切断を成功扱いにする', async () => {
    const denied = buildSocket('room-denied');
    denied.emit.mockImplementation(() => {
      throw new Error('emit failed');
    });
    const { io } = buildIo([denied]);
    filterAuthorizedRoomUserIds.mockResolvedValue([]);

    await expect(
      revalidateUserSockets(io, { userId: 'user-1', userRole: 'Author' })
    ).resolves.toBeUndefined();

    expect(denied.disconnect).toHaveBeenCalledWith(true);
  });

  test('対象ユーザの全Socketだけへセッション失効を通知して切断する', async () => {
    const targetScope = {
      emit: jest.fn(),
      disconnectSockets: jest.fn(),
    };
    const otherScope = {
      emit: jest.fn(),
      disconnectSockets: jest.fn(),
    };
    const io = {
      in: jest.fn((room) => (room === '__access__:user:user-1' ? targetScope : otherScope)),
    };

    await disconnectUserSessionSockets(io, 'user-1');

    expect(io.in).toHaveBeenCalledWith('__access__:user:user-1');
    expect(targetScope.emit).toHaveBeenCalledWith(USER_SESSION_REVOKED_EVENT);
    expect(targetScope.disconnectSockets).toHaveBeenCalledWith(true);
    expect(otherScope.emit).not.toHaveBeenCalled();
    expect(otherScope.disconnectSockets).not.toHaveBeenCalled();
  });

  test('セッション失効イベントの通知に失敗しても対象Socketを切断して成功扱いにする', async () => {
    const { io, scope } = buildIo([]);
    scope.emit.mockImplementation(() => {
      throw new Error('emit failed');
    });

    await expect(disconnectUserSessionSockets(io, 'user-1')).resolves.toBeUndefined();

    expect(scope.disconnectSockets).toHaveBeenCalledWith(true);
  });

  test('ioまたはユーザIDが無いセッション失効要求は何もしない', () => {
    const { io } = buildIo([]);

    disconnectUserSessionSockets(null, 'user-1');
    disconnectUserSessionSockets(io, null);

    expect(io.in).not.toHaveBeenCalled();
  });

  test('ioまたは識別子が無い場合は何もしない', async () => {
    const { io } = buildIo([]);

    await revalidateFloorUserSockets(null, { floorId: 'floor-1', userId: 'user-1' });
    await revalidateFloorUserSockets(io, { floorId: null, userId: 'user-1' });
    await revalidateFloorUserSockets(io, { floorId: 'floor-1', userId: null });
    await revalidateUserSockets(null, { userId: 'user-1', userRole: 'Author' });
    await revalidateUserSockets(io, { userId: null, userRole: 'Author' });

    expect(io.in).not.toHaveBeenCalled();
  });
});
