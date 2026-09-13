import { sanitizeStaticDocumentHtml } from '@/utils/htmlSanitizer.js';
import { normalizeSupportedLocale } from '@/utils/locale.js';

export const STATIC_DOCUMENT_NAMES = Object.freeze([
  'accessibility',
  'contact',
  'cookie',
  'privacy',
  'terms',
]);

const STATIC_DOCUMENT_NAME_SET = new Set(STATIC_DOCUMENT_NAMES);
const STATIC_DOCUMENT_URLS = import.meta.glob('../../content/static/*/*.html', {
  eager: true,
  import: 'default',
  query: '?url',
});

const defaultFetch = (...args) => globalThis.fetch(...args);
const contentKey = (locale, contentName) =>
  `../../content/static/${locale}/${contentName}.html`;

const assertContentName = (contentName) => {
  if (!STATIC_DOCUMENT_NAME_SET.has(contentName)) {
    throw new TypeError(`Unsupported static document: ${String(contentName)}`);
  }
};

const readCandidate = async ({ fetchImpl, forceReload, sanitizeHtml, url, lang }) => {
  const response = forceReload
    ? await fetchImpl(url, { cache: 'reload' })
    : await fetchImpl(url);
  if (!response?.ok) throw new Error('Static document request failed');

  const contentHtml = sanitizeHtml(await response.text());
  if (!contentHtml.trim()) throw new Error('Static document is empty');
  return { contentHtml, contentLang: lang };
};

export const createStaticContentLoader = ({
  contentUrls = STATIC_DOCUMENT_URLS,
  fetchImpl = defaultFetch,
  sanitizeHtml = sanitizeStaticDocumentHtml,
} = {}) => async ({ contentName, forceReload = false, locale }) => {
  assertContentName(contentName);

  const requestedLocale = normalizeSupportedLocale(locale, 'ja');
  const candidateLocales = requestedLocale === 'ja'
    ? ['ja']
    : [requestedLocale, 'ja'];
  let lastError = null;

  for (const lang of candidateLocales) {
    const url = contentUrls[contentKey(lang, contentName)];
    if (!url) {
      lastError = new Error(`Static document asset is missing: ${lang}/${contentName}`);
      continue;
    }

    try {
      return await readCandidate({ fetchImpl, forceReload, sanitizeHtml, url, lang });
    } catch (error) {
      lastError = error;
    }
  }

  const error = new Error(`Static document is unavailable: ${contentName}`);
  error.cause = lastError;
  throw error;
};

export const loadStaticContent = createStaticContentLoader();
