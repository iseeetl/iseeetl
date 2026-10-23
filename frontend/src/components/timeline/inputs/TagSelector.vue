<template>
  <div role="group" class="tag-group">
    <p v-if="showSource && sourceLabel" class="tag-source" data-testid="post-tag-source">{{ $t('postDefaults.source', { source: sourceLabel }) }}</p>
    <div class="legend-with-buttons">
      <div :class="['tag-actions', { 'tag-actions--sources': showSource }]">
        <button type="button" class="tag-action-button" :aria-pressed="showSource ? source === 'clear' : undefined" @click="clearAll" :disabled="sending || recording">
          {{ $t('クリア') }}
        </button>

        <button v-if="showSource" type="button" class="tag-action-button"
          :disabled="!selectAvailableTags(columnTags).length || sending || recording"
          :aria-pressed="source === 'tab'" :title="$t(selectAvailableTags(columnTags).length ? 'postDefaults.thisTabHelp' : 'postDefaults.noTabTags')"
          data-testid="tag-selector-this-tab" @click="setColumn">{{ $t('postDefaults.thisTab') }}</button>
        <button
          type="button"
          class="tag-action-button"
          :aria-label="$t('元投稿')" :disabled="!hasOriginal || sending || recording"
          :aria-pressed="showSource ? source === 'original' : undefined" @click="setOriginal"
        >
          {{ showSource ? $t('postDefaults.originalShort') : $t('元投稿') }}
        </button>

        <button
          type="button"
          class="tag-action-button"
          :aria-label="$t('前回投稿')" :disabled="!hasPrevious || sending || recording"
          :aria-pressed="showSource ? source === 'previous' : undefined" @click="setPrevious"
        >
          {{ showSource ? $t('postDefaults.previousShort') : $t('前回投稿') }}
        </button>

        <button
          type="button"
          class="tag-action-button"
          :disabled="!hasCopiedTags || sending || recording"
          data-testid="tag-selector-paste-button"
          :aria-pressed="showSource ? source === 'paste' : undefined" @click="pasteCopied"
        >
          {{ $t('貼り付け') }}
        </button>
      </div>
    </div>

    <div class="tag-options">
      <label
        v-for="tag in sortedTags"
        :key="tag._id"
        class="tag-option"
        :for="tagCheckboxId(tag._id)"
      >
        <input
          type="checkbox"
          :id="tagCheckboxId(tag._id)"
          :data-testid="'tag-selector-checkbox-' + tag._id"
          :data-tag-id="tag._id"
          :value="tag._id"
          :checked="modelValue.includes(tag._id)"
          @change="onChange($event, tag._id)"
          :disabled="sending || recording"
        />
        <span dir="auto">{{ getTagName(tag) }}</span>
      </label>
    </div>
  </div>
</template>

<script>
import { useId } from 'vue';
import TranslationUtil from '@/utils/translationUtil';
import { showSnackbar } from '@/utils/snackbar';

export default {
  name: 'TagSelector',
  emits: ['update:modelValue', 'source-change'],
  setup() {
    const tagCheckboxPrefix = useId();
    return {
      tagCheckboxId: (tagId) => `${tagCheckboxPrefix}-tag-checkbox-${tagId}`,
    };
  },
  props: {
    showSource: { type: Boolean, default: false },
    originalAvailable: { type: Boolean, default: false },
    source: { type: String, default: null },
    columnTags: { type: Array, default: () => [] },
    tags: {
      type: Array,
      default: () => [],
    },
    modelValue: {
      type: Array,
      default: () => [],
    },
    locale: {
      type: String,
      required: true,
    },
    originalTags: {
      type: Array,
      default: () => [],
    },
    previousTags: {
      type: Array,
      default: () => [],
    },
    copiedTags: {
      type: Array,
      default: () => [],
    },
    preservedTags: {
      type: Array,
      default: () => [],
    },
    sending: { type: Boolean, default: false },
    recording: { type: Boolean, default: false },
  },
  computed: {
    sourceLabel() {
      const labels = { clear: 'クリア', tab: 'postDefaults.thisTab', original: '元投稿', previous: '前回投稿', paste: '貼り付け' };
      return labels[this.source] ? this.$t(labels[this.source]) : '';
    },
    sortedTags: function () {
      if (!this.tags) {
        return [];
      }
      // 親から受け取ったタグの順序を変えないよう、配列を複製して並べ替える。
      return [].concat(this.tags).sort(function (a, b) {
        return a.order - b.order;
      });
    },
    availableTagIds() {
      return new Set((this.tags || []).map((tag) => tag._id));
    },
    selectableOriginalTags() {
      return this.selectAvailableTags(this.originalTags);
    },
    selectablePreviousTags() {
      return this.selectAvailableTags(this.previousTags);
    },
    hasOriginal() {
      return this.originalAvailable || this.selectableOriginalTags.length > 0;
    },
    hasPrevious() {
      return this.selectablePreviousTags.length > 0;
    },
    copyableCopiedTags() {
      const result = [];
      (this.copiedTags || []).forEach((tagId) => {
        if (this.availableTagIds.has(tagId) && !result.includes(tagId)) {
          result.push(tagId);
        }
      });
      return result;
    },
    hasCopiedTags() {
      return this.copyableCopiedTags.length > 0;
    },
  },
  methods: {
    selectAvailableTags(tagIds) {
      const result = [];
      (Array.isArray(tagIds) ? tagIds : []).forEach((tagId) => {
        if (this.availableTagIds.has(tagId) && !result.includes(tagId)) result.push(tagId);
      });
      return result;
    },
    withPreservedTags(tagIds) {
      const result = [];
      [...(Array.isArray(this.preservedTags) ? this.preservedTags : []), ...tagIds].forEach((tagId) => {
        if (!result.includes(tagId)) result.push(tagId);
      });
      return result;
    },
    getTagName: function (tag) {
      return TranslationUtil.getTagName(tag, this.locale);
    },
    onChange(event, id) {
      const next = this.modelValue.slice();
      if (event.target.checked) {
        if (!next.includes(id)) next.push(id);
      } else {
        const idx = next.indexOf(id);
        if (idx !== -1) next.splice(idx, 1);
      }
      this.$emit('update:modelValue', next);
      this.$emit('source-change', null);
    },
    setColumn() {
      this.$emit('update:modelValue', this.selectAvailableTags(this.columnTags));
      this.$emit('source-change', 'tab');
    },
    clearAll() {
      this.$emit('source-change', 'clear');
      this.$emit('update:modelValue', this.withPreservedTags([]));
    },
    setOriginal() {
      this.$emit('source-change', 'original');
      if (this.hasOriginal) {
        this.$emit('update:modelValue', this.withPreservedTags(this.selectableOriginalTags));
      }
    },
    setPrevious() {
      this.$emit('source-change', 'previous');
      if (this.hasPrevious) {
        this.$emit('update:modelValue', this.withPreservedTags(this.selectablePreviousTags));
      }
    },
    pasteCopied() {
      if (!this.hasCopiedTags || this.sending || this.recording) return;
      this.$emit('update:modelValue', this.withPreservedTags(this.copyableCopiedTags));
      this.$emit('source-change', 'paste');
      showSnackbar(this.$store, this.$t('タグを貼り付けました'), 'status');
    },
  },
};
</script>

<style scoped>
.legend-with-buttons {
  display: flex;
  align-items: center;
  width: 100%;
  margin-bottom: 8px;
}

.legend-with-buttons > span {
  margin-inline-end: 8px;
  white-space: nowrap;
  flex: 0 0 auto;
}

.tag-actions {
  flex: 1 1 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.tag-action-button {
  width: 100%;
  padding: 4px 0;
  border: 1px solid #666;
  background: #eee;
  border-radius: 4px;
  cursor: pointer;
  text-align: center;
}

.tag-action-button:disabled {
  background: #ccc;
  cursor: default;
}

.tag-source { font-size: 13px; margin: 0 0 6px; }
.tag-actions--sources { display: flex; flex-wrap: nowrap; gap: 4px; overflow-x: auto; padding: 2px; }
.tag-actions--sources .tag-action-button { flex: 1 0 auto; width: auto; padding: 5px 2px; font-size: 14px; white-space: nowrap; min-height: 38px; }
.tag-actions--sources .tag-action-button[aria-pressed='true'] { background: var(--ui-color-primary); color: white; border-color: #3030a9; box-shadow: inset 0 0 0 1px white; font-weight: 600; }
</style>

<style scoped src="@/styles/tag-options.css"></style>
