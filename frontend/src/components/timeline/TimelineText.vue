<template>
  <span class="timeline-text-content" dir="auto">
    <template v-for="(token, index) in tokens" :key="`${token.type}-${index}`">
      <a
        v-if="token.type === 'link'"
        :href="token.href"
        target="_blank"
        rel="noopener noreferrer"
      >{{ token.value }}</a>
      <template v-else>{{ token.value }}</template>
    </template>
  </span>
</template>

<script>
import { tokenizeTimelineText } from '@/features/timeline/timelineUtil';

export default {
  name: 'TimelineText',
  props: {
    content: {
      type: [String, Number],
      default: '',
    },
  },
  computed: {
    tokens() {
      return tokenizeTimelineText(this.content);
    },
  },
};
</script>
