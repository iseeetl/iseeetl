const { Types } = require('mongoose');
const { capture } = require('../../../../services/activity/capture');
const { actorKey } = require('../../../../services/activity/contract');
const objectId = () => new Types.ObjectId();
let post;
beforeEach(() => { post = { _id: objectId(), room: objectId(), floor: objectId(), user: objectId(), image_name: 'a.jpg', image_caption: 'old', replies: [{ _id: objectId(), user: objectId(), delete_flg: false, supplementaries: [{ _id: objectId(), user: objectId(), content: 'before', delete_flg: false }] }] }; });
test('new flat reply keeps the root owner and emits in the same update', () => {
  const update = { $push: { replies: { user: objectId() } } };
  const result = capture(post, { _id: post._id }, update);
  expect(result.events).toHaveLength(1); expect(result.events[0].owner_key).toBe(actorKey(post));
  expect(result.update.$push.replies._id).toEqual(result.events[0].reply_id);
  expect(result.update.$push.replies).not.toHaveProperty('direct_target');
  expect(result.update.$push.activity_outbox.$each).toEqual(result.events);
});
test('nested filtered supplement edit is guarded and records only one event', () => {
  const result = capture(post, { _id: post._id }, { $set: { 'replies.$[reply].supplementaries.$[supp].content': 'after', 'replies.$[reply].supplementaries.$[supp].title': 'new' } },
    { arrayFilters: [{ 'reply._id': post.replies[0]._id }, { 'supp._id': post.replies[0].supplementaries[0]._id, 'supp.delete_flg': false }] }, 'user:editor');
  expect(result.events).toHaveLength(1); expect(result.events[0].supplement_id).toEqual(post.replies[0].supplementaries[0]._id);
  expect(result.guards['replies.0.supplementaries.0.content']).toBe('before');
});
test.each([{ $set: { translations: [{ content: 'translated' }] } }, { $pull: { reactions: { _id: objectId() } } }, { $set: { image_caption: 'old' } }])('translations, removal and unchanged writes do not generate events', update => {
  expect(capture(post, { _id: post._id }, update, {}, 'user:editor').events).toEqual([]);
});
test('stale array filters cannot enqueue an update that did not happen', () => {
  const result = capture(post, { _id: post._id }, { $set: { 'replies.$[reply].supplementaries.$[supp].content': 'wrong' } },
    { arrayFilters: [{ 'reply._id': post.replies[0]._id }, { 'supp._id': objectId() }] }, 'user:editor');
  expect(result.events).toEqual([]);
});
test('a guest reaction is attributed to its signed actor, not the parent owner', () => {
  const result = capture(post, { _id: post._id }, { $push: { alternative_reactions: { guest_id: 'signed-guest', media_kind: 'image', type: 'いいね' } } });
  expect(result.events[0]).toMatchObject({ type: 'reaction', media: 'image', actor_key: 'guest:signed-guest', owner_key: actorKey(post) });
});
