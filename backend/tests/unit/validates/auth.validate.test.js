const { buildReq, runValidators } = require('./_helpers');
const { validate24BytesHexToken } = require('../../../validates/auth.validate');

describe('認証の入力検証', () => {
  test('トークンとして48桁の16進数を受け付ける', async () => {
    const req = buildReq({ body: { token: 'a'.repeat(48) } });
    const result = await runValidators(validate24BytesHexToken('token'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('長さが不正なトークンを拒否する', async () => {
    const req = buildReq({ body: { token: 'a'.repeat(47) } });
    const result = await runValidators(validate24BytesHexToken('token'), req);
    expect(result.isEmpty()).toBe(false);
  });
});
