jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const createOpenAIChatClient = require('../../../../integrations/openai/chat.client');

describe('OpenAIのチャットクライアント', () => {
  beforeEach(() => jest.clearAllMocks());

  test('apiKeyを必須とする', () => {
    expect(() => createOpenAIChatClient()).toThrow(/required/i);
  });

  test('指定モデルでタイムアウトとAbortSignalを付け、1回だけChat Completionsへ送る', async () => {
    const client = createOpenAIChatClient({
      apiKey: 'dummy-key',
      baseURL: 'https://example.com/v1',
      timeout: 4321,
    });
    const controller = new AbortController();
    const messages = [{ role: 'user', content: 'fixture input' }];
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'fixture output' } }] } });

    await expect(
      client.chatCompletions({
        model: 'gpt-4.1-mini-2025-04-14',
        messages,
        max_completion_tokens: 500,
        modalities: ['text'],
        signal: controller.signal,
      })
    ).resolves.toBe('fixture output');

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      'https://example.com/v1/chat/completions',
      {
        model: 'gpt-4.1-mini-2025-04-14',
        messages,
        max_completion_tokens: 500,
        modalities: ['text'],
      },
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer dummy-key',
        },
        signal: controller.signal,
        timeout: 4321,
      })
    );
  });

  test('モデルとmessagesを必須とする', async () => {
    const client = createOpenAIChatClient({ apiKey: 'dummy-key' });
    await expect(client.chatCompletions({ messages: [] })).rejects.toThrow('model is required');
    await expect(
      client.chatCompletions({ model: 'gpt-4.1-mini-2025-04-14' })
    ).rejects.toThrow('messages are required');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('処理開始前に中断された場合はHTTPリクエストを作らずAbortErrorを返す', async () => {
    const client = createOpenAIChatClient({ apiKey: 'dummy-key' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.chatCompletions({
        model: 'gpt-4.1-mini-2025-04-14',
        messages: [],
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('axiosの中断を機密情報を含まないAbortErrorへ変換する', async () => {
    const client = createOpenAIChatClient({ apiKey: 'dummy-key' });
    axios.post.mockRejectedValue({ code: 'ERR_CANCELED', config: { data: 'private fixture' } });

    const error = await client
      .chatCompletions({ model: 'gpt-4.1-mini-2025-04-14', messages: [] })
      .catch((caught) => caught);
    expect(error).toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(error).not.toHaveProperty('cause');
  });

  test('外部サービスエラーは必要な固定項目だけを保持し再試行しない', async () => {
    const client = createOpenAIChatClient({ apiKey: 'dummy-key' });
    axios.post.mockRejectedValue({
      response: {
        status: 429,
        headers: { 'x-request-id': 'req-fixture' },
        data: {
          error: {
            message: 'Rate limit',
            type: 'rate_limit_error',
            code: 'rate_limit_exceeded',
            param: 'model',
          },
        },
      },
      config: { headers: { Authorization: 'Bearer should-not-leak' } },
    });

    const error = await client
      .chatCompletions({ model: 'gpt-4.1-mini-2025-04-14', messages: [] })
      .catch((caught) => caught);
    expect(error).toMatchObject({
      message: 'OpenAI chat failed',
      status: 429,
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
      param: 'model',
      requestId: 'req-fixture',
    });
    expect(error).not.toHaveProperty('cause');
    expect(error.message).not.toContain('Rate limit');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('外部サービスの診断情報が安全な文字列でなければエラーに含めない', async () => {
    const client = createOpenAIChatClient({ apiKey: 'dummy-key' });
    axios.post.mockRejectedValue({
      response: {
        status: 400,
        headers: { 'x-request-id': 'private input fragment with spaces' },
        data: {
          error: {
            message: 'private provider message',
            type: 'private type with spaces',
            code: 'private input: hello world',
            param: 'messages[0].content=private',
          },
        },
      },
    });
    const error = await client
      .chatCompletions({ model: 'gpt-4.1-mini-2025-04-14', messages: [] })
      .catch((caught) => caught);
    expect(error).toMatchObject({ message: 'OpenAI chat failed', status: 400 });
    expect(error).not.toHaveProperty('type');
    expect(error).not.toHaveProperty('code');
    expect(error).not.toHaveProperty('param');
    expect(error).not.toHaveProperty('requestId');
  });
});
