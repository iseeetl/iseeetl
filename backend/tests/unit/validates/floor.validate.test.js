const { buildReq, runValidators } = require('./_helpers');
const {
  validateFloorTitle,
  validateFloorDescription,
  validateFloorDisplayHidden,
} = require('../../../validates/floor.validate');

describe('フロアの入力検証', () => {
  test('上限以内のフロアタイトルを受け付ける', async () => {
    const req = buildReq({ body: { title: 'floor' } });
    const result = await runValidators(validateFloorTitle('title'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('上限を超えるフロア説明を拒否する', async () => {
    const req = buildReq({ body: { description: 'a'.repeat(201) } });
    const result = await runValidators(validateFloorDescription('description'), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('フロアの非表示設定は真偽値を必須とする', async () => {
    const req = buildReq({ body: { hidden: true } });
    const result = await runValidators(validateFloorDisplayHidden('hidden'), req);
    expect(result.isEmpty()).toBe(true);
  });
});
