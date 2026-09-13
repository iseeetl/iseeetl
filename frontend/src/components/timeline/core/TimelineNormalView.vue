<template>
  <div class="view">
    <TimelineHeader v-bind="headerProps" ref="timelineHeaderRef" v-on="headerEvents" />

    <div class="socket-status" v-if="showSocketStatus" data-testid="timeline-socket-status">
      <span class="socket-status__text">{{ socketStatusMessage }}</span>
      <button type="button" class="socket-status__button" @click="onReconnect">{{ $t('再接続') }}</button>
    </div>

    <div class="view-content" :aria-busy="!isSocketConnect">
      <div v-if="isSocketConnect" class="timeline-connected-marker" data-testid="timeline-connected"></div>
      <TimelineTabs
        ref="tabsRef"
        :filters="filters"
        :currentTabIndex="currentTabIndex"
        :localTagIds="localTagIds"
        :getTranslatedTagName="getTranslatedTagName"
        :isSpeechActive="isSpeechActive"
        :onPressFilterTab="onPressFilterTab"
        :onToggleColumnSpeech="onToggleColumnSpeech"
        :onShowFilterDialog="onShowFilterDialog"
        :onDeleteFilter="onDeleteFilter"
        :onTabListKeydown="onTabListKeydown"
      />

      <TimelineMobilePostButtons
        :isGuestReactionOnly="isGuestReactionOnly"
        :defaultTagIds="currentFilterTagIds"
        :onShowEditPostDialog="onShowEditPostDialog"
      />

      <TimelineColumns
        :filters="filters"
        :currentTabIndex="currentTabIndex"
        :isMobile="isMobile"
        :commonColumnProps="commonColumnProps"
        :commonColumnEvents="commonColumnEvents"
        :onPaneResized="onPaneResized"
        :onDragEnd="onDragEnd"
      />
    </div>
  </div>
</template>

<script>
import TimelineColumns from '@/components/timeline/core/TimelineColumns.vue';
import TimelineHeader from '@/components/timeline/core/TimelineHeader.vue';
import TimelineTabs from '@/components/timeline/core/TimelineTabs.vue';
import TimelineMobilePostButtons from '@/components/timeline/core/TimelineMobilePostButtons.vue';

export default {
  name: 'TimelineNormalView',
  components: {
    TimelineColumns,
    TimelineHeader,
    TimelineTabs,
    TimelineMobilePostButtons,
  },
  props: {
    headerProps: {
      type: Object,
      default: () => ({}),
    },
    headerEvents: {
      type: Object,
      default: () => ({}),
    },
    isSocketConnect: {
      type: Boolean,
      default: false,
    },
    socketStatusMessage: {
      type: String,
      default: '',
    },
    showSocketStatus: {
      type: Boolean,
      default: false,
    },
    isGuestReactionOnly: {
      type: Boolean,
      default: false,
    },
    filters: {
      type: Array,
      default: () => [],
    },
    currentTabIndex: {
      type: Number,
      default: 0,
    },
    localTagIds: {
      type: Array,
      default: () => [],
    },
    getTranslatedTagName: {
      type: Function,
      required: true,
    },
    isSpeechActive: {
      type: Function,
      required: true,
    },
    onPressFilterTab: {
      type: Function,
      required: true,
    },
    onToggleColumnSpeech: {
      type: Function,
      required: true,
    },
    onShowFilterDialog: {
      type: Function,
      required: true,
    },
    onDeleteFilter: {
      type: Function,
      required: true,
    },
    onTabListKeydown: {
      type: Function,
      required: true,
    },
    onShowEditPostDialog: {
      type: Function,
      required: true,
    },
    currentFilterTagIds: {
      type: Array,
      default: () => [],
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
    onReconnect: {
      type: Function,
      required: true,
    },
  },
};
</script>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}
.socket-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: #fff5d6;
  border-bottom: 1px solid #f0d38a;
  color: #5a3b00;
  font-size: 14px;
}
.socket-status__text {
  flex: 1;
}
.socket-status__button {
  border: 1px solid #cfa85a;
  background: #fff1c2;
  color: #5a3b00;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.socket-status__button:hover {
  background: #ffe59a;
}
.timeline-connected-marker {
  height: 0;
  width: 0;
  overflow: hidden;
}
.view-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  margin: 0;
  padding: 0;
}
</style>
