<template>
  <splitpanes
    v-if="!isMobile && filters.length > 0"
    ref="desktopPanesRef"
    class="timeline-wrapper"
    push-other-panes
    @resized="onPaneResized"
  >
    <pane
      v-for="(filter, index) in filters"
      :key="filterItemKey(filter)"
      :size="filter.size || 33"
      :min-size="1"
    >
      <TimelineColumn v-bind="commonColumnProps(filter, index)" v-on="commonColumnEvents" />
    </pane>
  </splitpanes>
  <div v-else-if="!isMobile" class="timeline-wrapper"></div>
  <div v-else class="timeline-wrapper mobile-wrapper">
    <template v-for="(filter, index) in filters" :key="filterItemKey(filter)">
      <TimelineColumn
        v-if="index === currentTabIndex"
        v-bind="commonColumnProps(filter, index)"
        v-on="commonColumnEvents"
      />
      <div
        v-else
        :id="'timeline-inner-' + index"
        role="tabpanel"
        :aria-labelledby="'tab-button-' + index"
        hidden
      ></div>
    </template>
  </div>
</template>

<script>
import Sortable from 'sortablejs';
import { Pane, Splitpanes } from 'splitpanes';
import { markRaw } from 'vue';
import TimelineColumn from '@/components/timeline/core/TimelineColumn.vue';

let anonymousFilterId = 0;
const anonymousFilterIds = new WeakMap();

export default {
  name: 'TimelineColumns',
  components: {
    pane: Pane,
    splitpanes: Splitpanes,
    TimelineColumn,
  },
  data() {
    return {
      desktopSortable: null,
      desktopSortableElement: null,
    };
  },
  props: {
    filters: {
      type: Array,
      default: () => [],
    },
    currentTabIndex: {
      type: Number,
      default: 0,
    },
    isMobile: {
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
    onPaneResized: {
      type: Function,
      required: true,
    },
    onDragEnd: {
      type: Function,
      required: true,
    },
  },
  watch: {
    isMobile() {
      this.$nextTick(this.syncDesktopSortable);
    },
    'filters.length'() {
      this.$nextTick(this.syncDesktopSortable);
    },
  },
  mounted() {
    this.syncDesktopSortable();
  },
  beforeUnmount() {
    this.destroyDesktopSortable();
  },
  methods: {
    filterItemKey(filter) {
      if (filter.id) return `id:${filter.id}`;
      if (filter.pushFilterId) return `push:${filter.pushFilterId}`;

      if (!anonymousFilterIds.has(filter)) {
        anonymousFilterId += 1;
        anonymousFilterIds.set(filter, `local:${anonymousFilterId}`);
      }
      return anonymousFilterIds.get(filter);
    },
    getDesktopPanesElement() {
      const panes = this.$refs.desktopPanesRef;
      return panes?.$el || panes || null;
    },
    destroyDesktopSortable() {
      if (this.desktopSortable) {
        this.desktopSortable.destroy();
        this.desktopSortable = null;
        this.desktopSortableElement = null;
      }
    },
    syncDesktopSortable() {
      const element = this.getDesktopPanesElement();
      if (!element || this.isMobile || this.filters.length === 0) {
        this.destroyDesktopSortable();
        return;
      }
      if (this.desktopSortableElement === element && this.desktopSortable) return;

      this.destroyDesktopSortable();
      this.desktopSortable = markRaw(
        new Sortable(element, {
          draggable: '.splitpanes__pane',
          handle: '.timeline-handle',
          animation: 150,
          onEnd: this.handleSortableEnd,
        })
      );
      this.desktopSortableElement = element;
    },
    handleSortableEnd(event) {
      this.onDragEnd(event);
    },
  },
};
</script>

<style scoped>
.mobile-wrapper {
  overflow-x: hidden;
}
</style>
