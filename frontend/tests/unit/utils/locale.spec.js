import { expect } from 'vitest';
import {
  isCrawlerUserAgent,
  normalizeSupportedLocale,
  resolveBrowserLocale,
  resolveInitialLocale,
} from '@/utils/locale.js';

describe('表示言語の決定', () => {
  it('言語コードの地域・大文字小文字を統一し、未対応の言語には英語を使う', () => {
    expect(normalizeSupportedLocale('FR-fr')).to.equal('fr');
    expect(normalizeSupportedLocale('pt_BR')).to.equal('pt');
    expect(normalizeSupportedLocale('xx-YY')).to.equal('en');
    expect(normalizeSupportedLocale(null)).to.equal('en');
  });

  it('navigator.languagesを優先してブラウザ言語を解決する', () => {
    expect(resolveBrowserLocale({ languages: ['TR-tr'], language: 'fr' })).to.equal('tr');
    expect(resolveBrowserLocale({ languages: [], language: 'de-DE' })).to.equal('de');
    expect(resolveBrowserLocale({})).to.equal('en');
  });

  it('既知のクローラの初期言語だけを日本語に固定する', () => {
    expect(isCrawlerUserAgent('Mozilla/5.0 Googlebot')).to.equal(true);
    expect(resolveInitialLocale({ userAgent: 'Googlebot', languages: ['fr'] })).to.equal('ja');
    expect(resolveInitialLocale({ userAgent: 'Mozilla/5.0', languages: ['fr'] })).to.equal('fr');
  });
});
