<template>
  <UiTooltip v-if="center?.enabled" :text="$t('activity.title')">
    <UiButton data-testid="timeline-activity-button" appearance="filled" tone="primary" iconOnly :aria-label="$t(center.pending ? 'activity.pendingLabel' : 'activity.title')" @click="center.show()">
      <UiIcon name="history" /><span v-if="center.pending" class="activity-dot" aria-hidden="true"></span>
    </UiButton>
  </UiTooltip>
</template>
<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
export default { components: { UiButton, UiIcon, UiTooltip }, inject: { activityController: { default: null } },
  computed: { center() { return this.activityController?.center(); } } };
</script>
<style scoped>.activity-dot{width:8px;height:8px;background:#fff;border:2px solid #172137;border-radius:50%;position:absolute;top:5px;right:5px}</style>
