jest.mock('../../../integrations/google/translate.client', () => ({
  translateText: jest.fn(),
}));
jest.mock('../../../services/googleApiUsage.service', () => ({
  canTranslate: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));

const { translateText } = require('../../../integrations/google/translate.client');
const { canTranslate } = require('../../../services/googleApiUsage.service');
const logger = require('../../../utils/logger');
const translationService = require('../../../services/translation.service');

describe('translationのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
  });

  test.each([
    ['タイトルと説明', () => translationService.translateTitleAndDescription('u1', 'title', 'desc', 'ja', ['en'])],
    ['タグ', () => translationService.translateTag('u1', { name: 'tag', lang: 'ja' }, ['en'])],
    ['単語グループ', () => translationService.translateQuickTextGroup('u1', { title: 'group', lang: 'ja' }, ['en'])],
    ['単語', () => translationService.translateQuickTextItem('u1', { label: 'item', lang: 'ja' }, ['en'])],
    ['本文', () => translationService.translateContent('u1', 'hello', 'ja', ['en'])],
    ['ゲストの本文', () => translationService.translateGuestContent('g1', 'hello', 'ja', ['en'])],
  ])('Google翻訳無効時は%sの利用量確認と外部サービス呼出しを省く', async (_label, translate) => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);

    await expect(translate()).resolves.toEqual([]);

    expect(canTranslate).not.toHaveBeenCalled();
    expect(translateText).not.toHaveBeenCalled();
  });

  describe('タイトルと説明の翻訳', () => {
    test('入力が空の場合は何もしない', async () => {
      const res = await translationService.translateTitleAndDescription('u1', '', '', 'ja', ['en']);

      expect(res).toEqual([]);
      expect(canTranslate).not.toHaveBeenCalled();
      expect(translateText).not.toHaveBeenCalled();
    });

    test('canTranslate が false の場合は空配列', async () => {
      canTranslate.mockResolvedValue(false);

      const res = await translationService.translateTitleAndDescription('u1', 't', 'd', 'ja', ['en']);

      expect(canTranslate).toHaveBeenCalledWith('td', 'ja', ['en']);
      expect(translateText).not.toHaveBeenCalled();
      expect(res).toEqual([]);
    });

    test('翻訳結果を返す', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockResolvedValueOnce(['TITLE_FR', 'DESC_FR']).mockResolvedValueOnce(['TITLE_JA', 'DESC_JA']);

      const res = await translationService.translateTitleAndDescription('u1', 'Title', 'Desc', 'en', [
        'en',
        'fr',
        'ja',
      ]);

      expect(canTranslate).toHaveBeenCalledWith('TitleDesc', 'en', ['fr', 'ja']);
      expect(translateText).toHaveBeenCalledWith({
        contents: ['Title', 'Desc'],
        sourceLanguageCode: 'en',
        targetLanguageCode: 'fr',
      });
      expect(res).toEqual([
        { user: 'u1', lang: 'fr', title: 'TITLE_FR', description: 'DESC_FR' },
        { user: 'u1', lang: 'ja', title: 'TITLE_JA', description: 'DESC_JA' },
      ]);
    });

    test('例外時は空配列', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockRejectedValue(new Error('fail'));

      const res = await translationService.translateTitleAndDescription('u1', 'Title', 'Desc', 'en', ['fr']);

      expect(res).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('translateTitleAndDescription'),
        expect.objectContaining({ error: 'fail' })
      );
    });
  });

  describe('単語グループの翻訳', () => {
    test('ソースを除外した target に対して翻訳する', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockResolvedValueOnce(['HELLO']).mockResolvedValueOnce(['BONJOUR']);

      const res = await translationService.translateQuickTextGroup('u1', { title: 'hello', lang: 'ja' }, [
        'ja',
        'en',
        'en',
        'fr',
      ]);

      expect(canTranslate).toHaveBeenCalledWith('hello', 'ja', ['en', 'fr']);
      expect(translateText).toHaveBeenCalledTimes(2);
      expect(res).toEqual([
        { user: 'u1', lang: 'en', content: 'HELLO' },
        { user: 'u1', lang: 'fr', content: 'BONJOUR' },
      ]);
    });
  });

  describe('単語の翻訳', () => {
    test('ラベルが空の場合は空配列', async () => {
      const res = await translationService.translateQuickTextItem('u1', { label: '', lang: 'ja' }, ['en']);

      expect(res).toEqual([]);
      expect(canTranslate).not.toHaveBeenCalled();
      expect(translateText).not.toHaveBeenCalled();
    });

    test('翻訳結果を返す', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockResolvedValueOnce(['LABEL_EN']);

      const res = await translationService.translateQuickTextItem('u1', { label: 'Label', lang: 'ja' }, ['en', 'ja']);

      expect(canTranslate).toHaveBeenCalledWith('Label', 'ja', ['en']);
      expect(res).toEqual([{ user: 'u1', lang: 'en', content: 'LABEL_EN' }]);
    });
  });

  describe('タグの翻訳', () => {
    test('name が空の場合は空配列', async () => {
      const res = await translationService.translateTag('u1', { name: '', lang: 'ja' }, ['en']);
      expect(res).toEqual([]);
      expect(canTranslate).not.toHaveBeenCalled();
    });

    test('lowerCase で返す', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockResolvedValueOnce(['TagName']);

      const res = await translationService.translateTag('u1', { name: 'Tag', lang: 'ja' }, ['en']);

      expect(canTranslate).toHaveBeenCalledWith('Tag', 'ja', ['en']);
      expect(res).toEqual([{ user: 'u1', lang: 'en', name: 'tagname' }]);
    });

    test('例外時は空配列', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockRejectedValue(new Error('fail'));

      const res = await translationService.translateTag('u1', { name: 'Tag', lang: 'ja' }, ['en']);

      expect(res).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('translateTag'),
        expect.objectContaining({ error: 'fail' })
      );
    });
  });

  describe('本文の翻訳', () => {
    test('canTranslate が false の場合は空配列', async () => {
      canTranslate.mockResolvedValue(false);

      const res = await translationService.translateContent('u1', 'hello', 'ja', ['en']);

      expect(res).toEqual([]);
      expect(translateText).not.toHaveBeenCalled();
    });

    test('翻訳結果を返す', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockResolvedValueOnce(['HELLO']);

      const res = await translationService.translateContent('u1', 'hello', 'ja', ['en', 'ja']);

      expect(canTranslate).toHaveBeenCalledWith('hello', 'ja', ['en']);
      expect(res).toEqual([{ user: 'u1', guest_id: null, lang: 'en', content: 'HELLO' }]);
    });

    test('一部言語が失敗しても成功した翻訳を保持し、失敗言語を通知用メタデータへ残す', async () => {
      canTranslate.mockResolvedValue(true);
      translateText
        .mockResolvedValueOnce(['HELLO'])
        .mockRejectedValueOnce(new Error('provider failed'))
        .mockResolvedValueOnce(['HALLO']);

      const res = await translationService.translateContent('u1', 'hello', 'ja', ['en', 'fr', 'de']);

      expect(res).toEqual([
        { user: 'u1', guest_id: null, lang: 'en', content: 'HELLO' },
        { user: 'u1', guest_id: null, lang: 'de', content: 'HALLO' },
      ]);
      expect(translationService.getFailedTranslationLanguages(res)).toEqual(['fr']);
      expect(Object.keys(res)).toEqual(['0', '1']);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('translateContent:fr'),
        expect.objectContaining({ error: 'provider failed' })
      );
    });

    test('翻訳先を正規化し、未対応言語と不正型を利用量計算から除外する', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockResolvedValueOnce(['HELLO']);

      const res = await translationService.translateContent('u1', 'hello', 'ja', [
        ' EN ',
        'zz',
        1,
        null,
        'en',
        'JA',
      ]);

      expect(canTranslate).toHaveBeenCalledWith('hello', 'ja', ['en']);
      expect(translateText).toHaveBeenCalledTimes(1);
      expect(res).toEqual([{ user: 'u1', guest_id: null, lang: 'en', content: 'HELLO' }]);
    });

    test('例外時は空配列', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockRejectedValue(new Error('fail'));

      const res = await translationService.translateContent('u1', 'hello', 'ja', ['en']);

      expect(res).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('translateContent'),
        expect.objectContaining({ error: 'fail' })
      );
    });
  });

  describe('ゲストの本文の翻訳', () => {
    test('内容が空の場合は空配列', async () => {
      const res = await translationService.translateGuestContent('g1', '', 'ja', ['en']);
      expect(res).toEqual([]);
      expect(canTranslate).not.toHaveBeenCalled();
    });

    test('翻訳結果を返す', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockResolvedValueOnce(['HELLO']);

      const res = await translationService.translateGuestContent('g1', 'hello', 'ja', ['en', 'ja']);

      expect(canTranslate).toHaveBeenCalledWith('hello', 'ja', ['en']);
      expect(res).toEqual([{ user: null, guest_id: 'g1', lang: 'en', content: 'HELLO' }]);
    });

    test('未対応言語だけの場合は利用量を加算しない', async () => {
      const targets = Array.from({ length: 100 }, (_, index) => `invalid-${index}`);

      const res = await translationService.translateGuestContent('g1', 'hello', 'ja', targets);

      expect(res).toEqual([]);
      expect(canTranslate).not.toHaveBeenCalled();
      expect(translateText).not.toHaveBeenCalled();
    });

    test('例外時は空配列', async () => {
      canTranslate.mockResolvedValue(true);
      translateText.mockRejectedValue(new Error('fail'));

      const res = await translationService.translateGuestContent('g1', 'hello', 'ja', ['en']);

      expect(res).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('translateGuestContent'),
        expect.objectContaining({ error: 'fail' })
      );
    });
  });
});
