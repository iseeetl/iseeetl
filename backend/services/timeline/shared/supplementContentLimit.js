const AppError = require('../../../utils/appError');
const { MAX_CONVERSATION_UTF16_UNITS } = require('../../analysis/conversationBudget');

// HTTPの自己申告ではなく、認可後にDBから得たAI由来を使う。
const assertSupplementContentLimit = (patch, current) => {
  if (patch.content === undefined || patch.content === null) return;
  const limit = current?.meta?.analysis_kind === 'conversation' ? MAX_CONVERSATION_UTF16_UNITS : 400;
  if (typeof patch.content !== 'string' || patch.content.length > limit) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
};
module.exports = { assertSupplementContentLimit };
