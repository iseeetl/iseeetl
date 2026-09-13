import { expect } from 'vitest';
import { LANGUAGES } from '@/constants/languages';

describe('対応言語の定義', () => {
  it('LANGUAGES は空でない配列で value/label を持つ', () => {
    expect(LANGUAGES).to.be.an('array');
    expect(LANGUAGES.length).to.be.greaterThan(0);

    LANGUAGES.forEach((item) => {
      expect(item).to.be.an('object');
      expect(item.value).to.be.a('string').and.not.equal('');
      expect(item.label).to.be.a('string').and.not.equal('');
    });
  });

  it('言語コードは重複しない', () => {
    const values = LANGUAGES.map((item) => item.value);
    expect(new Set(values).size).to.equal(values.length);
  });

  it('主要言語が意図どおり存在する', () => {
    const valueSet = new Set(LANGUAGES.map((item) => item.value));
    ['ja', 'en', 'ko', 'fr', 'es', 'de', 'ru'].forEach((value) => {
      expect(valueSet.has(value)).to.equal(true);
    });
  });
});
