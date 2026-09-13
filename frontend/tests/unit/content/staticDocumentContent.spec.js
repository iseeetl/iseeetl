import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';

import { LANGUAGES } from '@/constants/languages.js';
import { STATIC_DOCUMENT_NAMES } from '@/features/static-content/loadStaticContent.js';
import { sanitizeStaticDocumentHtml } from '@/utils/htmlSanitizer.js';

const ALLOWED_TAGS = new Set([
  'a',
  'address',
  'bdi',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'h2',
  'h3',
  'li',
  'ol',
  'p',
  'section',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]);
const ALLOWED_ATTRIBUTES = new Set(['dir', 'href', 'id', 'lang', 'rel', 'scope', 'target']);
const RESERVED_VIEW_IDS = new Set(['static-document-title']);

const contentPath = (locale, contentName) =>
  path.resolve(process.cwd(), 'src', 'content', 'static', locale, `${contentName}.html`);
const contentRoot = path.resolve(process.cwd(), 'src', 'content', 'static');

const parseFragment = (contentHtml) => {
  const template = document.createElement('template');
  template.innerHTML = contentHtml;
  return template.content;
};

describe('公開する静的文書の内容', () => {
  it('対応言語と5文書だけを配置する', () => {
    const expectedLocales = LANGUAGES.map(({ value }) => value).sort();
    const expectedFileNames = STATIC_DOCUMENT_NAMES.map((contentName) => `${contentName}.html`).sort();
    const actualLocales = fs.readdirSync(contentRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(actualLocales).to.deep.equal(expectedLocales);
    actualLocales.forEach((locale) => {
      expect(fs.readdirSync(path.join(contentRoot, locale)).sort(), locale).to.deep.equal(expectedFileNames);
    });
  });

  it('全16言語に5種類の安全な本文断片を配置する', () => {
    LANGUAGES.forEach(({ value: locale }) => {
      STATIC_DOCUMENT_NAMES.forEach((contentName) => {
        const filePath = contentPath(locale, contentName);
        expect(fs.existsSync(filePath), `${locale}/${contentName}: ファイル`).to.equal(true);

        const contentHtml = fs.readFileSync(filePath, 'utf8');
        expect(contentHtml.trim(), `${locale}/${contentName}: 内容`).not.to.equal('');
        expect(contentHtml.startsWith('\uFEFF'), `${locale}/${contentName}: BOM`).to.equal(false);
        expect(contentHtml, `${locale}/${contentName}: 改行コード`).not.to.include('\r');
        expect(contentHtml.endsWith('\n'), `${locale}/${contentName}: 末尾の改行`).to.equal(true);
        expect(contentHtml.endsWith('\n\n'), `${locale}/${contentName}: 末尾の空行`).to.equal(false);

        const fragment = parseFragment(contentHtml);
        expect(fragment.children.length, `${locale}/${contentName}: ルート要素`).to.be.greaterThan(0);
        ['article', 'main', 'h1', 'script', 'style', 'iframe'].forEach((tagName) => {
          expect(fragment.querySelector(tagName), `${locale}/${contentName}: ${tagName}`).to.equal(null);
        });

        const firstHeading = fragment.querySelector('h1, h2, h3, h4, h5, h6');
        expect(firstHeading?.tagName, `${locale}/${contentName}: 最初の見出し`).to.equal('H2');

        const ids = new Set();
        fragment.querySelectorAll('*').forEach((element) => {
          expect(ALLOWED_TAGS.has(element.localName), `${locale}/${contentName}: ${element.localName}`).to.equal(true);
          [...element.attributes].forEach(({ name }) => {
            expect(ALLOWED_ATTRIBUTES.has(name), `${locale}/${contentName}: ${element.tagName} ${name}`).to.equal(true);
            expect(name, `${locale}/${contentName}: ${element.tagName}属性`).not.to.match(/^on/iu);
            expect(name, `${locale}/${contentName}: インラインスタイル`).not.to.equal('style');
            if (name === 'dir') {
              expect(element.getAttribute(name), `${locale}/${contentName}: dir`).to.match(/^(?:auto|ltr|rtl)$/iu);
            }
            if (name === 'lang') {
              expect(element.getAttribute(name), `${locale}/${contentName}: lang`)
                .to.match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu);
            }
            if (['href', 'rel', 'target'].includes(name)) {
              expect(element.localName, `${locale}/${contentName}: ${name}タグ`).to.equal('a');
            }
            if (name === 'scope') {
              expect(element.localName, `${locale}/${contentName}: 対象範囲のタグ`).to.equal('th');
            }
          });
          if (!element.id) return;
          expect(RESERVED_VIEW_IDS.has(element.id), `${locale}/${contentName}: 予約済みのID ${element.id}`)
            .to.equal(false);
          expect(ids.has(element.id), `${locale}/${contentName}: IDの重複${element.id}`).to.equal(false);
          ids.add(element.id);
        });

        fragment.querySelectorAll('a[href]').forEach((link) => {
          const href = link.getAttribute('href');
          expect(href, `${locale}/${contentName}: href`).to.match(/^(?:https?:|mailto:|tel:|\/(?!\/)|#)/iu);
          const target = link.getAttribute('target');
          if (target !== null) expect(target, `${locale}/${contentName}: target`).to.equal('_blank');
          if (link.getAttribute('target') === '_blank') {
            expect(link.getAttribute('rel'), `${locale}/${contentName}: 別タブで開くリンクのrel属性`)
              .to.equal('noopener noreferrer');
          } else {
            expect(link.hasAttribute('rel'), `${locale}/${contentName}: 別タブで開かないリンクのrel属性`).to.equal(false);
          }
        });

        fragment.querySelectorAll('th').forEach((heading) => {
          expect(heading.getAttribute('scope'), `${locale}/${contentName}: thのscope属性`)
            .to.match(/^(?:col|row)$/u);
        });

        const sanitizedFragment = parseFragment(sanitizeStaticDocumentHtml(contentHtml));
        expect(
          sanitizedFragment.querySelectorAll('*').length,
          `${locale}/${contentName}: サニタイズ後の要素数`
        ).to.equal(fragment.querySelectorAll('*').length);
        expect(sanitizedFragment.textContent, `${locale}/${contentName}: サニタイズ後のテキスト`)
          .to.equal(fragment.textContent);
        ids.forEach((id) => {
          expect(sanitizedFragment.getElementById(id), `${locale}/${contentName}: サニタイズ後のID ${id}`)
            .not.to.equal(null);
        });
      });
    });
  }, 30_000);
});
