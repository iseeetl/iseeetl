const {
  MAX_SUPPLEMENT_UTF16_UNITS,
  buildAnalysisSupplement,
  truncateSpeechWithPrefix,
} = require('../../../../services/analysis/output.service');

const snapshot = (overrides = {}) => ({
  sourceType: 'post',
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

  test('文字起こし以外は300文字を許可し、301文字を拒否する', async () => {
    const log = logger();
    const accepted = await buildAnalysisSupplement({
      snapshot: snapshot({ targetLangs: [] }),
      providerOutput: '界'.repeat(300),
      logger: log,
    });
    const rejected = await buildAnalysisSupplement({
      snapshot: snapshot({ targetLangs: [] }),
      providerOutput: '界'.repeat(301),
      logger: log,
    });

    expect(accepted).not.toBeNull();
    expect(rejected).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      'AI_ANALYSIS_OUTPUT_INVALID',
      expect.objectContaining({ reason: 'provider_code_points' })
    );
  });

  test('文字起こし以外は接頭辞込みの400文字を保存し、401文字なら変更しない', async () => {
    const longLabel = 'T'.repeat(99);
    const baseSnapshot = snapshot({
      targetLangs: [],
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

    expect(atLimit.content).toHaveLength(400);
    expect(aboveLimit).toBeNull();
  });

  test('文字起こしはサロゲートペアを分割せず、省略記号付きで切り詰める', async () => {
    const log = logger();
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({ kind: 'speech', targetLangs: [], source: { _id: 'post-1', lang: 'ja' } }),
      providerOutput: `text${'😀'.repeat(300)}`,
      logger: log,
    });

    expect(value.content.length).toBeLessThanOrEqual(400);
    expect(value.content.endsWith('…')).toBe(true);
    const lastBeforeEllipsis = value.content.charCodeAt(value.content.length - 2);
    expect(lastBeforeEllipsis >= 0xd800 && lastBeforeEllipsis <= 0xdbff).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      'AI_ANALYSIS_OUTPUT_TRUNCATED',
      expect.objectContaining({ reason: 'base_utf16_units' })
    );
  });

  test('翻訳だけが上限を超えた場合はその翻訳を省き、有効な本文と他の翻訳を残す', async () => {
    const translateContent = jest.fn(async () => [
      { lang: 'en', content: 'x'.repeat(500) },
      { lang: 'fr-FR', content: 'court' },
    ]);
    const value = await buildAnalysisSupplement({
      snapshot: snapshot({
        kind: 'vision',
        source: { _id: 'post-1', lang: 'ja' },
      }),
      providerOutput: 'valid',
      translateContent,
      logger: logger(),
    });

    expect(value.content).toBe('#相談 valid');
    expect(value.translations).toEqual([
      expect.objectContaining({ lang: 'fr-FR', content: '#Conseil court' }),
    ]);
  });

  test('接頭辞付きの文字起こしを切り詰めてもサロゲートペアを分割しない', () => {
    const result = truncateSpeechWithPrefix({ label: 'T', text: '😀'.repeat(400) });
    const beforeEllipsis = result.slice(0, -1);
    const last = beforeEllipsis.charCodeAt(beforeEllipsis.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    expect(result.length).toBeLessThanOrEqual(400);
  });
});
