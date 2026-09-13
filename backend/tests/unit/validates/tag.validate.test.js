const { buildReq, runValidators } = require('./_helpers');
const { validateTagName, validateCsv, validateTagOrder } = require('../../../validates/tag.validate');

describe('タグの入力検証', () => {
  test('有効なタグ名を受け付ける', async () => {
    const req = buildReq({ body: { name: 'tag' } });
    const result = await runValidators(validateTagName('name'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('許容範囲内のタグの表示順を受け付ける', async () => {
    const req = buildReq({ body: { order: 1 } });
    const result = await runValidators(validateTagOrder('order'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('CSVの行の列数が不正なら拒否する', async () => {
    const req = buildReq({ body: { csv: [['a', 'b', 'c']] } });
    const result = await runValidators(validateCsv('csv'), req);
    expect(result.isEmpty()).toBe(false);
  });
});
