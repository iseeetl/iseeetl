const mockModels = Object.freeze({
  vision: 'test-vision-model',
  video: 'test-video-model',
  audioScene: 'test-audio-model',
  conversation: 'test-conversation-model',
  speech: 'test-transcription-model',
});
const mockIsOpenAIAnalysisEnabled = jest.fn(() => false);
const mockGetOpenAIConfig = jest.fn(() => ({ apiKey: 'snapshot-openai-key', models: mockModels }));
jest.mock('../../../../config/featureFlags', () => ({
  getOpenAIConfig: mockGetOpenAIConfig,
  isOpenAIAnalysisEnabled: mockIsOpenAIAnalysisEnabled,
}));
jest.mock('../../../../integrations/openai/chat.client', () => jest.fn());
jest.mock('../../../../integrations/openai/audio.client', () => jest.fn());

const createOpenAIChatClient = require('../../../../integrations/openai/chat.client');
const createOpenAIAudioClient = require('../../../../integrations/openai/audio.client');
const {
  getOpenAIClients,
  resetOpenAIClientsForTest,
} = require('../../../../services/analysis/runtime');

describe('AI解析クライアントのモデル設定', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenAIClientsForTest();
    mockIsOpenAIAnalysisEnabled.mockReturnValue(false);
  });

  test('解析無効時はOpenAI クライアントを作成しない', () => {
    expect(getOpenAIClients()).toBeNull();
    expect(createOpenAIChatClient).not.toHaveBeenCalled();
    expect(createOpenAIAudioClient).not.toHaveBeenCalled();
  });

  test('解析有効時は起動時設定getterのAPI キーとモデルでクライアントを一度だけ作成する', () => {
    const chatClient = { kind: 'chat' };
    const audioClient = { kind: 'audio' };
    mockIsOpenAIAnalysisEnabled.mockReturnValue(true);
    createOpenAIChatClient.mockReturnValue(chatClient);
    createOpenAIAudioClient.mockReturnValue(audioClient);

    expect(getOpenAIClients()).toEqual({ openAIChat: chatClient, openAIAudio: audioClient, models: mockModels });
    expect(getOpenAIClients()).toEqual({ openAIChat: chatClient, openAIAudio: audioClient, models: mockModels });
    expect(mockGetOpenAIConfig).toHaveBeenCalledTimes(1);
    expect(createOpenAIChatClient).toHaveBeenCalledTimes(1);
    expect(createOpenAIChatClient).toHaveBeenCalledWith({ apiKey: 'snapshot-openai-key' });
    expect(createOpenAIAudioClient).toHaveBeenCalledTimes(1);
    expect(createOpenAIAudioClient).toHaveBeenCalledWith({ apiKey: 'snapshot-openai-key', model: 'test-transcription-model' });
  });
});
