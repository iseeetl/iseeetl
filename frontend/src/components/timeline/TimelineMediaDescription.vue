<template>
  <figcaption v-if="description" class="media-description" dir="auto">
    <span :id="bodyId">{{ canExpand && !expanded ? preview(description) : description }}</span>
    <UiButton v-if="canExpand" appearance="filled" tone="neutral" :aria-expanded="String(expanded)" :aria-controls="bodyId"
      :aria-label="$t(expanded ? 'aiAnswer.collapseLabel' : 'aiAnswer.expandLabel', { title: $t('音声の説明') })"
      @click.stop="expanded = !expanded">{{ $t(expanded ? 'aiAnswer.collapse' : 'aiAnswer.expand') }}</UiButton>
  </figcaption>
</template>
<script>
import { useId } from 'vue';
import UiButton from '@/components/ui/UiButton.vue';
import { supplementPreview } from '@/features/timeline/supplementLength';
export default {
  components: { UiButton },
  props: { description: { type: String, default: '' } },
  setup() { return { bodyId: `media-description-${useId()}` }; },
  data() { return { expanded: false }; },
  computed: { canExpand() { return this.description.length > 400; } },
  watch: { description() { this.expanded = false; } },
  methods: { preview: supplementPreview },
};
</script>
<style scoped>
.media-description { overflow-wrap:anywhere;white-space:pre-wrap; }
.media-description .ui-button { min-height:44px;display:flex;margin:4px 0; }
</style>
