import { sanitizeStaticContentHtml } from '@/utils/htmlSanitizer';
import { normalizeSupportedLocale } from '@/utils/locale.js';

export const createLocalizedStaticContentMixin = ({ contentName = null } = {}) => ({
  data() {
    return {
      contentHtml: '',
      contentLang: '',
      contentLoadFailed: false,
      contentRequestId: 0,
    };
  },
  computed: {
    currentLang() {
      return normalizeSupportedLocale(this.$i18n?.locale, 'ja');
    },
    resolvedContentName() {
      return contentName || this.contentName;
    },
    contentFileName() {
      return `/content/${this.currentLang}/${this.resolvedContentName}.html`;
    },
    fallbackContentFileName() {
      return `/content/ja/${this.resolvedContentName}.html`;
    },
  },
  watch: {
    currentLang() {
      this.fetchContent();
    },
  },
  mounted() {
    this.fetchContent();
  },
  beforeUnmount() {
    this.contentRequestId += 1;
  },
  methods: {
    async fetchContent() {
      const requestId = ++this.contentRequestId;
      this.contentLoadFailed = false;

      const candidates = [{ url: this.contentFileName, lang: this.currentLang }];
      if (this.contentFileName !== this.fallbackContentFileName) {
        candidates.push({ url: this.fallbackContentFileName, lang: 'ja' });
      }

      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate.url, { cache: 'no-cache' });
          if (response?.ok === false) throw new Error('content fetch failed');
          const html = await response.text();
          if (requestId !== this.contentRequestId) return;
          this.contentHtml = sanitizeStaticContentHtml(html);
          this.contentLang = candidate.lang;
          return;
        } catch (error) {
          void error;
        }
      }

      if (requestId === this.contentRequestId) this.contentLoadFailed = true;
    },
  },
});
