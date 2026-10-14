const safeDiagnostic = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : null;

// 例外本文・stack・送受信データには利用者の入力や認証情報が含まれるため、診断項目だけを取り出す。
const errorLogDetails = (error) => {
  const status = error?.httpStatus !== undefined
    ? error.httpStatus
    : error?.response?.status ?? error?.status ?? error?.statusCode;
  return {
    error_code: Number.isSafeInteger(error?.code) ? error.code : safeDiagnostic(error?.code),
    error_type: safeDiagnostic(error?.type) || safeDiagnostic(error?.name),
    http_status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : null,
    request_id: safeDiagnostic(error?.requestId)
      || safeDiagnostic(error?.response?.headers?.['x-request-id']),
  };
};

module.exports = { errorLogDetails, safeDiagnostic };
