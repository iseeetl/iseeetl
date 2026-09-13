const mockAudioClient = {
  transcribeFromBuffer: jest.fn(),
};

jest.mock('../../../../integrations/openai/audio.client', () => jest.fn(() => mockAudioClient));
jest.mock('../../../../services/room/roomAccess.service', () => ({
  authorizeRoomAccess: jest.fn(),
}));
const mockIsOpenAITranscriptionEnabled = jest.fn(() => true);
const mockGetOpenAIConfig = jest.fn(() => ({ apiKey: 'test-openai-key', models: { speech: 'test-transcription-model' } }));
jest.mock('../../../../config/featureFlags', () => ({
  getOpenAIConfig: mockGetOpenAIConfig,
  isOpenAITranscriptionEnabled: mockIsOpenAITranscriptionEnabled,
}));

const AppError = require('../../../../utils/appError');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');

const service = require('../../../../services/timeline/transcription.service');

describe('transcriptionのサービス', () => {
  const ORIGINAL_ENV = process.env;
  const access = {
    foundUser: { _id: 'u1', username: 'U', delete_flg: false },
    foundRoom: { _id: 'r1', floor: 'f1', title: 'R', delete_flg: false },
    foundFloor: { _id: 'f1', title: 'F', delete_flg: false },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOpenAITranscriptionEnabled.mockReturnValue(true);
    mockGetOpenAIConfig.mockReturnValue({ apiKey: 'test-openai-key', models: { speech: 'test-transcription-model' } });
    process.env = { ...ORIGINAL_ENV, OPENAI_API_KEY: 'test-openai-key' };
    authorizeRoomAccess.mockResolvedValue(access);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('ユーザ不在は 401', async () => {
    authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'INVALID_PERMISSION' }));

    const p = service.transcribeBuffer(
      { buffer: Buffer.from('a'), mimetype: 'audio/wav', originalname: 'a.wav' },
      { room_id: 'r1' },
      { user_id: 'u1', user_role: 'Author' }
    );

    await expect(p).rejects.toBeInstanceOf(AppError);
    await expect(p).rejects.toHaveProperty('status', 401);
    expect(mockAudioClient.transcribeFromBuffer).not.toHaveBeenCalled();
  });

  test('ルーム不在は 400', async () => {
    authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));

    const p = service.transcribeBuffer(
      { buffer: Buffer.from('a'), mimetype: 'audio/wav', originalname: 'a.wav' },
      { room_id: 'r1' },
      { user_id: 'u1', user_role: 'Author' }
    );

    await expect(p).rejects.toBeInstanceOf(AppError);
    await expect(p).rejects.toHaveProperty('status', 400);
  });

  test('フロア不在は 400', async () => {
    authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));

    const p = service.transcribeBuffer(
      { buffer: Buffer.from('a'), mimetype: 'audio/wav', originalname: 'a.wav' },
      { room_id: 'r1' },
      { user_id: 'u1', user_role: 'Author' }
    );

    await expect(p).rejects.toBeInstanceOf(AppError);
    await expect(p).rejects.toHaveProperty('status', 400);
  });

  test('ルームアクセス拒否時は外部APIへ到達しない', async () => {
    authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'INVALID_PERMISSION' }));

    await expect(
      service.transcribeBuffer(
        { buffer: Buffer.from('a'), mimetype: 'audio/wav', originalname: 'a.wav' },
        { room_id: 'r1', lang: 'ja' },
        { user_id: 'u1', user_role: 'Author' }
      )
    ).rejects.toHaveProperty('status', 401);

    expect(mockAudioClient.transcribeFromBuffer).not.toHaveBeenCalled();
  });

  test('文字起こし結果を返す', async () => {
    mockAudioClient.transcribeFromBuffer.mockResolvedValue('ok');

    const res = await service.transcribeBuffer(
      { buffer: Buffer.from('a'), mimetype: 'audio/wav', originalname: 'a.wav' },
      { room_id: 'r1', lang: 'ja' },
      { user_id: 'u1', user_role: 'Author' }
    );

    expect(authorizeRoomAccess).toHaveBeenCalledWith('u1', 'Author', 'r1', {
      errors: {
        user: { code: 'INVALID_PERMISSION' },
        room: { code: 'INVALID_PARAMS' },
        floor: { code: 'INVALID_PARAMS' },
        kicked: { code: 'INVALID_PERMISSION' },
        permission: { code: 'INVALID_PERMISSION' },
      },
    });
    expect(mockAudioClient.transcribeFromBuffer).toHaveBeenCalledWith({
      buffer: expect.any(Buffer),
      mimetype: 'audio/wav',
      filename: 'a.wav',
      language: 'ja',
    });
    expect(require('../../../../integrations/openai/audio.client')).toHaveBeenCalledWith({
      apiKey: 'test-openai-key',
      model: 'test-transcription-model',
    });
    expect(res).toBe('ok');
  });

  test('外部API失敗は AppError に変換される', async () => {
    mockAudioClient.transcribeFromBuffer.mockRejectedValue(Object.assign(new Error('fail'), { status: 503 }));

    const p = service.transcribeBuffer(
      { buffer: Buffer.from('a'), mimetype: 'audio/wav', originalname: 'a.wav' },
      { room_id: 'r1' },
      { user_id: 'u1', user_role: 'Author' }
    );

    await expect(p).rejects.toBeInstanceOf(AppError);
    await expect(p).rejects.toHaveProperty('status', 500);
  });

  test('文字起こし無効時は認可DB・外部サービス・利用記録より前に共通503となる', async () => {
    mockIsOpenAITranscriptionEnabled.mockReturnValue(false);

    const p = service.transcribeBuffer(
      { buffer: Buffer.from('a'), mimetype: 'audio/wav', originalname: 'a.wav' },
      { room_id: 'r1' },
      { user_id: 'u1', user_role: 'Author' }
    );

    await expect(p).rejects.toBeInstanceOf(AppError);
    await expect(p).rejects.toHaveProperty('code', 'EXTERNAL_FEATURE_DISABLED');
    await expect(p).rejects.toHaveProperty('status', 503);
    await expect(p).rejects.toHaveProperty('details', { feature: 'openaiTranscription' });
    expect(authorizeRoomAccess).not.toHaveBeenCalled();
    expect(mockAudioClient.transcribeFromBuffer).not.toHaveBeenCalled();
  });
});
