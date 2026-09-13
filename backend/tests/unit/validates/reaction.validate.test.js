const { buildReq, runValidators } = require('./_helpers');
const { validateReactionType } = require('../../../validates/reaction.validate');

describe('リアクションの入力検証', () => {
  test('対応するリアクション種別を受け付ける', async () => {
    const req = buildReq({ body: { type: 'いいね' } });
    const result = await runValidators(validateReactionType('type'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('未対応のリアクション種別を拒否する', async () => {
    const req = buildReq({ body: { type: 'bad' } });
    const result = await runValidators(validateReactionType('type'), req);
    expect(result.isEmpty()).toBe(false);
  });
});
