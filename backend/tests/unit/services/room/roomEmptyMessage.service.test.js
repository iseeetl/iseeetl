jest.mock('../../../../config/featureFlags', () => ({ isGoogleTranslateEnabled: jest.fn() }));
jest.mock('../../../../services/translation.service', () => ({ translateContent: jest.fn() }));
const { isGoogleTranslateEnabled } = require('../../../../config/featureFlags');
const { translateContent } = require('../../../../services/translation.service');
const { buildEmptyMessageUpdate } = require('../../../../services/room/roomEmptyMessage.service');

describe('投稿がないときの案内文の保存', () => {
  const floor = { target_langs: ['en'] };
  const build = (body, room) => buildEmptyMessageUpdate({ body, room, floor, userId: 'user' });
  beforeEach(() => {
    jest.clearAllMocks();
    isGoogleTranslateEnabled.mockReturnValue(true);
    translateContent.mockResolvedValue([{ lang: 'en', content: 'Welcome' }]);
  });

  test('指定なしの作成では標準文を保存せず、翻訳も呼び出さない', async () => {
    expect(await build({ lang: 'ja' })).toEqual({ empty_message: '', empty_message_translations: [] });
    expect(translateContent).not.toHaveBeenCalled();
  });
  test('独自の案内文を前後の空白を除いて翻訳する', async () => {
    expect(await build({ lang: 'ja', empty_message: ' ようこそ ' })).toEqual({
      empty_message: 'ようこそ', empty_message_translations: [{ lang: 'en', content: 'Welcome' }],
    });
    expect(translateContent).toHaveBeenCalledWith('user', 'ようこそ', 'ja', ['en']);
  });
  test('案内文の指定がない更新では保存済みの文と翻訳を維持する', async () => {
    expect(await build({ lang: 'ja' }, { lang: 'ja', empty_message: 'ようこそ' })).toEqual({});
    expect(translateContent).not.toHaveBeenCalled();
  });
  test.each([null, '', '   '])('案内文を空欄に戻すと翻訳も削除する（%j）', async (empty_message) => {
    expect(await build({ lang: 'ja', empty_message }, { lang: 'ja', empty_message: 'ようこそ' }))
      .toEqual({ empty_message: '', empty_message_translations: [] });
    expect(translateContent).not.toHaveBeenCalled();
  });
  test('原文の言語が変われば、同じ案内文でも翻訳を更新する', async () => {
    await build({ lang: 'en' }, { lang: 'ja', empty_message: 'Welcome' });
    expect(translateContent).toHaveBeenCalledWith('user', 'Welcome', 'en', ['en']);
  });
  test('翻訳が無効でも原文を更新し、以前の翻訳を削除する', async () => {
    isGoogleTranslateEnabled.mockReturnValue(false);
    expect(await build({ lang: 'ja', empty_message: '変更後' }, { lang: 'ja', empty_message: '変更前' }))
      .toEqual({ empty_message: '変更後', empty_message_translations: [] });
    expect(translateContent).not.toHaveBeenCalled();
  });
  test('翻訳の失敗や空の結果を保存せず、原文を維持する', async () => {
    translateContent.mockResolvedValue([{ lang: 'en', content: '' }]);
    expect(await build({ lang: 'ja', empty_message: 'ようこそ' }))
      .toEqual({ empty_message: 'ようこそ', empty_message_translations: [] });
  });
});
