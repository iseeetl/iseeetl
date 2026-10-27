<template>
  <div class="mobile-composer-tools">
    <UiButton v-for="item in sources" :key="item.kind" :tone="item.kind === 'voice' && recording ? 'danger' : 'neutral'"
      :aria-label="$t(item.kind === 'voice' && recording ? '録音停止' : item.label)" :title="$t(item.kind === 'voice' && recording ? '録音停止' : item.label)"
      :aria-pressed="item.kind === 'voice' ? String(recording) : undefined"
      :class="{ 'is-locked': locked }" :aria-description="locked ? $t('ログインが必要です') : undefined"
      :disabled="sending || transcribing || (recording && item.kind !== 'voice')"
      @click="item.kind === 'voice' ? $emit('record') : $emit('choose', item.kind)">
      <UiIcon :name="item.kind === 'voice' && recording ? 'stop' : item.icon" />
      <span class="source-label">{{ $t(item.kind === 'voice' && recording ? 'composerSource.stop' : item.short) }}</span>
    </UiButton>
  </div>
</template>
<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
export default {
  components: { UiButton, UiIcon }, emits: ['choose', 'record'],
  props: { sending:Boolean, recording:Boolean, transcribing:Boolean, locked:Boolean },
  data() { return { sources: [
    {kind:'file',icon:'attach_file',label:'composerSource.file',short:'composerSource.fileShort'},
    {kind:'voice',icon:'mic',label:'composerSource.record',short:'composerSource.recordShort'},
  ] }; },
};
</script>
<style scoped>
.mobile-composer-tools { display:flex; gap:0; flex-shrink:0; }
.mobile-composer-tools > .ui-button { display:flex; flex-direction:column; justify-content:center; gap:0; width:44px; min-width:44px; min-height:44px; margin:0; padding:2px 0; }
.source-label { font-size:10px; line-height:1.2; white-space:nowrap; }
.mobile-composer-tools > .ui-button.is-locked { opacity:.55; }
</style>
