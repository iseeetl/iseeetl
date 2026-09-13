import {
  getConditionlessIndexes,
  normalizeFiltersFromStore,
  prepareFiltersForSession,
  sanitizeFiltersForStore,
} from '@/features/timeline/filters';
import {
  buildReactionNotificationCard,
  buildReplyNotificationCard,
  appendNotificationCardToConditionless,
  shouldNotifyReaction,
  shouldNotifyReply,
} from '@/features/timeline/notifications';
import { playAudioIfMatch, speakIfNeeded } from '@/features/timeline/audio';
import { applyRoomRole, refreshRoomRole } from '@/features/timeline/bootstrap';

export const SOCKET_STATUS_VISIBLE_DELAY_MS = 800;

export const bindSocketHandlers = (socket, ctx, deps = {}) => {
  const prevCleanup = ctx?.infra?.socketCleanup;
  if (typeof prevCleanup === 'function') {
    prevCleanup();
  }
  ctx.infra.socketStatusTimerDisabled = false;
  ctx.infra.socketCleanup = null;

  const schedule = deps.schedule || ((cb, ms) => setTimeout(cb, ms));
  const cancel = deps.cancel || ((id) => clearTimeout(id));
  const addVisibilityListener =
    deps.addVisibilityListener ||
    ((handler) => {
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', handler);
      }
    });
  const removeVisibilityListener =
    deps.removeVisibilityListener ||
    ((handler) => {
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', handler);
      }
    });
  const addWindowListener =
    deps.addWindowListener ||
    ((event, handler) => {
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener(event, handler);
      }
    });
  const removeWindowListener =
    deps.removeWindowListener ||
    ((event, handler) => {
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener(event, handler);
      }
    });
  const isDocumentHidden = deps.isDocumentHidden || (() => typeof document !== 'undefined' && document.hidden === true);
  const statusVisibleDelayMs = Number.isFinite(deps.statusVisibleDelayMs)
    ? deps.statusVisibleDelayMs
    : SOCKET_STATUS_VISIBLE_DELAY_MS;
  const refreshCurrentRoomRole = deps.refreshRoomRole || refreshRoomRole;
  const socketHandlers = [];

  if (typeof ctx.infra.socketRecoveryPending !== 'boolean') {
    ctx.infra.socketRecoveryPending = false;
  }

  const isActiveSocket = () => !ctx?.infra?.socket || ctx.infra.socket === socket;
  const socketEvents = {
    on: (event, handler) => {
      const guardedHandler = (...args) => {
        if (!isActiveSocket()) return;
        handler(...args);
      };
      socketHandlers.push({ event, handler: guardedHandler });
      socket.on(event, guardedHandler);
      return socketEvents;
    },
  };

  const clearStatusVisibleTimer = () => {
    if (ctx.infra.socketStatusTimerId != null) {
      cancel(ctx.infra.socketStatusTimerId);
    }
    ctx.infra.socketStatusTimerId = null;
    ctx.infra.socketStatusTimerGeneration = null;
  };

  const hideSocketStatus = () => {
    clearStatusVisibleTimer();
    ctx.infra.socketStatusVisible = false;
  };

  const cleanupSocketStatus = ({ preserveRecoveryListeners = false } = {}) => {
    ctx.infra.socketStatusTimerDisabled = !preserveRecoveryListeners;
    hideSocketStatus();
    if (!preserveRecoveryListeners) {
      if (ctx.infra.socketVisibilityChangeHandler && typeof removeVisibilityListener === 'function') {
        removeVisibilityListener(ctx.infra.socketVisibilityChangeHandler);
      }
      if (typeof removeWindowListener === 'function') {
        if (ctx.infra.socketPageShowHandler) {
          removeWindowListener('pageshow', ctx.infra.socketPageShowHandler);
        }
        if (ctx.infra.socketOnlineHandler) {
          removeWindowListener('online', ctx.infra.socketOnlineHandler);
        }
      }
    }
    if (socket && typeof socket.off === 'function') {
      socketHandlers.forEach(({ event, handler }) => {
        socket.off(event, handler);
      });
    }
    socketHandlers.length = 0;
    if (!preserveRecoveryListeners) {
      ctx.infra.socketVisibilityChangeHandler = null;
      ctx.infra.socketPageShowHandler = null;
      ctx.infra.socketOnlineHandler = null;
      if (ctx.infra.scheduleSocketStatusVisible === scheduleSocketStatusVisible) {
        ctx.infra.scheduleSocketStatusVisible = null;
      }
      if (ctx.infra.hideSocketStatus === hideSocketStatus) {
        ctx.infra.hideSocketStatus = null;
      }
    }
  };

  const scheduleSocketStatusVisible = () => {
    if (ctx.infra.socketStatusTimerDisabled) return;
    if (isDocumentHidden()) {
      hideSocketStatus();
      return;
    }
    if (ctx.infra.socketStatusVisible) return;
    if (ctx.infra.socketStatusTimerId != null) return;
    const generation = ctx.infra.socketReconnectGeneration;
    ctx.infra.socketStatusTimerGeneration = generation;
    ctx.infra.socketStatusTimerId = schedule(() => {
      ctx.infra.socketStatusTimerId = null;
      if (ctx.infra.socketStatusTimerGeneration !== generation) return;
      ctx.infra.socketStatusTimerGeneration = null;
      if (ctx.infra.isSocketConnect) return;
      if (isDocumentHidden()) return;
      ctx.infra.socketStatusVisible = true;
    }, statusVisibleDelayMs);
  };

  const recoverSocketConnection = (reason) => {
    if (ctx.infra.socketStatusTimerDisabled) return false;
    if (isDocumentHidden()) {
      hideSocketStatus();
      return false;
    }

    const currentSocket = ctx.infra.socket;
    const socketConnected = Boolean(currentSocket) && currentSocket.connected !== false;
    if (ctx.infra.isSocketConnect && ctx.infra.socketStatus === 'connected' && socketConnected) {
      hideSocketStatus();
      return true;
    }

    if (typeof ctx.requestSocketReconnect !== 'function') {
      scheduleSocketStatusVisible();
      return false;
    }

    let reconnectResult;
    try {
      reconnectResult = ctx.requestSocketReconnect({ reason });
    } catch {
      ctx.infra.socketRecoveryPending = false;
      scheduleSocketStatusVisible();
      return false;
    }
    void Promise.resolve(reconnectResult).catch(() => {
      scheduleSocketStatusVisible();
    });
    return true;
  };

  const handleVisibilityChange = () => {
    if (isDocumentHidden()) {
      hideSocketStatus();
      return;
    }
    recoverSocketConnection('visibilitychange');
  };

  const handlePageShow = () => recoverSocketConnection('pageshow');
  const handleOnline = () => recoverSocketConnection('online');

  if (typeof addVisibilityListener === 'function') {
    if (!ctx.infra.socketVisibilityChangeHandler) {
      ctx.infra.socketVisibilityChangeHandler = handleVisibilityChange;
      addVisibilityListener(handleVisibilityChange);
    }
  }
  if (typeof addWindowListener === 'function') {
    if (!ctx.infra.socketPageShowHandler) {
      ctx.infra.socketPageShowHandler = handlePageShow;
      addWindowListener('pageshow', handlePageShow);
    }
    if (!ctx.infra.socketOnlineHandler) {
      ctx.infra.socketOnlineHandler = handleOnline;
      addWindowListener('online', handleOnline);
    }
  }

  ctx.infra.scheduleSocketStatusVisible = scheduleSocketStatusVisible;
  ctx.infra.hideSocketStatus = hideSocketStatus;

  const settleSocketConnectAttempt = () => {
    if (typeof ctx.infra.finishSocketConnectAttempt === 'function') {
      ctx.infra.finishSocketConnectAttempt(socket);
    }
  };

  const isParentVisibleInColumn = (postId, index) => {
    const container = document.getElementById('timeline-inner-' + index)?.querySelector('.timeline-content');
    const targetEl = container?.querySelector(`#timeline_${postId}`);
    if (!container || !targetEl) return false;
    const er = targetEl.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    return er.bottom > cr.top && er.top < cr.bottom;
  };

  socketEvents
    .on('error', () => {
      console.error('socket error');
      settleSocketConnectAttempt();
      ctx.infra.isSocketConnect = false;
      ctx.infra.socketStatus = 'error';
      ctx.infra.socketRecoveryPending = false;
      scheduleSocketStatusVisible();
    })
    .on('connect_error', () => {
      console.error('socket connect error');

      settleSocketConnectAttempt();
      ctx.infra.isSocketConnect = false;
      ctx.infra.socketStatus = 'connect_error';
      ctx.infra.socketRecoveryPending = false;
      scheduleSocketStatusVisible();
    })
    .on('connect', () => {
      settleSocketConnectAttempt();
      ctx.infra.isSocketConnect = true;
      ctx.infra.socketStatus = 'connected';
      ctx.infra.socketRecoveryPending = false;
      hideSocketStatus();

      const queryFilters = ctx.ui.queryFilters || { active: false, hasColumnQueries: false, filters: [] };
      // 旧形式の空エントリを除外し、条件なしの既定列を維持する。
      const rawFilters = queryFilters.hasColumnQueries
        ? [{ conditions: null }, ...queryFilters.filters]
        : ctx.$store.getters.filters[ctx.$store.getters.roomId] || [];
      const filtersBeforeCheck = normalizeFiltersFromStore(rawFilters);
      // 保存状態から投稿一覧や送信状態を引き継がず、投稿はAPIから取得し直す。
      ctx.timeline.filters = prepareFiltersForSession(filtersBeforeCheck);

      if (ctx.timeline.filters.length === 0) {
        ctx.timeline.filters.unshift({ conditions: null, posts: [] });
      }

      if (ctx.timeline.filters.length === 1) {
        ctx.timeline.filters[0].size = 100;
      }

      if (!queryFilters.active) {
        ctx.$store.dispatch('doSetFilters', {
          roomId: ctx.$store.getters.roomId,
          filters: sanitizeFiltersForStore(ctx.timeline.filters),
        });
      }

      if (ctx.ui.localSpeech) {
        ctx.timeline.filters.forEach((f) => {
          if (f.conditions === null) {
            f.speech = true;
          }
        });
      }

      ctx.initialFetchAllColumns();

      ctx.applyStoredTimelineSettings();

      // 初回取得で投稿一覧を初期化した後、指定された投稿を追加する。
      if (ctx.ui.focusedPostId) {
        try {
          ctx.fetchFocusPostAndAppend(ctx.ui.focusedPostId);
        } catch (e) {
          console.error('failed to fetch focus post:', e);
        }
      }
    })
    .on('disconnect', (reason) => {
      settleSocketConnectAttempt();
      ctx.infra.isSocketConnect = false;
      ctx.infra.socketStatus = 'disconnected';
      ctx.infra.socketRecoveryPending = false;
      ctx.room.status = null;

      const isApplicationDisconnect = reason === 'io server disconnect' || reason === 'io client disconnect';
      if (!isApplicationDisconnect && recoverSocketConnection('disconnect')) return;
      scheduleSocketStatusVisible();
    })
    .on('ROOM_STATUS_UPDATE', (data) => {
      ctx.room.status = data;
      ctx.setTargetLangs?.();
    })
    .on('TRANSLATION_ERROR', () => {
      const message = ctx.$t('一部の言語への翻訳に失敗しました');
      if (typeof ctx.setSnackbar === 'function') {
        ctx.setSnackbar(message, 'alert');
      } else {
        ctx.$store.dispatch('doShowSnackbar', { message, role: 'alert' });
      }
    })
    .on('POST_CREATE', (post) => {
      playAudioIfMatch({
        postTags: post.room_tags,
        roomTags: ctx.room.tags,
        soundTags: ctx.dialogs.sound.tags,
        audioRef: ctx.$refs.newAudio,
        onSuccess: () => ctx.handleNotificationAudioSuccess?.(),
        onError: () => ctx.handleNotificationAudioError?.(),
      });

      speakIfNeeded({
        text: post.content,
        lang: post.lang,
        filters: ctx.timeline.filters,
        speed: ctx.$store.getters.speechSpeed,
        matchFn: (conditions) => ctx.doesDataMatchConditions(post, conditions) || ctx.ui.localSpeech,
      });

      ctx.insertNewToFiltersHead(post);
    })
    .on('POST_UPDATE', (post) => ctx.reconcilePostInFilters(post))
    .on('POST_DELETE', (post) => ctx.removeFromFilters(post._id))
    .on('SUPPLEMENT_CREATE', (post) => {
      const supplement = post.supplementaries[post.supplementaries.length - 1];

      speakIfNeeded({
        text: supplement.content,
        lang: supplement.lang,
        filters: ctx.timeline.filters,
        speed: ctx.$store.getters.speechSpeed,
        matchFn: (conditions) => ctx.doesDataMatchConditions(supplement, conditions),
      });

      ctx.reconcilePostInFilters(post);
    })
    .on('SUPPLEMENT_UPDATE', (post) => ctx.reconcilePostInFilters(post))
    .on('SUPPLEMENT_DELETE', (post) => ctx.reconcilePostInFilters(post))
    .on('REPLY_CREATE', (post) => {
      // 返信によって絞り込み条件に一致する場合もあるため、全カラムで表示対象を再判定する。
      ctx.reconcilePostInFilters(post);

      const reply = post.replies[post.replies.length - 1];

      playAudioIfMatch({
        postTags: reply.room_tags,
        roomTags: ctx.room.tags,
        soundTags: ctx.dialogs.sound.tags,
        audioRef: ctx.$refs.newAudio,
        onSuccess: () => ctx.handleNotificationAudioSuccess?.(),
        onError: () => ctx.handleNotificationAudioError?.(),
      });

      speakIfNeeded({
        text: reply.content,
        lang: reply.lang,
        filters: ctx.timeline.filters,
        speed: ctx.$store.getters.speechSpeed,
        matchFn: (conditions) => ctx.doesDataMatchConditions(reply, conditions),
      });

      const canNotify = shouldNotifyReply({
        post,
        reply,
        userId: ctx.$store.getters.userId,
        guestId: ctx.$store.getters.guestId,
        roomNotification: ctx.room?.roomNotification,
      });
      if (!canNotify) return;
      if (typeof ctx.matchesAny === 'function' && !ctx.matchesAny(post, null)) return;

      const baseCard = buildReplyNotificationCard(post, reply);

      // 通知内の親投稿の表示はカラムごとに判定する。全員宛ての返信は、親投稿が表示中でも通知する。
      appendNotificationCardToConditionless({
        filters: ctx.timeline.filters,
        indexes: getConditionlessIndexes(ctx.timeline.filters),
        baseCard,
        ensurePostsArray: (i) => ctx.ensurePostsArray(i),
        isParentVisible: (i) => isParentVisibleInColumn(post._id, i),
        getHideParent: (i) => ctx.isSameParentNotification(post._id, i),
        skipIfParentVisible: reply.notify_all !== true,
      });
    })
    .on('REPLY_UPDATE', (post) => {
      ctx.reconcilePostInFilters(post);

      const reply = Array.isArray(post?.replies) ? post.replies.find((r) => r?.notify_all === true) : null;
      if (!reply) return;

      const canNotify = shouldNotifyReply({
        post,
        reply,
        userId: ctx.$store.getters.userId,
        guestId: ctx.$store.getters.guestId,
        roomNotification: ctx.room?.roomNotification,
      });
      if (!canNotify) return;
      if (typeof ctx.matchesAny === 'function' && !ctx.matchesAny(post, null)) return;

      const baseCard = buildReplyNotificationCard(post, reply);

      appendNotificationCardToConditionless({
        filters: ctx.timeline.filters,
        indexes: getConditionlessIndexes(ctx.timeline.filters),
        baseCard,
        ensurePostsArray: (i) => ctx.ensurePostsArray(i),
        isParentVisible: (i) => isParentVisibleInColumn(post._id, i),
        getHideParent: (i) => ctx.isSameParentNotification(post._id, i),
        skipIfParentVisible: false,
      });
    })
    .on('REPLY_DELETE', (post) => ctx.reconcilePostInFilters(post))
    .on('REPLY_SUPPLEMENT_CREATE', (post, supplement) => {
      speakIfNeeded({
        text: supplement.content,
        lang: supplement.lang,
        filters: ctx.timeline.filters,
        speed: ctx.$store.getters.speechSpeed,
        matchFn: (conditions) => ctx.doesDataMatchConditions(supplement, conditions),
      });

      ctx.reconcilePostInFilters(post);
    })
    .on('REPLY_SUPPLEMENT_UPDATE', (post) => ctx.reconcilePostInFilters(post))
    .on('REPLY_SUPPLEMENT_DELETE', (post) => ctx.reconcilePostInFilters(post))
    .on('TAG_UPDATE', (post) => ctx.reconcilePostInFilters(post))
    .on('REACTION_CREATE', (post) => {
      ctx.updateExistingInFilters(post);

      const reaction = post.reactions[post.reactions.length - 1];

      const canNotify = shouldNotifyReaction({
        post,
        reaction,
        userId: ctx.$store.getters.userId,
        guestId: ctx.$store.getters.guestId,
        roomNotification: ctx.room?.roomNotification,
      });
      if (!canNotify) return;
      if (typeof ctx.matchesAny === 'function' && !ctx.matchesAny(post, null)) return;

      const baseCard = buildReactionNotificationCard(post, reaction);

      // 通知内の親投稿の表示は、各カラムの表示状態と直前の通知から判定する。
      appendNotificationCardToConditionless({
        filters: ctx.timeline.filters,
        indexes: getConditionlessIndexes(ctx.timeline.filters),
        baseCard,
        ensurePostsArray: (i) => ctx.ensurePostsArray(i),
        isParentVisible: (i) => isParentVisibleInColumn(post._id, i),
        getHideParent: (i) => ctx.isSameParentNotification(post._id, i),
      });
    })
    .on('SUPPLEMENT_REACTION_CREATE', (post) => {
      // 返信・付加情報へのリアクションでは通知カードを作らず、表示中の投稿だけを更新する。
      ctx.updateExistingInFilters(post);
    })
    .on('REPLY_REACTION_CREATE', (post) => {
      // 返信・付加情報へのリアクションでは通知カードを作らず、表示中の投稿だけを更新する。
      ctx.updateExistingInFilters(post);
    })
    .on('REPLY_SUPPLEMENT_REACTION_CREATE', (post) => {
      // 返信・付加情報へのリアクションでは通知カードを作らず、表示中の投稿だけを更新する。
      ctx.updateExistingInFilters(post);
    })
    .on('REACTION_DELETE', (post) => ctx.updateExistingInFilters(post))
    .on('RECEIVE_COMPLETE_DELETE_ROOM_MEMBER', () => {
      ctx.deleteRoomMember();
    })
    .on('ACCESS_REVOKED', (payload = {}) => {
      if (!['room_restricted', 'room_deleted', 'floor_deleted'].includes(payload.reason)) return;
      ctx.infra.socketDisposed = true;
      ctx.infra.socketReconnectGeneration = (ctx.infra.socketReconnectGeneration || 0) + 1;
      ctx.infra.socketRecoveryPending = false;
      cleanupSocketStatus();
      socket.disconnect();
      const destination = payload.scope === 'floor'
        ? { name: 'Floor' }
        : { name: 'Room', params: { floor_id: ctx.$route.params.floor_id } };
      void Promise.resolve(ctx.$router.push(destination)).catch(() => undefined);
    })
    .on('USER_ROLE_UPDATED', (payload = {}) => {
      const role = payload.role;
      if (typeof role !== 'string' || role.length === 0) return;

      ctx.$store.dispatch('doUpdateUserRole', { role });
      applyRoomRole(ctx, null);

      let refreshResult;
      try {
        refreshResult = refreshCurrentRoomRole(ctx);
      } catch {
        return;
      }
      void Promise.resolve(refreshResult).catch(() => undefined);
    })
    .on('SESSION_REVOKED', () => {
      const message = ctx.$t('セッションが無効になりました。再度ログインしてください');
      ctx.$store.dispatch('doUpdateErrorMessage', { message });

      let logoutResult;
      try {
        logoutResult = ctx.$store.dispatch('doLogout');
      } catch {
        logoutResult = undefined;
      }

      void Promise.resolve(logoutResult)
        .catch(() => undefined)
        .then(() => ctx.$router.push({ name: 'Login' }))
        .catch(() => undefined);
    })
    .on('KICKED_USER', () => {
      const message = ctx.$t('キックされているため、このフロア及びルームにはアクセスできません');
      ctx.$store.dispatch('doUpdateErrorMessage', { message });
      ctx.$router.push({ name: 'Floor' });
    });

  ctx.infra.socketCleanup = cleanupSocketStatus;
  return cleanupSocketStatus;
};
