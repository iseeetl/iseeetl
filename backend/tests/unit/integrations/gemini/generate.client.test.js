jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const createGeminiGenerateClient = require('../../../../integrations/gemini/generate.client');

const AUDIO = Buffer.from('synthetic encoded audio');
const SCHEMA = { type: 'OBJECT', properties: { description: { type: 'STRING' } }, required: ['description'] };

const successResponse = (parts, finishReason = 'STOP', extra = {}) => ({
  data: { candidates: [{ content: { parts }, finishReason }], ...extra },
});

describe('Geminiの生成クライアント', () => {
  beforeEach(() => jest.clearAllMocks());

  test('apiKeyを必須とする', () => {
    expect(() => createGeminiGenerateClient()).toThrow(/required/i);
  });

  test('指定モデルへ音声・指示・応答スキーマを1回だけ送り、思考部分を除いた本文を返す', async () => {
    const client = createGeminiGenerateClient({
      apiKey: 'dummy',
      baseURL: 'https://example.invalid/v1beta',
      timeout: 4321,
    });
    const controller = new AbortController();
    axios.post.mockResolvedValue(successResponse([
      { text: 'internal thought', thought: true },
      { text: '{"description":' },
      { text: '"話し声"}' },
      { inlineData: { mimeType: 'image/png', data: 'ignored' } },
    ]));

    await expect(client.generateContent({
      model: 'test-gemini-model',
      systemInstruction: 'system fixture',
      text: 'prompt fixture',
      audio: { buffer: AUDIO, mimeType: 'audio/mp3' },
      responseSchema: SCHEMA,
      maxOutputTokens: 512,
      signal: controller.signal,
    })).resolves.toEqual({ text: '{"description":"話し声"}', finishReason: 'STOP', blocked: false });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      'https://example.invalid/v1beta/models/test-gemini-model:generateContent',
      {
        systemInstruction: { parts: [{ text: 'system fixture' }] },
        contents: [{
          role: 'user',
          parts: [
            { text: 'prompt fixture' },
            { inlineData: { mimeType: 'audio/mp3', data: AUDIO.toString('base64') } },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
        },
      },
      {
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'dummy' },
        timeout: 4321,
        signal: controller.signal,
      }
    );
  });

  test('responseSchemaを省略した場合はresponseMimeTypeも付けず、thinkingLevelを指定できる', async () => {
    const client = createGeminiGenerateClient({ apiKey: 'dummy' });
    axios.post.mockResolvedValue(successResponse([{ text: 'plain' }]));

    await client.generateContent({
      model: 'test-gemini-model',
      text: 'prompt fixture',
      audio: { buffer: AUDIO, mimeType: 'audio/mp3' },
      thinkingLevel: 'MEDIUM',
    });

    const [url, body, options] = axios.post.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/test-gemini-model:generateContent');
    expect(body).not.toHaveProperty('systemInstruction');
    expect(body.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'MEDIUM', includeThoughts: false } });
    expect(options.timeout).toBe(20000);
  });

  test.each([
    ['promptFeedback.blockReason', successResponse([{ text: '' }], 'STOP', { promptFeedback: { blockReason: 'SAFETY' } })],
    ['finishReason SAFETY', successResponse([{ text: '一部' }], 'SAFETY')],
    ['finishReason PROHIBITED_CONTENT', successResponse([], 'PROHIBITED_CONTENT')],
  ])('%sはblockedとして返す', async (_label, response) => {
    const client = createGeminiGenerateClient({ apiKey: 'dummy' });
    axios.post.mockResolvedValue(response);
    const result = await client.generateContent({ model: 'm', text: 'prompt', audio: { buffer: AUDIO, mimeType: 'audio/mp3' } });
    expect(result.blocked).toBe(true);
  });

  test('候補のない応答は空文字とnullのfinishReasonを返す', async () => {
    const client = createGeminiGenerateClient({ apiKey: 'dummy' });
    axios.post.mockResolvedValue({ data: {} });
    await expect(client.generateContent({ model: 'm', text: 'prompt' }))
      .resolves.toEqual({ text: '', finishReason: null, blocked: false });
  });

  test('モデルと本文を必須とし、不正な音声入力を送信前に拒否する', async () => {
    const client = createGeminiGenerateClient({ apiKey: 'dummy' });
    await expect(client.generateContent({ text: 'prompt' })).rejects.toThrow('model is required');
    await expect(client.generateContent({ model: 'm' })).rejects.toThrow('text is required');
    await expect(client.generateContent({ model: 'm', text: 'prompt', audio: { buffer: Buffer.alloc(0), mimeType: 'audio/mp3' } }))
      .rejects.toThrow('audio input is invalid');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('処理開始前に中断された場合はHTTPリクエストを作らずAbortErrorを返す', async () => {
    const client = createGeminiGenerateClient({ apiKey: 'dummy' });
    const controller = new AbortController();
    controller.abort();
    await expect(client.generateContent({ model: 'm', text: 'prompt', signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('axiosの中断を機密情報を含まないAbortErrorへ変換する', async () => {
    const client = createGeminiGenerateClient({ apiKey: 'dummy' });
    axios.post.mockRejectedValue({ code: 'ERR_CANCELED', config: { data: 'private fixture' } });
    const error = await client.generateContent({ model: 'm', text: 'prompt' }).catch((caught) => caught);
    expect(error).toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toContain('private');
  });

  test.each([
    [429, 'RESOURCE_EXHAUSTED'],
    [503, 'UNAVAILABLE'],
  ])('HTTP %sのエラーは固定項目だけを保持し、キーと本文を含めず再試行しない', async (status, apiStatus) => {
    const client = createGeminiGenerateClient({ apiKey: 'dummy' });
    axios.post.mockRejectedValue({
      message: 'Request failed with private details',
      response: {
        status,
        headers: { 'x-goog-request-id': 'req-fixture' },
        data: { error: { code: status, message: 'private provider message', status: apiStatus } },
      },
      config: {
        headers: { 'x-goog-api-key': 'dummy' },
        data: JSON.stringify({ contents: [{ parts: [{ text: 'private prompt' }] }] }),
      },
    });

    const error = await client
      .generateContent({ model: 'm', text: 'private prompt', audio: { buffer: AUDIO, mimeType: 'audio/mp3' } })
      .catch((caught) => caught);
    expect(error).toMatchObject({
      message: 'Gemini generateContent failed',
      httpStatus: status,
      status,
      type: apiStatus,
      code: status,
      requestId: 'req-fixture',
    });
    expect(error).not.toHaveProperty('cause');
    expect(error).not.toHaveProperty('response');
    expect(error).not.toHaveProperty('config');
    const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
    expect(serialized).not.toContain('dummy');
    expect(serialized).not.toContain('private');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('HTTP応答のない通信失敗はhttpStatusをnullにし、安全なcodeだけを残す', async () => {
    const client = createGeminiGenerateClient({ apiKey: 'dummy' });
    axios.post.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' });
    const error = await client.generateContent({ model: 'm', text: 'prompt' }).catch((caught) => caught);
    expect(error).toMatchObject({ message: 'Gemini generateContent failed', httpStatus: null, status: 500, code: 'ECONNABORTED' });
    expect(error).not.toHaveProperty('type');
  });

  test('外部サービスの診断情報が安全な文字列でなければエラーに含めない', async () => {
    const client = createGeminiGenerateClient({ apiKey: 'dummy' });
    axios.post.mockRejectedValue({
      response: {
        status: 400,
        headers: { 'x-goog-request-id': 'private input fragment with spaces' },
        data: { error: { code: 'private code: hello world', message: 'private', status: 'private status with spaces' } },
      },
    });
    const error = await client.generateContent({ model: 'm', text: 'prompt' }).catch((caught) => caught);
    expect(error).toMatchObject({ message: 'Gemini generateContent failed', httpStatus: 400 });
    expect(error).not.toHaveProperty('type');
    expect(error).not.toHaveProperty('code');
    expect(error).not.toHaveProperty('requestId');
  });
});
