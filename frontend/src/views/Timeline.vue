<template>
  <div class="timeline-page">
    <p
      v-if="initializationError"
      data-testid="timeline-initialization-error"
      class="screen-reader-only"
      role="alert"
    >
      {{ initializationError }}
    </p>
    <audio
      id="new_audio"
      ref="newAudio"
      class="hidden-audio"
      aria-hidden="true"
      data-testid="timeline-notification-audio"
      preload="auto"
    >
      <source src="/assets/sound/decision34.mp3" type="audio/mpeg" />
    </audio>
    <TimelineArView
      v-if="isArMode"
      :filters="timeline.filters"
      :isMobile="isMobile"
      :isArAll="isArAll"
      :commonColumnProps="commonColumnProps"
      :commonColumnEvents="commonColumnEvents"
    />

    <div v-else class="view-wrapper">
      <TimelineNormalView
        ref="normalViewRef"
        :isSocketConnect="infra.isSocketConnect"
        :socketStatusMessage="socketStatusMessage"
        :showSocketStatus="showSocketStatus"
        :isGuestReactionOnly="isGuestReactionOnly"
        :filters="timeline.filters"
        :currentTabIndex="ui.currentTabIndex"
        :localTagIds="ui.localTagIds"
        :headerProps="headerProps"
        :headerEvents="headerEvents"
        :getTranslatedTagName="getTranslatedTagName"
        :isSpeechActive="isSpeechActive"
        :onPressFilterTab="onPressFilterTab"
        :onToggleColumnSpeech="toggleColumnSpeech"
        :onShowFilterDialog="showFilterDialog"
        :onDeleteFilter="deleteFilter"
        :onTabListKeydown="handleTabListKeydown"
        :onShowEditPostDialog="showEditPostDialog"
        :currentFilterTagIds="currentFilterTagIds"
        :isMobile="isMobile"
        :commonColumnProps="commonColumnProps"
        :commonColumnEvents="commonColumnEvents"
        :onPaneResized="onPaneResized"
        :onDragEnd="onDragEnd"
        :onReconnect="handleSocketReconnect"
      />
    </div>

    <TimelineDialogs
      ref="dialogsRef"
      :dialogs="dialogs"
      :dialogShared="dialogShared"
      @dialog-event="handleDialogEvent"
    />
  </div>
</template>

<script>
import chatApi from '@/api/chat';
import roomApi from '@/api/room';
import { appendApiErrorMessage } from '@/api/apiClient';

import TimelineUtil from '@/features/timeline/timelineUtil';
import {
  ensurePostsArray as ensurePostsArrayInFilters,
  getConditionlessIndexes,
  getDefaultIndex as getDefaultIndexFromFilters,
  getLatestReplyablePost as getLatestReplyablePostFromFilters,
  getPresetTagIdsFromFilter,
  insertNewToFiltersHead as insertNewToFiltersHeadInFilters,
  reconcilePostInFilters as reconcilePostInFiltersState,
  removeFromFilters as removeFromFiltersInFilters,
  sanitizeFiltersForStore,
  updateExistingInFilters as updateExistingInFiltersInFilters,
} from '@/features/timeline/filters';
import {
  reevaluateAutoLoad,
  setupScrollIntersectionObserver,
  setupTimelineContentObserver,
} from '@/features/timeline/observers';
import {
  connectInitialSocket as connectInitialTimelineSocket,
  disposeTimelineSocket,
  requestSocketReconnect as requestTimelineSocketReconnect,
} from '@/features/timeline/socketClient';
import { buildColumnEvents, buildColumnProps } from '@/features/timeline/columns';
import { initTimeLine as initTimeLineUtil } from '@/features/timeline/bootstrap';
import { applyTimelineSettings } from '@/features/timeline/settings';
import { createTimelineLifecycleGuard } from '@/features/timeline/lifecycleGuard';
import { createTimelineTracker } from '@/features/analytics/timelineTracking.js';
import { syncUserProfileSnapshots } from '@/features/profile/userDisplayMethods';
import { timelineDialogMethods } from '@/features/timeline/dialogMethods';
import { timelineFilterMethods } from '@/features/timeline/filterMethods';
import { timelinePresentationMethods } from '@/features/timeline/presentationMethods';
import { createTimelineViewState } from '@/features/timeline/viewState';
import { disposeTimelineView, mountTimelineView } from '@/features/timeline/viewLifecycle';
import {
  createTimelineDialogEventHandlers,
  createTimelineHeaderEvents,
  dispatchTimelineDialogEvent,
} from '@/features/timeline/viewEvents';

import {
  getTimelineFilterQuerySignature,
  matchesConditionGroups,
  matchesPostConditionGroups,
  parseTimelineQueryFilters,
  toServerQuery,
} from '@/features/timeline/queryFilters';
import TimelineArView from '@/components/timeline/core/TimelineArView.vue';
import TimelineNormalView from '@/components/timeline/core/TimelineNormalView.vue';
import TimelineDialogs from '@/components/timeline/core/TimelineDialogs.vue';

export default {
  name: 'Timeline',
  inject: {
    analyticsEventReporter: {
      from: 'analyticsEventReporter',
      default: null,
    },
    analyticsPageReporter: {
      from: 'analyticsPageReporter',
      default: null,
    },
  },
  setup() {
    return { timelineLifecycle: createTimelineLifecycleGuard() };
  },
  provide() {
    // 子孫のリアクション部品でも、ゲスト利用ルールへの同意を待ってから操作を続けられるようにする。
    return {
      requireGuestRules: () => this.ensureGuestRules(),
      timelineOperationReporter: Object.freeze({
        capture: () => this.captureTimelineOperation(),
        report: (token, operation) => this.reportTimelineOperation(token, operation),
      }),
    };
  },
  components: {
    TimelineArView,
    TimelineNormalView,
    TimelineDialogs,
  },
  data() {
    return createTimelineViewState();
  },
  created() {
    this.initializeTimelineAnalytics();

    this.checkMobile();

    this.applyPresentationQuery(this.$route.query);

    this.handleRoutePostIdChange(this.$route.params.post_id);

    this.initTimeLine();
  },
  mounted() {
    mountTimelineView(this);
  },
  beforeUnmount() {
    disposeTimelineView(this, { disposeSocket: disposeTimelineSocket });
  },
  computed: {
    effectiveAnimationEnabled() {
      return this.$store.getters.enableTextAnimation === true && this.ui.localEnableTextAnimation === true;
    },
    currentUserProfileSnapshot() {
      return {
        userId: this.$store.getters.userId,
        userName: this.$store.getters.userName,
        userImageName: this.$store.getters.userImageName,
      };
    },
    isMobile() {
      return this.ui.windowWidth <= 896;
    },
    isGuestReactionOnly() {
      return !this.$store.getters.userIsLogin && this.room.guestReactionOnly;
    },
    headerProps() {
      return {
        roomTitle: this.room.title,
        roomImageUrl: this.room.imageUrl,
        roomStatus: this.room.status,
        isMemberOnly: this.room.isMemberOnly,
        isRoomMember: this.room.isRoomMember,
      };
    },
    headerEvents() {
      return this.getHeaderEvents();
    },
    commonColumnEvents() {
      return this.getColumnEvents();
    },
    currentFilterTagIds() {
      const filter = this.timeline.filters[this.ui.currentTabIndex];
      return getPresetTagIdsFromFilter(filter);
    },
    isArMode() {
      return this.$route.query.armode === 'on';
    },
    isArAll() {
      return this.$route.query.cols === 'all';
    },

    dialogShared() {
      return {
        roomId: this.$store.getters.roomId,
        roomTitle: this.room.title,
        floorId: this.$store.getters.floorId,
        floorTitle: this.$store.getters.floorTitle,
        roomTags: this.room.tags,
        targetLangs: this.timeline.targetLangs,
        quickTextGroups: this.room.quickTextGroups,
        quickTextItemsByGroup: this.room.quickTextItemsByGroup,
        isGuestReactionOnly: this.isGuestReactionOnly,
        disableFilterPersistence: this.ui.queryFilters.active,
        roomInfo: {
          title: this.room.title,
          description: this.room.description,
          creator:
            this.$store.getters.resolveUserDisplayName?.(this.room.creatorUser) || this.room.creator,
          createdAt: this.room.createdAt,
        },
      };
    },
    socketStatusMessage() {
      switch (this.infra.socketStatus) {
        case 'connecting':
          return this.$t('接続中...');
        case 'connect_error':
          return this.$t('接続に失敗しました。再接続中...');
        case 'error':
          return this.$t('接続エラーが発生しました。再接続中...');
        case 'disconnected':
          return this.$t('接続が切断されました。再接続中...');
        default:
          return '';
      }
    },
    showSocketStatus() {
      return !this.infra.isSocketConnect && this.infra.socketStatusVisible;
    },
  },
  watch: {
    '$store.getters.userEyeFriendlyMode'() {
      this.applyEyeFriendlyPreference(this.$route.query);
      this.applyStoredTimelineSettings();
    },
    '$store.getters.lang'(language, previousLanguage) {
      if (language === previousLanguage) return;
      this.handleProfileLanguageChange(language);
    },
    '$i18n.locale'(locale) {
      const queryLanguage = this.getPresentationQueryLanguage(this.$route.query);
      if (!queryLanguage || locale === queryLanguage) return;
      this.$i18n.locale = queryLanguage;
      this.setTargetLangs();
    },
    currentUserProfileSnapshot(profile) {
      this.syncCurrentUserProfileSnapshots(profile);
    },
    effectiveAnimationEnabled(enabled) {
      if (!enabled) {
        this.resetDisabledAnimations();
        return;
      }
      this.$nextTick(this.queueUpdateAnimationObserver);
    },
    '$route.query': {
      deep: true,
      handler(query, previousQuery) {
        this.handleRouteQueryChange(query, previousQuery);
      },
    },
    '$route.params.post_id'(postId) {
      this.handleRoutePostIdChange(postId);
    },
    'infra.isSocketConnect'(newVal) {
      if (newVal) {
        this.$nextTick(() => {
          this.setupTimelineContentObserver();
        });
      }
    },
    // 投稿の変更が画面へ反映された後に、アニメーションの監視対象を更新する。
    'timeline.filters': {
      deep: true,
      handler() {
        this.$nextTick(this.queueUpdateAnimationObserver);
      },
    },
    'timeline.filters.length'(newLen, oldLen) {
      if (newLen === oldLen) return;
      // カラム数の変更による描画が反映されるよう、nextTickを2回待ってから監視対象を更新する。
      this.$nextTick(() => {
        this.$nextTick(this.queueUpdateAnimationObserver);
      });
    },
    'ui.currentTabIndex'() {
      this.$nextTick(this.queueUpdateAnimationObserver);
    },
  },
  methods: {
    ...timelineDialogMethods,
    ...timelineFilterMethods,
    ...timelinePresentationMethods,
    captureTimelineLifecycle() {
      return this.timelineLifecycle.capture(this.infra);
    },
    isTimelineLifecycleCurrent(generation) {
      return this.timelineLifecycle.isCurrent(this.infra, generation);
    },
    canApplyTimelineRequest(generation) {
      return this.timelineLifecycle.canApplyRequest(this.infra, generation);
    },
    shouldIgnoreTimelineRequestError(error, generation) {
      return this.timelineLifecycle.shouldIgnoreRequestError(this.infra, error, generation);
    },
    invalidateTimelineLifecycle() {
      this.timelineLifecycle.invalidate(this.infra);
    },
    initializeTimelineAnalytics() {
      try {
        this.timelineAnalytics.pageToken = this.analyticsPageReporter?.capture?.() || null;
      } catch (_error) {
        this.timelineAnalytics.pageToken = null;
      }
      this.timelineAnalytics.tracker = createTimelineTracker({
        track: (eventName, parameters) => {
          try {
            return this.analyticsEventReporter?.track?.(eventName, parameters) === true;
          } catch (_error) {
            return false;
          }
        },
        getCurrentRoomId: () => this.$route?.params?.room_id || null,
        activatePageResource: (room, onPageViewSent) => {
          if (!this.analyticsPageReporter) {
            onPageViewSent?.();
            return true;
          }
          const token = this.timelineAnalytics.pageToken;
          if (!token) return false;
          try {
            return this.analyticsPageReporter.activate?.(
              token,
              room,
              onPageViewSent
            ) === true;
          } catch (_error) {
            return false;
          }
        },
        cancelPageResource: () => {
          if (!this.analyticsPageReporter) return true;
          const token = this.timelineAnalytics.pageToken;
          this.timelineAnalytics.pageToken = null;
          if (!token) return false;
          try {
            return this.analyticsPageReporter.cancel?.(token) === true;
          } catch (_error) {
            return false;
          }
        },
      });
      this.timelineAnalytics.roomToken = this.timelineAnalytics.tracker.beginRoom(
        this.$route?.params?.room_id
      );
    },
    activateTimelineAnalytics(room) {
      try {
        return this.timelineAnalytics.tracker?.activateRoom(
          this.timelineAnalytics.roomToken,
          { room, roomTags: this.room.tags }
        ) === true;
      } catch (_error) {
        return false;
      }
    },
    clearTimelineAnalytics() {
      try {
        this.timelineAnalytics.tracker?.clear();
      } catch (_error) {
        // 利用状況の計測に失敗しても、タイムラインの終了処理を続ける。
      }
      this.timelineAnalytics.pageToken = null;
      this.timelineAnalytics.roomToken = null;
    },
    captureTimelineOperation() {
      try {
        return this.timelineAnalytics.tracker?.capture() || null;
      } catch (_error) {
        return null;
      }
    },
    reportTimelineOperation(token, operation) {
      try {
        return (this.timelineAnalytics.tracker?.report(token, operation) || 0) > 0;
      } catch (_error) {
        return false;
      }
    },
    resolveAnalyticsContentType(contentType, replyId = null) {
      if (contentType !== 'supplement') return contentType;
      return replyId ? 'reply_supplement' : 'post_supplement';
    },
    reportSavedContent(token, payload, replyId = null) {
      const operation = {
        kind: 'content_change',
        content: this.resolveAnalyticsContentType(payload?.contentType, replyId),
        action: payload?.actionType,
        response: { animation: payload?.presentationAnimation },
        beforeTagIds: payload?.previousTagIds,
        afterTagIds: payload?.nextTagIds,
      };
      if (payload?.mediaType) operation.newMainMediaType = payload.mediaType;
      return this.reportTimelineOperation(token, operation);
    },
    reportDeletedContent(token, payload, replyId = null) {
      const operation = {
        kind: 'content_change',
        content: this.resolveAnalyticsContentType(payload?.contentType, replyId),
        action: payload?.actionType,
        before: { animation: payload?.presentationAnimation },
      };
      if (Array.isArray(payload?.previousTagIds)) {
        operation.beforeTagIds = payload.previousTagIds;
        operation.afterTagIds = [];
      }
      return this.reportTimelineOperation(token, operation);
    },
    reportQuickTextUse(token, payload, replyId = null) {
      return this.reportTimelineOperation(token, {
        kind: 'quick_text_use',
        content: this.resolveAnalyticsContentType(payload?.contentType, replyId),
        quickText: {
          _id: payload?.quickTextId,
          label: payload?.quickTextLabel,
        },
      });
    },
    postSaved(payload) {
      return this.reportSavedContent(this.dialogs.post.edit.operationToken, payload);
    },
    replySaved(payload) {
      return this.reportSavedContent(this.dialogs.reply.edit.operationToken, payload);
    },
    supplementSaved(payload) {
      return this.reportSavedContent(
        this.dialogs.supplement.edit.operationToken,
        payload,
        this.dialogs.supplement.edit.replyId
      );
    },
    postDeleted(payload) {
      return this.reportDeletedContent(this.dialogs.post.delete.operationToken, payload);
    },
    replyDeleted(payload) {
      return this.reportDeletedContent(this.dialogs.reply.delete.operationToken, payload);
    },
    supplementDeleted(payload) {
      return this.reportDeletedContent(
        this.dialogs.supplement.delete.operationToken,
        payload,
        this.dialogs.supplement.delete.replyId
      );
    },
    postQuickTextInserted(payload) {
      return this.reportQuickTextUse(this.dialogs.post.edit.operationToken, payload);
    },
    replyQuickTextInserted(payload) {
      return this.reportQuickTextUse(this.dialogs.reply.edit.operationToken, payload);
    },
    supplementQuickTextInserted(payload) {
      return this.reportQuickTextUse(
        this.dialogs.supplement.edit.operationToken,
        payload,
        this.dialogs.supplement.edit.replyId
      );
    },
    timelineSettingSaved(settings) {
      return this.reportTimelineOperation(this.dialogs.settings.operationToken, {
        kind: 'display_save',
        settings,
      });
    },
    applyTimelineQueryFilters(query = {}) {
      const queryFilters = parseTimelineQueryFilters({
        query,
        roomTags: this.room.tags,
      });
      this.ui.queryFilters = queryFilters;
      this.ui.localTagIds = queryFilters.globalConditions?.tags || [];
      this.ui.localTagOperator = queryFilters.globalConditions?.tagSearchOperator || 'or';
      this.ui.tempQueryTagNames = [];

      if (queryFilters.warnings.length) {
        this.setSnackbar(this.$t('URLの絞り込み条件の一部を適用できませんでした'), 'alert');
      }

      return queryFilters;
    },

    handleRoutePostIdChange(postId) {
      const nextPostId = typeof postId === 'string' && postId ? postId : null;
      this.ui.focusedPostId = nextPostId;
      if (!nextPostId || !this.timelineResourcesReady) return;
      void this.fetchFocusPostAndAppend(nextPostId);
    },

    handleRouteQueryChange(query, previousQuery = {}) {
      if (!this.timelineResourcesReady) return;
      const previousLocale = this.$i18n.locale;
      this.applyPresentationQuery(query);
      const localeChanged = this.$i18n.locale !== previousLocale;
      const filtersChanged = getTimelineFilterQuerySignature(query) !== getTimelineFilterQuerySignature(previousQuery);
      if (!localeChanged && !filtersChanged) return;

      if (localeChanged) {
        this.setTargetLangs();
        void this.refreshTranslatedRoomPresentation();
      }
      if (filtersChanged) {
        this.applyTimelineQueryFilters(query);
        this.ui.currentTabIndex = 0;
      }
      void this.requestSocketReconnect({ force: true, reason: 'query-change' }).catch(() => undefined);
    },

    handleProfileLanguageChange(language) {
      const queryLanguage = this.getPresentationQueryLanguage(this.$route.query);
      this.$i18n.locale = queryLanguage || language || this.$i18n.locale;
      this.setTargetLangs();
      if (queryLanguage || !this.timelineResourcesReady) return;

      void this.refreshTranslatedRoomPresentation();
      void this.requestSocketReconnect({ force: true, reason: 'profile-language-change' }).catch(() => undefined);
    },

    async refreshTranslatedRoomPresentation() {
      const lifecycleGeneration = this.captureTimelineLifecycle();
      const roomId = this.$route.params.room_id || this.$store.getters.roomId;
      const floorId = this.$route.params.floor_id || this.$store.getters.floorId;
      if (!roomId || !floorId) return false;

      try {
        const { data: room } = await roomApi.detail({ _id: roomId });
        if (!this.canApplyTimelineRequest(lifecycleGeneration)) return false;
        if (!room || String(room._id) !== String(roomId) || String(room.floor?._id) !== String(floorId)) {
          return false;
        }

        const floorTitle = this.getTranslatedTitle(room.floor);
        const roomTitle = this.getTranslatedTitle(room);
        this.$store.dispatch('doUpdateFloorTitle', { title: floorTitle });
        this.$store.dispatch('doUpdateRoomTitle', { title: roomTitle });
        this.room.title = roomTitle;
        this.room.description = this.getTranslatedDescription(room);
        return true;
      } catch (error) {
        if (this.shouldIgnoreTimelineRequestError(error, lifecycleGeneration)) return false;
        const message = appendApiErrorMessage(this.$t('ルーム詳細の取得に失敗しました'), error, {
          translate: this.$t,
        });
        this.setSnackbar(message, 'alert');
        return false;
      }
    },

    syncCurrentUserProfileSnapshots(profile = this.currentUserProfileSnapshot) {
      return syncUserProfileSnapshots([this.timeline.filters, this.dialogs], profile);
    },

    findTagIdByNameOrTranslation(tagText) {
      if (!this.room.tags || !this.room.tags.length) return null;

      const found = this.room.tags.find((t) => {
        if (t.name === tagText) {
          return true;
        }
        if (Array.isArray(t.translations)) {
          return t.translations.some((tr) => tr.name === tagText);
        }
        return false;
      });
      return found ? found._id : null;
    },

    commonColumnProps(filter, index) {
      return buildColumnProps({
        filter,
        index,
        filters: this.timeline.filters,
        roomTags: this.room.tags,
        isMobile: this.isMobile,
        timelineFontFamily: this.timeline.fontFamily,
        timelineFontSize: this.timeline.fontSize,
        animatingItemsColumn: this.timeline.animatingItems[index],
        animationEnabled: this.effectiveAnimationEnabled,
        isGuestRulesAgreed: this.isGuestRulesAgreed,
        hideReply: this.ui.hideReply,
        hideInfo: this.ui.hideInfo,
        localSpeech: this.ui.localSpeech,
        localTagIds: this.ui.localTagIds,
        localTagOperator: this.ui.localTagOperator,
        globalConditions: this.ui.queryFilters?.globalConditions,
        globalShowRange: this.ui.queryFilters?.globalShowRange,
        focusedPostId: this.ui.focusedPostId,
        isGuestReactionOnly: this.isGuestReactionOnly,
        showExternalShareButton: this.room.showExternalShareButton,
        isSpeechActive: (filters, columnIndex) => this.isSpeechActive(filters, columnIndex),
      });
    },

    // 子カラムへ渡すイベントハンドラは一度だけ作成し、同じ参照を使い続ける。
    getColumnEvents() {
      if (!this.columnEventsCache) {
        this.columnEventsCache = buildColumnEvents({
          onPressNotification: this.onPressNotification,
          onGetNextPosts: this.getNextPostsButtonClick,
          showEditReplyDialog: this.showEditReplyDialog,
          showDeleteReplyDialog: this.showDeleteReplyDialog,
          showEditSupplementDialog: this.showEditSupplementDialog,
          showDeleteSupplementDialog: this.showDeleteSupplementDialog,
          showEditTagDialog: this.showEditTagDialog,
          showGalleryDialog: this.showGalleryDialog,
          showEditKickedUserDialog: this.showEditKickedUserDialog,
          showDeletePostDialog: this.showDeletePostDialog,
          showEditPostDialog: this.showEditPostDialog,
          toggleColumnSpeech: this.toggleColumnSpeech,
          showFilterDialog: this.showFilterDialog,
          deleteFilter: this.deleteFilter,
          successCreateFilter: this.successCreateFilter,
          toggleAnimation: this.toggleAnimation,
        });
      }
      return this.columnEventsCache;
    },

    getHeaderEvents() {
      if (!this.headerEventsCache) {
        this.headerEventsCache = createTimelineHeaderEvents(this);
      }
      return this.headerEventsCache;
    },

    getDialogEventHandlers() {
      if (!this.dialogEventHandlersCache) {
        this.dialogEventHandlersCache = createTimelineDialogEventHandlers(this);
      }
      return this.dialogEventHandlersCache;
    },

    handleDialogEvent(eventName, ...payload) {
      dispatchTimelineDialogEvent(this.getDialogEventHandlers(), eventName, payload);
    },

    onPaneResized(payload) {
      if (this.isMobile) return;
      const panes = Array.isArray(payload?.panes) ? payload.panes : [];
      let updated = false;

      panes.forEach((pane, index) => {
        const filter = this.timeline.filters[index];
        if (!filter || !Number.isFinite(pane?.size)) return;
        filter.size = pane.size;
        updated = true;
      });

      if (!updated) return;
      this.saveSortFilter();
      this.$nextTick(() => this.timeline.filters.forEach((_, i) => this.reevaluateAutoLoad(i)));
    },

    doesDataMatchConditions(data, conditions) {
      return matchesConditionGroups({
        target: data,
        globalConditions: this.ui.queryFilters.globalConditions,
        columnConditions: conditions,
        matcher: (target, targetConditions) => TimelineUtil.doesDataMatchConditions(target, targetConditions),
      });
    },

    applyStoredTimelineSettings() {
      return applyTimelineSettings({
        timeline: this.timeline,
        ui: this.ui,
      });
    },

    // 各カラムの末尾を監視し、表示領域に入ったカラムだけ次の投稿を取得する。
    setupTimelineContentObserver() {
      const observer = setupTimelineContentObserver({
        rootEl: this.$el,
        onTimelineContent: (timelineContent) => this.setupScrollIntersectionObserver(timelineContent),
      });
      this.infra.timelineContentObserver = observer;
      return observer;
    },

    setupScrollIntersectionObserver(timelineContent) {
      return setupScrollIntersectionObserver({
        scrollState: this.scrollState,
        timelineContent,
        getColumnIndex: (target) => {
          const rootEl = target.closest('.timeline-content');
          const idx = rootEl ? Number(rootEl.dataset.columnIndex) : this.ui.currentTabIndex;
          return Number.isFinite(idx) ? idx : this.ui.currentTabIndex;
        },
        onReachEnd: (index) => {
          const idx = Number.isFinite(index) ? index : this.ui.currentTabIndex;
          const tl = this.timeline.filters[idx];
          if (!tl || tl._sending || tl._noMore) return;
          this.getNextPosts(idx);
        },
      });
    },
    // スクロールできないカラムで取得を繰り返さないよう、取得後に監視の要否を見直す。
    reevaluateAutoLoad(index) {
      const tl = this.timeline.filters[index];
      return reevaluateAutoLoad({
        scrollState: this.scrollState,
        rootEl: this.$el,
        index,
        isNoMore: !!(tl && tl._noMore),
      });
    },

    getNextPostsButtonClick(index) {
      const idx = typeof index === 'number' ? index : this.ui.currentTabIndex;
      this.getNextPosts(idx);
      this.$nextTick(() => this.reevaluateAutoLoad(idx));
    },

    async fetchFocusPostAndAppend(postId) {
      const lifecycleGeneration = this.captureTimelineLifecycle();
      const isCurrentFocusRequest = () => this.ui.focusedPostId === postId;
      try {
        const { data } = await chatApi.fetchDetail({ room_id: this.$store.getters.roomId, post_id: postId, isGuest: !this.$store.getters.userIsLogin });
        if (!this.canApplyTimelineRequest(lifecycleGeneration) || !isCurrentFocusRequest()) return false;
        if (!data || !data._id) return false;

        getConditionlessIndexes(this.timeline.filters).forEach((i) => {
          this.ensurePostsArray(i);
          const arr = this.timeline.filters[i].posts;
          if (!arr.some((p) => p._id === data._id)) arr.unshift(data);
        });
        return true;
      } catch (e) {
        if (!isCurrentFocusRequest() || this.shouldIgnoreTimelineRequestError(e, lifecycleGeneration)) return false;
        const message = appendApiErrorMessage(this.$t('投稿の取得に失敗しました'), e, { translate: this.$t });
        this.setSnackbar(message, 'alert');
        return false;
      }
    },

    // 直前の通知と親投稿が同じかをカラムごとに判定し、親投稿の重複表示を防ぐ。
    isSameParentNotification(originId, index = null) {
      const i = typeof index === 'number' ? index : this.getDefaultIndex();
      const prev = this.timeline.filters[i]?.posts?.[0];
      return prev && (prev.replyNotification || prev.reactionNotification) && prev.origin_id === originId;
    },

    getNextPosts(index = this.ui.currentTabIndex) {
      const arr = this.timeline.filters[index]?.posts || [];
      if (!arr.length) return;
      const normal = arr.filter((p) => !p.replyNotification && !p.reactionNotification && !p.isFocusPost);
      if (!normal.length) return;
      const oldest = normal[normal.length - 1];
      this.fetchTimelinePosts(index, { from: oldest.created_at, position: 'tail' });
    },

    initialFetchAllColumns() {
      this.timeline.filters.forEach((_, i) => {
        this.ensurePostsArray(i);
        delete this.timeline.filters[i]._noMore;
        this.fetchTimelinePosts(i, { position: 'tail' });
      });
    },

    shortcutPushNkey(event) {
      if (
        !event ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        this.$store.getters.inertAppContainer
      ) return;

      const target = event.target || document.activeElement;
      if (
        target?.isContentEditable ||
        target?.closest?.(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]'
        )
      ) return;

      if (
        !this.dialogs.post.edit.visible &&
        !this.dialogs.post.delete.visible &&
        !this.dialogs.reply.edit.visible &&
        !this.dialogs.reply.delete.visible &&
        !this.dialogs.supplement.edit.visible &&
        !this.dialogs.supplement.delete.visible &&
        !this.dialogs.gallery.visible &&
        !this.dialogs.roomMember.leaveVisible &&
        !this.dialogs.tag.editVisible &&
        !this.dialogs.filter.visible &&
        !this.dialogs.sound.tagVisible &&
        !this.dialogs.sound.cautionVisible &&
        !this.dialogs.speech.visible &&
        !this.dialogs.settings.visible &&
        !this.dialogs.roomInfo.visible &&
        !this.dialogs.kickedUser.visible &&
        !this.dialogs.guestRules.visible
      ) {
        const k = event.key || '';
        switch (k.toLowerCase()) {
          case 'm':
            this.showEditPostDialog(null, true);
            break;
          case 'n':
            if (this.isGuestReactionOnly) break;
            this.showEditPostDialog(null, false);
            break;
          case 'r':
            const focusedElement = document.activeElement;

            if (focusedElement.closest('article')) {
              const article = focusedElement.closest('article');

              const replyButtons = article.querySelectorAll('button[class*="reply-add-button"]');

              if (replyButtons.length > 0) {
                replyButtons[0].click();
              }
            } else {
              // 操作対象の投稿が見つからなければ、最新の通常投稿への返信を開く。
              const foundPost = this.getLatestReplyablePost();

              if (foundPost) {
                this.showEditReplyDialog(foundPost, null, null);
              }
            }

            break;
        }
      }
    },

    onDragEnd(event) {
      if (this.isMobile) return;

      if (!event || event.newDraggableIndex == null || event.oldDraggableIndex == null) {
        return;
      }

      if (event.newDraggableIndex === event.oldDraggableIndex) {
        return;
      }

      const [movedFilter] = this.timeline.filters.splice(event.oldDraggableIndex, 1);
      if (!movedFilter) return;
      this.timeline.filters.splice(event.newDraggableIndex, 0, movedFilter);

      this.saveSortFilter();
    },

    saveSortFilter() {
      this.persistFilters();
    },

    persistFilters() {
      if (this.ui.queryFilters.active) return false;
      // 並び順を保存するときは、投稿一覧などの一時的な状態を除く。
      const sanitized = sanitizeFiltersForStore(this.timeline.filters);
      this.$store.dispatch('doSetFilters', {
        roomId: this.$store.getters.roomId,
        filters: sanitized,
      });
      return true;
    },

    isSpeechActive(filters, index) {
      let result = false;
      if (typeof filters[index] !== 'undefined') {
        if (typeof filters[index].speech !== 'undefined') {
          if (filters[index].speech) {
            result = true;
          }
        }
      }
      return result;
    },

    handleTabListKeydown(e) {
      if (e.target?.getAttribute?.('role') !== 'tab' || this.timeline.filters.length === 0) return;
      const key = e.key;
      const currentIndex = this.ui.currentTabIndex;
      let newIndex = currentIndex;

      switch (key) {
        case 'ArrowRight':
          newIndex = (currentIndex + 1) % this.timeline.filters.length;
          break;
        case 'ArrowLeft':
          newIndex = (currentIndex - 1 + this.timeline.filters.length) % this.timeline.filters.length;
          break;
        case 'Home':
          newIndex = 0;
          break;
        case 'End':
          newIndex = this.timeline.filters.length - 1;
          break;
        default:
          return;
      }

      this.ui.currentTabIndex = newIndex;
      this.onPressFilterTab(newIndex);

      this.$nextTick(() => {
        const tabsRef = this.$refs.normalViewRef?.$refs?.tabsRef;
        if (tabsRef && typeof tabsRef.focusTab === 'function') {
          tabsRef.focusTab(newIndex);
        }
      });

      e.preventDefault();
    },

    // 通知を押したカラム内で対象投稿へ移動する。未取得の場合は、そのカラムへ取得してから移動する。
    async onPressNotification(post, columnIndex) {
      if (!Number.isInteger(columnIndex) || !this.timeline.filters[columnIndex] || !post?.origin_id) return;

      const sourceFilter = this.timeline.filters[columnIndex];
      const sourcePosts = Array.isArray(sourceFilter.posts) ? sourceFilter.posts : [];
      const originExists = sourcePosts.some(({ _id }) => _id === post.origin_id);
      if (!originExists) {
        const from = sourcePosts.length ? sourcePosts[sourcePosts.length - 1].created_at : null;
        try {
          await this.fetchTimelinePosts(columnIndex, {
            from,
            to: post.created_at,
            position: 'tail',
          });
        } catch {
          return;
        }
      }

      await this.$nextTick();
      const columnRoot = document.getElementById(`timeline-inner-${columnIndex}`);
      const timelineContent = columnRoot?.querySelector('.timeline-content');
      if (!timelineContent) return;

      const items = Array.from(timelineContent.querySelectorAll('[data-timeline-item-id]'));
      const findItem = (id) => items.find((element) => element.dataset.timelineItemId === id);
      const targetId = post.replyNotification?._id || post.origin_id;
      let target = findItem(targetId);
      if (!target && post.replyNotification) target = findItem(post.origin_id);
      if (!target) return;

      target.focus({ preventScroll: true });
      timelineContent.scrollTo({
        top: target.offsetTop,
        behavior: 'smooth',
      });
    },

    setSnackbar(message, role = 'status') {
      this.$store.dispatch('doShowSnackbar', { message, role });
    },

    successGuestRules() {
      this.isGuestRulesAgreed = true;
      this.dialogs.guestRules.visible = false;
      if (this.guestRulesResolver) {
        this.guestRulesResolver(true);
        this.guestRulesResolver = null;
      }
    },
    // 同意した場合はtrue、閉じた場合や拒否した場合はfalseで待機中の処理を再開する。
    ensureGuestRules() {
      if (this.$store.getters.userIsLogin || this.isGuestRulesAgreed) return Promise.resolve(true);
      this.dialogs.guestRules.visible = true;
      return new Promise((resolve) => {
        this.guestRulesResolver = resolve;
      });
    },
    closeGuestRulesDialog() {
      this.dialogs.guestRules.visible = false;
      if (this.guestRulesResolver) {
        this.guestRulesResolver(false);
        this.guestRulesResolver = null;
      }
    },

    ensureSmartphoneTabVisible(index, smooth = true) {
      const tabsRef = this.$refs.normalViewRef?.$refs?.tabsRef;
      if (!tabsRef || typeof tabsRef.ensureTabVisible !== 'function') return;
      tabsRef.ensureTabVisible(index, smooth);
    },
    // 切り替え先の要素が描画されてから操作するため、nextTickで描画の反映を待つ。
    onPressFilterTab(index) {
      this.ui.currentTabIndex = index;

      this.$nextTick(() => {
        if (this.isMobile) {
          const targetTimeline = document.getElementById('timeline-inner-' + index);
          if (targetTimeline) {
            const content = targetTimeline.querySelector('.timeline-content');
            if (content) {
              content.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
          this.ensureSmartphoneTabVisible(index);
        }
      });
    },

    async initTimeLine() {
      return initTimeLineUtil(this);
    },

    connectInitialSocket() {
      return connectInitialTimelineSocket(this);
    },
    requestSocketReconnect(options = {}) {
      return requestTimelineSocketReconnect(this, options);
    },
    handleSocketReconnect() {
      void this.requestSocketReconnect({ force: true, reason: 'manual' }).catch(() => undefined);
    },

    getDefaultIndex() {
      return getDefaultIndexFromFilters(this.timeline.filters);
    },
    getLatestReplyablePost() {
      return getLatestReplyablePostFromFilters({
        filters: this.timeline.filters,
        currentTabIndex: this.ui.currentTabIndex,
      });
    },
    getCurrentTimelineActor() {
      const userId = this.$store.getters.userId;
      if (userId !== null && typeof userId !== 'undefined') {
        return { type: 'user', id: userId };
      }
      const guestId = this.$store.getters.guestId;
      if (guestId !== null && typeof guestId !== 'undefined') {
        return { type: 'guest', id: guestId };
      }
      return null;
    },
    getPostUserId(post) {
      const user = post && post.user;
      if (!user) return null;
      return typeof user === 'object' ? user._id : user;
    },
    isOwnVisiblePost(post) {
      if (!post || post.replyNotification || post.reactionNotification || post.origin_id) return false;
      const actor = this.getCurrentTimelineActor();
      if (!actor) return false;
      if (actor.type === 'user') return this.getPostUserId(post) === actor.id;
      return post.guest_id === actor.id;
    },
    getPostCreatedAtTime(post) {
      const value = post && post.created_at;
      const time = value ? new Date(value).getTime() : 0;
      return Number.isFinite(time) ? time : 0;
    },
    getPreviousOwnPostTagIds() {
      let latestPost = null;
      let latestTime = -Infinity;
      const seen = new Set();

      this.timeline.filters.forEach((filter) => {
        const posts = Array.isArray(filter && filter.posts) ? filter.posts : [];
        posts.forEach((post) => {
          if (!this.isOwnVisiblePost(post)) return;
          if (post._id && seen.has(post._id)) return;
          if (post._id) seen.add(post._id);

          const time = this.getPostCreatedAtTime(post);
          if (latestPost === null || time > latestTime) {
            latestPost = post;
            latestTime = time;
          }
        });
      });

      return Array.isArray(latestPost && latestPost.room_tags) ? latestPost.room_tags.slice() : [];
    },
    ensurePostsArray(i) {
      return ensurePostsArrayInFilters({
        filters: this.timeline.filters,
        index: i,
      });
    },
    matchesAny(post, conditions) {
      return matchesPostConditionGroups({
        post,
        globalConditions: this.ui.queryFilters.globalConditions,
        columnConditions: conditions,
        matcher: (target, targetConditions) => TimelineUtil.doesDataMatchConditions(target, targetConditions),
      });
    },
    insertNewToFiltersHead(post) {
      return insertNewToFiltersHeadInFilters({
        filters: this.timeline.filters,
        post,
        matchesAny: (target, conditions) => this.matchesAny(target, conditions),
        ensurePostsArray: (i) => this.ensurePostsArray(i),
      });
    },
    // 表示中の投稿だけを更新し、絞り込み条件から外れた場合は表示から除く。
    updateExistingInFilters(post) {
      return updateExistingInFiltersInFilters({
        filters: this.timeline.filters,
        post,
        matchesAny: (target, conditions) => this.matchesAny(target, conditions),
      });
    },
    // 投稿ツリーの更新後に、各カラムへの追加・更新・削除を再判定する。
    reconcilePostInFilters(post) {
      return reconcilePostInFiltersState({
        filters: this.timeline.filters,
        post,
        matchesAny: (target, conditions) => this.matchesAny(target, conditions),
        ensurePostsArray: (i) => this.ensurePostsArray(i),
      });
    },
    removeFromFilters(postId) {
      return removeFromFiltersInFilters({
        filters: this.timeline.filters,
        postId,
      });
    },
    async fetchTimelinePosts(index, { from = null, to = null, position = 'tail' } = {}) {
      const tl = this.timeline.filters[index];
      if (!tl) return;
      if (tl._sending || tl._noMore) return;
      const lifecycleGeneration = this.captureTimelineLifecycle();
      tl._sending = true;
      tl._noMore = false;
      try {
        const body = {
          floor_id: this.$store.getters.floorId,
          room_id: this.$store.getters.roomId,
          globalServerQuery: toServerQuery(this.ui.queryFilters.globalConditions),
          serverQuery: toServerQuery(tl.conditions),
          from,
          to,
        };
        const { data } = await chatApi.fetchPosts({
          ...body,
          isGuest: !this.$store.getters.userIsLogin,
        });
        if (!this.canApplyTimelineRequest(lifecycleGeneration)) return;
        const list = Array.isArray(data) ? data : data?.posts || [];
        if (!list.length) {
          tl._noMore = true;
          return;
        }
        this.ensurePostsArray(index);
        const arr = this.timeline.filters[index].posts;
        list.forEach((post) => {
          const exists = arr.findIndex((p) => p._id === post._id);
          if (exists === -1) {
            position === 'head' ? arr.unshift(post) : arr.push(post);
          } else {
            arr[exists] = post;
          }
        });
      } catch (e) {
        if (this.shouldIgnoreTimelineRequestError(e, lifecycleGeneration)) return;
        const message = appendApiErrorMessage(this.$t('投稿の取得に失敗しました'), e, { translate: this.$t });
        this.setSnackbar(message, 'alert');
      } finally {
        if (this.isTimelineLifecycleCurrent(lifecycleGeneration)) {
          delete tl._sending;
          if (this.canApplyTimelineRequest(lifecycleGeneration)) {
            this.$nextTick(() => {
              this.reevaluateAutoLoad(index);
              this.queueUpdateAnimationObserver();
            });
          }
        }
      }
    },
  },
};
</script>

<style>
/* タイムライン全体の配置 */
.timeline-page {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.view-wrapper {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

h3 {
  margin: 0;
  font-weight: 400;
  font-size: 1em;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 表示の補助スタイル */
.two-line-ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.button-position-right {
  margin-inline-start: auto;
}
.hidden-audio {
  position: absolute;
  inset: 0;
  width: 1px;
  height: 1px;
  z-index: -9999;
}
audio {
  height: 40px !important;
}

/* タイムラインのカラム配置 */
.timeline-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.edit-dialog-content {
  padding: 8px !important;
}

/* 投稿と返信の表示 */
.post-audio {
  margin-bottom: 8px;
}
.post-content .post-media {
  margin-inline-end: 8px;
  width: 150px;
}
.post-content .post-text {
  flex: 1;
}
.post-action,
.reply-action {
  display: flex;
  justify-content: flex-start;
}

.post-container .user,
.reply-container .user,
.post-container .created-at,
.reply-container .created-at {
  margin-bottom: 4px;
  color: #555;
}
.post-container .created-at,
.reply-container .created-at {
  text-align: end;
}

.post-content .content,
.reply-content .content {
  margin-bottom: 4px;
  font-size: 1.1em;
  text-align: start;
  white-space: pre-wrap;
  word-break: break-all;
}
.post-content .supplementaries,
.reply-content .supplementaries {
  margin-bottom: 4px;
  text-align: end;
}
.post-content .supplement,
.reply-content .supplement {
  margin: 0 4px;
  color: #3366ff;
  text-decoration: underline;
  cursor: pointer;
}
.post-content .floor-tags,
.reply-content .floor-tags {
  margin-bottom: 4px;
  text-align: end;
}
.floor-tag-icon {
  margin: 0 2px;
  color: orange !important;
}

/* 「流す」投稿と返信の表示 */
.animation {
  padding: 8px;
  height: 0;
}
.animation-active {
  display: inline-block;
  white-space: nowrap;
  height: auto;
}
.warning-icon {
  color: orange !important;
}

/* カラムの分割と幅調整 */
.splitpanes--vertical {
  background: #e6e6e6;
}
.splitpanes__splitter {
  width: 10px;
  cursor: col-resize;
  background-image: radial-gradient(#999 38%, transparent 40%);
  background-size: 4px 4px;
  background-repeat: repeat;
  background-position: 1px 1px;
}
.splitpanes--dragging,
.splitpanes--dragging * {
  cursor: col-resize !important;
}

@media (min-width: 897px) {
  .splitpanes--vertical {
    display: flex;
    justify-content: center;
    overflow-x: auto;
  }
  .splitpanes__pane {
    flex: 0 1 auto;
    max-width: 800px;
    margin: 0 4px;
  }
  .splitpanes__pane:only-child {
    margin-inline: auto;
  }
}

@media (max-width: 896px) {
  .timeline-inner,
  .column {
    width: 100%;
    margin: 0;
    padding: 0;
    min-width: unset;
  }
  .mobile-wrapper > .timeline-inner {
    display: flex;
  }
  .draggable-icon {
    display: none;
  }
  .tweet {
    padding-inline-start: 4px;
  }
  .tweet span {
    display: none;
  }
}

/* ARモードの表示 */
.ar-mode-wrapper {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  display: flex;
}
.ar-mode-column {
  flex: 1 1 auto;
}
.ar-mode-wrapper .timeline-content {
  height: 100% !important;
}

@media screen and (max-width: 896px) {
  .ar-mode-wrapper .timeline-inner .timeline-title,
  .ar-mode-wrapper .timeline-inner .filter-title {
    display: flex !important;
  }
  .ar-mode-wrapper .timeline-inner .timeline-content {
    height: 100% !important;
  }
  .ar-mode-wrapper .timeline-inner .timeline-title,
  .ar-mode-wrapper .timeline-inner .filter-title {
    display: none !important;
  }
}

.ar-mode-wrapper {
  height: 100svh !important;
}
.ar-mode-wrapper .view {
  height: 100% !important;
}
.ar-mode-wrapper .view-content {
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  background-color: #e6e6e6;
}
.ar-mode-wrapper .timeline-wrapper,
.ar-mode-wrapper .splitpanes__pane {
  margin: 0 !important;
  padding: 0 !important;
}
.ar-mode-wrapper .timeline-handle,
.ar-mode-wrapper .draggable-icon {
  display: none !important;
}

.ar-mode-wrapper .timeline-title,
.ar-mode-wrapper .filter-timeline-title {
  display: none !important;
}
</style>
