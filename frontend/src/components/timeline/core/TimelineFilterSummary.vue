<template>
  <span class="timeline-filter-summary" :class="{ 'is-muted': mutedTone }">
    <template v-if="isConditionless">
      {{ $t('タイムライン') }}
      <br v-if="localTagIds.length" />
      <span v-if="localTagIds.length" class="two-line-ellipsis">
        <span v-for="tid in localTagIds" :key="tid"> #{{ getTranslatedTagName(tid) }} </span>
      </span>
    </template>
    <template v-else>
      <span class="filter-mode-chip" :class="filterModeChipClass">
        {{ filterModeLabel }}
      </span>
      <span v-if="filter.conditions.keyword" :class="conditionTokenClass">
        {{ filter.conditions.keyword }}
      </span>
      <span v-if="filter.conditions.userName" :class="conditionTokenClass">
        {{ filter.conditions.userName }}
      </span>
      <span v-for="(item, i) in normalizedDisplayOrder" :key="'disp_' + i" :class="conditionTokenClass">
        <template v-if="isSpecialKey(item.key)">
          {{ $t(getSpecialTranslationKey(item.key)) }}
        </template>
        <template v-else>#{{ getTranslatedTagName(item.key) }}</template>
      </span>
    </template>
  </span>
</template>

<script>
import { getFilterModeLabel, getSpecialFilterTranslationKey, isSpecialFilterKey } from '@/features/timeline/filterSummary';

export default {
  name: 'TimelineFilterSummary',
  props: {
    filter: {
      type: Object,
      default: () => ({ conditions: null }),
    },
    localTagIds: {
      type: Array,
      default: () => [],
    },
    getTranslatedTagName: {
      type: Function,
      required: true,
    },
    mutedTone: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    isConditionless() {
      return !this.filter || this.filter.conditions === null;
    },
    isExcludeMode() {
      return !this.isConditionless && this.filter.conditions.filterMode === 'exclude';
    },
    normalizedDisplayOrder() {
      if (this.isConditionless) return [];
      if (!Array.isArray(this.filter.conditions.displayOrder)) return [];
      return this.filter.conditions.displayOrder.filter((item) => item && item.key);
    },
    filterModeLabel() {
      if (this.isConditionless) return '';
      return getFilterModeLabel(this.filter.conditions, (key) => this.$t(key));
    },
    filterModeChipClass() {
      if (this.isConditionless) return {};
      return {
        'is-exclude': this.isExcludeMode,
        'is-include': !this.isExcludeMode,
      };
    },
    conditionTokenClass() {
      return {
        'condition-token': true,
        'condition-token--excluded': this.isExcludeMode,
      };
    },
  },
  methods: {
    isSpecialKey(key) {
      return isSpecialFilterKey(key);
    },
    getSpecialTranslationKey(key) {
      return getSpecialFilterTranslationKey(key);
    },
  },
};
</script>

<style scoped>
.timeline-filter-summary {
  display: inline;
}
.two-line-ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-mode-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  margin-inline-end: 6px;
  border: 1px solid rgb(0 0 0 / 20%);
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.2;
  background: #f0f0f0;
  vertical-align: middle;
}
.filter-mode-chip.is-include {
  color: #0f5132;
  background: #d1e7dd;
  border-color: #badbcc;
}
.filter-mode-chip.is-exclude {
  color: #842029;
  background: #f8d7da;
  border-color: #f5c2c7;
}
.condition-token {
  display: inline;
  margin-inline-end: 4px;
}
.condition-token--excluded {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}
.timeline-filter-summary.is-muted {
  color: #777;
}
.timeline-filter-summary.is-muted .filter-mode-chip {
  color: #666;
  background: #e3e3e3;
  border-color: #c7c7c7;
}
</style>
