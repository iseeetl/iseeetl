const http = require('node:http');
const { once } = require('node:events');
const createChatClient = require('../../../integrations/openai/chat.client');
const createAudioClient = require('../../../integrations/openai/audio.client');

describe('OpenAIクライアントとHTTP送信の結合動作', () => {
  let server;
  let baseURL;
  let received;
  let response;
  const originalNoProxy = { NO_PROXY: process.env.NO_PROXY, no_proxy: process.env.no_proxy };

  beforeAll(async () => {
    // ダミーAPIへの通信をループバック内に閉じ、開発環境のプロキシへ送らない。
    process.env.NO_PROXY = '127.0.0.1';
    process.env.no_proxy = '127.0.0.1';
    server = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      received = {
        method: req.method,
        path: req.url,
        contentType: req.headers['content-type'],
        authorized: req.headers.authorization === 'Bearer public-test-key',
        body: Buffer.concat(chunks).toString('utf8'),
      };
      res.writeHead(response.status, {
        'Content-Type': 'application/json',
        'x-request-id': 'fixture-request',
      });
      res.end(JSON.stringify(response.body));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  });

  beforeEach(() => {
    received = null;
    response = { status: 200, body: {} };
  });

  afterAll(async () => {
    try {
      if (server?.listening) await new Promise((resolve) => server.close(resolve));
    } finally {
      for (const [key, value] of Object.entries(originalNoProxy)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('チャット要求をJSONで送り、Axios経由で生成結果を受け取る', async () => {
    response.body = { choices: [{ message: { content: 'fixture answer' } }] };
    const client = createChatClient({ apiKey: 'public-test-key', baseURL });
    const messages = [{ role: 'user', content: 'fixture question' }];

    await expect(client.chatCompletions({ model: 'fixture-model', messages })).resolves.toBe(
      'fixture answer'
    );
    expect(received).toMatchObject({
      method: 'POST',
      path: '/v1/chat/completions',
      authorized: true,
    });
    expect(received.contentType).toMatch(/^application\/json/);
    expect(JSON.parse(received.body)).toEqual({ model: 'fixture-model', messages });
  });

  test('音声要求の境界文字列・ファイル・モデルをmultipart形式でAxios経由で送る', async () => {
    response.body = { text: 'fixture transcript' };
    const client = createAudioClient({
      apiKey: 'public-test-key',
      model: 'fixture-transcription',
      baseURL,
    });

    await expect(
      client.transcribeFromBuffer({ buffer: Buffer.from('fixture audio'), filename: 'fixture.mp3' })
    ).resolves.toBe('fixture transcript');
    expect(received).toMatchObject({
      method: 'POST',
      path: '/v1/audio/transcriptions',
      authorized: true,
    });
    expect(received.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const boundary = received.contentType.split('boundary=')[1];
    expect(received.body).toContain(`--${boundary}\r\n`);
    expect(received.body).toContain('name="file"; filename="fixture.mp3"');
    expect(received.body).toContain('Content-Type: audio/mpeg');
    expect(received.body).toContain('fixture audio');
    expect(received.body).toContain('name="model"\r\n\r\nfixture-transcription');
    expect(received.body).toContain(`--${boundary}--`);
  });

  test('HTTPエラーは診断に必要な情報だけを保持し、Axiosのリクエストを公開しない', async () => {
    response = { status: 429, body: { error: { type: 'rate_limit_error', code: 'rate_limit' } } };
    const client = createChatClient({ apiKey: 'public-test-key', baseURL });
    let failure;
    try {
      await client.chatCompletions({ model: 'fixture-model', messages: [] });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      message: 'OpenAI chat failed',
      status: 429,
      type: 'rate_limit_error',
      code: 'rate_limit',
      requestId: 'fixture-request',
    });
    expect(failure).not.toHaveProperty('config');
    expect(failure).not.toHaveProperty('request');
    expect(failure).not.toHaveProperty('response');
  });
});
