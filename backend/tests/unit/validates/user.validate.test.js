const { buildReq, runValidators } = require('./_helpers');
const ROLES = require('../../../constants/roles');
const {
  validateUserRole,
  validateMail,
  validateNullableMail,
  validateDeleteFlg,
  validateOptionalDeleteFlg,
  validateOptionalQueryDeleteFlg,
  validatePassword,
} = require('../../../validates/user.validate');

describe('ユーザの入力検証', () => {
  test('定義済みのユーザ権限を受け付ける', async () => {
    const req = buildReq({ body: { role: ROLES.ADMINISTRATOR } });
    const result = await runValidators(validateUserRole('role'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('未定義のユーザ権限を拒否する', async () => {
    const req = buildReq({ body: { role: 'Unknown' } });
    const result = await runValidators(validateUserRole('role'), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('有効なメールアドレスを受け付ける', async () => {
    const req = buildReq({ body: { mail: 'test@example.com' } });
    const result = await runValidators(validateMail('mail'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('メールアドレスの前後の空白を除去し、小文字へ統一する', async () => {
    const req = buildReq({ body: { mail: ' Test@Example.COM ' } });
    const result = await runValidators(validateMail('mail'), req);

    expect(result.isEmpty()).toBe(true);
    expect(req.body.mail).toBe('test@example.com');
  });

  test('任意メールは項目自体を必須とし、値はnullを受け付ける', async () => {
    const nullReq = buildReq({ body: { mail: null } });
    const nullResult = await runValidators(validateNullableMail('mail'), nullReq);
    expect(nullResult.isEmpty()).toBe(true);
    expect(nullReq.body.mail).toBeNull();

    const missingReq = buildReq({ body: {} });
    const missingResult = await runValidators(validateNullableMail('mail'), missingReq);
    expect(missingResult.isEmpty()).toBe(false);
  });

  test('任意メールは有効な文字列を正規化し、不正な文字列を拒否する', async () => {
    const validReq = buildReq({ body: { mail: ' Test@Example.COM ' } });
    const validResult = await runValidators(validateNullableMail('mail'), validReq);
    expect(validResult.isEmpty()).toBe(true);
    expect(validReq.body.mail).toBe('test@example.com');

    const invalidReq = buildReq({ body: { mail: '' } });
    const invalidResult = await runValidators(validateNullableMail('mail'), invalidReq);
    expect(invalidResult.isEmpty()).toBe(false);
  });

  test('短すぎるパスワードを拒否する', async () => {
    const req = buildReq({ body: { password: 'short' } });
    const result = await runValidators(validatePassword('password'), req);
    expect(result.isEmpty()).toBe(false);
  });

  test.each([true, false])('削除フラグはJSONの真偽値%sを受け付ける', async (input) => {
    const req = buildReq({ body: { delete_flg: input } });
    const result = await runValidators(validateDeleteFlg('delete_flg'), req);

    expect(result.isEmpty()).toBe(true);
    expect(req.body.delete_flg).toBe(input);
  });

  test.each(['true', 'false', '1', '0', 1, 0, 'yes'])(
    '削除フラグはJSONの真偽値以外の%pを拒否する',
    async (input) => {
      const req = buildReq({ body: { delete_flg: input } });
      const result = await runValidators(validateDeleteFlg('delete_flg'), req);
      expect(result.isEmpty()).toBe(false);
    }
  );

  test('削除フラグを必須項目にする', async () => {
    const missingReq = buildReq({ body: {} });
    const missingResult = await runValidators(validateDeleteFlg('delete_flg'), missingReq);
    expect(missingResult.isEmpty()).toBe(false);
  });

  test.each([true, false])('任意の削除フラグはJSONの真偽値%sを受け付ける', async (input) => {
    const req = buildReq({ body: { delete_flg: input } });
    const result = await runValidators(validateOptionalDeleteFlg('delete_flg'), req);

    expect(result.isEmpty()).toBe(true);
    expect(req.body.delete_flg).toBe(input);
  });

  test('任意の削除フラグは省略を受け付け、クエリ形式の文字列を拒否する', async () => {
    const missingReq = buildReq({ body: {} });
    const missingResult = await runValidators(
      validateOptionalDeleteFlg('delete_flg'),
      missingReq
    );
    expect(missingResult.isEmpty()).toBe(true);
    expect(missingReq.body).not.toHaveProperty('delete_flg');

    const invalidReq = buildReq({ body: { delete_flg: 'false' } });
    const invalidResult = await runValidators(
      validateOptionalDeleteFlg('delete_flg'),
      invalidReq
    );
    expect(invalidResult.isEmpty()).toBe(false);
  });

  test.each([
    ['true', true],
    ['false', false],
  ])('任意クエリの削除フラグは文字列%sを真偽値へ変換する', async (input, expected) => {
    const req = buildReq({ body: { delete_flg: input } });
    const result = await runValidators(validateOptionalQueryDeleteFlg('delete_flg'), req);

    expect(result.isEmpty()).toBe(true);
    expect(req.body.delete_flg).toBe(expected);
  });

  test.each([true, false, 1, 0, '1', '0', 'yes'])(
    '任意クエリの削除フラグは規定の文字列以外の%pを拒否する',
    async (input) => {
      const req = buildReq({ body: { delete_flg: input } });
      const result = await runValidators(validateOptionalQueryDeleteFlg('delete_flg'), req);
      expect(result.isEmpty()).toBe(false);
    }
  );
});
