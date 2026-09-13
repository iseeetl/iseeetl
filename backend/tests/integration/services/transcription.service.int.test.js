const { OPENAI_MODEL_ENV } = require('../../_helpers/openai');
const ORIGINAL_ENV = {
  ...Object.fromEntries(Object.keys(OPENAI_MODEL_ENV).map((name) => [name, process.env[name]])),
  EXTERNAL_OPENAI_ENABLED: process.env.EXTERNAL_OPENAI_ENABLED,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

Object.assign(process.env, OPENAI_MODEL_ENV);
process.env.EXTERNAL_OPENAI_ENABLED = 'true';
if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'test-openai-key';

const mockTranscribeFromBuffer = jest.fn();

jest.mock('../../../integrations/openai/audio.client', () =>
  jest.fn(() => ({
    transcribeFromBuffer: mockTranscribeFromBuffer,
  }))
);

const transcriptionService = require('../../../services/timeline/transcription.service');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');

describe('文字起こしサービスの結合動作', () => {
  afterAll(() => {
    Object.keys(OPENAI_MODEL_ENV).forEach((name) => {
      if (ORIGINAL_ENV[name] === undefined) delete process.env[name];
      else process.env[name] = ORIGINAL_ENV[name];
    });
    if (ORIGINAL_ENV.EXTERNAL_OPENAI_ENABLED === undefined) delete process.env.EXTERNAL_OPENAI_ENABLED;
    else process.env.EXTERNAL_OPENAI_ENABLED = ORIGINAL_ENV.EXTERNAL_OPENAI_ENABLED;
    if (ORIGINAL_ENV.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;
  });

  beforeEach(() => {
    mockTranscribeFromBuffer.mockReset();
  });

  test('音声データをOpenAIクライアントへ送り、文字起こし結果を返す', async () => {
    mockTranscribeFromBuffer.mockResolvedValueOnce('hello');

    const user = await User.create({
      username: 'Speaker',
      mail: `speaker-${Date.now()}@example.com`,
      lang: 'ja',
    });
    const floor = await Floor.create({
      user: user._id,
      title: 'Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: user._id,
      floor: floor._id,
      title: 'Room',
      lang: 'ja',
    });

    const file = {
      buffer: Buffer.from('audio'),
      mimetype: 'audio/wav',
      originalname: 'voice.wav',
    };

    const text = await transcriptionService.transcribeBuffer(
      file,
      { room_id: room._id.toString(), lang: 'en' },
      { user_id: user._id.toString() }
    );

    expect(text).toBe('hello');
    expect(mockTranscribeFromBuffer).toHaveBeenCalledTimes(1);
    expect(mockTranscribeFromBuffer.mock.calls[0][0]).toEqual({
      buffer: file.buffer,
      mimetype: file.mimetype,
      filename: file.originalname,
      language: 'en',
    });
  });

  test('OpenAIのエラーをAppErrorのコードへ変換する', async () => {
    mockTranscribeFromBuffer.mockRejectedValueOnce(Object.assign(new Error('rate limit'), { status: 429 }));

    const user = await User.create({
      username: 'Speaker2',
      mail: `speaker2-${Date.now()}@example.com`,
      lang: 'ja',
    });
    const floor = await Floor.create({
      user: user._id,
      title: 'Floor2',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: user._id,
      floor: floor._id,
      title: 'Room2',
      lang: 'ja',
    });

    const file = {
      buffer: Buffer.from('audio'),
      mimetype: 'audio/wav',
      originalname: 'voice.wav',
    };

    await expect(
      transcriptionService.transcribeBuffer(
        file,
        { room_id: room._id.toString(), lang: 'en' },
        { user_id: user._id.toString() }
      )
    ).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });
});
