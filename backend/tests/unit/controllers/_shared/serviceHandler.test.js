const { handleService } = require('../../../../controllers/_shared/serviceHandler');

describe('サービス呼出しと共通の応答処理', () => {
  const makeRes = (overrides = {}) => ({
    json: jest.fn(),
    headersSent: false,
    writableEnded: false,
    ...overrides,
  });

  test('サービスを実行し、結果をres.jsonで返す', async () => {
    const handler = jest.fn().mockResolvedValue({ ok: true });
    const req = { id: 'req' };
    const res = makeRes();
    const next = jest.fn();

    await handleService(handler)(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  test('ヘッダを送信済みならres.jsonを呼ばない', async () => {
    const handler = jest.fn().mockResolvedValue({ ok: true });
    const res = makeRes({ headersSent: true });

    await handleService(handler)({}, res, jest.fn());

    expect(res.json).not.toHaveBeenCalled();
  });

  test('エラーをnextへ渡す', async () => {
    const err = new Error('boom');
    const handler = jest.fn().mockRejectedValue(err);
    const res = makeRes();
    const next = jest.fn();

    await handleService(handler)({}, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
