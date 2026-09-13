const { isOpenAIAnalysisEnabled } = require('../../../config/featureFlags');

const isAIAnalysisExecutionEnabled = () => isOpenAIAnalysisEnabled();

module.exports = { isAIAnalysisExecutionEnabled };
