import DOMPurify from 'dompurify';

export const STATIC_CONTENT_ALLOWED_TAGS = Object.freeze([
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'b',
  'bdi',
  'bdo',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'dd',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'i',
  'kbd',
  'li',
  'main',
  'mark',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'q',
  'rb',
  'rp',
  'rt',
  'rtc',
  'ruby',
  's',
  'samp',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
  'var',
  'wbr',
]);

export const STATIC_CONTENT_ALLOWED_ATTRIBUTES = Object.freeze([
  'aria-label',
  'class',
  'href',
  'id',
  'dir',
  'lang',
  'name',
  'rel',
  'scope',
  'target',
]);

export const STATIC_DOCUMENT_FORBIDDEN_TAGS = Object.freeze([
  'article',
  'h1',
  'iframe',
  'main',
  'script',
  'style',
]);

const STATIC_CONTENT_URI_PATTERN = /^(?:(?:https?|mailto|tel):|(?!\/\/)(?:[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)))/iu;
const GLOBAL_ALLOWED_ATTRIBUTES = new Set(['aria-label', 'class', 'dir', 'id', 'lang']);
const ALLOWED_ATTRIBUTES_BY_TAG = Object.freeze({
  a: new Set(['href', 'name', 'rel', 'target']),
  th: new Set(['scope']),
});

const keepOnlyAllowedAttributeForTag = (node, hookEvent) => {
  const attributeName = hookEvent.attrName.toLowerCase();
  const tagName = node.nodeName.toLowerCase();
  hookEvent.keepAttr =
    GLOBAL_ALLOWED_ATTRIBUTES.has(attributeName) || ALLOWED_ATTRIBUTES_BY_TAG[tagName]?.has(attributeName) === true;
  if (attributeName === 'dir') hookEvent.keepAttr = /^(?:auto|ltr|rtl)$/iu.test(hookEvent.attrValue || '');
  if (attributeName === 'lang') hookEvent.keepAttr = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu.test(hookEvent.attrValue || '');
};

// 配布する静的HTMLを、表示に必要な許可済みのタグ・属性・URLに制限する。
const sanitizeAllowedStaticHtml = (html, { forbiddenTags = [] } = {}) => {
  DOMPurify.addHook('uponSanitizeAttribute', keepOnlyAllowedAttributeForTag);
  try {
    return DOMPurify.sanitize(html == null ? '' : String(html), {
      ALLOWED_TAGS: STATIC_CONTENT_ALLOWED_TAGS,
      ALLOWED_ATTR: STATIC_CONTENT_ALLOWED_ATTRIBUTES,
      ALLOWED_URI_REGEXP: STATIC_CONTENT_URI_PATTERN,
      ALLOW_ARIA_ATTR: true,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: forbiddenTags,
      RETURN_TRUSTED_TYPE: false,
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
};

export const sanitizeStaticContentHtml = (html) => sanitizeAllowedStaticHtml(html);

// article内に挿入する文書では、本文断片に不要なタグも除外する。
export const sanitizeStaticDocumentHtml = (html) =>
  sanitizeAllowedStaticHtml(html, { forbiddenTags: STATIC_DOCUMENT_FORBIDDEN_TAGS });
