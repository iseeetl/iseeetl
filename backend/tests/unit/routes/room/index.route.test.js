const roomIndexPath = require.resolve('../../../../routes/room/index');
const roomRoutePath = require.resolve('../../../../routes/room/room.route');
const roomMemberRoutePath = require.resolve('../../../../routes/room/roomMember.route');
const roomTagRoutePath = require.resolve('../../../../routes/room/roomTag.route');
const roomQuickTextRoutePath = require.resolve('../../../../routes/room/roomQuickText.route');

describe('indexの検証', () => {
  test('ルームのルートを所定の順序で登録する', () => {
    jest.resetModules();

    const useMock = jest.fn();
    const router = { use: useMock };

    jest.doMock('express', () => ({
      Router: () => router,
    }));

    const buildRoomMemberRoute = jest.fn(() => 'roomMemberRoute');
    jest.doMock(roomRoutePath, () => 'roomRoute');
    jest.doMock(roomMemberRoutePath, () => buildRoomMemberRoute);
    jest.doMock(roomTagRoutePath, () => 'roomTagRoute');
    jest.doMock(roomQuickTextRoutePath, () => 'roomQuickTextRoute');

    const io = { to: jest.fn() };
    const buildRoomRouter = require(roomIndexPath);
    const built = buildRoomRouter(io);

    expect(built).toBe(router);
    expect(buildRoomMemberRoute).toHaveBeenCalledWith(io);
    expect(useMock.mock.calls).toEqual([
      ['/room', 'roomRoute'],
      ['/roommember', 'roomMemberRoute'],
      ['/roomtag', 'roomTagRoute'],
      ['/', 'roomQuickTextRoute'],
    ]);
  });
});
