jest.mock('../../../../services/translation.service', () => ({
  translateContent: jest.fn(),
  translateGuestContent: jest.fn(),
  getFailedTranslationLanguages: jest.fn((translations) => translations.failedLanguages || []),
}));

jest.mock('../../../../models/Chat', () => ({
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../../../../services/timeline/shared/timelineSerializer', () => jest.fn((v) => v));
jest.mock('../../../../utils/logger', () => ({ warn: jest.fn() }));

const translationCore = require('../../../../services/translation.service');
const Chat = require('../../../../models/Chat');
const serializeTimeline = require('../../../../services/timeline/shared/timelineSerializer');
const timelineTranslation = require('../../../../services/timeline/timelineTranslation.service');

// Mongooseのクエリと同様に、populateを連続して呼び出せ、awaitで結果を取得できる。
const makeQuery = (doc) => {
  const chain = {
    populate: jest.fn(() => chain),
    then: (res, rej) => Promise.resolve(doc).then(res, rej),
    catch: (rej) => Promise.resolve(doc).catch(rej),
  };
  return chain;
};

const makeDoc = () => {
  const doc = {
    room: {
      _id: 'room1',
      toString() {
        return 'room1';
      },
    },
  };
  return doc;
};

const makeIo = () => {
  const toCtx = { emit: jest.fn() };
  const io = { to: jest.fn().mockReturnValue(toCtx) };
  return { io, toCtx };
};

describe('timelineTranslationのサービス', () => {
  test.each([
    'translateMainContentIfNeeded', 'translateGuestMainContentIfNeeded',
    'translateReplyIfNeeded', 'translateGuestReplyIfNeeded',
    'translateSupplementIfNeeded', 'translateReplySupplementIfNeeded',
  ].flatMap((name) => ['populate', 'serialize', 'to', 'emit'].map((stage) => [name, stage])))(
    '%sは保存後の%s失敗を翻訳失敗に変えない', async (name, stage) => {
      translationCore.translateContent.mockResolvedValue([{ lang: 'en', content: 'translated' }]);
      translationCore.translateGuestContent.mockResolvedValue([{ lang: 'en', content: 'translated' }]);
      const doc = makeDoc();
      doc.populate = jest.fn().mockResolvedValue(doc);
      Chat.findOneAndUpdate.mockReturnValue(makeQuery(doc));
      const { io, toCtx } = makeIo();
      const fail = () => { throw new Error('publication failed'); };
      if (stage === 'populate') doc.populate.mockImplementation(fail);
      if (stage === 'serialize') serializeTimeline.mockImplementationOnce(fail);
      if (stage === 'to') io.to.mockImplementation(fail);
      if (stage === 'emit') toCtx.emit.mockRejectedValue(new Error('publication failed'));
      await expect(timelineTranslation[name]({
        chatId: 'post1', replyId: 'reply1', supplementId: 'supp1', userId: 'user1', guestId: 'guest1',
        content: 'original', lang: 'ja', targetLangs: ['en'], reply: { _id: 'reply1', content: 'original', lang: 'ja' }, io,
      })).resolves.toBeUndefined();
      expect(Chat.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(require('../../../../utils/logger').warn).toHaveBeenCalledWith('[SOCKET] publication failed', { event: expect.any(String) });
    }
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('投稿本文の翻訳', () => {
    const baseParams = {
      userId: 'u1',
      chatId: 'c1',
      content: 'hello',
      lang: 'en',
      targetLangs: ['ja'],
    };

    test('内容が空 → 何もしない', async () => {
      const { io } = makeIo();

      await timelineTranslation.translateMainContentIfNeeded({
        ...baseParams,
        content: '',
        io,
      });

      expect(translationCore.translateContent).not.toHaveBeenCalled();
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });

    test('翻訳結果が空配列 → 更新せず', async () => {
      translationCore.translateContent.mockResolvedValue([]);
      const { io } = makeIo();

      await timelineTranslation.translateMainContentIfNeeded({ ...baseParams, io });

      expect(translationCore.translateContent).toHaveBeenCalledWith('u1', 'hello', 'en', ['ja']);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });

    test('翻訳失敗をバックグラウンド実行基盤へ伝播する', async () => {
      translationCore.translateContent.mockRejectedValue(new Error('translation failed'));
      const { io } = makeIo();

      await expect(
        timelineTranslation.translateMainContentIfNeeded({ ...baseParams, io })
      ).rejects.toThrow('translation failed');

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });

    test('翻訳成功 → DB 更新、POST_UPDATEを通知する', async () => {
      const translations = [{ lang: 'ja', content: 'こんにちは' }];
      translationCore.translateContent.mockResolvedValue(translations);
      Chat.findOneAndUpdate.mockReturnValue(makeQuery(makeDoc()));

      const { io, toCtx } = makeIo();

      await timelineTranslation.translateMainContentIfNeeded({ ...baseParams, io });

      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'c1', delete_flg: false },
        { $set: { translations } },
        expect.objectContaining({ new: true, runValidators: true })
      );

      expect(io.to).toHaveBeenCalledWith('room1');
      expect(toCtx.emit).toHaveBeenCalledWith('POST_UPDATE', expect.any(Object));
      expect(serializeTimeline).toHaveBeenCalled();
    });

    test('一部翻訳失敗時は成功分を更新し、同じルームへ警告する', async () => {
      const translations = [{ lang: 'ja', content: 'こんにちは' }];
      Object.defineProperty(translations, 'failedLanguages', { value: ['fr'] });
      translationCore.translateContent.mockResolvedValue(translations);
      Chat.findOneAndUpdate.mockReturnValue(makeQuery(makeDoc()));
      const { io, toCtx } = makeIo();

      await timelineTranslation.translateMainContentIfNeeded({ ...baseParams, targetLangs: ['ja', 'fr'], io });

      expect(Chat.findOneAndUpdate).toHaveBeenCalled();
      expect(toCtx.emit).toHaveBeenCalledWith('POST_UPDATE', expect.any(Object));
      expect(toCtx.emit).toHaveBeenCalledWith('TRANSLATION_ERROR', { failedLanguages: ['fr'] });
    });

    test('全翻訳失敗時もchatのルームへ警告する', async () => {
      const translations = [];
      Object.defineProperty(translations, 'failedLanguages', { value: ['ja'] });
      translationCore.translateContent.mockResolvedValue(translations);
      Chat.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ room: 'room1' }) }),
      });
      const { io, toCtx } = makeIo();

      await timelineTranslation.translateMainContentIfNeeded({ ...baseParams, io });

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(toCtx.emit).toHaveBeenCalledWith('TRANSLATION_ERROR', { failedLanguages: ['ja'] });
    });

    test('保存結果の通知失敗後も一部翻訳失敗の警告を送る', async () => {
      const translations = [{ lang: 'ja', content: 'translated' }];
      translations.failedLanguages = ['fr'];
      translationCore.translateContent.mockResolvedValue(translations);
      Chat.findOneAndUpdate.mockReturnValue(makeQuery(makeDoc()));
      const { io, toCtx } = makeIo();
      toCtx.emit.mockRejectedValueOnce(new Error('emit failed'));
      await timelineTranslation.translateMainContentIfNeeded({ ...baseParams, io });
      expect(toCtx.emit).toHaveBeenNthCalledWith(2, 'TRANSLATION_ERROR', { failedLanguages: ['fr'] });
    });

    test('翻訳結果のDB保存失敗は伝播し通知しない', async () => {
      translationCore.translateContent.mockResolvedValue([{ lang: 'ja', content: 'translated' }]);
      Chat.findOneAndUpdate.mockRejectedValueOnce(new Error('save failed'));
      const { io } = makeIo();
      await expect(timelineTranslation.translateMainContentIfNeeded({ ...baseParams, io })).rejects.toThrow('save failed');
      expect(io.to).not.toHaveBeenCalled();
    });
  });

  describe('ゲスト投稿の翻訳', () => {
    test('翻訳成功で POST_UPDATEを通知する', async () => {
      const params = {
        guestId: 'g1',
        chatId: 'c2',
        content: 'bonjour',
        lang: 'fr',
        targetLangs: ['en'],
      };

      translationCore.translateGuestContent.mockResolvedValue([{ lang: 'en', content: 'hello' }]);
      Chat.findOneAndUpdate.mockReturnValue(makeQuery(makeDoc()));

      const { io, toCtx } = makeIo();

      await timelineTranslation.translateGuestMainContentIfNeeded({ ...params, io });

      expect(translationCore.translateGuestContent).toHaveBeenCalledWith('g1', 'bonjour', 'fr', ['en']);
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(toCtx.emit).toHaveBeenCalledWith('POST_UPDATE', expect.any(Object));
    });

    test('翻訳結果が空 → 何もしない', async () => {
      translationCore.translateGuestContent.mockResolvedValue([]);
      const { io } = makeIo();

      await timelineTranslation.translateGuestMainContentIfNeeded({
        guestId: 'g1',
        chatId: 'c2',
        content: 'bonjour',
        lang: 'fr',
        targetLangs: ['en'],
        io,
      });

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });
  });

  describe('返信の翻訳', () => {
    test('翻訳成功で REPLY_UPDATEを通知する', async () => {
      const reply = { _id: 'r1', content: 'hi', lang: 'en' };
      translationCore.translateContent.mockResolvedValue([{ lang: 'ja', content: 'やあ' }]);
      Chat.findOneAndUpdate.mockReturnValue(makeQuery(makeDoc()));

      const { io, toCtx } = makeIo();

      await timelineTranslation.translateReplyIfNeeded({
        chatId: 'c3',
        reply,
        targetLangs: ['ja'],
        io,
        userId: 'u2',
      });

      const options = Chat.findOneAndUpdate.mock.calls[0][2];
      expect(options.arrayFilters[0]).toEqual({ 'reply._id': 'r1' });
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(toCtx.emit).toHaveBeenCalledWith('REPLY_UPDATE', expect.any(Object));
    });

    test('翻訳結果が空 → 何もしない', async () => {
      translationCore.translateContent.mockResolvedValue([]);
      const { io } = makeIo();

      await timelineTranslation.translateReplyIfNeeded({
        chatId: 'c3',
        reply: { _id: 'r1', content: 'hi', lang: 'en' },
        targetLangs: ['ja'],
        io,
        userId: 'u2',
      });

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });
  });

  describe('ゲスト返信の翻訳', () => {
    test('翻訳成功で REPLY_UPDATEを通知する', async () => {
      const reply = { _id: 'r2', content: 'hola', lang: 'es' };
      translationCore.translateGuestContent.mockResolvedValue([{ lang: 'en', content: 'hello' }]);
      Chat.findOneAndUpdate.mockReturnValue(makeQuery(makeDoc()));

      const { io, toCtx } = makeIo();

      await timelineTranslation.translateGuestReplyIfNeeded({
        chatId: 'c4',
        reply,
        targetLangs: ['en'],
        io,
        guestId: 'g2',
      });

      expect(io.to).toHaveBeenCalledWith('room1');
      expect(toCtx.emit).toHaveBeenCalledWith('REPLY_UPDATE', expect.any(Object));
    });

    test('翻訳結果が空 → 何もしない', async () => {
      translationCore.translateGuestContent.mockResolvedValue([]);
      const { io } = makeIo();

      await timelineTranslation.translateGuestReplyIfNeeded({
        chatId: 'c4',
        reply: { _id: 'r2', content: 'hola', lang: 'es' },
        targetLangs: ['en'],
        io,
        guestId: 'g2',
      });

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });
  });

  describe('投稿の付加情報の翻訳', () => {
    test('翻訳成功で SUPPLEMENT_UPDATEを通知する', async () => {
      translationCore.translateContent.mockResolvedValue([{ lang: 'en', content: 'info' }]);
      Chat.findOneAndUpdate.mockReturnValue(makeQuery(makeDoc()));

      const { io, toCtx } = makeIo();

      await timelineTranslation.translateSupplementIfNeeded({
        chatId: 'c5',
        supplementId: 's1',
        content: '情報',
        lang: 'ja',
        targetLangs: ['en'],
        userId: 'u3',
        io,
      });

      const opts = Chat.findOneAndUpdate.mock.calls[0][2];
      expect(opts.arrayFilters[0]).toEqual({ 'supplement._id': 's1' });
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(toCtx.emit).toHaveBeenCalledWith('SUPPLEMENT_UPDATE', expect.any(Object));
    });

    test('翻訳結果が空 → 何もしない', async () => {
      translationCore.translateContent.mockResolvedValue([]);
      const { io } = makeIo();

      await timelineTranslation.translateSupplementIfNeeded({
        chatId: 'c5',
        supplementId: 's1',
        content: '情報',
        lang: 'ja',
        targetLangs: ['en'],
        userId: 'u3',
        io,
      });

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });
  });

  describe('返信の付加情報の翻訳', () => {
    test('翻訳成功で REPLY_SUPPLEMENT_UPDATEを通知する', async () => {
      translationCore.translateContent.mockResolvedValue([{ lang: 'ja', content: '追加' }]);
      Chat.findOneAndUpdate.mockReturnValue(makeQuery(makeDoc()));

      const { io, toCtx } = makeIo();

      await timelineTranslation.translateReplySupplementIfNeeded({
        chatId: 'c6',
        replyId: 'r3',
        supplementId: 's2',
        content: 'add',
        lang: 'en',
        targetLangs: ['ja'],
        userId: 'u4',
        io,
      });

      const opts = Chat.findOneAndUpdate.mock.calls[0][2];
      expect(opts.arrayFilters).toEqual([{ 'reply._id': 'r3' }, { 'supp._id': 's2' }]);
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(toCtx.emit).toHaveBeenCalledWith('REPLY_SUPPLEMENT_UPDATE', expect.any(Object));
    });

    test('翻訳結果が空 → 何もしない', async () => {
      translationCore.translateContent.mockResolvedValue([]);
      const { io } = makeIo();

      await timelineTranslation.translateReplySupplementIfNeeded({
        chatId: 'c6',
        replyId: 'r3',
        supplementId: 's2',
        content: 'add',
        lang: 'en',
        targetLangs: ['ja'],
        userId: 'u4',
        io,
      });

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });
  });
});
