const {
  normalizeEnvValue,
  hasEnv,
  requireEnv,
  missingEnv,
  assertRequiredEnv,
  readIntEnv,
  readCsvEnv,
} = require('../../../config/env');

describe('環境変数の取得と検証', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('normalizeEnvValue: 文字列をtrimし、文字列以外は空文字へ変換する', () => {
    expect(normalizeEnvValue(' value ')).toBe('value');
    expect(normalizeEnvValue(undefined)).toBe('');
  });

  test('空文字と空白だけの値は未設定として扱う', () => {
    process.env.TEST_A = '';
    process.env.TEST_B = '   ';
    process.env.TEST_C = 'value';

    expect(hasEnv('TEST_A')).toBe(false);
    expect(hasEnv('TEST_B')).toBe(false);
    expect(hasEnv('TEST_C')).toBe(true);
  });

  test('必須の環境変数が未設定ならエラーにする', () => {
    delete process.env.NOT_EXISTS;
    expect(() => requireEnv('NOT_EXISTS')).toThrow('NOT_EXISTS is required');
  });

  test('未設定の必須項目をまとめて取得し、エラーとして通知する', () => {
    process.env.FOO = 'foo';
    process.env.BAR = '';

    expect(missingEnv(['FOO', 'BAR', 'BAZ'])).toEqual(['BAR', 'BAZ']);
    expect(() => assertRequiredEnv(['FOO', 'BAR', 'BAZ'])).toThrow('Missing required env: BAR, BAZ');
  });

  test('整数の設定は数値化し、不正なら既定値を使う', () => {
    process.env.INT_OK = '10';
    process.env.INT_BAD = 'abc';
    process.env.INT_LOW = '0';

    expect(readIntEnv('INT_OK', { defaultValue: 1, min: 1 })).toBe(10);
    expect(readIntEnv('INT_BAD', { defaultValue: 1, min: 1 })).toBe(1);
    expect(readIntEnv('INT_LOW', { defaultValue: 1, min: 1 })).toBe(1);
    expect(readIntEnv('INT_MISSING', { defaultValue: 7, min: 1 })).toBe(7);
  });

  test('readCsvEnv: CSV を配列化し、未設定時は defaultValue を返す', () => {
    process.env.CSV = 'a, b,,c';

    expect(readCsvEnv('CSV')).toEqual(['a', 'b', 'c']);
    expect(readCsvEnv('CSV_MISSING', { defaultValue: ['x'] })).toEqual(['x']);
  });
});
