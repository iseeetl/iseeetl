const { errorLogDetails } = require('../../../utils/errorLogDetails');
const { toOpenAIError } = require('../../../integrations/openai/errors');

describe('ログ用のエラー診断情報', () => {
  test('HTTPエラーから診断項目だけを残し、本文・認証情報・stackを含めない', () => {
    const error = Object.assign(new Error('private fixture message'), {
      code: 'ERR_BAD_REQUEST',
      config: { headers: { Authorization: 'Bearer private-fixture' }, data: 'private fixture input' },
      response: {
        status: 429,
        headers: { 'x-request-id': 'req-fixture' },
        data: { error: { type: 'rate_limit_error', code: 'rate_limit_exceeded', message: 'private fixture response' } },
      },
    });
    expect(errorLogDetails(toOpenAIError(error, 'OpenAI chat failed'))).toEqual({
      error_code: 'rate_limit_exceeded', error_type: 'rate_limit_error',
      http_status: 429, request_id: 'req-fixture',
    });
    expect(errorLogDetails(error)).toEqual({
      error_code: 'ERR_BAD_REQUEST', error_type: 'Error', http_status: 429, request_id: 'req-fixture',
    });
  });

  test.each(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'])(
    '%sは通信エラーのコードを保持し、仮の500を外部APIの応答として記録しない', (code) => {
      const error = toOpenAIError({ code }, 'OpenAI chat failed');
      expect(error.status).toBe(500);
      expect(errorLogDetails(error)).toEqual({
        error_code: code, error_type: 'Error', http_status: null, request_id: null,
      });
    }
  );

  test.each(['private fixture input', 'line\nbreak', 'x'.repeat(101), { value: 'fixture' }])(
    '不正な診断値を出力しない（%p）', (value) => {
      expect(errorLogDetails({ code: value, type: value, name: value, requestId: value, status: value })).toEqual({
        error_code: null, error_type: null, http_status: null, request_id: null,
      });
    }
  );

  test('数値のエラーコードを保持する', () => {
    expect(errorLogDetails({ code: 11000 })).toEqual({
      error_code: 11000, error_type: null, http_status: null, request_id: null,
    });
  });

  test.each([null, undefined, 'private fixture string'])('例外以外の値も本文を出力しない（%p）', (value) => {
    expect(errorLogDetails(value)).toEqual({
      error_code: null, error_type: null, http_status: null, request_id: null,
    });
  });
});
