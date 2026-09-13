const mongoose = require('mongoose');

jest.mock('../../../services/room/roomAccess.service', () => ({
  authorizeRoomAccess: jest.fn(),
  ensureRoomContext: jest.fn(),
}));

jest.mock('../../../services/guestAuth.service', () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock('../../../services/_shared/userSession', () => ({
  findUserForSession: jest.fn(),
  normalizeSessionVersion: jest.fn((value) => (Number.isInteger(value) ? value : 0)),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const { authorizeRoomAccess, ensureRoomContext } = require('../../../services/room/roomAccess.service');
const { verifyAccessToken } = require('../../../services/guestAuth.service');
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'unit-test-secret';
const { findUserForSession } = require('../../../services/_shared/userSession');
const socketHandlers = require('../../../socket');
const { SOCKET_ACCESS_ERRORS } = require('../../../socket/authenticateSocket');
const { createRoomLanguageProvider } = require('../../../socket/roomLanguageProvider');
const { ALLOWED_LANGUAGES } = require('../../../constants/languages');

const buildIo = () => {
  let middleware;
  let connectionHandler;
  const emitMap = new Map();
  const io = {
    use: jest.fn((fn) => {
      middleware = fn;
      return {
        on: (event, handler) => {
          if (event === 'connection') connectionHandler = handler;
        },
      };
    }),
    to: jest.fn((id) => {
      const emit = jest.fn();
      emitMap.set(id, emit);
      return { emit };
    }),
  };
  const roomParticipants = new Map();
  socketHandlers(io, roomParticipants);
  return { io, roomParticipants, emitMap, getMiddleware: () => middleware, getConnection: () => connectionHandler };
};

const buildSocket = (query = {}) => {
  const handlers = {};
  return {
    id: 'socket-1',
    handshake: { query },
    join: jest.fn(),
    connected: true,
    disconnect: jest.fn(function disconnect() {
      this.connected = false;
    }),
    on: jest.fn((event, handler) => {
      handlers[event] = handler;
    }),
    getHandler: (event) => handlers[event],
  };
};

const validRoomId = new mongoose.Types.ObjectId().toHexString();

beforeEach(() => {
  jest.clearAllMocks();
  ensureRoomContext.mockResolvedValue({ room: { _id: validRoomId, member_only: false }, floor: { _id: 'floor-1' } });
  authorizeRoomAccess.mockResolvedValue();
  findUserForSession.mockResolvedValue({ _id: 'user-1', role: 'editor', session_version: 0 });
});

afterAll(() => {
  if (ORIGINAL_JWT_SECRET === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
  }
});

describe('Socket接続時の認証と認可', () => {
  test('ルーム参加権限エラーは利用者向けの文言を返す', () => {
    expect(SOCKET_ACCESS_ERRORS.kicked).toEqual({
      message: 'このルームに参加する権限がありません',
      status: 403,
    });
    expect(SOCKET_ACCESS_ERRORS.permission).toEqual(SOCKET_ACCESS_ERRORS.kicked);
  });

  test('room_id 未指定はエラー', async () => {
    const { getMiddleware } = buildIo();
    const socket = buildSocket({ lang: ALLOWED_LANGUAGES[0], guest_token: 'guest' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('ルーム情報が必要です');
  });

  test('room_id が不正ならエラー', async () => {
    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: 'invalid', lang: ALLOWED_LANGUAGES[0], guest_token: 'guest' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('ルーム情報が正しくありません');
  });

  test('lang 未指定はエラー', async () => {
    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, guest_token: 'guest' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('言語の指定が必要です');
  });

  test('lang が不正ならエラー', async () => {
    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: 'xx', guest_token: 'guest' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('言語の指定が正しくありません');
  });

  test('ユーザ/ゲストトークンが両方または両方無しならエラー', async () => {
    const { getMiddleware } = buildIo();
    const next = jest.fn();

    await getMiddleware()(buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0] }), next);
    expect(next.mock.calls[0][0].message).toBe('ログイン情報またはゲスト認証情報が必要です');

    next.mockClear();
    await getMiddleware()(buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], guest_token: 'g1', user_token: 'u1' }), next);
    expect(next.mock.calls[0][0].message).toBe('ログイン情報またはゲスト認証情報が必要です');
  });

  test('ゲストトークンが不正ならエラー', async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new Error('bad');
    });
    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], guest_token: 'bad' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('ゲスト認証が無効か、有効期限が切れています');
  });

  test('ゲストトークンに guest_id が無い場合はエラー', async () => {
    verifyAccessToken.mockReturnValue({});
    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], guest_token: 'guest' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('ゲスト認証が無効か、有効期限が切れています');
  });

  test('member_only のルームはゲスト参加不可', async () => {
    ensureRoomContext.mockResolvedValue({ room: { member_only: true }, floor: { _id: 'floor-1' } });
    verifyAccessToken.mockReturnValue({ guest_id: 'guest-1' });

    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], guest_token: 'guest' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('ゲストはこのルームに参加できません');
  });

  test('ユーザトークンが有効なら userData をセットする', async () => {
    jwt.verify.mockImplementation((_token, _secret, cb) => cb(null, { user_id: 'user-1', user_role: 'editor' }));

    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], user_token: 'token' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(findUserForSession).toHaveBeenCalledWith({ user_id: 'user-1', user_role: 'editor' });
    expect(authorizeRoomAccess).toHaveBeenCalledWith('user-1', 'editor', validRoomId, expect.any(Object));
    expect(socket.userData).toEqual({
      room_id: validRoomId,
      floor_id: 'floor-1',
      user_id: 'user-1',
      user_role: 'editor',
      authenticated_user: true,
      lang: ALLOWED_LANGUAGES[0],
    });
    expect(socket.data.accessContext).toEqual(socket.userData);
  });

  test('大文字のルームIDをDB由来IDへ正規化し、接続言語を同じルームキーで参照できる', async () => {
    const uppercaseRoomId = validRoomId.toUpperCase();
    jwt.verify.mockImplementation((_token, _secret, cb) => cb(null, { user_id: 'user-1', user_role: 'editor' }));

    const { getMiddleware, getConnection, roomParticipants } = buildIo();
    const socket = buildSocket({
      room_id: uppercaseRoomId,
      lang: ALLOWED_LANGUAGES[0],
      user_token: 'token',
    });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(ensureRoomContext).toHaveBeenCalledWith(uppercaseRoomId, expect.any(Object));
    expect(authorizeRoomAccess).toHaveBeenCalledWith('user-1', 'editor', validRoomId, expect.any(Object));
    expect(socket.userData.room_id).toBe(validRoomId);
    expect(socket.data.accessContext.room_id).toBe(validRoomId);

    await getConnection()(socket);

    expect(roomParticipants.has(validRoomId)).toBe(true);
    expect(roomParticipants.has(uppercaseRoomId)).toBe(false);
    expect(createRoomLanguageProvider(roomParticipants).getLanguages(validRoomId)).toEqual([ALLOWED_LANGUAGES[0]]);
  });

  test('セッション世代が失効したユーザトークンはエラー', async () => {
    jwt.verify.mockImplementation((_token, _secret, cb) =>
      cb(null, { user_id: 'user-1', user_role: 'editor', session_version: 0 })
    );
    findUserForSession.mockResolvedValue(null);

    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], user_token: 'token' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('ユーザーの認証情報を確認できませんでした');
    expect(authorizeRoomAccess).not.toHaveBeenCalled();
  });

  test('ゲストトークンが有効なら userData に guest_id をセットする', async () => {
    verifyAccessToken.mockReturnValue({ guest_id: 'guest-1' });

    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], guest_token: 'guest' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.userData).toEqual({
      room_id: validRoomId,
      floor_id: 'floor-1',
      user_id: 'guest-1',
      user_role: null,
      authenticated_user: false,
      lang: ALLOWED_LANGUAGES[0],
    });
    expect(socket.data.accessContext).toEqual(socket.userData);
  });

  test('JWT検証が失敗した場合はエラー', async () => {
    jwt.verify.mockImplementation((_token, _secret, cb) => cb(new Error('bad token')));

    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], user_token: 'token' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('ユーザーの認証情報を確認できませんでした');
  });

  test('ensureRoomContext が失敗した場合はエラーを伝播する', async () => {
    ensureRoomContext.mockRejectedValue(new Error('room context error'));

    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], guest_token: 'guest' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('room context error');
  });

  test('authorizeRoomAccess が失敗した場合はエラーを伝播する', async () => {
    jwt.verify.mockImplementation((_token, _secret, cb) => cb(null, { user_id: 'user-1', user_role: 'editor' }));
    authorizeRoomAccess.mockRejectedValue(new Error('permission error'));

    const { getMiddleware } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: ALLOWED_LANGUAGES[0], user_token: 'token' });
    const next = jest.fn();

    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toBe('permission error');
  });
});

describe('Socket接続後の参加管理', () => {
  test('ハンドシェイク後のロール変更も参加時の再認可へ反映する', async () => {
    jwt.verify.mockImplementation((_token, _secret, cb) => cb(null, { user_id: 'user-1', session_version: 0 }));
    const { getMiddleware, getConnection } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: 'ja', user_token: 'token' });
    await getMiddleware()(socket, jest.fn());
    findUserForSession.mockResolvedValueOnce({ _id: 'user-1', role: 'Author', session_version: 0 });
    await getConnection()(socket);
    expect(authorizeRoomAccess).toHaveBeenLastCalledWith('user-1', 'Author', validRoomId, expect.any(Object));
    expect(socket.data.accessContext.user_role).toBe('Author');
  });

  test('ハンドシェイク後に失効したセッションは配信用ルームへ参加しない', async () => {
    jwt.verify.mockImplementation((_token, _secret, cb) => cb(null, { user_id: 'user-1', session_version: 0 }));
    const { getMiddleware, getConnection, roomParticipants } = buildIo();
    const socket = buildSocket({ room_id: validRoomId, lang: 'ja', user_token: 'token' });
    const next = jest.fn();
    await getMiddleware()(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.sessionVersion).toBe(0);
    findUserForSession.mockResolvedValueOnce(null);
    await getConnection()(socket);
    expect(findUserForSession).toHaveBeenLastCalledWith({ user_id: 'user-1', session_version: 0 });
    expect(socket.join).not.toHaveBeenCalledWith(validRoomId);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(roomParticipants.size).toBe(0);
  });

  test('認証ユーザはユーザ・フロア専用ルームへ参加後に再認可され、対象ルームへ参加する', async () => {
    const { getConnection, roomParticipants } = buildIo();
    const socket = buildSocket();
    socket.userData = {
      room_id: 'room-1',
      floor_id: 'floor-1',
      user_id: 'user-1',
      user_role: 'editor',
      authenticated_user: true,
      lang: 'ja',
    };

    await getConnection()(socket);

    expect(socket.join.mock.calls).toEqual([
      ['__access__:floor:floor-1'],
      ['__access__:room:room-1'],
      ['__access__:user:user-1'],
      ['__access__:floor-user:floor-1:user-1'],
      ['room-1'],
    ]);
    expect(authorizeRoomAccess).toHaveBeenCalledWith('user-1', 'editor', 'room-1', expect.any(Object));
    expect(roomParticipants.get('room-1').has('user-1')).toBe(true);
  });

  test('専用ルーム参加後の再認可に失敗した場合は対象ルームへ参加させず切断する', async () => {
    const { getConnection, roomParticipants } = buildIo();
    const socket = buildSocket();
    socket.userData = {
      room_id: 'room-1',
      floor_id: 'floor-1',
      user_id: 'user-1',
      user_role: 'editor',
      authenticated_user: true,
      lang: 'ja',
    };
    authorizeRoomAccess.mockRejectedValueOnce(new Error('kicked'));

    await getConnection()(socket);

    expect(socket.join.mock.calls).toEqual([['__access__:floor:floor-1'], ['__access__:room:room-1'], ['__access__:user:user-1'], ['__access__:floor-user:floor-1:user-1']]);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(roomParticipants.has('room-1')).toBe(false);
  });

  test('ユーザ専用ルーム参加直後に切断されたSocketは後続ルームへ参加させない', async () => {
    const { getConnection, roomParticipants } = buildIo();
    const socket = buildSocket();
    socket.userData = {
      room_id: 'room-1',
      floor_id: 'floor-1',
      user_id: 'user-1',
      user_role: 'editor',
      authenticated_user: true,
      lang: 'ja',
    };
    socket.join.mockImplementation(async (room) => {
      if (room === '__access__:user:user-1') socket.connected = false;
    });

    await getConnection()(socket);

    expect(socket.join.mock.calls).toEqual([['__access__:floor:floor-1'], ['__access__:room:room-1'], ['__access__:user:user-1']]);
    expect(authorizeRoomAccess).not.toHaveBeenCalled();
    expect(roomParticipants.has('room-1')).toBe(false);
  });

  test('再認可中に切断されたSocketは対象ルームと参加者一覧へ追加しない', async () => {
    const { getConnection, roomParticipants } = buildIo();
    const socket = buildSocket();
    socket.userData = {
      room_id: 'room-1',
      floor_id: 'floor-1',
      user_id: 'user-1',
      user_role: 'editor',
      authenticated_user: true,
      lang: 'ja',
    };
    authorizeRoomAccess.mockImplementationOnce(async () => {
      socket.connected = false;
    });

    await getConnection()(socket);

    expect(socket.join.mock.calls).toEqual([['__access__:floor:floor-1'], ['__access__:room:room-1'], ['__access__:user:user-1'], ['__access__:floor-user:floor-1:user-1']]);
    expect(roomParticipants.has('room-1')).toBe(false);
  });


  test('ゲスト参加時に roomParticipants を更新し、人数/言語を通知する', async () => {
    const { getConnection, roomParticipants, emitMap } = buildIo();
    const socket = buildSocket();
    socket.userData = { room_id: 'room-1', user_id: 'user-1', lang: 'ja' };

    await getConnection()(socket);

    expect(socket.join).toHaveBeenCalledWith('room-1');
    const users = roomParticipants.get('room-1');
    expect(users.has('user-1')).toBe(true);
    expect(users.get('user-1').lang).toBe('ja');
    expect(emitMap.get('room-1')).toHaveBeenCalledWith('ROOM_STATUS_UPDATE', {
      roomSize: 1,
      languages: ['ja'],
    });
    expect(authorizeRoomAccess).not.toHaveBeenCalled();
  });

  test('クライアント起点のルームメンバー退出イベントを登録しない', async () => {
    const { getConnection } = buildIo();
    const socket = buildSocket();
    socket.userData = { room_id: 'room-1', user_id: 'user-1', lang: 'ja' };

    await getConnection()(socket);

    expect(socket.getHandler('SEND_COMPLETE_DELETE_ROOM_MEMBER')).toBeUndefined();
  });

  test('disconnect で参加者を減らし、空ならルームを削除する', async () => {
    const { getConnection, roomParticipants, emitMap } = buildIo();
    const socket = buildSocket();
    socket.id = 'sock-1';
    socket.userData = { room_id: 'room-1', user_id: 'user-1', lang: 'ja' };

    await getConnection()(socket);

    const disconnect = socket.getHandler('disconnect');
    disconnect();

    expect(roomParticipants.has('room-1')).toBe(false);
    expect(emitMap.get('room-1')).toHaveBeenCalledWith('ROOM_STATUS_UPDATE', {
      roomSize: 0,
      languages: [],
    });
  });

  test('disconnect で他ソケットが残る場合はユーザを保持する', async () => {
    const { getConnection, roomParticipants, emitMap } = buildIo();
    const socket = buildSocket();
    socket.id = 'sock-2';
    socket.userData = { room_id: 'room-1', user_id: 'user-1', lang: 'en' };

    roomParticipants.set('room-1', new Map([['user-1', { sockets: new Set(['sock-1']), lang: 'ja' }]]));

    await getConnection()(socket);

    const disconnect = socket.getHandler('disconnect');
    disconnect();

    const users = roomParticipants.get('room-1');
    expect(users.has('user-1')).toBe(true);
    expect(users.get('user-1').sockets.has('sock-1')).toBe(true);
    expect(users.get('user-1').sockets.has('sock-2')).toBe(false);
    expect(emitMap.get('room-1')).toHaveBeenCalledWith('ROOM_STATUS_UPDATE', {
      roomSize: 1,
      languages: ['ja'],
    });
  });

  test('同一ユーザの複数Socketは各言語設定を保持し、切断したSocketの言語設定だけを除く', async () => {
    const { getConnection, roomParticipants, emitMap } = buildIo();
    const japaneseSocket = buildSocket();
    japaneseSocket.id = 'sock-ja';
    japaneseSocket.userData = { room_id: 'room-1', user_id: 'user-1', lang: 'ja' };
    const hebrewSocket = buildSocket();
    hebrewSocket.id = 'sock-he';
    hebrewSocket.userData = { room_id: 'room-1', user_id: 'user-1', lang: 'he' };

    await getConnection()(japaneseSocket);
    await getConnection()(hebrewSocket);

    const user = roomParticipants.get('room-1').get('user-1');
    expect(user.sockets).toEqual(new Set(['sock-ja', 'sock-he']));
    expect(user.languages).toEqual(new Map([['sock-ja', 'ja'], ['sock-he', 'he']]));
    expect(emitMap.get('room-1')).toHaveBeenCalledWith('ROOM_STATUS_UPDATE', {
      roomSize: 1,
      languages: ['ja', 'he'],
    });

    hebrewSocket.getHandler('disconnect')();

    expect(user.languages).toEqual(new Map([['sock-ja', 'ja']]));
    expect(emitMap.get('room-1')).toHaveBeenCalledWith('ROOM_STATUS_UPDATE', {
      roomSize: 1,
      languages: ['ja'],
    });
  });
});
