jest.mock('../../../services/timeline/timelineTranslation.service', () => ({
  translateMainContentIfNeeded: jest.fn(),
  translateGuestMainContentIfNeeded: jest.fn(),
  translateReplyIfNeeded: jest.fn(),
  translateGuestReplyIfNeeded: jest.fn(),
  translateSupplementIfNeeded: jest.fn(),
  translateReplySupplementIfNeeded: jest.fn(),
}));
jest.mock('../../../services/analysis.service', () => ({ runPostAnalyses: jest.fn(), runReplyAnalyses: jest.fn() }));
jest.mock('../../../services/translation.service', () => ({
  translateContent: jest.fn(), translateGuestContent: jest.fn(), getFailedTranslationLanguages: () => [],
}));
jest.mock('../../../integrations/onesignal/notification.client', () => ({ dispatchNotification: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }));

const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const RoomTag = require('../../../models/RoomTag');
const Chat = require('../../../models/Chat');
const logger = require('../../../utils/logger');
const { drainBackgroundTasks } = require('../../../services/backgroundTaskRunner');

const mutations = [
  ['postsCreate', 'create', 'post', 'create', 'POST_CREATE'],
  ['postsMutation', 'update', 'post', 'update', 'POST_UPDATE'],
  ['postsMutation', 'delete', 'post', 'delete', 'POST_DELETE'],
  ['postsTag', 'updateTag', 'post', 'tag', 'TAG_UPDATE'],
  ['repliesCreate', 'create', 'reply', 'create', 'REPLY_CREATE'],
  ['repliesMutation', 'update', 'reply', 'update', 'REPLY_UPDATE'],
  ['repliesMutation', 'delete', 'reply', 'delete', 'REPLY_DELETE'],
  ['repliesTag', 'updateTag', 'reply', 'tag', 'TAG_UPDATE'],
  ...['create', 'update', 'delete'].map((action) => ['postSupplements', action, 'supplement', action, `SUPPLEMENT_${action.toUpperCase()}`]),
  ...['create', 'update', 'delete'].map((action) => ['replySupplements', `${action}ReplySupplement`, 'replySupplement', action, `REPLY_SUPPLEMENT_${action.toUpperCase()}`]),
  ['guest/guestPosts', 'createPost', 'post', 'create', 'POST_CREATE'],
  ['guest/guestReplies', 'createReply', 'reply', 'create', 'REPLY_CREATE'],
];
for (const [module, method, target, event] of [
  ['postReactions', 'Reaction', 'post', 'REACTION_CREATE'],
  ['replyReactions', 'ReplyReaction', 'reply', 'REPLY_REACTION_CREATE'],
  ['postSupplementReactions', 'SupplementReaction', 'supplement', 'SUPPLEMENT_REACTION_CREATE'],
  ['replySupplementReactions', 'ReplySupplementReaction', 'replySupplement', 'REPLY_SUPPLEMENT_REACTION_CREATE'],
]) {
  for (const guest of [false, true]) {
    const name = guest ? `guest/guest${module[0].toUpperCase()}${module.slice(1)}` : module;
    for (const action of ['create', 'delete']) {
      const exportName = !guest && module.startsWith('reply') ? action : `${action}${method}`;
      mutations.push([name, exportName, target, `${action}Reaction`, action === 'create' ? event : 'REACTION_DELETE']);
    }
  }
}

const targetOf = (chat, target) => ({
  post: chat,
  reply: chat.replies[0],
  supplement: chat.supplementaries[0],
  replySupplement: chat.replies[0]?.supplementaries[0],
})[target];

describe.each(['配信先取得', '通知実行'])('Timeline保存後の%s失敗', (stage) => {
  afterEach(async () => { await drainBackgroundTasks(); });

  test.each(mutations)('%s.%sは保存した%sの%sを失敗に変えない', async (module, method, target, action, event) => {
    const user = await User.create({ username: '保存検証', mail: 'post-save@example.com', role: 'Administrator', lang: 'ja' });
    const floor = await Floor.create({ title: '保存検証フロア', user: user._id });
    const room = await Room.create({ title: '保存検証ルーム', floor: floor._id, user: user._id, member_only: false });
    const tag = await RoomTag.create({ name: '検証タグ', order: 1, floor: floor._id, room: room._id, user: user._id });
    const guest = module.startsWith('guest/');
    const author = guest ? { guest_id: 'guest-1', guest_name: '検証ゲスト' } : { user: user._id };
    const reaction = { ...author, type: 'いいね' };
    const supplement = { ...author, content: 'before', lang: 'ja', reactions: [reaction] };
    const chat = await Chat.create({
      ...author, floor: floor._id, room: room._id, content: 'before', lang: 'ja',
      reactions: [reaction], supplementaries: [supplement],
      replies: [{ ...supplement, supplementaries: [supplement] }],
    });
    const item = targetOf(chat, target);
    const body = {
      _id: String(item._id), post_id: String(chat._id), room_id: String(room._id), floor_id: String(floor._id),
      reply_id: String(chat.replies[0]._id), supplement_id: String(item._id), reaction_id: String(item.reactions[0]._id),
      content: 'after', lang: 'ja', room_tags: action === 'tag' ? [String(tag._id)] : [],
      animation: null, target_langs: [], type: '拍手', guest_id: 'guest-1', guest_name: '検証ゲスト',
    };
    const emit = jest.fn(() => { throw new Error('socket failed'); });
    const io = { to: jest.fn(() => {
      if (stage === '配信先取得') throw new Error('scope failed');
      return { emit };
    }) };
    const service = require(`../../../services/timeline/${module}.service`);
    const result = await (guest ? service[method](body, io) : service[method](body, { user_id: String(user._id), user_role: user.role }, io));
    const saved = await Chat.findById(result._id).lean();
    expect(logger.warn).toHaveBeenCalledWith('[SOCKET] publication failed', { event });
    expect(io.to).toHaveBeenCalledTimes(1);
    expect(String(io.to.mock.calls[0][0])).toBe(String(room._id));
    if (stage === '通知実行') expect(emit.mock.calls[0][0]).toBe(event);
    if (action === 'create') {
      if (target === 'post') {
        expect(await Chat.countDocuments()).toBe(2);
        expect(saved.content).toBe('after');
      } else {
        const items = target === 'reply' ? saved.replies : target === 'supplement' ? saved.supplementaries : saved.replies[0].supplementaries;
        expect(items).toHaveLength(2);
        expect(items[1].content).toBe('after');
      }
    } else {
      const changed = targetOf(saved, target);
      if (action === 'update') expect(changed.content).toBe('after');
      if (action === 'delete') expect(changed.delete_flg).toBe(true);
      if (action === 'tag') expect(changed.room_tags.map(String)).toEqual([String(tag._id)]);
      if (action === 'createReaction') expect(changed.reactions.map((r) => r.type)).toEqual(['いいね', '拍手']);
      if (action === 'deleteReaction') expect(changed.reactions).toHaveLength(0);
    }
  });
});

describe.each(['正常', '配信先例外', '通知例外'])('翻訳保存後の%s', (stage) => {
  test.each([
    ['translateMainContentIfNeeded', 'post', 'POST_UPDATE'],
    ['translateGuestMainContentIfNeeded', 'post', 'POST_UPDATE'],
    ['translateReplyIfNeeded', 'reply', 'REPLY_UPDATE'],
    ['translateGuestReplyIfNeeded', 'reply', 'REPLY_UPDATE'],
    ['translateSupplementIfNeeded', 'supplement', 'SUPPLEMENT_UPDATE'],
    ['translateReplySupplementIfNeeded', 'replySupplement', 'REPLY_SUPPLEMENT_UPDATE'],
  ])('%sは%sの翻訳をDBへ保存する', async (method, target, event) => {
    const user = await User.create({ username: '翻訳検証', mail: 'translate-save@example.com', lang: 'ja' });
    const floor = await Floor.create({ title: '翻訳検証', user: user._id });
    const room = await Room.create({ title: '翻訳検証', floor: floor._id, user: user._id });
    const source = { user: user._id, content: 'original', lang: 'ja' };
    const chat = await Chat.create({
      ...source, floor: floor._id, room: room._id,
      replies: [{ ...source, supplementaries: [source] }], supplementaries: [source],
    });
    const translations = [{ user: user._id, lang: 'en', content: 'translated' }];
    const provider = require('../../../services/translation.service');
    provider.translateContent.mockResolvedValue(translations);
    provider.translateGuestContent.mockResolvedValue(translations);
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })) };
    if (stage === '配信先例外') io.to.mockImplementation(() => { throw new Error('scope failed'); });
    if (stage === '通知例外') emit.mockRejectedValue(new Error('emit failed'));
    const service = jest.requireActual('../../../services/timeline/timelineTranslation.service');
    await expect(service[method]({
      ...source, userId: user._id, guestId: 'guest-1', chatId: chat._id,
      replyId: chat.replies[0]._id, reply: chat.replies[0],
      supplementId: targetOf(chat, target)._id, targetLangs: ['en'], io,
    })).resolves.toBeUndefined();
    const saved = await Chat.findById(chat._id).lean();
    expect(targetOf(saved, target).translations).toEqual([expect.objectContaining({ lang: 'en', content: 'translated' })]);
    expect(String(io.to.mock.calls[0][0])).toBe(String(room._id));
    if (stage === '正常') {
      const published = emit.mock.calls[0][1];
      expect(emit.mock.calls[0][0]).toBe(event);
      expect(published.user.username).toBe(user.username);
      expect(published).not.toHaveProperty('analysis_source_revision');
      expect(targetOf(published, target).translations[0].content).toBe('translated');
    } else {
      expect(logger.warn).toHaveBeenCalledWith('[SOCKET] publication failed', { event });
    }
  });
});
