const mockRunSourceAnalyses = jest.fn();

jest.mock('../../../services/analysis/executor.service', () => ({
  createAnalysisExecutor: jest.fn(() => ({ runSourceAnalyses: mockRunSourceAnalyses })),
}));

const analysisService = require('../../../services/analysis.service');

describe('AI解析の呼出処理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunSourceAnalyses.mockResolvedValue([]);
  });

  test('投稿1件の解析をAbortSignal付きで委譲する', async () => {
    const signal = new AbortController().signal;
    await analysisService.runPostAnalyses({
      chatId: 'post-1',
      targetLangs: ['en'],
      io: 'io',
      mediaPath: '/media',
      signal,
    });

    expect(mockRunSourceAnalyses).toHaveBeenCalledWith({
      chatId: 'post-1',
      sourceType: 'post',
      io: 'io',
      mediaPath: '/media',
      signal,
    });
  });

  test('返信1件の解析をAbortSignal付きで委譲する', async () => {
    const signal = new AbortController().signal;
    await analysisService.runReplyAnalyses({
      chatId: 'post-1',
      replyId: 'reply-1',
      io: 'io',
      mediaPath: '/media',
      signal,
    });

    expect(mockRunSourceAnalyses).toHaveBeenCalledWith({
      chatId: 'post-1',
      sourceType: 'reply',
      replyId: 'reply-1',
      io: 'io',
      mediaPath: '/media',
      signal,
    });
  });
});
