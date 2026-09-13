jest.mock('../../../services/room/roomAccess.service', () => ({ filterAuthorizedRoomUserIds: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ error: jest.fn(), warn: jest.fn() }));
const { filterAuthorizedRoomUserIds } = require('../../../services/room/roomAccess.service');
const { revalidateRestrictedRoom, revokeRoom, revokeFloor, revokeUserSessions } = require('../../../socket/configurationRevocation');

const socket = (userId) => ({
  data: { accessContext: { authenticated_user: Boolean(userId), user_id: userId } },
  emit: jest.fn(), disconnect: jest.fn(),
});
const context = (sockets = []) => {
  const scope = { fetchSockets: jest.fn().mockResolvedValue(sockets), emit: jest.fn(), disconnectSockets: jest.fn() };
  return { io: { in: jest.fn(() => scope) }, scope };
};

test('限定化はゲストと失権ユーザだけ切断し、認可されたユーザを維持する', async () => {
  const guest = socket(); const denied = socket('denied'); const allowed = socket('allowed');
  const { io, scope } = context([guest, denied, allowed]);
  filterAuthorizedRoomUserIds.mockResolvedValue(['allowed']);
  await revalidateRestrictedRoom(io, 'room-a');
  expect(io.in).toHaveBeenCalledWith('__access__:room:room-a');
  expect(filterAuthorizedRoomUserIds).toHaveBeenCalledWith(['denied', 'allowed'], 'room-a');
  for (const target of [guest, denied]) {
    expect(target.emit).toHaveBeenCalledWith('ACCESS_REVOKED', { scope: 'room', reason: 'room_restricted' });
    expect(target.disconnect).toHaveBeenCalledWith(true);
  }
  expect(allowed.disconnect).not.toHaveBeenCalled();
  expect(scope.disconnectSockets).not.toHaveBeenCalled();
});

test.each(['fetch', 'authorization'])('%s失敗は対象ルーム全体を切断する', async (failure) => {
  const { io, scope } = context([socket('user')]);
  if (failure === 'fetch') scope.fetchSockets.mockRejectedValue(new Error('failure'));
  else filterAuthorizedRoomUserIds.mockRejectedValue(new Error('failure'));
  await revalidateRestrictedRoom(io, 'room-a');
  expect(scope.disconnectSockets).toHaveBeenCalledWith(true);
});

test.each([
  [revokeRoom, '__access__:room:a', 'ACCESS_REVOKED', { scope: 'room', reason: 'room_deleted' }],
  [revokeFloor, '__access__:floor:a', 'ACCESS_REVOKED', { scope: 'floor', reason: 'floor_deleted' }],
  [revokeUserSessions, '__access__:user:a', 'SESSION_REVOKED', undefined],
])('対象の範囲だけを失効させ、通知が失敗しても切断する', async (revoke, name, event, payload) => {
  const { io, scope } = context();
  scope.emit.mockImplementation(() => { throw new Error('failure'); });
  await revoke(io, 'a');
  expect(io.in).toHaveBeenCalledWith(name);
  expect(io.in).toHaveBeenCalledTimes(1);
  expect(scope.emit.mock.calls[0]).toEqual(payload === undefined ? [event] : [event, payload]);
  expect(scope.disconnectSockets).toHaveBeenCalledWith(true);
  scope.disconnectSockets.mockRejectedValue(new Error('failure'));
  await expect(revoke(io, 'a')).resolves.toBeUndefined();
});
