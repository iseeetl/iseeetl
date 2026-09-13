<template>
  <div class="view">
    <div class="view-header">
      <BackButton />
      <h1 id="static-document-title" class="view-title">
        {{ $t(titleKey) }}
      </h1>
    </div>

    <div class="view-content">
      <p
        v-if="contentLoading && !contentHtml"
        class="static-document-status"
        role="status"
      >
        {{ $t('読み込み中です') }}
      </p>

      <p v-else-if="contentLoading" class="screen-reader-only" role="status">
        {{ $t('読み込み中です') }}
      </p>

      <div
        class="static-document-container"
        :aria-busy="contentLoading ? 'true' : 'false'"
      >
        <div v-if="contentLoadFailed" class="static-document-error">
          <p role="alert">
            {{ $t('内容を読み込めませんでした') }}
          </p>
          <UiButton appearance="filled" tone="primary" @click="retryContent">
            {{ $t('再試行') }}
          </UiButton>
        </div>

        <article
          v-else-if="contentHtml"
          ref="documentContent"
          class="static-document"
          tabindex="-1"
          :lang="contentLang || currentLang"
          aria-labelledby="static-document-title"
          v-html="contentHtml"
        ></article>
      </div>
    </div>
  </div>
</template>

<script>
import BackButton from '@/components/common/BackButton.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { loadStaticContent } from '@/features/static-content/loadStaticContent.js';
import { normalizeSupportedLocale } from '@/utils/locale.js';

export default {
  name: 'StaticDocumentView',
  components: {
    BackButton,
    UiButton,
  },
  data() {
    return {
      contentHtml: '',
      contentLang: '',
      contentLoading: false,
      contentLoadFailed: false,
      contentRequestId: 0,
      displayedContentName: '',
    };
  },
  computed: {
    contentName() {
      return this.$route?.meta?.staticContentName || '';
    },
    titleKey() {
      return this.$route?.meta?.title || '';
    },
    currentLang() {
      return normalizeSupportedLocale(this.$i18n?.locale, 'ja');
    },
    contentRequestKey() {
      return `${this.contentName}:${this.currentLang}`;
    },
  },
  watch: {
    contentRequestKey: {
      immediate: true,
      handler() {
        this.reloadContent();
      },
    },
  },
  beforeUnmount() {
    this.contentRequestId += 1;
  },
  methods: {
    retryContent() {
      this.reloadContent({ forceReload: true, focusContent: true });
    },
    async reloadContent({ forceReload = false, focusContent = false } = {}) {
      const requestId = ++this.contentRequestId;
      const requestedContentName = this.contentName;
      const requestedLocale = this.currentLang;

      if (this.displayedContentName !== requestedContentName) {
        this.contentHtml = '';
        this.contentLang = '';
        this.displayedContentName = '';
      }
      this.contentLoading = true;
      this.contentLoadFailed = false;

      try {
        const { contentHtml, contentLang } = await loadStaticContent({
          contentName: requestedContentName,
          forceReload,
          locale: requestedLocale,
        });
        if (requestId !== this.contentRequestId) return;

        this.contentHtml = contentHtml;
        this.contentLang = contentLang;
        this.displayedContentName = requestedContentName;
        if (focusContent) {
          this.$nextTick(() => this.$refs.documentContent?.focus());
        }
      } catch (error) {
        if (requestId !== this.contentRequestId) return;
        void error;
        this.contentHtml = '';
        this.contentLang = '';
        this.displayedContentName = '';
        this.contentLoadFailed = true;
      } finally {
        if (requestId === this.contentRequestId) this.contentLoading = false;
      }
    },
  },
};
</script>
