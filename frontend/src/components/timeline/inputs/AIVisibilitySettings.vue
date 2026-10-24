<template>
  <fieldset class="ai-settings" :disabled="!enabled" :aria-describedby="helpId">
    <legend>{{ $t('aiVisibility.roomTitle') }} — {{ roomTitle }}</legend>
    <div class="ai-modes" role="radiogroup" :aria-label="$t('aiVisibility.roomTitle')">
      <label v-for="mode in modes" :key="mode" class="ai-mode">
        <input type="radio" :name="groupId" :value="mode" :checked="modelValue.mode === mode" @change="setMode(mode)" />
        {{ $t(modeKeys[mode]) }}
      </label>
    </div>
    <label class="ai-mobile-mode" :for="selectId">{{ $t('aiVisibility.mode') }}</label>
    <select class="ai-mobile-mode input-select" :id="selectId" :value="modelValue.mode" @change="setMode($event.target.value)">
      <option v-for="mode in modes" :key="mode" :value="mode">{{ $t(modeKeys[mode]) }}</option>
    </select>
    <p :id="helpId" class="ai-help">{{ $t('aiVisibility.help') }}</p>
    <template v-if="modelValue.mode === 'tags'">
      <p role="status" v-if="loading">{{ $t('aiVisibility.loading') }}</p>
      <p role="alert" v-else-if="failed">{{ $t('aiVisibility.loadFailed') }}</p>
      <div v-else class="ai-source-options" role="group" :aria-label="$t('aiVisibility.shownTags')">
        <label v-for="tag in sourceOptions" :key="tag._id" class="ai-source-option">
          <input type="checkbox" :aria-label="$t('aiVisibility.showSource', { tag: sourceName(tag) })" :checked="!modelValue.hiddenTagIds.includes(tag._id)" @change="toggle(tag._id, $event.target.checked)" />
          <span>{{ sourceName(tag) }}</span>
        </label>
        <p v-if="!sourceOptions.length">{{ $t('aiVisibility.noSources') }}</p>
      </div>
    </template>
  </fieldset>
</template>
<script>
import { useId } from 'vue';
import apiClient from '@/api/apiClient';
import TranslationUtil from '@/utils/translationUtil';
export default {
  props: { roomId: String, roomTitle: String, enabled: Boolean, modelValue: Object, tags: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup() { const id = useId(); return { groupId: `${id}-ai-modes`, selectId: `${id}-ai-select`, helpId: `${id}-ai-help` }; },
  data() { return { modes: ['all', 'tags', 'none'], modeKeys: { all: 'aiVisibility.all', tags: 'aiVisibility.tags', none: 'aiVisibility.none' }, sources: [], loading: true, failed: false, loadRevision: 0 }; },
  computed: {
    sourceOptions() {
      const result = new Map(this.sources.map((tag) => [tag._id, tag]));
      this.tags.filter((tag) => tag.ai_enabled).forEach((tag) => result.set(tag._id, tag));
      this.modelValue.hiddenTagIds.forEach((id) => { if (!result.has(id)) result.set(id, { _id: id, unknown: id === '__unknown__', unavailable: true }); });
      return [...result.values()];
    },
  },
  watch: { roomId: { immediate: true, handler: 'loadSources' } },
  beforeUnmount() { this.loadRevision++; },
  methods: {
    async loadSources() {
      const revision = ++this.loadRevision;
      this.sources = []; this.loading = true; this.failed = false;
      try {
        const { data } = await apiClient.get(`/api/rooms/${encodeURIComponent(this.roomId)}/ai-sources`);
        if (revision === this.loadRevision) this.sources = data;
      } catch { if (revision === this.loadRevision) this.failed = true; }
      finally { if (revision === this.loadRevision) this.loading = false; }
    },
    sourceName(tag) {
      if (tag.unknown) return this.$t('aiVisibility.unknown');
      if (tag.unavailable) return this.$t('aiVisibility.unavailable', { id: tag._id });
      const name = TranslationUtil.getTagName(tag, this.$i18n.locale);
      return tag.delete_flg ? this.$t('aiVisibility.deleted', { name }) : name;
    },
    setMode(mode) { this.$emit('update:modelValue', { ...this.modelValue, mode }); },
    toggle(id, checked) {
      const hiddenTagIds = this.modelValue.hiddenTagIds.filter((value) => value !== id);
      if (!checked) hiddenTagIds.push(id);
      this.$emit('update:modelValue', { ...this.modelValue, hiddenTagIds });
    },
  },
};
</script>
<style scoped>
.ai-settings { margin: 20px 0 0; padding: 16px; border: 1px solid #d7c2e9; border-radius: 8px; min-width: 0; }
.ai-settings legend { font-size: 16px; font-weight: 600; padding: 0 4px; }
.ai-modes, .ai-source-options { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.ai-mode, .ai-source-option { display: flex; align-items: center; gap: 8px; min-height: 36px; max-width: 100%; cursor: pointer; padding: 0; margin: 0; }
.ai-source-option span { overflow-wrap: anywhere; }
.ai-settings input { width: 16px; height: 16px; margin: 0; flex-shrink: 0; }
.ai-help { font-size: 14px; margin: 12px 0; }
.ai-mobile-mode { display: none; }
.ai-settings:disabled { opacity: .6; }
@media (max-width: 600px) {
  .ai-modes { display: none; }
  .ai-mobile-mode { display: block; width: 100%; margin-top: 8px; }
  .ai-settings { padding: 12px; }
}
</style>
