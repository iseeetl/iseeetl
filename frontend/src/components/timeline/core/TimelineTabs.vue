<template>
  <div class="smartphone-tab-menu-wrapper">
    <div class="smartphone-tab-strip">
      <div
        role="tablist"
        id="smartphone-tab-menu"
        class="smartphone-tab-menu"
        :aria-label="$t('タイムライン')"
      >
        <div
          v-for="(filter, index) in filters"
          :key="'tab-item-' + index"
          :id="'tab-item-' + index"
          role="presentation"
          :style="{ gridColumn: index + 1 }"
          :class="['tab-item', currentTabIndex === index ? 'tab-item-active' : 'tab-item-non-active']"
        >
          <UiTooltip :text="getTabTitle(filter)">
            <button
              role="tab"
              :id="'tab-button-' + index"
              :ref="'tab' + index"
              :aria-controls="'timeline-inner-' + index"
              :aria-selected="currentTabIndex === index ? 'true' : 'false'"
              :tabindex="currentTabIndex === index ? '0' : '-1'"
              :aria-label="getTabTitle(filter)"
              class="tab-button"
              @click.stop.prevent="onPressFilterTab(index)"
              @keydown="onTabListKeydown"
            >
              <TimelineFilterSummary
                :filter="filter"
                :localTagIds="localTagIds"
                :getTranslatedTagName="getTranslatedTagName"
                :mutedTone="currentTabIndex !== index"
              />
            </button>
          </UiTooltip>
        </div>
      </div>
      <div
        v-if="filters[currentTabIndex]"
        class="active-tab-actions"
        :style="{ gridColumn: currentTabIndex + 1 }"
        role="group"
        :aria-labelledby="'tab-button-' + currentTabIndex"
      >
        <UiButton
          class="button-position-right"
          appearance="text"
          :tone="isSpeechActive(filters, currentTabIndex) ? 'danger' : 'primary'"
          density="dense"
          iconOnly
          :aria-label="$t(isSpeechActive(filters, currentTabIndex) ? '読み上げオン' : '読み上げオフ')"
          @click="onToggleColumnSpeech(currentTabIndex, $event)"
        >
          <UiIcon :name="isSpeechActive(filters, currentTabIndex) ? 'volume_up' : 'volume_off'" />
        </UiButton>

        <UiButton
          class="mobile-filter-edit-button"
          appearance="text"
          tone="primary"
          density="dense"
          iconOnly
          :aria-label="$t('絞り込み条件変更')"
          @click="onShowFilterDialog(currentTabIndex, filters[currentTabIndex], $event)"
        >
          <UiIcon name="filter_alt" />
        </UiButton>
        <UiButton
          appearance="text"
          tone="primary"
          density="dense"
          iconOnly
          :aria-label="$t('絞り込み削除')"
          @click="onDeleteFilter(currentTabIndex)"
        >
          <UiIcon name="close" />
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script>
import TimelineFilterSummary from '@/components/timeline/core/TimelineFilterSummary.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { buildFilterSummaryText } from '@/features/timeline/filterSummary';

export default {
  name: 'TimelineTabs',
  components: {
    TimelineFilterSummary,
    UiButton,
    UiIcon,
    UiTooltip,
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
  },
  methods: {
    getTabTitle(filter) {
      return buildFilterSummaryText({
        filter,
        localTagIds: this.localTagIds,
        getTranslatedTagName: this.getTranslatedTagName,
        t: (key) => this.$t(key),
      });
    },
    focusTab(index) {
      const ref = this.$refs[`tab${index}`];
      const tabEl = Array.isArray(ref) ? ref[0] : ref;
      if (tabEl && typeof tabEl.focus === 'function') {
        // タブ全体のスクロールを妨げないよう、タイトルへのフォーカス移動ではスクロールさせない。
        tabEl.focus({ preventScroll: true });
      }
    },
    ensureTabVisible(index, smooth = true) {
      const tab = this.$el.querySelector(`#tab-item-${index}`);
      if (!tab) return;

      tab.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'nearest',
        inline: 'nearest',
      });
    },
  },
};
</script>

<style scoped>
.smartphone-tab-menu-wrapper {
  display: none;
  position: relative;
  padding-bottom: 4px;
}
.smartphone-tab-menu-wrapper::before,
.smartphone-tab-menu-wrapper::after {
  content: '';
  position: absolute;
  inset-inline-start: 0;
  bottom: 0;
  display: block;
  width: 100%;
  border-bottom: 4px solid;
}
.smartphone-tab-menu-wrapper::before {
  z-index: 2;
  border-color: rgb(255 146 0);
}
.smartphone-tab-menu-wrapper::after {
  z-index: 3;
  width: 50%;
  border-color: rgb(0 159 168);
}
.smartphone-tab-strip {
  display: none;
  grid-auto-columns: max-content;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.smartphone-tab-menu {
  display: contents;
}
.active-tab-actions {
  display: flex;
  grid-row: 1;
  align-items: center;
  justify-self: end;
  align-self: stretch;
  margin-inline-end: 8px;
  z-index: 1;
}
.smartphone-tab-strip::-webkit-scrollbar {
  display: none;
}
.tab-button {
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  text-align: start;
  max-width: 300px;
  white-space: nowrap;
}
.tab-item {
  display: flex;
  align-items: center;
  grid-row: 1;
  min-height: 45px;
  max-width: 300px;
  padding: 0 8px;
  background: #ddd;
  border-inline-end: 1px solid #ccc;
  overflow: hidden;
}
.tab-item-active {
  background: #fff;
  /* 操作ボタン114px・末尾余白8px・タイトルとの間隔8pxを確保する。 */
  padding-inline-end: 130px;
}
.tab-item > .ui-tooltip__anchor {
  min-width: 0;
}
.tab-item .tab-button .ui-icon {
  color: #171f2a;
}
.tab-item-non-active .tab-button,
.tab-item-non-active .tab-button .ui-icon {
  color: #777;
}
.mobile-filter-edit-button {
  margin-inline-start: auto;
  margin-inline-end: 0;
}

@media (max-width: 896px) {
  .smartphone-tab-menu-wrapper {
    display: block;
  }
  .smartphone-tab-strip {
    display: grid;
  }
  .smartphone-tab-menu .tab-button {
    display: -webkit-box !important;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal !important;
    line-height: 1.4;
  }
  .smartphone-tab-menu .tab-button span,
  .smartphone-tab-menu .tab-button i {
    display: inline;
  }
}
</style>
