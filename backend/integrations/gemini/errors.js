const { safeDiagnostic } = require('../../utils/errorLogDetails');

const createAbortError = () => {
  const error = new Error('Gemini request aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
};

// 送信内容・APIキー・axiosの元エラーを外部へ返すエラーに含めず、診断に必要な固定項目だけを残す。
// Geminiのエラー本文は { error: { code: 429, message, status: 'RESOURCE_EXHAUSTED' } } の形で返る。
const toGeminiError = (error, fallbackMessage) => {
  if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED' || error?.code === 'ABORT_ERR') {
    return createAbortError();
  }

  const apiError = error?.response?.data?.error;
  const sanitized = new Error(fallbackMessage);
  const status = Number(error?.response?.status);
  sanitized.httpStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
  sanitized.status = sanitized.httpStatus || 500;
  const type = safeDiagnostic(apiError?.status);
  const code = Number.isSafeInteger(apiError?.code)
    ? apiError.code
    : safeDiagnostic(apiError?.code) || safeDiagnostic(error?.code);
  if (type) sanitized.type = type;
  if (code) sanitized.code = code;

  const requestId = safeDiagnostic(error?.response?.headers?.['x-goog-request-id']);
  if (requestId) sanitized.requestId = requestId;
  return sanitized;
};

module.exports = { createAbortError, toGeminiError };
