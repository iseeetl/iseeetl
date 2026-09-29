jest.mock('../../../../../config/featureFlags', () => ({ isGoogleTranslateEnabled: jest.fn() }));
jest.mock('../../../../../services/backgroundTaskRunner', () => ({ runBackgroundTask: jest.fn() }));
jest.mock('../../../../../services/timeline/timelineTranslation.service', () => ({ translateSupplementTitleIfNeeded: jest.fn() }));
const { isGoogleTranslateEnabled } = require('../../../../../config/featureFlags');
const { runBackgroundTask } = require('../../../../../services/backgroundTaskRunner');
const { translateSupplementTitleIfNeeded } = require('../../../../../services/timeline/timelineTranslation.service');
const { scheduleSupplementTitleTranslation } = require('../../../../../services/timeline/shared/supplementTitleTranslation');

describe('付加情報タイトルの翻訳起動', () => {
  const input = () => ({
    chatId: 'post', body: {},
    supplement: { _id: 'supplement', title: 'お買い得メモ', title_lang: 'ja', lang: 'en' },
    context: { userId: 'user', foundFloor: { target_langs: ['ja', 'en'] }, foundRoom: { _id: 'room' } },
    io: { roomLanguageProvider: { getLanguages: () => ['fr'] } },
  });
  beforeEach(() => {
    jest.clearAllMocks();
    isGoogleTranslateEnabled.mockReturnValue(true);
  });
  test('本文とタイトルの言語が異なっても、タイトル言語を除いたフロア・接続中の言語へ翻訳する', async () => {
    scheduleSupplementTitleTranslation(input());
    expect(runBackgroundTask).toHaveBeenCalledTimes(1);
    await runBackgroundTask.mock.calls[0][1]();
    expect(translateSupplementTitleIfNeeded).toHaveBeenCalledWith(expect.objectContaining({
      title: 'お買い得メモ', titleLang: 'ja', targetLangs: ['en', 'fr'], userId: 'user',
    }));
  });
  test.each(['未設定', '翻訳無効', 'タイトル変更なし', '対象言語なし'])('%sでは翻訳を起動しない', (reason) => {
    const args = input();
    if (reason === '未設定') args.supplement.title = null;
    if (reason === '翻訳無効') isGoogleTranslateEnabled.mockReturnValue(false);
    if (reason === 'タイトル変更なし') args.previous = { ...args.supplement };
    if (reason === '対象言語なし') { args.context.foundFloor.target_langs = ['ja']; args.io.roomLanguageProvider.getLanguages = () => []; }
    scheduleSupplementTitleTranslation(args);
    expect(runBackgroundTask).not.toHaveBeenCalled();
  });
  test('タイトル言語だけの変更も再翻訳する', () => {
    const args = input();
    scheduleSupplementTitleTranslation({ ...args, previous: { ...args.supplement, title_lang: 'en' } });
    expect(runBackgroundTask).toHaveBeenCalledTimes(1);
  });
});
