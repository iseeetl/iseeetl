const ROUTER_FACTORIES = [
  ['kickedUser', '../../../routes/kickedUser.route', 4, true],
  ['timeline index', '../../../routes/timeline', 8],
  ['timeline management', '../../../routes/timeline/management.route', 5],
  ['timeline post reactions', '../../../routes/timeline/postReactions.route', 2],
  ['timeline post supplement reactions', '../../../routes/timeline/postSupplementReactions.route', 2],
  ['timeline push filter', '../../../routes/timeline/pushFilter.route', 3],
  ['timeline reply reactions', '../../../routes/timeline/replyReactions.route', 2],
  ['timeline reply supplement reactions', '../../../routes/timeline/replySupplementReactions.route', 2],
  ['timeline role', '../../../routes/timeline/role.route', 1],
  ['guest timeline index', '../../../routes/timeline/guest', 6],
  ['guest post reactions', '../../../routes/timeline/guest/guestPostReactions.route', 2],
  ['guest post supplement reactions', '../../../routes/timeline/guest/guestPostSupplementReactions.route', 2],
  ['guest posts', '../../../routes/timeline/guest/guestPosts.route', 3],
  ['guest replies', '../../../routes/timeline/guest/guestReplies.route', 1],
  ['guest reply reactions', '../../../routes/timeline/guest/guestReplyReactions.route', 2],
  ['guest reply supplement reactions', '../../../routes/timeline/guest/guestReplySupplementReactions.route', 2],
];

describe.each(ROUTER_FACTORIES)('%sのルータ生成', (_name, modulePath, expectedStackLength, requiresIo) => {
  test('呼出しごとに独立したルータを生成する', () => {
    const factory = require(modulePath);
    const buildRouter = (io) => (requiresIo ? factory(io, new Map()) : factory());

    const first = buildRouter({ name: 'io-a' });
    const firstStack = first.stack.slice();
    const second = buildRouter({ name: 'io-b' });

    expect(second).not.toBe(first);
    expect(first.stack).toEqual(firstStack);
    expect(first.stack).toHaveLength(expectedStackLength);
    expect(second.stack).toHaveLength(expectedStackLength);
  });
});
