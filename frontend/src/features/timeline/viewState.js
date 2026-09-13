import { createEmptyTimelineQueryState } from '@/features/timeline/queryFilters';

const createUiState = (windowObject) => ({
  focusedPostId: null,
  hideReply: false,
  hideInfo: false,
  localFontSize: null,
  localEnableTextAnimation: true,
  localSpeech: false,
  tempQueryTagNames: [],
  localTagIds: [],
  localTagOperator: '',
  queryFilters: createEmptyTimelineQueryState(),
  currentTabIndex: 0,
  windowWidth: windowObject?.innerWidth ?? 0,
  audio: {
    speechColumnIndex: null,
    notificationPlaybackErrorShown: false,
  },
});

const createRoomState = () => ({
  title: null,
  description: null,
  creator: null,
  creatorUser: null,
  createdAt: null,
  imageUrl: null,
  isMemberOnly: false,
  guestReactionOnly: false,
  roomNotification: true,
  showExternalShareButton: false,
  status: null,
  isAdmin: false,
  isFloorEditor: false,
  isFloorMember: false,
  isRoomMember: false,
  tags: [],
  quickTextGroups: [],
  quickTextItemsByGroup: Object.create(null),
});

const createTimelineState = () => ({
  filters: [],
  fontFamily: '',
  fontSize: '',
  targetLangs: null,
  animatingItems: {},
  sending: false,
});

const createInfrastructureState = () => ({
  socket: null,
  socketCleanup: null,
  socketRecoveryCleanup: null,
  isSocketConnect: false,
  socketStatus: 'disconnected',
  socketStatusVisible: false,
  socketStatusTimerId: null,
  socketStatusTimerGeneration: null,
  socketVisibilityChangeHandler: null,
  socketPageShowHandler: null,
  socketOnlineHandler: null,
  socketStatusTimerDisabled: false,
  socketRecoveryPending: false,
  socketReconnectGeneration: 0,
  socketReconnectPromise: null,
  socketReconnectReason: null,
  socketConnectStartedAt: null,
  socketConnectGeneration: null,
  socketConnectAttemptSocket: null,
  socketConnectWatchdogTimerId: null,
  socketDisposed: false,
  timelineLifecycleGeneration: 0,
  timelineDisposed: false,
  finishSocketConnectAttempt: null,
  scheduleSocketStatusVisible: null,
  hideSocketStatus: null,
  animRaf: null,
  animationObserver: null,
  observedAnimations: new Set(),
  timelineContentObserver: null,
});

const createDialogState = () => ({
  guestRules: {
    visible: false,
  },
  filter: {
    visible: false,
    editIndex: null,
    editFilter: null,
  },
  post: {
    edit: {
      visible: false,
      value: null,
      isAnimationPost: false,
      presetTagIds: [],
      previousOwnPostTagIds: [],
      operationToken: null,
    },
    delete: {
      visible: false,
      value: null,
      operationToken: null,
    },
  },
  reply: {
    edit: {
      visible: false,
      postValue: null,
      value: null,
      operationToken: null,
    },
    delete: {
      visible: false,
      postId: null,
      value: null,
      operationToken: null,
    },
  },
  supplement: {
    edit: {
      visible: false,
      postId: null,
      replyId: null,
      value: null,
      operationToken: null,
    },
    delete: {
      visible: false,
      postId: null,
      replyId: null,
      value: null,
      operationToken: null,
    },
  },
  gallery: {
    visible: false,
    value: null,
  },
  roomMember: {
    leaveVisible: false,
  },
  tag: {
    editVisible: false,
    postId: null,
    replyId: null,
    value: null,
    operationToken: null,
  },
  sound: {
    tagVisible: false,
    tagId: null,
    tags: [],
    cautionVisible: false,
  },
  speech: {
    visible: false,
  },
  settings: {
    visible: false,
    operationToken: null,
  },
  roomInfo: {
    visible: false,
  },
  kickedUser: {
    visible: false,
    id: null,
    name: null,
  },
});

export const createTimelineViewState = ({
  windowObject = typeof window === 'undefined' ? null : window,
} = {}) => ({
  ui: createUiState(windowObject),
  room: createRoomState(),
  timeline: createTimelineState(),
  infra: createInfrastructureState(),
  scrollState: {
    observers: new Map(),
    observedSentinels: new WeakSet(),
  },
  guestRulesResolver: null,
  handleResize: null,
  timelineResourcesReady: false,
  timelineAnalytics: {
    tracker: null,
    pageToken: null,
    roomToken: null,
  },
  initializationError: '',
  columnEventsCache: null,
  headerEventsCache: null,
  dialogEventHandlersCache: null,
  dialogs: createDialogState(),
  isGuestRulesAgreed: false,
});
