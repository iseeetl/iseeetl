const AppError = require('../../../utils/appError');
const { MAX_SUPPLEMENT_UTF16_UNITS } = require('../../../constants/contentLimits');

// 作成・編集とも、付加情報の出所にかかわらず同じ上限。
const assertSupplementContentLimit = (patch) => {
  if (patch.content === undefined || patch.content === null) return;
  const limit = MAX_SUPPLEMENT_UTF16_UNITS;
  if (typeof patch.content !== 'string' || patch.content.length > limit) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
};
module.exports = { assertSupplementContentLimit };
