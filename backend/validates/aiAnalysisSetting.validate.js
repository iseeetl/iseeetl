const { body } = require('express-validator');
const {
  ANALYSIS_KINDS,
  MAX_ADDITIONAL_PROMPT_BYTES,
  MAX_ADDITIONAL_PROMPT_CODE_POINTS,
  MAX_SPEECH_PROMPT_BYTES,
} = require('../constants/aiAnalysisSettings');

const validateAllowedBodyFields = (allowedFields) =>
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.keys(value).every((key) => allowedFields.includes(key));
  });

const validateAnalysisKind = (fieldName = 'analysis_kind') =>
  body(fieldName).exists().isString().isIn(ANALYSIS_KINDS);

const validateAdditionalPrompt = (fieldName = 'additional_prompt') =>
  body(fieldName)
    .exists()
    .isString()
    .bail()
    .customSanitizer((value) => value.normalize('NFC').trim())
    .custom((value, { req }) => {
      if ([...value].length > MAX_ADDITIONAL_PROMPT_CODE_POINTS) return false;
      const bytes = Buffer.byteLength(value, 'utf8');
      if (bytes > MAX_ADDITIONAL_PROMPT_BYTES) return false;
      if (req.body.analysis_kind === 'speech' && bytes > MAX_SPEECH_PROMPT_BYTES) return false;
      return true;
    });

const validateRevision = (fieldName = 'revision') =>
  body(fieldName)
    .exists()
    .isInt({ min: 1, max: Number.MAX_SAFE_INTEGER })
    .customSanitizer((value) => Number(value));

const validateCanonicalPage = (fieldName = 'page') =>
  body(fieldName)
    .exists()
    .isString()
    .matches(/^[1-9]\d*$/)
    .custom((value) => Number.isSafeInteger(Number(value)))
    .customSanitizer((value) => Number(value));

const validateAIAnalysisSearch = (fieldName = 'search') =>
  body(fieldName)
    .exists()
    .custom((value) => value === null || typeof value === 'string')
    .customSanitizer((value) => (typeof value === 'string' ? value.trim() : value))
    .custom((value) => value === null || value.length <= 100);

const validateResultUserSearch = (fieldName = 'search') =>
  body(fieldName)
    .exists()
    .isString()
    .bail()
    .customSanitizer((value) => value.trim())
    .isLength({ max: 100 });

module.exports = {
  validateAIAnalysisSearch,
  validateAdditionalPrompt,
  validateAllowedBodyFields,
  validateAnalysisKind,
  validateCanonicalPage,
  validateRevision,
  validateResultUserSearch,
};
