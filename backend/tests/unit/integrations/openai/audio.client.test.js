jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn(() => '__read_stream__'),
}));
jest.mock('form-data', () =>
  jest.fn().mockImplementation(() => {
    const entries = [];
    return {
      append: jest.fn((name, value, options) => entries.push({ name, value, options })),
      getHeaders: jest.fn(() => ({ 'content-type': 'multipart/form-data; boundary=fixture' })),
      __entries: entries,
    };
  })
);

const path = require('path');
const axios = require('axios');
const fs = require('fs');
const createOpenAIAudioClient = require('../../../../integrations/openai/audio.client');

const AUDIO_FILE_PATH = path.join(process.cwd(), 'fixtures', 'audio.mp3');

describe('OpenAIの音声クライアント', () => {
  beforeEach(() => jest.clearAllMocks());

  test('apiKeyを必須とする', () => {
    expect(() => createOpenAIAudioClient()).toThrow(/required/i);
  });

  test.each([undefined, '', '   '])('モデル未設定・空値を拒否する: %s', (model) => {
    expect(() => createOpenAIAudioClient({ apiKey: 'dummy-key', model }))
      .toThrow('OpenAI transcription model is required');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('MP3 Bufferを指定モデルで1回だけ送信しプロンプトとsignalを渡す', async () => {
    const client = createOpenAIAudioClient({
      apiKey: 'dummy-key',
      model: 'test-transcription-model',
      baseURL: 'https://example.com/v1',
      timeout: 9876,
    });
    const controller = new AbortController();
    axios.post.mockResolvedValue({ data: { text: 'transcript' } });

    await expect(
      client.transcribeFromBuffer({
        buffer: Buffer.from('fixture-audio'),
        mimetype: 'audio/mpeg',
        filename: 'audio.mp3',
        language: 'ja',
        prompt: '追加指示',
        signal: controller.signal,
      })
    ).resolves.toBe('transcript');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, form, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://example.com/v1/audio/transcriptions');
    expect(config).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer dummy-key' }),
      maxBodyLength: Infinity,
      signal: controller.signal,
      timeout: 9876,
    });
    expect(form.__entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'file',
          options: { filename: 'audio.mp3', contentType: 'audio/mpeg' },
        }),
        { name: 'model', value: 'test-transcription-model', options: undefined },
        { name: 'language', value: 'ja', options: undefined },
        { name: 'prompt', value: '追加指示', options: undefined },
      ])
    );
  });

  test('空bufferをHTTP送信前に拒否する', async () => {
    const client = createOpenAIAudioClient({ apiKey: 'dummy-key', model: 'test-transcription-model' });
    await expect(client.transcribeFromBuffer({ buffer: Buffer.alloc(0) })).rejects.toThrow('buffer is required');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('処理開始前の中断をAbortErrorとして扱う', async () => {
    const client = createOpenAIAudioClient({ apiKey: 'dummy-key', model: 'test-transcription-model' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.transcribeFromBuffer({ buffer: Buffer.from('fixture'), signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('外部サービスのエラーに含まれる秘密情報を除外し、再試行しない', async () => {
    const client = createOpenAIAudioClient({ apiKey: 'dummy-key', model: 'test-transcription-model' });
    axios.post.mockRejectedValue({
      response: { status: 500, data: { error: { message: 'provider failed' } } },
      config: { headers: { Authorization: 'Bearer should-not-leak' }, data: 'private audio' },
    });

    const error = await client
      .transcribeFromBuffer({ buffer: Buffer.from('fixture') })
      .catch((caught) => caught);
    expect(error).toMatchObject({ message: 'OpenAI transcription failed', status: 500 });
    expect(error).not.toHaveProperty('cause');
    expect(error.message).not.toContain('provider failed');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('ファイルパス APIも指定モデルで送信する', async () => {
    const client = createOpenAIAudioClient({ apiKey: 'dummy-key', model: 'test-transcription-model' });
    fs.existsSync.mockReturnValue(true);
    axios.post.mockResolvedValue({ data: { text: 'fixture' } });
    await client.transcribeFromFilePath({
      filePath: AUDIO_FILE_PATH,
      language: 'en',
    });
    expect(fs.createReadStream).toHaveBeenCalledWith(AUDIO_FILE_PATH);
    const form = axios.post.mock.calls[0][1];
    expect(form.__entries).toEqual(
      expect.arrayContaining([{ name: 'model', value: 'test-transcription-model', options: undefined }])
    );

  });

  test.each([
    ['audio/webm', 'voice.webm', 'audio/webm'],
    ['audio/ogg', 'voice.ogg', 'audio/ogg'],
    ['audio/aac', 'voice.aac', 'audio/aac'],
    ['audio/mp4', 'voice.mp4', 'audio/mp4'],
    ['audio/x-m4a', 'voice.m4a', 'audio/x-m4a'],
    ['audio/wav', 'voice.wav', 'audio/wav'],
  ])('通常文字起こしの既存MIMEを維持する: %s', async (mimetype, filename, contentType) => {
    const client = createOpenAIAudioClient({ apiKey: 'dummy-key', model: 'test-transcription-model' });
    axios.post.mockResolvedValue({ data: { text: 'fixture' } });
    await client.transcribeFromBuffer({
      buffer: Buffer.from('fixture'),
      mimetype,
      filename,
    });
    const form = axios.post.mock.calls[0][1];
    expect(form.__entries.find((entry) => entry.name === 'file').options).toEqual({
      filename,
      contentType,
    });
  });
});
