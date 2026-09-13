const mongoose = require('mongoose');
const { buildReq, runValidators } = require('./_helpers');
const AppError = require('../../../utils/appError');
const { master } = require('../../../validates/quickText.validate');

describe('単語の入力検証', () => {
  test('共通の単語グループ更新には1つ以上の項目を必須にする', async () => {
    const req = buildReq({ params: { id: new mongoose.Types.ObjectId().toString() }, body: {} });

    await runValidators(master.group.update, req);

    const next = jest.fn();
    const requireAtLeastOne = master.group.update[4];
    requireAtLeastOne(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  test('共通の単語グループ作成では言語を小文字へ統一して検証を完了する', async () => {
    const req = buildReq({ body: { title: 'title', lang: 'JA' } });

    await runValidators(master.group.create, req);

    const finalize = master.group.create[2];
    const next = jest.fn();
    finalize(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.lang).toBe('ja');
  });
});
