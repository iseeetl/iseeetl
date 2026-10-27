<template>
  <div v-if="center?.enabled && center.pending" class="activity-banner">
    <span role="status">{{ $t('activity.newUpdates') }}</span>
    <button type="button" @click="center.show(true)">{{ $t('updateNotice.show') }}</button>
    <button type="button" @click="center.showSettings()">{{ $t('activity.settings') }}</button>
    <button type="button" :aria-label="$t('activity.dismissBanner')" @click="center.dismissBanner()">×</button>
  </div>
</template>
<script>export default { inject: { activityController: { default: null } }, computed: { center() { return this.activityController?.center(); } } };</script>
<style scoped>.activity-banner{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#26374f;color:white;font-size:14px;flex-wrap:wrap}.activity-banner button{font:inherit;color:inherit;background:transparent;border:1px solid #a8bddc;border-radius:4px;min-height:32px;padding:4px 8px}.activity-banner button:focus-visible{outline:3px solid #ffdb67;outline-offset:2px}</style>
