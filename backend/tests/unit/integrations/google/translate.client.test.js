let mockTranslateFn;
let mockTranslationServiceClient;
const mockGetGoogleTranslateConfig = jest.fn();

jest.mock('@google-cloud/translate', () => {
  mockTranslateFn = jest.fn();
  mockTranslationServiceClient = jest.fn(() => ({ translateText: mockTranslateFn }));
  return {
    v3: {
      TranslationServiceClient: mockTranslationServiceClient,
    },
  };
});
jest.mock('../../../../config/featureFlags', () => ({
  getGoogleTranslateConfig: mockGetGoogleTranslateConfig,
}));

const loadModule = () => {
  jest.resetModules();
  return require('../../../../integrations/google/translate.client');
};

describe('Google翻訳クライアント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGoogleTranslateConfig.mockReturnValue({
      credentialsPath: '/test-fixtures/google/credentials.json',
      projectId: 'proj-test',
      location: 'asia-northeast1',
      limit: 1000,
    });
  });

  test('contentsが空配列または非配列ならAPIを呼ばない', async () => {
    const { translateText } = loadModule();

    await expect(
      translateText({ contents: [], sourceLanguageCode: 'en', targetLanguageCode: 'ja' })
    ).resolves.toEqual([]);
    await expect(
      translateText({ contents: null, sourceLanguageCode: 'en', targetLanguageCode: 'ja' })
    ).resolves.toEqual([]);

    expect(mockTranslationServiceClient).not.toHaveBeenCalled();
    expect(mockTranslateFn).not.toHaveBeenCalled();
  });

  test('固定設定が無効ならクライアントを作らず空配列を返す', async () => {
    mockGetGoogleTranslateConfig.mockReturnValue(null);
    const { translateText } = loadModule();

    await expect(
      translateText({ contents: ['Hello'], sourceLanguageCode: 'en', targetLanguageCode: 'ja' })
    ).resolves.toEqual([]);
    expect(mockTranslationServiceClient).not.toHaveBeenCalled();
  });

  test('固定されたプロジェクト・地域・資格情報で翻訳する', async () => {
    const { translateText } = loadModule();
    mockTranslateFn.mockResolvedValueOnce([
      { translations: [{ translatedText: 'こんにちは' }, { translatedText: '世界' }] },
    ]);

    const result = await translateText({
      contents: ['Hello', 'World'],
      sourceLanguageCode: 'en',
      targetLanguageCode: 'ja',
    });

    expect(result).toEqual(['こんにちは', '世界']);
    expect(mockTranslationServiceClient).toHaveBeenCalledWith({
      projectId: 'proj-test',
      keyFilename: '/test-fixtures/google/credentials.json',
    });
    expect(mockTranslateFn).toHaveBeenCalledWith({
      parent: 'projects/proj-test/locations/asia-northeast1',
      contents: ['Hello', 'World'],
      mimeType: 'text/plain',
      sourceLanguageCode: 'en',
      targetLanguageCode: 'ja',
    });
  });

  test('mimeTypeを上書きできる', async () => {
    const { translateText } = loadModule();
    mockTranslateFn.mockResolvedValueOnce([{ translations: [{ translatedText: 'OK' }] }]);

    await translateText({
      contents: ['<b>Hi</b>'],
      sourceLanguageCode: 'en',
      targetLanguageCode: 'ja',
      mimeType: 'text/html',
    });

    expect(mockTranslateFn.mock.calls[0][0].mimeType).toBe('text/html');
  });

  test('API応答に翻訳がなければ空配列を返す', async () => {
    const { translateText } = loadModule();
    mockTranslateFn.mockResolvedValueOnce([{}]);

    await expect(
      translateText({ contents: ['Hello'], sourceLanguageCode: 'en', targetLanguageCode: 'ja' })
    ).resolves.toEqual([]);
  });
});
