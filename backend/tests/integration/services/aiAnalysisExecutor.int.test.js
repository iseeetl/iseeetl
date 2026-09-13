const mongoose = require('mongoose');

const ROLES = require('../../../constants/roles');
const Chat = require('../../../models/Chat');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');
const RoomTag = require('../../../models/RoomTag');
const User = require('../../../models/User');
const { createAnalysisExecutor } = require('../../../services/analysis/executor.service');
const { persistPostAnalysisSourceMutation } = require('../../../services/timeline/shared/analysisSourceMutation');
const { createFloor, createRoom, createUser } = require('../_helpers/models');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const createIo = () => {
  const emit = jest.fn();
  return { emit, io: { to: jest.fn(() => ({ emit })) } };
};

const prepareInput = (_options, callback) => callback({ mocked: true });

const setup = async ({ kinds = ['conversation'], withReply = false } = {}) => {
  const owner = await createUser({ role: ROLES.ADMINISTRATOR });
  const resultUser = await createUser({ role: ROLES.AUTHOR });
  const floor = await createFloor(owner, { target_langs: [] });
  const room = await createRoom(owner, floor);
  const tag = await RoomTag.create({
    user: owner._id,
    floor: floor._id,
    room: room._id,
    order: 1,
    name: 'Custom analysis',
    lang: 'en',
    translations: [{ user: owner._id, lang: 'ja', name: '独自解析' }],
  });
  const settings = await RoomAIAnalysisSetting.create(
    kinds.map((kind) => ({
      floor: floor._id,
      room: room._id,
      room_tag: tag._id,
      analysis_kind: kind,
      additional_prompt: `${kind} prompt`,
      result_user: resultUser._id,
      revision: 1,
      user: owner._id,
      updated_by: owner._id,
    }))
  );
  const commonSource = {
    content: 'source text',
    lang: 'en',
    room_tags: [tag._id],
    image_name: 'image.jpg',
    video_name: 'video.mp4',
    audio_name: 'audio.mp3',
    analysis_source_revision: 1,
  };
  const replyId = new mongoose.Types.ObjectId();
  const post = await Chat.create({
    floor: floor._id,
    room: room._id,
    user: owner._id,
    ...commonSource,
    replies: withReply
      ? [{ _id: replyId, user: owner._id, ...commonSource }]
      : [],
  });
  return { floor, owner, post, replyId, resultUser, room, settings, tag };
};

const sourceSupplements = async ({ postId, replyId = null }) => {
  const post = await Chat.findById(postId).lean();
  if (!replyId) return post.supplementaries;
  return post.replies.find((reply) => reply._id.toString() === replyId.toString()).supplementaries;
};

describe('設定に基づくAI解析の結合動作（外部サービスはモック）', () => {
  test.each(['正常', '配信先例外', '通知例外'])('%sでも5種類の解析を順番に保存し、保存済みの結果を成功として返す', async (stage) => {
    const kinds = ['vision', 'audioScene', 'speech', 'video', 'conversation'];
    const context = await setup({ kinds });
    const order = [];
    let active = 0;
    let maxActive = 0;
    const analyze = jest.fn(async ({ kind }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(kind);
      await Promise.resolve();
      active -= 1;
      return `${kind} result`;
    });
    const { emit, io } = createIo();
    if (stage === '配信先例外') io.to.mockImplementation(() => { throw new Error('scope failed'); });
    if (stage === '通知例外') emit.mockRejectedValue(new Error('emit failed'));
    const executor = createAnalysisExecutor({
      executionEnabled: () => true,
      prepareInput,
      analyze,
    });

    const results = await executor.runSourceAnalyses({
      chatId: context.post._id,
      sourceType: 'post',
      io,
      mediaPath: '/mocked',
    });

    expect(results.map((result) => result.status)).toEqual(Array(5).fill('created'));
    expect(maxActive).toBe(1);
    expect(order).toEqual([...order].sort());
    const supplements = await sourceSupplements({ postId: context.post._id });
    expect(supplements).toHaveLength(5);
    expect(new Set(supplements.map((item) => item.meta.analysis_kind))).toEqual(new Set(kinds));
    expect(supplements.every((item) => item.user.toString() === context.resultUser._id.toString())).toBe(true);
    expect(io.to).toHaveBeenCalledTimes(5);
    expect(emit).toHaveBeenCalledTimes(stage === '配信先例外' ? 0 : 5);
  });

  test('返信にも同じ設定取得を適用し、解析結果の管理情報を保存する', async () => {
    const context = await setup({ withReply: true });
    const { emit, io } = createIo();
    const executor = createAnalysisExecutor({
      executionEnabled: () => true,
      prepareInput,
      analyze: async () => 'reply result',
    });

    await executor.runSourceAnalyses({
      chatId: context.post._id,
      sourceType: 'reply',
      replyId: context.replyId,
      io,
      mediaPath: '/mocked',
    });

    const supplements = await sourceSupplements({
      postId: context.post._id,
      replyId: context.replyId,
    });
    expect(supplements).toHaveLength(1);
    expect(supplements[0].meta.analysis_source_revision).toBe(1);
    expect(emit).toHaveBeenCalledWith('REPLY_SUPPLEMENT_CREATE', expect.any(Object), expect.any(Object));
  });

  test('送信後に解析元が削除・更新されても送信時のデータを保持して保存する', async () => {
    const context = await setup();
    const executor = createAnalysisExecutor({
      executionEnabled: () => true,
      prepareInput,
      analyze: async () => {
        await Promise.all([
          Chat.updateOne(
            { _id: context.post._id },
            { $set: { content: 'changed after send', delete_flg: true }, $inc: { analysis_source_revision: 1 } }
          ),
          RoomAIAnalysisSetting.updateOne({ _id: context.settings[0]._id }, { $set: { delete_flg: true } }),
          RoomTag.updateOne({ _id: context.tag._id }, { $set: { delete_flg: true, name: 'Changed' } }),
          User.updateOne({ _id: context.resultUser._id }, { $set: { delete_flg: true } }),
          Room.updateOne({ _id: context.room._id }, { $set: { delete_flg: true } }),
          Floor.updateOne({ _id: context.floor._id }, { $set: { delete_flg: true } }),
        ]);
        return 'snapshot result';
      },
    });

    const result = await executor.executeSetting({
      chatId: context.post._id,
      sourceType: 'post',
      settingId: context.settings[0]._id,
      mediaPath: '/mocked',
    });

    expect(result.status).toBe('created');
    const supplements = await sourceSupplements({ postId: context.post._id });
    expect(supplements).toHaveLength(1);
    expect(supplements[0]).toEqual(expect.objectContaining({
      user: context.resultUser._id,
      content: '#Custom analysis snapshot result',
    }));
    expect(supplements[0].meta.analysis_source_revision).toBe(1);
    expect(supplements[0].meta.analysis_setting_revision).toBe(1);
  });

  test('新しい解析元の結果が先に保存された場合は古い応答を反映しない', async () => {
    const context = await setup();
    const firstStarted = deferred();
    const firstResponse = deferred();
    let requestCount = 0;
    const analyze = jest.fn(() => {
      requestCount += 1;
      if (requestCount === 1) {
        firstStarted.resolve();
        return firstResponse.promise;
      }
      return Promise.resolve('new result');
    });
    const { emit, io } = createIo();
    const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze });

    const older = executor.executeSetting({
      chatId: context.post._id,
      sourceType: 'post',
      settingId: context.settings[0]._id,
      io,
      mediaPath: '/mocked',
    });
    await firstStarted.promise;
    await Chat.updateOne(
      { _id: context.post._id },
      { $set: { content: 'new source' }, $inc: { analysis_source_revision: 1 } }
    );
    await expect(
      executor.executeSetting({
        chatId: context.post._id,
        sourceType: 'post',
        settingId: context.settings[0]._id,
        io,
        mediaPath: '/mocked',
      })
    ).resolves.toEqual(expect.objectContaining({ status: 'created' }));
    firstResponse.resolve('old result');
    await expect(older).resolves.toEqual({ status: 'stale', value: null });

    const [saved] = await sourceSupplements({ postId: context.post._id });
    expect(saved.content).toBe('#Custom analysis new result');
    expect(saved.meta.analysis_source_revision).toBe(2);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  test('同じ解析元で設定のリビジョンが異なる場合は最後の応答を採用する', async () => {
    const context = await setup();
    const firstStarted = deferred();
    const firstResponse = deferred();
    let requestCount = 0;
    const analyze = jest.fn(() => {
      requestCount += 1;
      if (requestCount === 1) {
        firstStarted.resolve();
        return firstResponse.promise;
      }
      return Promise.resolve('revision two');
    });
    const { emit, io } = createIo();
    const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze });
    const first = executor.executeSetting({
      chatId: context.post._id,
      sourceType: 'post',
      settingId: context.settings[0]._id,
      io,
      mediaPath: '/mocked',
    });
    await firstStarted.promise;
    await RoomAIAnalysisSetting.updateOne(
      { _id: context.settings[0]._id },
      { $set: { additional_prompt: 'revision two prompt' }, $inc: { revision: 1 } }
    );
    await executor.executeSetting({
      chatId: context.post._id,
      sourceType: 'post',
      settingId: context.settings[0]._id,
      io,
      mediaPath: '/mocked',
    });
    firstResponse.resolve('revision one last');
    await expect(first).resolves.toEqual(expect.objectContaining({ status: 'updated' }));

    const [saved] = await sourceSupplements({ postId: context.post._id });
    expect(saved.content).toBe('#Custom analysis revision one last');
    expect(saved.meta.analysis_source_revision).toBe(1);
    expect(saved.meta.analysis_setting_revision).toBe(1);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  test('同じ解析元・設定リビジョンは重複保存せず、削除済み結果を再生成しない', async () => {
    const context = await setup();
    const { emit, io } = createIo();
    const analyze = jest.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second')
      .mockResolvedValueOnce('third');
    const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze });
    const args = {
      chatId: context.post._id,
      sourceType: 'post',
      settingId: context.settings[0]._id,
      io,
      mediaPath: '/mocked',
    };

    await expect(executor.executeSetting(args)).resolves.toEqual(expect.objectContaining({ status: 'created' }));
    await expect(executor.executeSetting(args)).resolves.toEqual({ status: 'idempotent', value: null });
    const [created] = await sourceSupplements({ postId: context.post._id });
    await Chat.updateOne(
      { _id: context.post._id, 'supplementaries._id': created._id },
      { $set: { 'supplementaries.$.delete_flg': true, 'supplementaries.$.deleted_at': new Date() } }
    );
    await expect(executor.executeSetting(args)).resolves.toEqual({ status: 'deleted', value: null });

    const supplements = await sourceSupplements({ postId: context.post._id });
    expect(supplements).toHaveLength(1);
    expect(supplements[0].content).toBe('#Custom analysis first');
    expect(supplements[0].delete_flg).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  test('会話解析の結果が文字数上限を超えた場合は、既存結果を保持し、更新イベントを送らない', async () => {
    const context = await setup();
    const { emit, io } = createIo();
    const analyze = jest.fn().mockResolvedValueOnce('valid').mockResolvedValueOnce('x'.repeat(301));
    const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze });
    const args = {
      chatId: context.post._id,
      sourceType: 'post',
      settingId: context.settings[0]._id,
      io,
      mediaPath: '/mocked',
    };
    await executor.executeSetting(args);
    const [before] = await sourceSupplements({ postId: context.post._id });
    await RoomAIAnalysisSetting.updateOne(
      { _id: context.settings[0]._id },
      { $inc: { revision: 1 } }
    );
    await expect(executor.executeSetting(args)).resolves.toEqual({ status: 'invalid-output' });

    const [after] = await sourceSupplements({ postId: context.post._id });
    expect(after.content).toBe(before.content);
    expect(after.updated_at).toEqual(before.updated_at);
    expect(after.meta.analysis_setting_revision).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  test('1つの設定で外部サービスが失敗しても次の設定の解析結果を保存する', async () => {
    const context = await setup({ kinds: ['conversation', 'speech'] });
    const analyze = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('provider failed'), { code: 'PROVIDER_FAILED' }))
      .mockResolvedValueOnce('speech result');
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const executor = createAnalysisExecutor({
      executionEnabled: () => true,
      prepareInput,
      analyze,
      logger,
    });

    const results = await executor.runSourceAnalyses({
      chatId: context.post._id,
      sourceType: 'post',
      mediaPath: '/mocked',
    });

    expect(results).toEqual([{ status: 'failed' }, expect.objectContaining({ status: 'created' })]);
    expect(await sourceSupplements({ postId: context.post._id })).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'AI_ANALYSIS_SETTING_FAILED',
      expect.objectContaining({ error_code: 'PROVIDER_FAILED' })
    );
  });

  test('機能が無効なら外部サービスの呼出しも解析結果の保存も行わない', async () => {
    const context = await setup();
    const analyze = jest.fn(async () => 'must not run');
    const executor = createAnalysisExecutor({
      executionEnabled: () => false,
      prepareInput,
      analyze,
    });

    await expect(
      executor.runSourceAnalyses({
        chatId: context.post._id,
        sourceType: 'post',
        mediaPath: '/mocked',
      })
    ).resolves.toEqual([]);
    expect(analyze).not.toHaveBeenCalled();
    expect(await sourceSupplements({ postId: context.post._id })).toHaveLength(0);
  });

  test('解析送信のロックは外部サービスの呼出し開始まで元データの更新を待たせ、その後は更新できる', async () => {
    const context = await setup();
    const providerStarted = deferred();
    const providerResponse = deferred();
    const executor = createAnalysisExecutor({
      executionEnabled: () => true,
      prepareInput,
      analyze: () => {
        providerStarted.resolve();
        return providerResponse.promise;
      },
    });
    const execution = executor.executeSetting({
      chatId: context.post._id,
      sourceType: 'post',
      settingId: context.settings[0]._id,
      mediaPath: '/mocked',
    });
    await providerStarted.promise;

    const initial = context.post.toObject();
    const mutation = persistPostAnalysisSourceMutation({
      baseQuery: { _id: context.post._id, delete_flg: false },
      initialSource: initial,
      desiredSource: { ...initial, content: 'changed after provider start' },
      setFields: { content: 'changed after provider start' },
    });
    await expect(mutation).resolves.toEqual(expect.objectContaining({ sourceChanged: true }));
    expect(await Chat.findById(context.post._id).lean()).toEqual(
      expect.objectContaining({ content: 'changed after provider start', analysis_source_revision: 2 })
    );

    providerResponse.resolve('snapshot result');
    await expect(execution).resolves.toEqual(expect.objectContaining({ status: 'created' }));
    const [saved] = await sourceSupplements({ postId: context.post._id });
    expect(saved.meta.analysis_source_revision).toBe(1);
  });
});
