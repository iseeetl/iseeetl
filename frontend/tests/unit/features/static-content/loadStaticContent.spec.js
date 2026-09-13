import { expect, vi } from 'vitest';

import { LANGUAGES } from '@/constants/languages.js';
import {
  createStaticContentLoader,
  loadStaticContent,
  STATIC_DOCUMENT_NAMES,
} from '@/features/static-content/loadStaticContent.js';

const contentKey = (locale, contentName) =>
  `../../content/static/${locale}/${contentName}.html`;

const response = (contentHtml, { ok = true } = {}) => ({
  ok,
  text: () => Promise.resolve(contentHtml),
});

const createLoader = ({ contentUrls, fetchImpl, sanitizeHtml } = {}) =>
  createStaticContentLoader({
    contentUrls: contentUrls || {
      [contentKey('en', 'terms')]: '/assets/en-terms.html',
      [contentKey('ja', 'terms')]: '/assets/ja-terms.html',
    },
    fetchImpl,
    ...(sanitizeHtml ? { sanitizeHtml } : {}),
  });

describe('静的文書の読込', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ViteのURL一覧から16言語・5種類の文書に対応するファイルを一意に選ぶ', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('<h2>利用規約</h2>'));
    vi.stubGlobal('fetch', fetchImpl);

    for (const { value: locale } of LANGUAGES) {
      for (const contentName of STATIC_DOCUMENT_NAMES) {
        const result = await loadStaticContent({ contentName, locale });
        expect(result.contentLang, `${locale}/${contentName}`).to.equal(locale);
      }
    }

    const assetUrls = fetchImpl.mock.calls.map(([assetUrl]) => assetUrl);
    expect(assetUrls).to.have.lengthOf(LANGUAGES.length * STATIC_DOCUMENT_NAMES.length);
    assetUrls.forEach((assetUrl) => expect(assetUrl).to.be.a('string').and.not.to.equal(''));
    expect(new Set(assetUrls).size).to.equal(assetUrls.length);
  });

  it('言語設定を正規化して指定文書のビルド済みURLだけを取得する', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('<h2>Terms</h2>'));
    const loadContent = createLoader({ fetchImpl });

    const result = await loadContent({ contentName: 'terms', locale: 'EN-us' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith('/assets/en-terms.html');
    expect(result).to.deep.equal({
      contentHtml: '<h2>Terms</h2>',
      contentLang: 'en',
    });
  });

  it('指定言語の文書を取得できない場合は日本語を使う', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response('', { ok: false }))
      .mockResolvedValueOnce(response('<h2>日本語</h2>'));
    const loadContent = createLoader({ fetchImpl });

    const result = await loadContent({ contentName: 'terms', locale: 'en' });

    expect(fetchImpl.mock.calls.map(([url]) => url)).to.deep.equal([
      '/assets/en-terms.html',
      '/assets/ja-terms.html',
    ]);
    expect(result.contentLang).to.equal('ja');
    expect(result.contentHtml).to.equal('<h2>日本語</h2>');
  });

  it('全候補の取得に失敗した場合はエラーにする', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('', { ok: false }));
    const loadContent = createLoader({ fetchImpl });

    await expect(loadContent({ contentName: 'terms', locale: 'en' }))
      .rejects.toThrow('Static document is unavailable: terms');
  });

  it('本文断片をsanitizeしてarticle、h1、script、危険な属性を除去する', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(
      '<article><h1>Duplicate</h1><h2 onclick="alert(1)">Safe</h2>' +
      '<a href="javascript:alert(1)">Link</a><script>alert(1)</script></article>'
    ));
    const loadContent = createLoader({ fetchImpl });

    const { contentHtml } = await loadContent({ contentName: 'terms', locale: 'ja' });

    expect(contentHtml).to.include('<h2>Safe</h2>');
    expect(contentHtml).to.include('<a>Link</a>');
    expect(contentHtml).not.to.match(/article|<h1|script|onclick|javascript/iu);
  });

  it('未許可のcontentNameをfetchせず拒否する', async () => {
    const fetchImpl = vi.fn();
    const loadContent = createLoader({ fetchImpl });

    await expect(loadContent({ contentName: '../help', locale: 'ja' }))
      .rejects.toThrow('Unsupported static document: ../help');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('失敗後の再呼び出しで同じ文書を取得できる', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response('', { ok: false }))
      .mockResolvedValueOnce(response('<h2>再取得</h2>'));
    const loadContent = createLoader({ fetchImpl });

    await expect(loadContent({ contentName: 'terms', locale: 'ja' })).rejects.toThrow();
    await expect(loadContent({ contentName: 'terms', locale: 'ja' })).resolves.to.deep.equal({
      contentHtml: '<h2>再取得</h2>',
      contentLang: 'ja',
    });
  });

  it('明示的な再試行ではブラウザキャッシュを強制再読み込みする', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('<h2>再取得</h2>'));
    const loadContent = createLoader({ fetchImpl });

    await loadContent({ contentName: 'terms', forceReload: true, locale: 'ja' });

    expect(fetchImpl).toHaveBeenCalledWith('/assets/ja-terms.html', { cache: 'reload' });
  });
});
