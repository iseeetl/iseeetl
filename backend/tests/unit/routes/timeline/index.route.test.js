const timelineIndexPath = require.resolve('../../../../routes/timeline/index');
const roleRoutePath = require.resolve('../../../../routes/timeline/role.route');
const postReactionsRoutePath = require.resolve('../../../../routes/timeline/postReactions.route');
const postSupplementReactionsRoutePath = require.resolve('../../../../routes/timeline/postSupplementReactions.route');
const replyReactionsRoutePath = require.resolve('../../../../routes/timeline/replyReactions.route');
const replySupplementReactionsRoutePath = require.resolve('../../../../routes/timeline/replySupplementReactions.route');
const transcriptionRoutePath = require.resolve('../../../../routes/timeline/transcription.route');
const pushFilterRoutePath = require.resolve('../../../../routes/timeline/pushFilter.route');
const managementRoutePath = require.resolve('../../../../routes/timeline/management.route');

describe('indexの検証', () => {
  test('タイムラインのルートを所定の順序で登録し、共通のSocket.IO引数を渡さない', () => {
    jest.resetModules();

    const useMock = jest.fn();
    const router = { use: useMock };

    jest.doMock('express', () => ({
      Router: () => router,
    }));

    const roleRouteFactory = jest.fn(() => 'roleRoute');
    const postReactionsRouteFactory = jest.fn(() => 'postReactionsRoute');
    const postSupplementReactionsRouteFactory = jest.fn(() => 'postSupplementReactionsRoute');
    const replyReactionsRouteFactory = jest.fn(() => 'replyReactionsRoute');
    const replySupplementReactionsRouteFactory = jest.fn(() => 'replySupplementReactionsRoute');
    const pushFilterRouteFactory = jest.fn(() => 'pushFilterRoute');
    const managementRouteFactory = jest.fn(() => 'managementRoute');

    jest.doMock(roleRoutePath, () => roleRouteFactory);
    jest.doMock(postReactionsRoutePath, () => postReactionsRouteFactory);
    jest.doMock(postSupplementReactionsRoutePath, () => postSupplementReactionsRouteFactory);
    jest.doMock(replyReactionsRoutePath, () => replyReactionsRouteFactory);
    jest.doMock(replySupplementReactionsRoutePath, () => replySupplementReactionsRouteFactory);
    jest.doMock(transcriptionRoutePath, () => 'transcriptionRoute');
    jest.doMock(pushFilterRoutePath, () => pushFilterRouteFactory);
    jest.doMock(managementRoutePath, () => managementRouteFactory);

    const factory = require(timelineIndexPath);
    const built = factory();

    expect(built).toBe(router);

    expect(roleRouteFactory).toHaveBeenCalledWith();
    expect(postReactionsRouteFactory).toHaveBeenCalledWith();
    expect(postSupplementReactionsRouteFactory).toHaveBeenCalledWith();
    expect(replyReactionsRouteFactory).toHaveBeenCalledWith();
    expect(replySupplementReactionsRouteFactory).toHaveBeenCalledWith();
    expect(pushFilterRouteFactory).toHaveBeenCalledWith();
    expect(managementRouteFactory).toHaveBeenCalledWith();

    expect(useMock.mock.calls).toEqual([
      ['/', 'roleRoute'],
      ['/', 'postReactionsRoute'],
      ['/', 'postSupplementReactionsRoute'],
      ['/', 'replyReactionsRoute'],
      ['/', 'replySupplementReactionsRoute'],
      ['/', 'transcriptionRoute'],
      ['/', 'pushFilterRoute'],
      ['/management', 'managementRoute'],
    ]);
  });
});
