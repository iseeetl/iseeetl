const { buildReq, runValidators } = require('./_helpers');
const {
  validatePeriod,
  validateFloorMemberInviteToken,
} = require('../../../validates/member.validate');

describe('メンバーの入力検証', () => {
  test('許可された招待期間を受け付ける', async () => {
    const req = buildReq({ body: { period: '8h' } });
    const result = await runValidators(validatePeriod('period'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('不正な招待期間を拒否する', async () => {
    const req = buildReq({ body: { period: '1y' } });
    const result = await runValidators(validatePeriod('period'), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('16進数のフロア招待トークンを受け付ける', async () => {
    const req = buildReq({ body: { token: 'b'.repeat(48) } });
    const result = await runValidators(validateFloorMemberInviteToken('token'), req);
    expect(result.isEmpty()).toBe(true);
  });
});
