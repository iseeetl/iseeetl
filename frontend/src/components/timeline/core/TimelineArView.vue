<template>
  <div class="view-wrapper ar-mode-wrapper">
    <div class="view">
      <div class="view-content">
        <template v-if="isMobile || !isArAll">
          <TimelineColumn
            v-bind="commonColumnProps(primaryFilter, 0)"
            v-if="primaryFilter"
            :key="'ar-mode-single-0'"
            v-on="commonColumnEvents"
            class="ar-mode-column"
          />
        </template>

        <template v-else>
          <splitpanes class="timeline-wrapper">
            <pane
              v-for="(filter, index) in arFilters"
              :key="'ar-mode-pane-' + index"
              :size="(filters[index] && filters[index].size) || 33"
              :min-size="1"
            >
              <TimelineColumn
                v-bind="commonColumnProps(filter, index)"
                :key="'ar-col-' + index"
                v-on="commonColumnEvents"
              />
            </pane>
          </splitpanes>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
import { Splitpanes, Pane } from 'splitpanes';
import TimelineColumn from '@/components/timeline/core/TimelineColumn.vue';

export default {
  name: 'TimelineArView',
  components: {
    TimelineColumn,
    splitpanes: Splitpanes,
    pane: Pane,
  },
  props: {
    filters: {
      type: Array,
      default: () => [],
    },
    isMobile: {
      type: Boolean,
      default: false,
    },
    isArAll: {
      type: Boolean,
      default: false,
    },
    commonColumnProps: {
      type: Function,
      required: true,
    },
    commonColumnEvents: {
      type: Object,
      required: true,
    },
  },
  computed: {
    primaryFilter() {
      return this.filters && this.filters.length ? this.filters[0] : null;
    },
    arFilters() {
      return this.filters && this.filters.length ? this.filters : [{ conditions: null }];
    },
  },
};
</script>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: calc(100svh - 48px);
  padding: 0;
}
.view-content {
  height: calc(100% - 48px);
  overflow: hidden;
  margin: 0;
  padding: 0;
}
</style>
