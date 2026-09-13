const mongoose = require('mongoose');

const Chat = require('../../../models/Chat');
const {
  persistPostAnalysisSourceMutation,
  persistReplyAnalysisSourceMutation,
} = require('../../../services/timeline/shared/analysisSourceMutation');

const sourceFields = (source, overrides = {}) => ({
  content: source.content,
  lang: source.lang,
  room_tags: source.room_tags || [],
  image_name: source.image_name ?? null,
  video_name: source.video_name ?? null,
  audio_name: source.audio_name ?? null,
  ...overrides,
});

const createPost = (overrides = {}) =>
  Chat.create({
    floor: new mongoose.Types.ObjectId(),
    room: new mongoose.Types.ObjectId(),
    content: 'before',
    lang: 'ja',
    analysis_source_revision: 1,
    ...overrides,
  });

describe('AI解析元の更新競合制御', () => {
  test('同じ値への投稿の同時更新では解析元のリビジョンを1回だけ増やす', async () => {
    const post = await createPost();
    const initial = post.toObject();
    const desired = sourceFields(initial, { content: 'after' });

    await Promise.all([
      persistPostAnalysisSourceMutation({
        baseQuery: { _id: post._id, delete_flg: false },
        initialSource: initial,
        desiredSource: desired,
        setFields: { ...desired, updated_at: new Date() },
      }),
      persistPostAnalysisSourceMutation({
        baseQuery: { _id: post._id, delete_flg: false },
        initialSource: initial,
        desiredSource: desired,
        setFields: { ...desired, updated_at: new Date() },
      }),
    ]);

    const saved = await Chat.findById(post._id).lean();
    expect(saved.content).toBe('after');
    expect(saved.analysis_source_revision).toBe(2);
  });

  test('Mongoose Documentを初期値にした同一タグ並行更新でもソースリビジョンを1回だけ増加させる', async () => {
    const tagId = new mongoose.Types.ObjectId();
    const post = await createPost();
    const desired = sourceFields(post, { room_tags: [tagId] });

    await Promise.all([
      persistPostAnalysisSourceMutation({
        baseQuery: { _id: post._id, delete_flg: false },
        initialSource: post,
        desiredSource: desired,
        setFields: { room_tags: [tagId] },
      }),
      persistPostAnalysisSourceMutation({
        baseQuery: { _id: post._id, delete_flg: false },
        initialSource: post,
        desiredSource: desired,
        setFields: { room_tags: [tagId] },
      }),
    ]);

    const saved = await Chat.findById(post._id).lean();
    expect(saved.room_tags.map(String)).toEqual([tagId.toString()]);
    expect(saved.analysis_source_revision).toBe(2);
  });

  test('古い投稿データによる変更なしの要求で、同時更新した値を元へ戻さない', async () => {
    const post = await createPost();
    const initial = post.toObject();
    const changed = sourceFields(initial, { content: 'after' });
    const staleNoop = sourceFields(initial);

    await Promise.all([
      persistPostAnalysisSourceMutation({
        baseQuery: { _id: post._id, delete_flg: false },
        initialSource: initial,
        desiredSource: changed,
        setFields: { ...changed, updated_at: new Date() },
      }),
      persistPostAnalysisSourceMutation({
        baseQuery: { _id: post._id, delete_flg: false },
        initialSource: initial,
        desiredSource: staleNoop,
        setFields: { ...staleNoop, image_caption: 'display only', updated_at: new Date() },
      }),
    ]);

    const saved = await Chat.findById(post._id).lean();
    expect(saved.content).toBe('after');
    expect(saved.analysis_source_revision).toBe(2);
    expect(saved.image_caption).toBe('display only');
  });

  test('本文とタグの更新後に古い本文更新を再適用してもリビジョンを余分に増やさない', async () => {
    const tagId = new mongoose.Types.ObjectId();
    const post = await createPost();
    const initial = post.toObject();
    const contentOnly = sourceFields(initial, { content: 'after' });
    const contentAndTag = sourceFields(initial, { content: 'after', room_tags: [tagId] });

    await persistPostAnalysisSourceMutation({
      baseQuery: { _id: post._id, delete_flg: false },
      initialSource: initial,
      desiredSource: contentAndTag,
      setFields: { content: 'after', room_tags: [tagId] },
    });
    const staleResult = await persistPostAnalysisSourceMutation({
      baseQuery: { _id: post._id, delete_flg: false },
      initialSource: initial,
      desiredSource: contentOnly,
      setFields: { content: 'after' },
    });

    const saved = await Chat.findById(post._id).lean();
    expect(saved.content).toBe('after');
    expect(saved.room_tags.map(String)).toEqual([tagId.toString()]);
    expect(saved.analysis_source_revision).toBe(2);
    expect(staleResult.sourceChanged).toBe(false);
  });

  test('返信の同じ値への同時更新と古い変更なしの要求でも配下のデータを保持する', async () => {
    const post = await createPost({
      replies: [
        {
          content: 'reply before',
          lang: 'ja',
          analysis_source_revision: 1,
          reactions: [{ type: '拍手' }],
          supplementaries: [{ content: 'keep supplement', lang: 'ja' }],
        },
      ],
    });
    const initialReply = post.replies[0].toObject();
    const replyId = initialReply._id;
    const desired = sourceFields(initialReply, { content: 'reply after' });

    await Promise.all([
      persistReplyAnalysisSourceMutation({
        baseQuery: { _id: post._id, delete_flg: false },
        replyId,
        initialSource: initialReply,
        desiredSource: desired,
        setFields: { ...desired, updated_at: new Date() },
      }),
      persistReplyAnalysisSourceMutation({
        baseQuery: { _id: post._id, delete_flg: false },
        replyId,
        initialSource: initialReply,
        desiredSource: desired,
        setFields: { ...desired, updated_at: new Date() },
      }),
      persistReplyAnalysisSourceMutation({
        baseQuery: { _id: post._id, delete_flg: false },
        replyId,
        initialSource: initialReply,
        desiredSource: sourceFields(initialReply),
        setFields: {
          ...sourceFields(initialReply),
          image_caption: 'display only',
          updated_at: new Date(),
        },
      }),
    ]);

    const saved = await Chat.findById(post._id).lean();
    const reply = saved.replies.find((entry) => entry._id.toString() === replyId.toString());
    expect(reply.content).toBe('reply after');
    expect(reply.analysis_source_revision).toBe(2);
    expect(reply.image_caption).toBe('display only');
    expect(reply.reactions).toHaveLength(1);
    expect(reply.supplementaries).toHaveLength(1);
  });
});
