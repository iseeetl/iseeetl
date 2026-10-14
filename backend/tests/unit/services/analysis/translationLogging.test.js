jest.mock('../../../../integrations/google/translate.client', () => ({ translateText: jest.fn() }));
jest.mock('../../../../models/GoogleApiUsage', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: jest.fn(),
  getGoogleTranslateConfig: jest.fn(),
}));

const makeSnapshot = (sourceType = 'post') => ({
  sourceType, chatId: 'post-1', replyId: sourceType === 'reply' ? 'reply-1' : null,
  source: { _id: sourceType === 'reply' ? 'reply-1' : 'post-1', lang: 'ja' },
  settingId: 'setting-1', settingRevision: 1, sourceRevision: 1, kind: 'conversation',
  resultUserId: 'user-1', resultTitle: 'fixture title', resultTitleLang: 'ja',
  targetLangs: ['en', 'fr'], triggerTag: { _id: 'tag-1', name: 'fixture tag', translations: [] },
});

describe('AI解析の翻訳失敗を本番ログに記録する', () => {
  const originalEnv = process.env;
  let buildAnalysisSupplement, translateText, usage, flags, errorSpy, warnSpy;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    ({ translateText } = require('../../../../integrations/google/translate.client'));
    usage = require('../../../../models/GoogleApiUsage');
    flags = require('../../../../config/featureFlags');
    flags.isGoogleTranslateEnabled.mockReturnValue(true);
    flags.getGoogleTranslateConfig.mockReturnValue({ limit: 1000 });
    usage.findOneAndUpdate.mockResolvedValue({ usage: 100 });
    ({ buildAnalysisSupplement } = require('../../../../services/analysis/output.service'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    process.env = originalEnv;
  });

  test.each(['post', 'reply'].flatMap((sourceType) =>
    ['body', 'title'].flatMap((field) =>
      [false, true].map((allFailed) => ({ sourceType, field, allFailed }))
    )
  ))('$sourceTypeの$field翻訳失敗（全言語失敗=$allFailed）で成功分を残し、失敗ごとに一度だけ記録する', async ({ sourceType, field, allFailed }) => {
    translateText.mockImplementation(async ({ contents, targetLanguageCode }) => {
      const currentField = contents[0] === 'fixture title' ? 'title' : 'body';
      if (currentField === field && (allFailed || targetLanguageCode === 'fr')) {
        throw Object.assign(new Error('private-fixture input and response'), {
          code: 8, response: { status: 429, headers: { 'x-request-id': 'fixture-request' }, data: 'private-fixture' },
        });
      }
      return [`${currentField}-${targetLanguageCode}`];
    });

    const value = await buildAnalysisSupplement({ snapshot: makeSnapshot(sourceType), providerOutput: 'fixture body' });
    expect(value.content).toBe('#fixture tag fixture body');
    expect(value.title).toBe('fixture title');
    const failedTranslations = field === 'body' ? value.translations : value.title_translations;
    const successfulTranslations = field === 'body' ? value.title_translations : value.translations;
    expect(failedTranslations.map(({ lang }) => lang)).toEqual(allFailed ? [] : ['en']);
    expect(successfulTranslations.map(({ lang }) => lang)).toEqual(['en', 'fr']);
    expect(errorSpy).toHaveBeenCalledTimes(allFailed ? 2 : 1);
    for (const targetLanguage of allFailed ? ['en', 'fr'] : ['fr']) {
      expect(errorSpy).toHaveBeenCalledWith('[ERROR]', `[translation.service] translateContent:${targetLanguage} failed`, {
        source_type: sourceType, source_id: sourceType === 'reply' ? 'reply-1' : 'post-1',
        post_id: 'post-1', reply_id: sourceType === 'reply' ? 'reply-1' : null,
        setting_id: 'setting-1', kind: 'conversation', field,
        reason: 'provider_failed', target_language: targetLanguage,
        error_code: 8, error_type: 'Error', http_status: 429, request_id: 'fixture-request',
      });
    }
    expect(warnSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/private-fixture|fixture body|fixture title|fixture tag/);
  });

  test('利用量DBの障害を本文・タイトルそれぞれ一度だけ記録し、原文を残す', async () => {
    usage.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('private-fixture database'), { code: 13 }));

    const value = await buildAnalysisSupplement({ snapshot: makeSnapshot('reply'), providerOutput: 'fixture body' });
    expect(value).toMatchObject({ content: '#fixture tag fixture body', title: 'fixture title', translations: [], title_translations: [] });
    expect(translateText).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    for (const field of ['body', 'title']) {
      expect(errorSpy).toHaveBeenCalledWith('[ERROR]', '[translation.service] translateContent failed', expect.objectContaining({
        post_id: 'post-1', reply_id: 'reply-1', setting_id: 'setting-1', field,
        reason: 'usage_check_failed', error_code: 13, source_language: 'ja', target_languages: ['en', 'fr'],
      }));
    }
    expect(warnSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('private-fixture');
  });

  test.each(['月間上限超過', '機能無効'])('%sで翻訳しない場合は本番にERRORとWARNを出さず、原文を残す', async (condition) => {
    if (condition === '月間上限超過') usage.findOneAndUpdate.mockResolvedValue({ usage: 1001 });
    else flags.isGoogleTranslateEnabled.mockReturnValue(false);

    const value = await buildAnalysisSupplement({ snapshot: makeSnapshot(), providerOutput: 'fixture body' });
    expect(value).toMatchObject({ content: '#fixture tag fixture body', title: 'fixture title', translations: [], title_translations: [] });
    expect(translateText).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    if (condition === '機能無効') expect(usage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each(['body', 'title'])('AI解析側で捕捉した$fieldの例外も本番で一度だけERRORに記録する', async (field) => {
    const translateContent = jest.fn(async (_user, content) => {
      if ((content === 'fixture title' ? 'title' : 'body') === field) throw new Error('private-fixture');
      return [{ lang: 'en', content: 'translated' }];
    });
    const value = await buildAnalysisSupplement({ snapshot: makeSnapshot(), providerOutput: 'fixture body', translateContent });
    expect(value).toMatchObject({ content: '#fixture tag fixture body', title: 'fixture title' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'AI_ANALYSIS_TRANSLATION_FAILED', expect.objectContaining({
      post_id: 'post-1', setting_id: 'setting-1', field, target_languages: ['en', 'fr'],
    }));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('private-fixture');
  });
});
