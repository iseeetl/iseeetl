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

<style scoped>
.timeline-text-content a,
.timeline-text-content a:visited {
  color: #8fd3ff;
  text-decoration: underline;
  text-underline-offset: 0.15em;
  overflow-wrap: anywhere;
  word-break: normal;
}

.timeline-text-content a:hover,
.timeline-text-content a:active {
  color: #c1e6ff;
}

.timeline-text-content a:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
  border-radius: 2px;
}
</style>
