<template>
  <span class="management-status-badge" :class="`management-status-badge--${resolvedTone}`">
    <slot>{{ label }}</slot>
  </span>
</template>

<script>
const STATUS_TONES = ['neutral', 'success', 'warning', 'danger', 'info'];

export default {
  name: 'ManagementStatusBadge',
  props: {
    label: {
      type: String,
      default: '',
    },
    tone: {
      type: String,
      default: 'neutral',
      validator: (value) => STATUS_TONES.includes(value),
    },
  },
  computed: {
    resolvedTone() {
      return STATUS_TONES.includes(this.tone) ? this.tone : 'neutral';
    },
  },
};
</script>
