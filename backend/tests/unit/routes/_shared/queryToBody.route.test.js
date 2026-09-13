const { assignQueryToBody } = require('../../../../routes/_shared/queryToBody');

describe('クエリの本文への転記', () => {
  test('GETリクエストはクエリを本文へ転記する', () => {
    const req = { method: 'GET', query: { q: '1' }, body: { keep: 'no' } };
    const next = jest.fn();

    assignQueryToBody(req, {}, next);

    expect(req.body).toEqual({ q: '1' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('POSTリクエストは本文を維持する', () => {
    const req = { method: 'POST', query: { q: '1' }, body: { keep: 'yes' } };
    const next = jest.fn();

    assignQueryToBody(req, {}, next);

    expect(req.body).toEqual({ keep: 'yes' });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
