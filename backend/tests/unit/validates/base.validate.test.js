const mongoose = require('mongoose');
const { buildReq, runValidators } = require('./_helpers');
const { ALLOWED_LANGUAGES } = require('../../../constants/languages');
const {
  validateLang,
  validateMongoId,
  validateAnimation,
  validateDateTime,
  validateContentNotNull,
  validateTargetLangs,
  validateOptionalSearch,
  validatePage,
} = require('../../../validates/base.validate');

describe('基本項目の入力検証', () => {
  test.each([
    [1, true, 1],
    ['1', true, 1],
    ['01', true, 1],
    [Number.MAX_SAFE_INTEGER, true, Number.MAX_SAFE_INTEGER],
    [1.5, false, 1.5],
    ['1.5', false, '1.5'],
    ['1page', false, '1page'],
    [Number.MAX_SAFE_INTEGER + 1, false, Number.MAX_SAFE_INTEGER + 1],
    [String(Number.MAX_SAFE_INTEGER + 1), false, String(Number.MAX_SAFE_INTEGER + 1)],
    [0, false, 0],
    [-1, false, -1],
  ])('ページ番号が正規表記の正の安全な整数か検証する: %p', async (page, valid, expected) => {
    const req = buildReq({ body: { page } });
    const result = await runValidators(validatePage('page'), req);

    expect(result.isEmpty()).toBe(valid);
    if (valid) expect(req.body.page).toBe(expected);
  });

  test('言語を小文字へ統一し、対応する言語を受け付ける', async () => {
    const lang = ALLOWED_LANGUAGES[0] || 'ja';
    const req = buildReq({ body: { lang: lang.toUpperCase() } });
    const result = await runValidators(validateLang('lang'), req);
    expect(result.isEmpty()).toBe(true);
    expect(req.body.lang).toBe(lang.toLowerCase());
  });

  test('任意指定のMongoDBのIDは省略を受け付ける', async () => {
    const req = buildReq({ body: {} });
    const result = await runValidators(validateMongoId('id', { required: false }), req);
    expect(result.isEmpty()).toBe(true);
  });

  test.each([
    [{}, true],
    [{ search: null }, true],
    [{ search: 'room tag' }, true],
    [{ search: 42 }, false],
    [{ search: 'x'.repeat(101) }, false],
  ])('任意の検索条件を検証する: %p', async (body, valid) => {
    const req = buildReq({ body });
    const result = await runValidators(validateOptionalSearch('search'), req);
    expect(result.isEmpty()).toBe(valid);
  });

  test('不正なアニメーションを拒否する', async () => {
    const req = buildReq({ body: { animation: 'spin' } });
    const result = await runValidators(validateAnimation('animation'), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('空でない本文を受け付ける', async () => {
    const req = buildReq({ body: { content: 'hello' } });
    const result = await runValidators(validateContentNotNull('content'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('本文のnullを拒否する', async () => {
    const req = buildReq({ body: { content: null } });
    const result = await runValidators(validateContentNotNull('content'), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('翻訳先として対応するすべての言語を受け付ける', async () => {
    const req = buildReq({ body: { target_langs: [...ALLOWED_LANGUAGES] } });
    const result = await runValidators(validateTargetLangs('target_langs'), req);

    expect(result.isEmpty()).toBe(true);
    expect(req.body.target_langs).toEqual(ALLOWED_LANGUAGES);
  });

  test('翻訳先言語の空配列を受け付ける', async () => {
    const req = buildReq({ body: { target_langs: [] } });
    const result = await runValidators(validateTargetLangs('target_langs'), req);

    expect(result.isEmpty()).toBe(true);
    expect(req.body.target_langs).toEqual([]);
  });

  test('翻訳先言語を正規化して重複を除去する', async () => {
    const req = buildReq({ body: { target_langs: [' EN ', 'ja', 'en'] } });
    const result = await runValidators(validateTargetLangs('target_langs'), req);

    expect(result.isEmpty()).toBe(true);
    expect(req.body.target_langs).toEqual(['en', 'ja']);
  });

  test('対応言語数を超える翻訳先言語の配列を拒否する', async () => {
    const req = buildReq({
      body: { target_langs: Array(ALLOWED_LANGUAGES.length + 1).fill('en') },
    });
    const result = await runValidators(validateTargetLangs('target_langs'), req);

    expect(result.isEmpty()).toBe(false);
  });

  test.each([
    [['en', 1]],
    [['en', 'zz']],
  ])('翻訳先言語の不正な要素を拒否する: %p', async (targetLangs) => {
    const req = buildReq({ body: { target_langs: targetLangs } });
    const result = await runValidators(validateTargetLangs('target_langs'), req);

    expect(result.isEmpty()).toBe(false);
  });

  test('ISO 8601形式の日時を受け付ける', async () => {
    const req = buildReq({ body: { from: '2020-01-01T00:00:00Z' } });
    const result = await runValidators(validateDateTime('from'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('不正な日時形式を拒否する', async () => {
    const req = buildReq({ body: { from: '2020/01/01 00:00:00' } });
    const result = await runValidators(validateDateTime('from'), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('有効なMongoDBのIDを受け付ける', async () => {
    const req = buildReq({ body: { id: new mongoose.Types.ObjectId().toString() } });
    const result = await runValidators(validateMongoId('id'), req);
    expect(result.isEmpty()).toBe(true);
  });
});
