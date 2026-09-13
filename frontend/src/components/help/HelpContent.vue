<template>
  <div class="help-content" data-testid="help-content">
    <div v-if="contentLoadFailed" class="help-content-error" data-testid="help-content-error" role="alert">
      {{ $t('ヘルプ内容を読み込めませんでした') }}
    </div>
    <div
      v-else
      class="help-content-body"
      data-testid="help-content-body"
      :lang="contentLang || currentLang"
      v-html="visibleContentHtml"
    ></div>
  </div>
</template>

<script>
import { createLocalizedStaticContentMixin } from '@/mixins/localizedStaticContent';

const CAPABILITY_MARKERS = Object.freeze([
  ['help-capability--mail-delivery', 'mailDeliveryAvailable'],
  ['help-capability--google-login', 'googleLoginAvailable'],
  ['help-capability--line-login', 'lineLoginAvailable'],
  ['help-capability--google-translate', 'googleTranslateAvailable'],
  ['help-capability--openai-analysis', 'openaiAnalysisAvailable'],
]);

const removeMarkedElements = (container, marker, visible) => {
  if (visible) return;
  container.querySelectorAll(`.${marker}`).forEach((element) => element.remove());
};

export default {
  name: 'HelpContent',
  mixins: [createLocalizedStaticContentMixin()],
  props: {
    contentName: {
      type: String,
      default: 'help',
    },
  },
  computed: {
    visibleContentHtml() {
      if (!this.contentHtml) return '';

      const container = document.createElement('div');
      container.innerHTML = this.contentHtml;
      const getters = this.$store?.getters || {};

      CAPABILITY_MARKERS.forEach(([marker, getter]) => {
        removeMarkedElements(container, marker, getters[getter] === true);
      });

      const googleLoginAvailable = getters.googleLoginAvailable === true;
      const lineLoginAvailable = getters.lineLoginAvailable === true;
      removeMarkedElements(
        container,
        'help-capability--oauth-any',
        googleLoginAvailable || lineLoginAvailable
      );
      removeMarkedElements(
        container,
        'help-capability--oauth-both',
        googleLoginAvailable && lineLoginAvailable
      );

      return container.innerHTML;
    },
  },
};
</script>

<style scoped>
.help-content {
  width: 100%;
}
.help-content-error {
  margin: 16px 0;
}
.help-content :deep(section){
  margin-bottom: 28px;
}
.help-content :deep(h2){
  font-size: 1.35em !important;
  font-weight: bold !important;
  margin-top: 1em !important;
  margin-bottom: 0.45em !important;
}
.help-content :deep(h3){
  font-size: 1.12em !important;
  font-weight: bold !important;
  margin-top: 1em !important;
  margin-bottom: 0.35em !important;
}
.help-content :deep(p),
.help-content :deep(li){
  line-height: 1.7;
}
.help-content :deep(details){
  border-top: 1px solid #d7d7d7;
}
.help-content :deep(details:last-of-type){
  border-bottom: 1px solid #d7d7d7;
}
.help-content :deep(summary){
  padding: 14px 8px;
  cursor: pointer;
  font-weight: bold;
  line-height: 1.5;
}
.help-content :deep(summary:hover){
  background-color: #f5f5f5;
}
.help-content :deep(.help-topic-content){
  padding: 0 16px 14px;
}
.help-content :deep(.help-table-wrap){
  overflow-x: auto;
}
.help-content :deep(table){
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0 24px;
}
.help-content :deep(th),
.help-content :deep(td){
  border: 1px solid #dddddd;
  padding: 8px;
  text-align: start;
  vertical-align: top;
}
.help-content :deep(th){
  background-color: #f5f5f5;
  font-weight: bold;
}
.help-content :deep(kbd){
  display: inline-block;
  min-width: 1.6em;
  padding: 2px 6px;
  border: 1px solid #bbbbbb;
  border-radius: 4px;
  background-color: #f7f7f7;
  font-family: inherit;
  text-align: center;
}
@media screen and (max-width: 600px) {
  .help-content :deep(.help-topic-content){
    padding-inline: 8px;
  }
}
</style>
