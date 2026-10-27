<template>
  <UiTooltip v-if="center?.enabled" :text="$t(subscribed ? 'activity.unfollow' : 'activity.follow')">
    <UiButton appearance="text" tone="neutral" density="dense" iconOnly :disabled="busy" :aria-pressed="String(subscribed)"
      :aria-label="$t(subscribed ? 'activity.unfollow' : 'activity.follow')" @click.stop="toggle">
      <UiIcon :name="subscribed ? 'notifications_active' : 'notifications_none'" :size="20" />
    </UiButton>
  </UiTooltip>
</template>
<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
export default { components: { UiButton, UiIcon, UiTooltip }, props: { postId: String },
  inject: { activityController: { default: null } }, data: () => ({ busy: false }),
  computed: { center() { return this.activityController?.center(); }, subscribed() { return this.center?.subscribedIds.includes(this.postId) || false; } },
  methods: { async toggle() { if (this.busy) return; this.busy = true; try { await this.center.subscribe(this.postId, !this.subscribed); } finally { this.busy = false; } } } };
</script>
