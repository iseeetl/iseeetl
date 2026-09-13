const RoomTag = require('../../../models/RoomTag');
const Chat = require('../../../models/Chat');
const SoundTag = require('../../../models/SoundTag');
const PushFilter = require('../../../models/PushFilter');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');
const roomTagService = require('../../../services/room/roomTag.service');
const { createUser, createFloor, createRoom } = require('../_helpers/models');

const FloorTag = require('../../../models/FloorTag');

describe('ルームタグの論理削除・復元と使用中の参照の保持', () => {
  let user, floor, room, tag, actor, scope;
  beforeEach(async () => {
    user = await createUser({ role: 'Administrator' });
    floor = await createFloor(user);
    room = await createRoom(user, floor);
    scope = { floor: floor._id, room: room._id, user: user._id };
    tag = await RoomTag.create({ ...scope, order: 1, name: 'Used tag', lang: 'ja' });
    actor = { user_id: user._id.toString(), user_role: user.role };
  });
  afterEach(() => jest.restoreAllMocks());

  const references = [
    ['投稿', (scope, tag) => Chat.create({ ...scope, content: 'Post', room_tags: [tag._id] })],
    ['削除済み投稿', (scope, tag) => Chat.create({ ...scope, content: 'Post', room_tags: [tag._id], delete_flg: true })],
    ['削除済み返信', (scope, tag) => Chat.create({ ...scope, content: 'Post', replies: [{ user: scope.user, content: 'Reply', room_tags: [tag._id], delete_flg: true }] })],
    ['音通知', (scope, tag) => SoundTag.create({ ...scope, tags: [tag._id] })],
    ['プッシュ通知の文字列ID', (scope, tag) => PushFilter.create({ ...scope, conditions: { tags: [tag._id.toString()] } })],
    ['プッシュ通知のObjectId', (scope, tag) => PushFilter.create({ ...scope, conditions: { tags: [tag._id] } })],
  ];

  test.each(references)('%sで使用中でも論理削除・復元でき、参照元を変更しない', async (_label, createReference) => {
    const reference = await createReference(scope, tag);
    const before = await reference.constructor.findById(reference._id).lean();
    for (const remove of [
      () => roomTagService.delete({ _id: tag._id.toString() }, actor),
      () => roomTagService.managementSetDeleteState({ _id: tag._id.toString(), delete_flg: true }, actor),
    ]) {
      await remove();
      expect((await RoomTag.findById(tag._id)).delete_flg).toBe(true);
      await roomTagService.managementSetDeleteState({ _id: tag._id.toString(), delete_flg: false }, actor);
      const restored = await RoomTag.findById(tag._id);
      expect(restored.delete_flg).toBe(false);
      expect(restored.deleted_at).toBeNull();
      expect(await reference.constructor.findById(reference._id).lean()).toEqual(before);
    }
  });

  test('ルームAI解析設定で使用中なら通常・管理用削除を拒否する', async () => {
    await RoomAIAnalysisSetting.create({ ...scope, room_tag: tag._id, analysis_kind: 'vision', result_user: user._id, updated_by: user._id });
    for (const remove of [
      () => roomTagService.delete({ _id: tag._id.toString() }, actor),
      () => roomTagService.managementSetDeleteState({ _id: tag._id.toString(), delete_flg: true }, actor),
    ]) {
      await expect(remove()).rejects.toMatchObject({
        code: 'CONFLICT', status: 409,
        details: { reason: 'ACTIVE_AI_ANALYSIS_REFERENCE', resource_type: 'room-tag' },
      });
      expect((await RoomTag.findById(tag._id)).delete_flg).toBe(false);
    }
  });

  test.each(['import', 'init'])('%sは投稿で使用中のタグを論理削除し、同名タグを元のIDで復元する', async (method) => {
    const post = await Chat.create({ ...scope, content: 'Post', room_tags: [tag._id] });
    const before = await Chat.findById(post._id).lean();
    await roomTagService[method]({ room_id: room._id.toString(), csv: [] }, actor);
    expect((await RoomTag.findById(tag._id)).delete_flg).toBe(true);
    if (method === 'init') await FloorTag.create({ floor: floor._id, user: user._id, order: 1, name: tag.name, lang: 'ja' });
    await roomTagService[method]({ room_id: room._id.toString(), csv: [[1, tag.name]] }, actor);
    const restored = await RoomTag.findById(tag._id);
    expect(restored.delete_flg).toBe(false);
    expect(restored.deleted_at).toBeNull();
    expect(await RoomTag.countDocuments({ room: room._id, name: tag.name })).toBe(1);
    expect(await Chat.findById(post._id).lean()).toEqual(before);
  });
});
