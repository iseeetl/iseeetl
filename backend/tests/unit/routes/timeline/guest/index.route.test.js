const guestIndexPath = require.resolve('../../../../../routes/timeline/guest/index');
const guestPostsRoutePath = require.resolve('../../../../../routes/timeline/guest/guestPosts.route');
const guestPostReactionsRoutePath = require.resolve('../../../../../routes/timeline/guest/guestPostReactions.route');
const guestPostSupplementReactionsRoutePath = require.resolve(
  '../../../../../routes/timeline/guest/guestPostSupplementReactions.route'
);
const guestRepliesRoutePath = require.resolve('../../../../../routes/timeline/guest/guestReplies.route');
const guestReplyReactionsRoutePath = require.resolve('../../../../../routes/timeline/guest/guestReplyReactions.route');
const guestReplySupplementReactionsRoutePath = require.resolve(
  '../../../../../routes/timeline/guest/guestReplySupplementReactions.route'
);

describe('indexの検証', () => {
  test('ゲスト用タイムラインのルートを所定の順序で登録し、共通のSocket.IO引数を渡さない', () => {
    jest.resetModules();

    const useMock = jest.fn();
    const router = { use: useMock };

    jest.doMock('express', () => ({
      Router: () => router,
    }));

    const guestPostsFactory = jest.fn(() => 'guestPostsRoute');
    const guestPostReactionsFactory = jest.fn(() => 'guestPostReactionsRoute');
    const guestPostSupplementReactionsFactory = jest.fn(() => 'guestPostSupplementReactionsRoute');
    const guestRepliesFactory = jest.fn(() => 'guestRepliesRoute');
    const guestReplyReactionsFactory = jest.fn(() => 'guestReplyReactionsRoute');
    const guestReplySupplementReactionsFactory = jest.fn(() => 'guestReplySupplementReactionsRoute');

    jest.doMock(guestPostsRoutePath, () => guestPostsFactory);
    jest.doMock(guestPostReactionsRoutePath, () => guestPostReactionsFactory);
    jest.doMock(guestPostSupplementReactionsRoutePath, () => guestPostSupplementReactionsFactory);
    jest.doMock(guestRepliesRoutePath, () => guestRepliesFactory);
    jest.doMock(guestReplyReactionsRoutePath, () => guestReplyReactionsFactory);
    jest.doMock(guestReplySupplementReactionsRoutePath, () => guestReplySupplementReactionsFactory);

    const factory = require(guestIndexPath);
    const built = factory();

    expect(built).toBe(router);

    expect(guestPostsFactory).toHaveBeenCalledWith();
    expect(guestPostReactionsFactory).toHaveBeenCalledWith();
    expect(guestPostSupplementReactionsFactory).toHaveBeenCalledWith();
    expect(guestRepliesFactory).toHaveBeenCalledWith();
    expect(guestReplyReactionsFactory).toHaveBeenCalledWith();
    expect(guestReplySupplementReactionsFactory).toHaveBeenCalledWith();

    expect(useMock.mock.calls).toEqual([
      ['/', 'guestPostsRoute'],
      ['/', 'guestPostReactionsRoute'],
      ['/', 'guestPostSupplementReactionsRoute'],
      ['/', 'guestRepliesRoute'],
      ['/', 'guestReplyReactionsRoute'],
      ['/', 'guestReplySupplementReactionsRoute'],
    ]);
  });
});
