<template>
  <div class="clients-wrapper">
    <UiIcon class="timeline-participant-count__icon" name="group" />
    <span v-if="participantCount !== null" class="clients">
      {{ $t('{count}人の参加者', { count: formattedParticipantCount }, participantCount) }}
    </span>
  </div>
</template>

<script>
import UiIcon from '@/components/ui/UiIcon.vue';
import { formatLocaleNumber } from '@/utils/numberFormat';

export default {
  name: 'TimelineParticipantCount',
  components: {
    UiIcon,
  },
  props: {
    participantCount: {
      type: Number,
      default: null,
    },
  },
  computed: {
    formattedParticipantCount() {
      return formatLocaleNumber(this.participantCount, this.$i18n?.locale);
    },
  },
};
</script>

<style scoped>
.clients-wrapper {
  display: flex;
  align-items: flex-end;
  margin-inline-start: 8px;
  white-space: nowrap;
  overflow: hidden;
}
.timeline-participant-count__icon {
  color: var(--ui-color-danger);
}
.clients {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-inline-end: 8px;
  font-weight: bold;
  color: #db0000;
  flex-shrink: 1;
  min-width: 0;
}
</style>
