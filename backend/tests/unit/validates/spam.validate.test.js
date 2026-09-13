const { buildReq, runValidators } = require('./_helpers');
const { validateSpamSearch, validateSpamWord } = require('../../../validates/spam.validate');

describe('スパムの入力検証', () => {
  test('スパムの検索語はnullと短い文字列を受け付ける', async () => {
    const req = buildReq({ body: { search: null } });
    const result = await runValidators(validateSpamSearch('search'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('スパムの語句は空文字を拒否する', async () => {
    const req = buildReq({ body: { word: '' } });
    const result = await runValidators(validateSpamWord('word'), req);
    expect(result.isEmpty()).toBe(false);
  });
});
