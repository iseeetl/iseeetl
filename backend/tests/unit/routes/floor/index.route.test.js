const floorIndexPath = require.resolve('../../../../routes/floor/index');
const floorRoutePath = require.resolve('../../../../routes/floor/floor.route');
const floorMemberRoutePath = require.resolve('../../../../routes/floor/floorMember.route');
const floorTagRoutePath = require.resolve('../../../../routes/floor/floorTag.route');
const floorQuickTextRoutePath = require.resolve('../../../../routes/floor/floorQuickText.route');

describe('indexの検証', () => {
  test('フロアのルートを所定の順序で登録する', () => {
    jest.resetModules();

    const useMock = jest.fn();
    const router = { use: useMock };

    jest.doMock('express', () => ({
      Router: () => router,
    }));

    const buildFloorMemberRoute = jest.fn(() => 'floorMemberRoute');
    jest.doMock(floorRoutePath, () => 'floorRoute');
    jest.doMock(floorMemberRoutePath, () => buildFloorMemberRoute);
    jest.doMock(floorTagRoutePath, () => 'floorTagRoute');
    jest.doMock(floorQuickTextRoutePath, () => 'floorQuickTextRoute');

    const io = {};
    const buildFloorRouter = require(floorIndexPath);
    const built = buildFloorRouter(io);

    expect(built).toBe(router);
    expect(useMock.mock.calls).toEqual([
      ['/floor', 'floorRoute'],
      ['/floormember', 'floorMemberRoute'],
      ['/floortag', 'floorTagRoute'],
      ['/', 'floorQuickTextRoute'],
    ]);
    expect(buildFloorMemberRoute).toHaveBeenCalledWith(io);
  });
});
