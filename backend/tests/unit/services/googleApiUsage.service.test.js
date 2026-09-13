jest.mock('../../../models/GoogleApiUsage', () => ({
  findOneAndUpdate: jest.fn(),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
const mockGetGoogleTranslateConfig = jest.fn(() => ({ limit: 1000 }));
jest.mock('../../../config/featureFlags', () => ({
  getGoogleTranslateConfig: mockGetGoogleTranslateConfig,
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));

const { canTranslate } = require('../../../services/googleApiUsage.service');
const GoogleApiUsage = require('../../../models/GoogleApiUsage');

describe('Google翻訳の利用量判定', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockGetGoogleTranslateConfig.mockReturnValue({ limit: 1000 });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('内容が空なら false（DB 更新なし）', async () => {
    const ok = await canTranslate('', 'en', ['ja']);
    expect(ok).toBe(false);
    expect(GoogleApiUsage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('targetLangs が不正/空なら false（DB 更新なし）', async () => {
    const a = await canTranslate('hello', 'en', undefined);
    const b = await canTranslate('hello', 'en', []);
    expect(a).toBe(false);
    expect(b).toBe(false);
    expect(GoogleApiUsage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('Google Translate無効なら false（DB 更新なし）', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);

    const ok = await canTranslate('hello', 'en', ['ja']);
    expect(ok).toBe(false);
    expect(GoogleApiUsage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('targetLangs がソースのみ（filteredLangs 空）なら false（DB 更新なし）', async () => {
    const ok = await canTranslate('hello', 'en', ['en']);
    expect(ok).toBe(false);
    expect(GoogleApiUsage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('上限未超過: usage が limit 以下なら true、正しい charCount と year_month で加算', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-08-15T12:00:00Z'));

    // 文字数に翻訳先の言語数を掛けた値を使用量に加算する。
    GoogleApiUsage.findOneAndUpdate.mockResolvedValue({ usage: 123 });

    const ok = await canTranslate('abcd', 'en', ['ja', 'fr']);
    expect(ok).toBe(true);

    expect(GoogleApiUsage.findOneAndUpdate).toHaveBeenCalledWith(
      { api_type: 'translate', year_month: '2025-08' },
      { $inc: { usage: 8 }, year_month: '2025-08' },
      { upsert: true, new: true }
    );

    jest.useRealTimers();
  });

  test('上限超過: usage が limit を超えたら false（「>」判定）', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-03T00:00:00Z'));

    mockGetGoogleTranslateConfig.mockReturnValue({ limit: 10 });
    // 更新後の使用量で上限を判定するため、加算済みの値を返す。
    GoogleApiUsage.findOneAndUpdate.mockResolvedValue({ usage: 11 });

    const ok = await canTranslate('abc', 'en', ['ja', 'fr']);
    expect(ok).toBe(false);

    expect(GoogleApiUsage.findOneAndUpdate).toHaveBeenCalledWith(
      { api_type: 'translate', year_month: '2025-01' },
      { $inc: { usage: 6 }, year_month: '2025-01' },
      { upsert: true, new: true }
    );

    jest.useRealTimers();
  });

  test('明示unlimitedの固定設定は常に true（DB は更新される）', async () => {
    mockGetGoogleTranslateConfig.mockReturnValue({ limit: null });
    GoogleApiUsage.findOneAndUpdate.mockResolvedValue({ usage: 999999 });

    const ok = await canTranslate('hello', 'en', ['ja']);
    expect(ok).toBe(true);
    expect(GoogleApiUsage.findOneAndUpdate).toHaveBeenCalled();
  });

  test('例外時は false（安全側）', async () => {
    GoogleApiUsage.findOneAndUpdate.mockImplementation(() => {
      throw new Error('DB error');
    });

    const ok = await canTranslate('hello', 'en', ['ja']);
    expect(ok).toBe(false);
  });

  test('ソース言語が targetLangs に含まれていても除外され、charCount に反映される', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-08-01T00:00:00Z'));

    // 原文と同じ言語を翻訳先から除き、残りの言語数で使用量を計算する。
    GoogleApiUsage.findOneAndUpdate.mockResolvedValue({ usage: 50 });

    const ok = await canTranslate('hello', 'en', ['en', 'ja', 'fr']);
    expect(ok).toBe(true);

    expect(GoogleApiUsage.findOneAndUpdate).toHaveBeenCalledWith(
      { api_type: 'translate', year_month: '2025-08' },
      { $inc: { usage: 10 }, year_month: '2025-08' },
      { upsert: true, new: true }
    );

    jest.useRealTimers();
  });
});
