const {
  MAX_SUPPLEMENT_UTF16_UNITS,
  NOTICE_MESSAGES,
  buildAnalysisSupplement,
  truncateSpeechWithPrefix,
} = require('../../../../services/analysis/output.service');

const snapshot = (overrides = {}) => ({
  sourceType: 'post',
  chatId: 'post-1',
  replyId: null,
  settingId: 'setting-1',
  settingRevision: 3,
  kind: 'conversation',
  resultUserId: 'user-1',
  sourceRevision: 7,
  triggerTag: {
    _id: 'tag-1',
    name: '相談',
    translations: [
      { lang: 'en', name: 'Advice' },
      { lang: 'fr-FR', name: 'Conseil' },
    ],
  },
  targetLangs: ['en', 'fr-FR'],
  source: { _id: 'post-1', lang: 'en' },
  ...overrides,
});

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

describe('AI解析結果の整形', () => {
  test.each(['ja', 'en', 'fr'])('発話未検出は翻訳サービスが使えなくても日英を残す: %s', async (lang) => {
    const translateContent = jest.fn().mockRejectedValue(new Error('unavailable'));
    const value = await buildAnalysisSupplement({ snapshot: snapshot({ kind: 'speech', source: { lang }, targetLangs: [] }),
      providerOutput: { status: 'no-speech' }, translateContent, logger: logger() });
    expect(value.lang).toBe(lang === 'ja' ? 'ja' : 'en');
    const contents = [value.content, ...value.translations.map((entry) => entry.content)];
    expect(contents.some((text) => text.endsWith('発話を検出できませんでした'))).toBe(true);
    expect(contents.some((text) => text.endsWith('No speech was detected.'))).toBe(true);
    if (lang !== 'fr') expect(translateContent).not.toHaveBeenCalled();
  });

  test.each([
    ['no-sound', '解析用の音声データは無音です。音源や周囲の状況は判断できません。',
      'The audio data contains no sound. The source or surroundings cannot be determined.'],
    ['no-description', '音の説明を生成できませんでした。', 'Could not generate a description of the sounds.'],
    ['low-level', '録音レベルが非常に低く、はっきり聞き取れる音はありません。', 'The recording level is very low and no sound can be clearly heard.'],
  ])('音解析の%sは翻訳サービスが使えなくても日英の固定文を保存する', async (status, ja, en) => {
    expect(NOTICE_MESSAGES[status]).toEqual({ ja, en });
    for (const lang of ['ja', 'en', 'fr']) {
      const translateContent = jest.fn().mockRejectedValue(new Error('unavailable'));
      const value = await buildAnalysisSupplement({
        snapshot: snapshot({ kind: 'audioScene', source: { _id: 'post-1', lang }, targetLangs: [] }),
        providerOutput: { status }, translateContent, logger: logger(),
      });
      expect(value.lang).toBe(lang === 'ja' ? 'ja' : 'en');
      expect(value.content).toBe(lang === 'ja' ? `#相談 ${ja}` : `#Advice ${en}`);
      const contents = [value.content, ...value.translations.map((entry) => entry.content)];
      expect(contents).toContain(`#相談 ${ja}`);
      expect(contents).toContain(`#Advice ${en}`);
      expect(value.meta.analysis_kind).toBe('audioScene');
      if (lang !== 'fr') expect(translateContent).not.toHaveBeenCalled();
      else expect(translateContent).toHaveBeenCalledWith('user-1', en, 'en', ['fr'], expect.objectContaining({ field: 'body' }));
    }
  });

  test('音解析の固定文は日英以外を翻訳経路で補い、翻訳本文を保存する', async () => {
    const translateContent = jest.fn().mockResolvedValue([{ lang: 'fr-FR', content: 'Aucun son.' }]);
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({ kind: 'audioScene', source: { _id: 'post-1', lang: 'ja' } }),
      providerOutput: { status: 'no-sound' }, translateContent, logger: logger(),
    });
    expect(value.lang).toBe('ja');
    expect(translateContent).toHaveBeenCalledWith(
      'user-1', '解析用の音声データは無音です。音源や周囲の状況は判断できません。', 'ja', ['fr-FR'], expect.any(Object)
    );
    expect(value.translations).toEqual([
      expect.objectContaining({ lang: 'en', content: '#Advice The audio data contains no sound. The source or surroundings cannot be determined.' }),
      expect.objectContaining({ lang: 'fr-FR', content: '#Conseil Aucun son.' }),
    ]);
  });

  test.each([
    ['speech', 'no-sound'], ['speech', 'no-description'],
    ['conversation', 'no-sound'], ['vision', 'no-description'], ['video', 'no-sound'],
    ['audioScene', 'unknown-status'],
  ])('%sに%sの内部結果を流用しない', async (kind, status) => {
    const log = logger();
    await expect(buildAnalysisSupplement({ snapshot: snapshot({ kind }), providerOutput: { status }, logger: log }))
      .resolves.toBeNull();
    expect(log.error).toHaveBeenCalledWith('AI_ANALYSIS_OUTPUT_INVALID', expect.objectContaining({ reason: 'empty' }));
  });

  test.each(['conversation', 'vision', 'video', 'audioScene'])('他の種別に未検出結果を流用しない: %s', async (kind) => {
    await expect(buildAnalysisSupplement({ snapshot: snapshot({ kind }), providerOutput: { status: 'no-speech' }, logger: logger() }))
      .resolves.toBeNull();
  });

  test('翻訳例外は安全なERRORだけを記録し、解析本文を残す', async () => {
    const log = logger();
    const value = await buildAnalysisSupplement({
      snapshot: snapshot(),
      providerOutput: 'fixture answer',
      translateContent: jest.fn().mockRejectedValue(Object.assign(new Error('private fixture translation'), {
        code: 8, metadata: { token: 'private-fixture' },
      })),
      logger: log,
    });
    expect(value.content).toBe('#Advice fixture answer');
    expect(value.translations).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('AI_ANALYSIS_TRANSLATION_FAILED', expect.objectContaining({
      post_id: 'post-1', stage: 'translation', reason: 'translation_failed', error_code: 8,
      field: 'body', target_languages: ['fr-FR'],
    }));
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('private');
  });

  test('タイトルの原文言語を使って本文と別に翻訳し、長い翻訳も省略しない', async () => {
    const translatedTitle = '翻訳'.repeat(30);
    const translateContent = jest.fn(async (_user, text) => [{ lang: 'en', content: text === '見出し' ? translatedTitle : 'body' }]);
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({ resultTitle: '見出し', resultTitleLang: 'ja', targetLangs: ['en', 'ja'] }),
      providerOutput: 'answer', translateContent, logger: logger(),
    });
    expect(value).toMatchObject({ title: '見出し', title_lang: 'ja', content: '#Advice answer' });
    expect(translateContent).toHaveBeenCalledWith('user-1', '見出し', 'ja', ['en'], expect.objectContaining({
      post_id: 'post-1', setting_id: 'setting-1', field: 'title',
    }));
    expect(value.title_translations[0].content).toBe(translatedTitle);
  });
  test('タイトル翻訳が失敗しても原文タイトルと解析本文を保存する', async () => {
    const log = logger();
    const translateContent = jest.fn(async (_user, text) => {
      if (text === '見出し') throw new Error('translation unavailable');
      return [{ lang: 'ja', content: '本文訳' }];
    });
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({ resultTitle: '見出し', resultTitleLang: 'ja', targetLangs: ['en', 'ja'] }),
      providerOutput: 'answer', translateContent, logger: log,
    });
    expect(value).toMatchObject({ title: '見出し', title_translations: [], content: '#Advice answer' });
    expect(value.translations).toHaveLength(1);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('AI_ANALYSIS_TRANSLATION_FAILED', expect.objectContaining({
      post_id: 'post-1', setting_id: 'setting-1', field: 'title', target_languages: ['en'],
      reason: 'title_translation_failed',
    }));
  });

  test('解析を実行したルームタグの翻訳を使い、翻訳がなければ元のタグ名を使う', async () => {
    const translateContent = jest.fn(async () => [
      { lang: 'fr-FR', content: 'réponse' },
      { lang: 'de', content: 'antwort' },
    ]);
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({ targetLangs: ['fr-FR', 'de'] }),
      providerOutput: 'answer',
      translateContent,
      logger: logger(),
    });

    expect(value.content).toBe('#Advice answer');
    expect(value.translations).toEqual([
      expect.objectContaining({ lang: 'fr-FR', content: '#Conseil réponse' }),
      expect.objectContaining({ lang: 'de', content: '#相談 antwort' }),
    ]);
    expect(value.meta).toEqual({
      analysis_kind: 'conversation',
      analysis_setting: 'setting-1',
      analysis_setting_revision: 3,
      analysis_trigger_tag: 'tag-1',
      analysis_source_revision: 7,
    });
  });

  test.each(['vision','video','audioScene','conversation','speech'])('%sは400を超える本文を省略せず保持する', async (kind) => {
    const content = '界'.repeat(1500);
    const value = await buildAnalysisSupplement({ snapshot: snapshot({kind,targetLangs:[]}), providerOutput:content, logger:logger() });
    expect(value.content.endsWith(content)).toBe(true);
  });

  test('文字起こし以外は接頭辞込みの2000文字を保存し、2001文字なら変更しない', async () => {
    const longLabel = 'T'.repeat(99);
    const baseSnapshot = snapshot({
      kind: 'vision', targetLangs: [],
      triggerTag: { _id: 'tag-1', name: longLabel, translations: [] },
    });
    const prefixLength = `#${longLabel} `.length;
    const atLimit = await buildAnalysisSupplement({
      snapshot: baseSnapshot,
      providerOutput: 'a'.repeat(MAX_SUPPLEMENT_UTF16_UNITS - prefixLength),
      logger: logger(),
    });
    const aboveLimit = await buildAnalysisSupplement({
      snapshot: baseSnapshot,
      providerOutput: 'a'.repeat(MAX_SUPPLEMENT_UTF16_UNITS - prefixLength + 1),
      logger: logger(),
    });

    expect(atLimit.content).toHaveLength(2000);
    expect(aboveLimit).toBeNull();
  });

  test('文字起こしはサロゲートペアを分割せず、省略記号付きで切り詰める', async () => {
    const log = logger();
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({ kind: 'speech', targetLangs: [], source: { _id: 'post-1', lang: 'ja' } }),
      providerOutput: `text${'😀'.repeat(1200)}`,
      logger: log,
    });

    expect(value.content.length).toBeLessThanOrEqual(2000);
    expect(value.content.endsWith('…')).toBe(true);
    const lastBeforeEllipsis = value.content.charCodeAt(value.content.length - 2);
    expect(lastBeforeEllipsis >= 0xd800 && lastBeforeEllipsis <= 0xdbff).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      'AI_ANALYSIS_OUTPUT_TRUNCATED',
      expect.objectContaining({ reason: 'base_utf16_units' })
    );
  });

  test.each(['vision', 'audioScene', 'video', 'conversation'])('%sの500文字の翻訳を他の翻訳とともに全文保持する', async (kind) => {
    const log = logger();
    const translateContent = jest.fn(async () => [
      { lang: 'en', content: 'x'.repeat(500) },
      { lang: 'fr-FR', content: 'court' },
    ]);
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({
        kind,
        source: { _id: 'post-1', lang: 'ja' },
      }),
      providerOutput: 'valid',
      translateContent,
      logger: log,
    });

    expect(value.content).toBe('#相談 valid');
    expect(value.translations).toEqual([
      expect.objectContaining({ lang: 'en', content: `#Advice ${'x'.repeat(500)}` }),
      expect.objectContaining({ lang: 'fr-FR', content: '#Conseil court' }),
    ]);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  test.each([400, 401])('タグ名込み%s文字の翻訳を省略せず保持する', async (length) => {
    const content = 'x'.repeat(length - '#Advice '.length);
    const log = logger();
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({ source: { _id: 'post-1', lang: 'ja' }, targetLangs: ['en'] }),
      providerOutput: 'valid',
      translateContent: jest.fn().mockResolvedValue([{ lang: 'en', content }]),
      logger: log,
    });

    expect(value.translations).toEqual([
      expect.objectContaining({ lang: 'en', content: `#Advice ${content}` }),
    ]);
    expect(value.translations[0].content).toHaveLength(length);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  test('翻訳タグ名と区切りだけで400文字を超えても翻訳本文とともに全文保持する', async () => {
    const translatedName = 'T'.repeat(399);
    const log = logger();
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({
        source: { _id: 'post-1', lang: 'ja' },
        targetLangs: ['en'],
        triggerTag: { _id: 'tag-1', name: '相談', translations: [{ lang: 'en', name: translatedName }] },
      }),
      providerOutput: 'valid',
      translateContent: jest.fn().mockResolvedValue([{ lang: 'en', content: 'answer' }]),
      logger: log,
    });

    expect(value.content).toBe('#相談 valid');
    expect(value.translations[0].content).toBe(`#${translatedName} answer`);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  test('文字起こしの原文は省略し、翻訳には省略前の本文を渡して長い結果を保持する', async () => {
    const providerOutput = '文字起こし'.repeat(500);
    const translated = 'transcribed '.repeat(60);
    const translateContent = jest.fn().mockResolvedValue([{ lang: 'en', content: translated }]);
    const log = logger();
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({ kind: 'speech', source: { _id: 'post-1', lang: 'ja' }, targetLangs: ['en'] }),
      providerOutput,
      translateContent,
      logger: log,
    });

    expect(value.content).toHaveLength(2000);
    expect(value.content.endsWith('…')).toBe(true);
    expect(translateContent).toHaveBeenCalledWith('user-1', providerOutput, 'ja', ['en'], expect.objectContaining({
      post_id: 'post-1', setting_id: 'setting-1', field: 'body',
    }));
    expect(value.translations[0].content).toBe(`#Advice ${translated.trim()}`);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('AI_ANALYSIS_OUTPUT_TRUNCATED', expect.any(Object));
    expect(log.error).not.toHaveBeenCalled();
  });

  test('空の翻訳と原文言語の翻訳は除外し、有効な翻訳を残す', async () => {
    const value = await buildAnalysisSupplement({
      snapshot: snapshot(),
      providerOutput: 'valid',
      translateContent: jest.fn().mockResolvedValue([
        { lang: 'fr-FR', content: '   ' },
        { lang: 'de', content: '' },
        { lang: 'en', content: 'same language' },
        { content: 'missing language' },
        { lang: 'fr-FR', content: 'réponse' },
      ]),
      logger: logger(),
    });

    expect(value.content).toBe('#Advice valid');
    expect(value.translations).toEqual([
      expect.objectContaining({ lang: 'fr-FR', content: '#Conseil réponse' }),
    ]);
  });

  test('翻訳タグ名を会話原文に付けた結果が2000文字を超える場合は拒否する', async () => {
    const log = logger();
    const translateContent = jest.fn();
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({
        triggerTag: { _id: 'tag-1', name: '相談', translations: [{ lang: 'en', name: 'T'.repeat(1999) }] },
      }),
      providerOutput: 'valid',
      translateContent,
      logger: log,
    });

    expect(value).toBeNull();
    expect(translateContent).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith('AI_ANALYSIS_OUTPUT_INVALID', expect.objectContaining({ reason: 'base_utf16_units' }));
  });

  test('接頭辞付きの文字起こしを切り詰めてもサロゲートペアを分割しない', () => {
    const result = truncateSpeechWithPrefix({ label: 'T', text: '😀'.repeat(1200) });
    const beforeEllipsis = result.slice(0, -1);
    const last = beforeEllipsis.charCodeAt(beforeEllipsis.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    expect(result.length).toBeLessThanOrEqual(2000);
  });
});
