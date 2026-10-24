const mockGetGeminiConfig = jest.fn(() => ({
  apiKey: 'placeholder',
  models: { audioScene: 'test-gemini-audio-model' },
}));
jest.mock('../../../../config/featureFlags', () => ({
  getGeminiConfig: mockGetGeminiConfig,
}));

const mockGenerateContent = jest.fn();
const mockCreateGeminiGenerateClient = jest.fn(() => ({ generateContent: mockGenerateContent }));
jest.mock('../../../../integrations/gemini/generate.client', () => mockCreateGeminiGenerateClient);

const { LOW_LEVEL_NOTE_JA } = require('../../../../services/analysis/acousticProfile');
const {
  CATEGORIES,
  LOW_CONFIDENCE_NOTE_JA,
  NO_AUDIBLE_SOUND_JA,
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  USER_PROMPT,
  describeAudioSceneWithGemini,
  resetGeminiClientForTest,
} = require('../../../../services/analysis/audioSceneGemini');

const AUDIO = Buffer.from('synthetic encoded audio');
const media = (acousticProfile = { kind: 'unknown', lowLevel: false }) => ({
  audioBuffer: AUDIO, audioFileName: 'audio.mp3', acousticProfile,
});
const ok = (payload, extra = {}) => ({ text: JSON.stringify(payload), finishReason: 'STOP', blocked: false, ...extra });
const answer = (description, categories, audible = true) => ok({ description, categories, audible });
const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError', code: 'ABORT_ERR' });
const httpError = () => Object.assign(new Error('Gemini generateContent failed'), {
  httpStatus: 503, status: 503, type: 'UNAVAILABLE', requestId: 'req-fixture',
});

describe('Geminiによる音解析', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGeminiClientForTest();
    mockGetGeminiConfig.mockReturnValue({ apiKey: 'placeholder', models: { audioScene: 'test-gemini-audio-model' } });
  });

  test('同じ入力で2回並列に呼び、主要分類が一致すれば1回目の説明をそのまま返す', async () => {
    const controller = new AbortController();
    mockGenerateContent
      .mockResolvedValueOnce(answer('複数の人の話し声が聞こえます。', ['speech', 'other']))
      .mockResolvedValueOnce(answer('会話と足音が聞こえます。', ['speech', 'footsteps']));

    await expect(describeAudioSceneWithGemini({
      media: media(), additionalPrompt: 'trusted additional prompt', signal: controller.signal, logger: logger(),
    })).resolves.toBe('複数の人の話し声が聞こえます。');

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    for (const [request] of mockGenerateContent.mock.calls) {
      expect(request).toEqual({
        model: 'test-gemini-audio-model',
        systemInstruction: SYSTEM_INSTRUCTION,
        text: `${USER_PROMPT}\n\n説明と注記の合計は2000 UTF-16単位以内です。\n\ntrusted additional prompt`,
        audio: { buffer: AUDIO, mimeType: 'audio/mp3' },
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 2048,
        thinkingLevel: 'LOW',
        signal: controller.signal,
      });
    }
    expect(RESPONSE_SCHEMA.properties.categories.items.enum).toBe(CATEGORIES);
    expect(RESPONSE_SCHEMA.required).toEqual(['description', 'categories', 'audible']);
    expect(mockCreateGeminiGenerateClient).toHaveBeenCalledWith(mockGetGeminiConfig.mock.results[0].value);
  });

  test('クライアントはモジュール内で1回だけ生成し、テスト用リセットで再生成する', async () => {
    mockGenerateContent.mockResolvedValue(answer('雨音が聞こえます。', ['rain']));
    await describeAudioSceneWithGemini({ media: media(), logger: logger() });
    await describeAudioSceneWithGemini({ media: media(), logger: logger() });
    expect(mockGetGeminiConfig).toHaveBeenCalledTimes(1);
    expect(mockCreateGeminiGenerateClient).toHaveBeenCalledTimes(1);
    resetGeminiClientForTest();
    await describeAudioSceneWithGemini({ media: media(), logger: logger() });
    expect(mockCreateGeminiGenerateClient).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['先頭の主要分類が一致', ['speech', 'music'], ['speech', 'bird']],
    ['順序が違っても共通分類のJaccardが0.5以上', ['speech', 'music'], ['music', 'speech']],
    ['other・unclearを除いた先頭が一致', ['other', 'unclear', 'rain'], ['rain']],
  ])('%sなら注記を付けない', async (_label, first, second) => {
    mockGenerateContent
      .mockResolvedValueOnce(answer('一回目の説明。', first))
      .mockResolvedValueOnce(answer('二回目の説明。', second));
    await expect(describeAudioSceneWithGemini({ media: media(), logger: logger() })).resolves.toBe('一回目の説明。');
  });

  test.each([
    ['主要分類が交わらない', ['speech'], ['music']],
    ['共通分類があってもJaccardが0.5未満', ['speech', 'bird', 'wind'], ['bird']],
    ['一方がother・unclearだけ', ['speech'], ['other', 'unclear']],
  ])('%sなら1回目の説明に確度低の注記を付ける', async (_label, first, second) => {
    mockGenerateContent
      .mockResolvedValueOnce(answer('一回目の説明。', first))
      .mockResolvedValueOnce(answer('二回目の説明。', second));
    await expect(describeAudioSceneWithGemini({ media: media(), logger: logger() }))
      .resolves.toBe(`一回目の説明。${LOW_CONFIDENCE_NOTE_JA}`);
    expect(LOW_CONFIDENCE_NOTE_JA).toBe('この説明の確度は低く、聞き直すと別の音と判定されました。');
  });

  test('片方だけ失敗した場合は成功した説明に注記を付け、エラーログは出さない', async () => {
    const log = logger();
    mockGenerateContent
      .mockRejectedValueOnce(httpError())
      .mockResolvedValueOnce(answer('車の走行音が聞こえます。', ['vehicle']));
    await expect(describeAudioSceneWithGemini({ media: media(), logger: log }))
      .resolves.toBe(`車の走行音が聞こえます。${LOW_CONFIDENCE_NOTE_JA}`);
    expect(log.error).not.toHaveBeenCalled();
  });

  test('2回とも失敗した場合はサニタイズ済みの理由を記録し、説明なしの内部結果を返す', async () => {
    const log = logger();
    mockGenerateContent
      .mockRejectedValueOnce(Object.assign(httpError(), { privateBody: 'private fixture' }))
      .mockResolvedValueOnce({ text: 'not json: private transcript', finishReason: 'STOP', blocked: false });
    await expect(describeAudioSceneWithGemini({ media: media(), logger: log }))
      .resolves.toEqual({ status: 'no-description' });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('AI_ANALYSIS_PROVIDER_FAILED', {
      provider: 'gemini',
      kind: 'audioScene',
      attempts: [
        { reason: 'request_failed', error_code: null, error_type: 'UNAVAILABLE', http_status: 503, request_id: 'req-fixture' },
        { reason: 'invalid_json', error_code: null, error_type: null, http_status: null, request_id: null },
      ],
    });
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('private');
  });

  test.each([
    ['blocked', { text: '{"description":"話し声","categories":["speech"],"audible":true}', finishReason: 'STOP', blocked: true }],
    ['finishReasonがSTOP・MAX_TOKENS以外', ok({ description: '話し声', categories: ['speech'], audible: true }, { finishReason: 'RECITATION' })],
    ['JSON不正', { text: '{"description":', finishReason: 'STOP', blocked: false }],
    ['JSONが配列', { text: '["話し声"]', finishReason: 'STOP', blocked: false }],
    ['descriptionが空', answer('   ', ['speech'])],
    ['descriptionが非文字列', ok({ description: 123, categories: ['speech'], audible: true })],
    ['textが欠落', { finishReason: 'STOP', blocked: false }],
  ])('%sの応答は失敗扱いにする', async (_label, response) => {
    const log = logger();
    mockGenerateContent.mockResolvedValueOnce(response).mockResolvedValueOnce(response);
    await expect(describeAudioSceneWithGemini({ media: media(), logger: log })).resolves.toEqual({ status: 'no-description' });
    expect(log.error).toHaveBeenCalledWith('AI_ANALYSIS_PROVIDER_FAILED', expect.objectContaining({ provider: 'gemini' }));

    log.error.mockClear();
    mockGenerateContent.mockResolvedValueOnce(response).mockResolvedValueOnce(answer('有効な説明。', ['speech']));
    await expect(describeAudioSceneWithGemini({ media: media(), logger: log }))
      .resolves.toBe(`有効な説明。${LOW_CONFIDENCE_NOTE_JA}`);
    expect(log.error).not.toHaveBeenCalled();
  });

  test('コードフェンス付きのJSONは剥がして解釈し、改行は空白にする', async () => {
    mockGenerateContent
      .mockResolvedValueOnce(ok({ description: '鳥の鳴き声が\n聞こえます。', categories: ['bird'], audible: true }))
      .mockResolvedValueOnce({
        text: '```json\n{"description":"小鳥のさえずり。","categories":["bird"],"audible":true}\n```',
        finishReason: 'STOP',
        blocked: false,
      });
    await expect(describeAudioSceneWithGemini({ media: media(), logger: logger() })).resolves.toBe('鳥の鳴き声が 聞こえます。');
  });

  test.each([
    ['両方audible=false', answer('無音です。', ['noise_floor'], false), answer('何も聞こえません。', [], false)],
    ['両方の主要分類が空かnoise_floorだけ', answer('ノイズだけです。', ['noise_floor', 'unclear']), answer('静かです。', ['other'])],
  ])('%sなら創作を表示せず固定文に置き換える', async (_label, first, second) => {
    mockGenerateContent.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await expect(describeAudioSceneWithGemini({ media: media(), logger: logger() })).resolves.toBe(NO_AUDIBLE_SOUND_JA);
    expect(NO_AUDIBLE_SOUND_JA).toBe('はっきり聞き取れる音はありません。');
  });

  test('片方だけaudible=falseなら、音を説明した方の文に注記を付ける', async () => {
    mockGenerateContent
      .mockResolvedValueOnce(answer('遠くで犬が鳴いています。', ['animal']))
      .mockResolvedValueOnce(answer('聞き取れる音はありません。', ['animal'], false));
    await expect(describeAudioSceneWithGemini({ media: media(), logger: logger() }))
      .resolves.toBe(`遠くで犬が鳴いています。${LOW_CONFIDENCE_NOTE_JA}`);

    mockGenerateContent
      .mockResolvedValueOnce(answer('聞き取れる音はありません。', [], false))
      .mockResolvedValueOnce(answer('遠くで犬が鳴いています。', ['animal']));
    await expect(describeAudioSceneWithGemini({ media: media(), logger: logger() }))
      .resolves.toBe(`遠くで犬が鳴いています。${LOW_CONFIDENCE_NOTE_JA}`);
  });

  test('完結したJSONならfinishReasonがMAX_TOKENSでも採用する', async () => {
    mockGenerateContent
      .mockResolvedValueOnce(ok({ description: '雨の音が続いています。', categories: ['rain'], audible: true }, { finishReason: 'MAX_TOKENS' }))
      .mockResolvedValueOnce(answer('雨が降っています。', ['rain']));
    await expect(describeAudioSceneWithGemini({ media: media(), logger: logger() }))
      .resolves.toBe('雨の音が続いています。');
  });

  test('録音レベルが低い場合は説明の後に低レベルの注記を付ける', async () => {
    mockGenerateContent
      .mockResolvedValueOnce(answer('風の音が聞こえます。', ['wind']))
      .mockResolvedValueOnce(answer('風が吹いています。', ['wind']));
    await expect(describeAudioSceneWithGemini({
      media: media({ kind: 'unknown', peakDbfs: -58.2, rmsDbfs: -70.1, lowLevel: true }), logger: logger(),
    })).resolves.toBe(`風の音が聞こえます。${LOW_LEVEL_NOTE_JA}`);

    mockGenerateContent
      .mockResolvedValueOnce(answer('風の音が聞こえます。', ['wind']))
      .mockResolvedValueOnce(answer('話し声が聞こえます。', ['speech']));
    await expect(describeAudioSceneWithGemini({
      media: media({ kind: 'unknown', lowLevel: true }), logger: logger(),
    })).resolves.toBe(`風の音が聞こえます。${LOW_CONFIDENCE_NOTE_JA}${LOW_LEVEL_NOTE_JA}`);
  });

  test('注記込みで2000文字を超える説明は文末で切り、注記を残す', async () => {
    const sentence = `${'あ'.repeat(700)}。`;
    mockGenerateContent
      .mockResolvedValueOnce(answer(sentence.repeat(3), ['speech']))
      .mockResolvedValueOnce(answer('別の音。', ['music']));
    const text = await describeAudioSceneWithGemini({ media: media(), logger: logger() });
    expect(text).toBe(`${sentence.repeat(2)}${LOW_CONFIDENCE_NOTE_JA}`);
    expect(Array.from(text).length).toBeLessThanOrEqual(2000);
  });

  test('文末で収まらない長い説明は注記を優先して予算内に「…」付きで切る', async () => {
    mockGenerateContent
      .mockResolvedValueOnce(answer('😀'.repeat(1200), ['speech']))
      .mockResolvedValueOnce(answer('別の音。', ['music']));
    const text = await describeAudioSceneWithGemini({
      media: media({ kind: 'unknown', lowLevel: true }), logger: logger(),
    });
    expect(text.endsWith(`…${LOW_CONFIDENCE_NOTE_JA}${LOW_LEVEL_NOTE_JA}`)).toBe(true);
    expect(text).not.toMatch(/[\uD800-\uDBFF]…/);
    expect(Array.from(text).length).toBeLessThanOrEqual(2000);
  });

  test('注記なしで2000文字以内の説明は切らない', async () => {
    const description = `${'う'.repeat(1700)}。`;
    mockGenerateContent
      .mockResolvedValueOnce(answer(description, ['speech']))
      .mockResolvedValueOnce(answer('同じ音。', ['speech']));
    await expect(describeAudioSceneWithGemini({ media: media(), logger: logger() })).resolves.toBe(description);
  });

  test('中断はno-descriptionにせず伝播し、開始前の中断では呼び出さない', async () => {
    const log = logger();
    mockGenerateContent.mockRejectedValueOnce(abortError()).mockRejectedValueOnce(abortError());
    await expect(describeAudioSceneWithGemini({ media: media(), logger: log }))
      .rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(log.error).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    await expect(describeAudioSceneWithGemini({ media: media(), signal: controller.signal, logger: log }))
      .rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});
