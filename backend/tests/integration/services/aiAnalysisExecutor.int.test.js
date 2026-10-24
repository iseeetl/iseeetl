const mongoose = require('mongoose');

jest.mock('../../../integrations/google/translate.client', () => ({ translateText: jest.fn() }));
jest.mock('../../../config/featureFlags', () => ({
  ...jest.requireActual('../../../config/featureFlags'),
  isGoogleTranslateEnabled: jest.fn(() => false),
  getGoogleTranslateConfig: jest.fn(() => ({ limit: null })),
}));

const ROLES = require('../../../constants/roles');
const Chat = require('../../../models/Chat');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');
const RoomTag = require('../../../models/RoomTag');
const User = require('../../../models/User');
const { createAnalysisExecutor } = require('../../../services/analysis/executor.service');
const { buildAnalysisSupplement } = require('../../../services/analysis/output.service');
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
  test.each(['post','reply'].flatMap(sourceType=>['conversation','vision','video','speech','audioScene'].map(kind=>[sourceType,kind])))('%s/%sと人の付加情報を2000文字で保存・編集する', async (sourceType,kind) => {
    const ctx=await setup({withReply:sourceType==='reply',kinds:[kind]});const {io}=createIo();
    const executor=createAnalysisExecutor({executionEnabled:()=>true,prepareInput,analyze:async()=> 'x'.repeat(1800)});
    await executor.executeSetting({chatId:ctx.post._id,sourceType,replyId:sourceType==='reply'?ctx.replyId:null,settingId:ctx.settings[0]._id,io,mediaPath:'/mocked'});
    const [sup]=await sourceSupplements({postId:ctx.post._id,replyId:sourceType==='reply'?ctx.replyId:null});
    const update=sourceType==='post' ? require('../../../services/timeline/postSupplements.service').update : require('../../../services/timeline/replySupplements.service').updateReplySupplement;
    const body={room_id:String(ctx.room._id),post_id:String(ctx.post._id),reply_id:String(ctx.replyId),_id:String(sup._id),content:'y'.repeat(2000)};
    const payload={user_id:String(ctx.owner._id),user_role:ROLES.ADMINISTRATOR};
    await expect(update(body,payload,io,{requireContentOrMedia:true})).resolves.toBeTruthy();
    await expect(update({...body,content:'y'.repeat(2001)},payload,io,{requireContentOrMedia:true})).rejects.toMatchObject({code:'INVALID_PARAMS'});
    const current=(await sourceSupplements({postId:ctx.post._id,replyId:sourceType==='reply'?ctx.replyId:null}))[0];
    expect(current.content).toHaveLength(2000);
    const humanId = new mongoose.Types.ObjectId();
    const path = sourceType === 'reply' ? 'replies.$.supplementaries' : 'supplementaries';
    const query = sourceType === 'reply' ? { _id: ctx.post._id, 'replies._id': ctx.replyId } : { _id: ctx.post._id };
    await Chat.updateOne(query, { $push: { [path]: { _id: humanId, user: ctx.owner._id, content: 'Human information', lang: 'en' } } });
    await expect(update({ ...body, _id: String(humanId), content: 'h'.repeat(2001),
      ai_origin: { kind: 'conversation' }, meta: { analysis_kind: 'conversation' } }, payload, io))
      .rejects.toMatchObject({ code: 'INVALID_PARAMS' });
    await expect(update({ ...body, _id: String(humanId), content: 'h'.repeat(2000) }, payload, io))
      .resolves.toBeTruthy();
  });

  test.each(['post', 'reply'])('%sの会話短縮と失敗案内を1件だけ保存する', async (sourceType) => {
    const ctx = await setup({ withReply: sourceType === 'reply' });
    const { emit, io } = createIo();
    const analyze = jest.fn().mockResolvedValueOnce('x'.repeat(2450)).mockResolvedValueOnce('Both parts answered.');
    const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze });
    const args = { chatId: ctx.post._id, sourceType, replyId: sourceType === 'reply' ? ctx.replyId : null,
      settingId: ctx.settings[0]._id, io, mediaPath: '/mocked' };
    await expect(executor.executeSetting(args)).resolves.toMatchObject({ status: 'created' });
    const values = await sourceSupplements({ postId: ctx.post._id, replyId: args.replyId });
    expect(values).toHaveLength(1);
    expect(values[0].content).toBe('#Custom analysis Both parts answered.');
    expect(analyze).toHaveBeenCalledTimes(2);
    await expect(executor.executeSetting(args)).resolves.toMatchObject({ status: 'idempotent' });
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalled();
  });

  test.each(['post', 'reply'])('%sの会話通信失敗を日英の案内として保存し、古い結果を上書きしない', async (sourceType) => {
    const ctx = await setup({ withReply: sourceType === 'reply' });
    const { io } = createIo();
    const analyze = jest.fn().mockRejectedValue(new Error('synthetic failure'));
    const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze });
    const args = { chatId: ctx.post._id, sourceType, replyId: sourceType === 'reply' ? ctx.replyId : null,
      settingId: ctx.settings[0]._id, io, mediaPath: '/mocked' };
    await expect(executor.executeSetting(args)).resolves.toMatchObject({ status: 'created' });
    const values = await sourceSupplements({ postId: ctx.post._id, replyId: args.replyId });
    expect(values).toHaveLength(1);
    expect(values[0].content).toBe('#Custom analysis Could not generate AI supplementary information.');
    expect(values[0].translations.find(t => t.lang === 'ja').content).toBe('#独自解析 AIの補足情報を生成できませんでした。');
    await expect(executor.executeSetting(args)).resolves.toMatchObject({ status: 'idempotent' });
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  test.each(['post', 'reply'])('%sの発話未検出を日英で保存・配信し、再実行で重複しない', async (sourceType) => {
    const context = await setup({ kinds: ['speech'], withReply: sourceType === 'reply' });
    const { emit, io } = createIo();
    const analyze = jest.fn(async () => ({ status: 'no-speech' }));
    const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze });
    const args = { chatId: context.post._id, sourceType, replyId: sourceType === 'reply' ? context.replyId : null,
      settingId: context.settings[0]._id, io, mediaPath: '/mocked' };
    await expect(executor.executeSetting(args)).resolves.toMatchObject({ status: 'created' });
    const saved = await sourceSupplements({ postId: context.post._id, replyId: args.replyId });
    expect(saved).toHaveLength(1);
    expect(saved[0].content).toBe('#Custom analysis No speech was detected.');
    expect(saved[0].translations[0].content).toBe('#独自解析 発話を検出できませんでした');
    expect(emit).toHaveBeenCalledTimes(1);
    await expect(executor.executeSetting(args)).resolves.toMatchObject({ status: 'idempotent' });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  describe('共通翻訳処理の失敗後も解析結果を保存する', () => {
    const { translateText } = require('../../../integrations/google/translate.client');
    const flags = require('../../../config/featureFlags');
    const logger = require('../../../utils/logger');
    const GoogleApiUsage = require('../../../models/GoogleApiUsage');

    beforeEach(() => {
      flags.isGoogleTranslateEnabled.mockReturnValue(true);
      translateText.mockReset();
      jest.spyOn(logger, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
      flags.isGoogleTranslateEnabled.mockReturnValue(false);
    });

    test.each(['post', 'reply'])('%sの本文・タイトルで一部言語が失敗しても原文と成功した翻訳を保存・配信する', async (sourceType) => {
      const withReply = sourceType === 'reply';
      const context = await setup({ withReply });
      await Floor.updateOne({ _id: context.floor._id }, { $set: { target_langs: ['ja', 'fr'] } });
      await RoomAIAnalysisSetting.updateOne({ _id: context.settings[0]._id }, {
        $set: { result_title: 'fixture title', result_title_lang: 'en' },
      });
      translateText.mockImplementation(async ({ contents, targetLanguageCode }) => {
        if (targetLanguageCode === 'fr') throw Object.assign(new Error('private-fixture'), { code: 8 });
        return [contents[0] === 'fixture title' ? '翻訳タイトル' : '翻訳本文'];
      });
      const { emit, io } = createIo();
      const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze: async () => 'fixture answer' });
      const args = {
        chatId: context.post._id, sourceType, replyId: withReply ? context.replyId : null,
        settingId: context.settings[0]._id, io, mediaPath: '/mocked',
      };
      await expect(executor.executeSetting(args)).resolves.toMatchObject({ status: 'created' });

      const [saved] = await sourceSupplements({ postId: context.post._id, replyId: args.replyId });
      expect(saved).toMatchObject({
        content: '#Custom analysis fixture answer', title: 'fixture title',
        translations: [expect.objectContaining({ lang: 'ja', content: '#独自解析 翻訳本文' })],
        title_translations: [expect.objectContaining({ lang: 'ja', content: '翻訳タイトル' })],
      });
      expect(logger.error).toHaveBeenCalledTimes(2);
      for (const field of ['body', 'title']) {
        expect(logger.error).toHaveBeenCalledWith('[translation.service] translateContent:fr failed', expect.objectContaining({
          source_type: sourceType, post_id: context.post._id.toString(),
          reply_id: withReply ? context.replyId.toString() : null,
          setting_id: context.settings[0]._id.toString(), field, error_code: 8,
        }));
      }
      expect(emit).toHaveBeenCalledTimes(1);
      const [event, payload] = emit.mock.calls[0];
      expect(event).toBe(withReply ? 'REPLY_SUPPLEMENT_CREATE' : 'SUPPLEMENT_CREATE');
      const source = withReply ? payload.replies.find((reply) => String(reply._id) === String(args.replyId)) : payload;
      expect(source.supplementaries[0]).toMatchObject({
        content: saved.content, title: saved.title,
        translations: [expect.objectContaining({ lang: 'ja', content: '#独自解析 翻訳本文' })],
        title_translations: [expect.objectContaining({ lang: 'ja', content: '翻訳タイトル' })],
      });
    });

    test('利用量DBの例外を記録した後も解析原文を保存する', async () => {
      const context = await setup();
      await Floor.updateOne({ _id: context.floor._id }, { $set: { target_langs: ['ja'] } });
      jest.spyOn(GoogleApiUsage, 'findOneAndUpdate').mockRejectedValue(Object.assign(new Error('private-fixture'), { code: 13 }));
      const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze: async () => 'fixture answer' });
      await expect(executor.executeSetting({
        chatId: context.post._id, sourceType: 'post', settingId: context.settings[0]._id,
        io: createIo().io, mediaPath: '/mocked',
      })).resolves.toMatchObject({ status: 'created' });
      const [saved] = await sourceSupplements({ postId: context.post._id });
      expect(saved).toMatchObject({ content: '#Custom analysis fixture answer', translations: [] });
      expect(translateText).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('[translation.service] translateContent failed', expect.objectContaining({
        post_id: context.post._id.toString(), setting_id: context.settings[0]._id.toString(),
        field: 'body', reason: 'usage_check_failed', error_code: 13,
      }));
    });
  });

  test.each([
    { sourceType: 'post', kind: 'conversation' },
    { sourceType: 'reply', kind: 'conversation' },
    { sourceType: 'post', kind: 'speech' },
    { sourceType: 'reply', kind: 'speech' },
  ])('$sourceTypeの$kind解析で長い翻訳本文と翻訳タグ名を新規保存・更新・配信する', async ({ sourceType, kind }) => {
    const withReply = sourceType === 'reply';
    const context = await setup({ withReply, kinds: [kind] });
    const translatedTag = 'T'.repeat(399);
    await Floor.updateOne({ _id: context.floor._id }, { $set: { target_langs: ['ja', 'fr'] } });
    await RoomTag.updateOne({ _id: context.tag._id }, {
      $push: { translations: { user: context.owner._id, lang: 'fr', name: translatedTag } },
    });
    const providerOutput = kind === 'speech' ? 'a'.repeat(2400) : 'valid result';
    const translateContent = jest.fn();
    const { emit, io } = createIo();
    const executor = createAnalysisExecutor({
      executionEnabled: () => true,
      prepareInput,
      analyze: async () => providerOutput,
      buildSupplement: (options) => buildAnalysisSupplement({ ...options, translateContent }),
    });
    const args = {
      chatId: context.post._id,
      sourceType,
      replyId: withReply ? context.replyId : null,
      settingId: context.settings[0]._id,
      io,
      mediaPath: '/mocked',
    };
    let supplementId;
    for (const revision of [1, 2]) {
      if (revision === 2) {
        await RoomAIAnalysisSetting.updateOne({ _id: context.settings[0]._id }, { $inc: { revision: 1 } });
      }
      const translatedBody = `${revision}${'訳'.repeat(500)}`;
      translateContent.mockResolvedValue([
        { lang: 'ja', content: translatedBody },
        { lang: 'fr', content: 'réponse' },
      ]);
      await expect(executor.executeSetting(args)).resolves.toMatchObject({ status: revision === 1 ? 'created' : 'updated' });
      const supplements = await sourceSupplements({ postId: context.post._id, replyId: args.replyId });
      expect(supplements).toHaveLength(1);
      const [saved] = supplements;
      if (revision === 1) supplementId = saved._id.toString();
      expect(saved._id.toString()).toBe(supplementId);
      expect(saved.meta.analysis_setting_revision).toBe(revision);
      const expectedTranslations = [
        { lang: 'ja', content: `#独自解析 ${translatedBody}` },
        { lang: 'fr', content: `#${translatedTag} réponse` },
      ];
      expect(saved.translations.map(({ lang, content }) => ({ lang, content }))).toEqual(expectedTranslations);
      if (kind === 'speech') {
        expect(saved.content).toHaveLength(2000);
        expect(saved.content.endsWith('…')).toBe(true);
      } else {
        expect(saved.content).toBe(`#Custom analysis ${providerOutput}`);
      }
      expect(translateContent).toHaveBeenLastCalledWith(
        context.resultUser._id.toString(), providerOutput, 'en', ['ja', 'fr'],
        expect.objectContaining({
          post_id: context.post._id.toString(),
          reply_id: withReply ? context.replyId.toString() : null,
          setting_id: context.settings[0]._id.toString(),
          field: 'body',
        })
      );
      expect(emit).toHaveBeenCalledTimes(revision);
      expect(io.to).toHaveBeenLastCalledWith(context.room._id.toString());
      const [event, payload, createdReplySupplement] = emit.mock.calls[revision - 1];
      expect(event).toBe(`${withReply ? 'REPLY_' : ''}SUPPLEMENT_${revision === 1 ? 'CREATE' : 'UPDATE'}`);
      const emittedSource = withReply
        ? payload.replies.find((reply) => reply._id.toString() === args.replyId.toString())
        : payload;
      expect(emittedSource.supplementaries[0].translations).toEqual(
        expectedTranslations.map((translation) => expect.objectContaining(translation))
      );
      if (withReply && revision === 1) {
        expect(createdReplySupplement.translations).toEqual(emittedSource.supplementaries[0].translations);
      }
    }
  });

  test.each([false, true])('返信=%sでも設定のタイトルを反映し、再解析時だけ最新設定で置き換える', async (withReply) => {
    const ctx = await setup({ withReply });
    await RoomAIAnalysisSetting.updateOne({ _id: ctx.settings[0]._id }, { $set: { result_title: '解析メモ', result_title_lang: 'ja' } });
    const executor = createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze: async () => 'result' });
    const args = { chatId: ctx.post._id, sourceType: withReply ? 'reply' : 'post', replyId: withReply ? ctx.replyId : null, io: createIo().io, mediaPath: '/mocked' };
    await executor.runSourceAnalyses(args);
    const get = () => sourceSupplements({ postId: ctx.post._id, replyId: withReply ? ctx.replyId : null });
    expect((await get())[0]).toMatchObject({ title: '解析メモ', title_lang: 'ja' });
    await RoomAIAnalysisSetting.updateOne({ _id: ctx.settings[0]._id }, { $set: { result_title: '次の解析メモ' }, $inc: { revision: 1 } });
    expect((await get())[0].title).toBe('解析メモ');
    const sourcePath = withReply ? 'replies.0' : '';
    const path = sourcePath ? `${sourcePath}.supplementaries.0` : 'supplementaries.0';
    await Chat.updateOne({ _id: ctx.post._id }, { $set: { [`${path}.title`]: '手動の見出し' } });
    await executor.runSourceAnalyses(args);
    expect((await get())[0].title).toBe('次の解析メモ');
    expect(await get()).toHaveLength(1);
  });

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

  test('会話短縮も上限を超えた場合は、更新世代の失敗案内を表示する', async () => {
    const context = await setup();
    const { emit, io } = createIo();
    const analyze = jest.fn().mockResolvedValueOnce('valid').mockResolvedValue('x'.repeat(2450));
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
    await expect(executor.executeSetting(args)).resolves.toMatchObject({ status: 'updated' });

    const [after] = await sourceSupplements({ postId: context.post._id });
    expect(after._id).toEqual(before._id);
    expect(after.content).toBe('#Custom analysis Could not generate AI supplementary information.');
    expect(after.meta.analysis_setting_revision).toBe(2);
    expect(emit).toHaveBeenCalledTimes(2);
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

    expect(results).toEqual([expect.objectContaining({ status: 'created' }), expect.objectContaining({ status: 'created' })]);
    expect(await sourceSupplements({ postId: context.post._id })).toHaveLength(2);
    expect(logger.error).toHaveBeenCalledWith(
      'AI_CONVERSATION_FAILED',
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

describe('ゲスト会話解析の送信前の許可確認', () => {
  const setupGuest = async (withReply = false) => {
    const ctx = await setup({ withReply, kinds: ['conversation', 'vision'] });
    await Room.updateOne({ _id: ctx.room._id }, { $set: { guest_conversation_enabled: true } });
    const prefix = withReply ? 'replies.0.' : '';
    await Chat.updateOne({ _id: ctx.post._id }, {
      $unset: { [`${prefix}user`]: '' },
      $set: { [`${prefix}guest_id`]: 'guest-analysis', [`${prefix}guest_name`]: 'ゲスト' },
    });
    return { ...ctx, args: { chatId: ctx.post._id, sourceType: withReply ? 'reply' : 'post', replyId: withReply ? ctx.replyId : null, guest: true } };
  };

  test.each([false, true])('最新の許可がONなら会話だけを実行し、メディア解析は実行しない（返信=%s）', async (withReply) => {
    const ctx = await setupGuest(withReply);
    const analyze = jest.fn(async () => '会話の回答');
    const { io, emit } = createIo();
    const results = await createAnalysisExecutor({ executionEnabled: () => true, prepareInput, analyze })
      .runSourceAnalyses({ ...ctx.args, io });
    expect(results.map((result) => result.status)).toEqual(['created']);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conversation' }));
    const supplements = await sourceSupplements({ postId: ctx.post._id, replyId: ctx.args.replyId });
    expect(supplements).toHaveLength(1);
    expect(supplements[0].user).toEqual(ctx.resultUser._id);
    if (withReply) expect(emit).toHaveBeenCalledWith('REPLY_SUPPLEMENT_CREATE', expect.any(Object), expect.any(Object));
    else expect(emit).toHaveBeenCalledWith('SUPPLEMENT_CREATE', expect.any(Object));
  });

  test.each([false, true])('流す形式の投稿・返信は会話解析の対象にしない（返信=%s）', async (withReply) => {
    const ctx = await setupGuest(withReply);
    await Chat.updateOne({ _id: ctx.post._id }, { $set: { [withReply ? 'replies.0.animation' : 'animation']: 'move-and-erase' } });
    const analyze = jest.fn();
    await createAnalysisExecutor({ executionEnabled: () => true, analyze }).runSourceAnalyses(ctx.args);
    expect(analyze).not.toHaveBeenCalled();
  });

  test.each([false, true])('送信準備中に許可がOFFになったら外部AIを呼ばない（返信=%s）', async (withReply) => {
    const ctx = await setupGuest(withReply);
    const analyze = jest.fn(async () => '回答');
    const executor = createAnalysisExecutor({ executionEnabled: () => true, analyze,
      prepareInput: async (_options, callback) => {
        await Room.updateOne({ _id: ctx.room._id }, { $set: { guest_conversation_enabled: false } });
        return callback(null);
      },
    });
    await expect(executor.runSourceAnalyses(ctx.args)).resolves.toEqual([{ status: 'changed-before-send' }]);
    expect(analyze).not.toHaveBeenCalled();
    expect(await sourceSupplements({ postId: ctx.post._id, replyId: ctx.args.replyId })).toHaveLength(0);
  });

  test.each([
    ['旧データ', { $unset: { guest_conversation_enabled: '' } }],
    ['許可なし', { $set: { guest_conversation_enabled: false } }],
    ['リアクションのみ', { $set: { guest_reaction_only: true } }],
    ['メンバー限定', { $set: { member_only: true } }],
    ['削除済み', { $set: { delete_flg: true } }],
  ])('%sのルームでは許可を推測せず解析しない', async (_label, update) => {
    const ctx = await setupGuest();
    await Room.collection.updateOne({ _id: ctx.room._id }, update);
    const analyze = jest.fn();
    await createAnalysisExecutor({ executionEnabled: () => true, analyze }).runSourceAnalyses(ctx.args);
    expect(analyze).not.toHaveBeenCalled();
  });

  test('検索後に設定が会話以外へ変わっていたら解析しない', async () => {
    const ctx = await setupGuest();
    const setting = ctx.settings.find((item) => item.analysis_kind === 'conversation');
    await RoomAIAnalysisSetting.updateOne({ _id: setting._id }, { $set: { analysis_kind: 'speech' } });
    const analyze = jest.fn();
    await createAnalysisExecutor({ executionEnabled: () => true, analyze,
      listSettingIds: async () => [setting._id],
    }).runSourceAnalyses(ctx.args);
    expect(analyze).not.toHaveBeenCalled();
  });

  test('送信後に許可をOFFにすると実行中の結果は保存し、次の設定は実行しない', async () => {
    const ctx = await setupGuest();
    const secondTag = await RoomTag.create({ floor: ctx.floor._id, room: ctx.room._id, user: ctx.owner._id, order: 2, name: '別の相談' });
    await RoomAIAnalysisSetting.create({ floor: ctx.floor._id, room: ctx.room._id,
      room_tag: secondTag._id, analysis_kind: 'conversation', result_user: ctx.resultUser._id,
      user: ctx.owner._id, updated_by: ctx.owner._id,
    });
    await Chat.updateOne({ _id: ctx.post._id }, { $push: { room_tags: secondTag._id } });
    const analyze = jest.fn(async () => {
      await Room.updateOne({ _id: ctx.room._id }, { $set: { guest_conversation_enabled: false } });
      return '送信済みの回答';
    });
    const results = await createAnalysisExecutor({ executionEnabled: () => true, analyze, prepareInput }).runSourceAnalyses(ctx.args);
    expect(results.map((result) => result.status)).toEqual(['created', 'skipped']);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await sourceSupplements({ postId: ctx.post._id })).toHaveLength(1);
  });
});
