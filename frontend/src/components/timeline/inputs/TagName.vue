<template>
  <span :class="{ 'ai-tag-name': tag?.ai_enabled }" dir="auto">
    {{ name }}<template v-if="tag?.ai_enabled"> <span class="ai-badge" aria-hidden="true">{{ $t('aiVisibility.badge') }}</span><span class="sr-only"> {{ $t('aiVisibility.enabled') }}</span></template>
  </span>
</template>
<script>
import TranslationUtil from '@/utils/translationUtil';
export default {
  props: { tag: Object },
  computed: { name() { return this.tag ? TranslationUtil.getTagName(this.tag, this.$i18n?.locale || 'ja') : ''; } },
};
</script>
<style scoped>
.ai-tag-name { color: #6b21a8; }
.ai-badge { display: inline-block; font-size: .75em; font-weight: 700; padding: 0 4px; border-radius: 4px; background: #f3e8ff; color: #6b21a8; vertical-align: middle; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>
