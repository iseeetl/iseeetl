const { safeDiagnostic } = require('../../utils/errorLogDetails');

const createAbortError = () => {
  const error = new Error('OpenAI request aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
};

const toOpenAIError = (error, fallbackMessage) => {
  if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED' || error?.code === 'ABORT_ERR') {
    return createAbortError();
  }

  const apiError = error?.response?.data?.error;
  const sanitized = new Error(fallbackMessage);
  const status = Number(error?.response?.status);
  sanitized.httpStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
  sanitized.status = sanitized.httpStatus || 500;
  const type = safeDiagnostic(apiError?.type);
  const code = safeDiagnostic(apiError?.code) || safeDiagnostic(error?.code);
  const param = safeDiagnostic(apiError?.param);
  if (type) sanitized.type = type;
  if (code) sanitized.code = code;
  if (param) sanitized.param = param;

  const requestId = safeDiagnostic(error?.response?.headers?.['x-request-id']);
  if (requestId) sanitized.requestId = requestId;
  return sanitized;
};

module.exports = { createAbortError, toOpenAIError };
