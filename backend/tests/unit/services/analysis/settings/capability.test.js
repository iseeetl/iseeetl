const mockIsOpenAIAnalysisEnabled = jest.fn();

jest.mock('../../../../../config/featureFlags', () => ({
  isOpenAIAnalysisEnabled: mockIsOpenAIAnalysisEnabled,
}));

const {
  isAIAnalysisExecutionEnabled,
} = require('../../../../../services/analysis/settings/capability');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AI解析の利用可否', () => {
  test.each([
    [true, true],
    [false, false],
  ])('OpenAIの有効フラグが%sなら%sを返す', (featureEnabled, expected) => {
      mockIsOpenAIAnalysisEnabled.mockReturnValue(featureEnabled);

      expect(isAIAnalysisExecutionEnabled()).toBe(expected);
      expect(mockIsOpenAIAnalysisEnabled).toHaveBeenCalledTimes(1);
    });
});
