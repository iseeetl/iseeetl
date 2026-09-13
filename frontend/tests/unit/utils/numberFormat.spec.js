import { expect } from 'vitest';
import { formatLocaleNumber } from '@/utils/numberFormat';

describe('数値の桁区切り', () => {
  it('言語設定に応じた桁区切りを適用する', () => {
    expect(formatLocaleNumber(12345, 'en')).to.equal('12,345');
    expect(formatLocaleNumber(12345, 'de')).to.equal('12.345');
  });

  it('未知の言語には英語を使い、数値以外には空文字を返す', () => {
    expect(formatLocaleNumber(12345, 'unknown')).to.equal('12,345');
    expect(formatLocaleNumber('not-a-number', 'ja')).to.equal('');
  });
});
