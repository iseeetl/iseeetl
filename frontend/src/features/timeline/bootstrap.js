import chatApi from '@/api/chat';
import kickedUserApi from '@/api/kickedUser';
import roomApi from '@/api/room';
import tagApi from '@/api/tag';
import quickTextAPI from '@/api/quickText';
import { formatApiErrorMessage } from '@/api/apiClient';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import { shouldIgnorePageLeaveError } from '@/utils/plannedPageLeave';

const STALE_TIMELINE_REQUEST = 'STALE_TIMELINE_REQUEST';

const captureTimelineLifecycle = (ctx) =>
  typeof ctx.captureTimelineLifecycle === 'function' ? ctx.captureTimelineLifecycle() : null;

const canApplyTimelineRequest = (ctx, generation) =>
  generation === null || typeof ctx.canApplyTimelineRequest !== 'function' || ctx.canApplyTimelineRequest(generation);

const ensureTimelineRequestCurrent = (ctx, generation) => {
  if (canApplyTimelineRequest(ctx, generation)) return;
  const error = new Error(STALE_TIMELINE_REQUEST);
  error.code = STALE_TIMELINE_REQUEST;
  throw error;
};

const isStaleTimelineRequest = (error) => error && error.code === STALE_TIMELINE_REQUEST;

const readRoutePostId = (ctx) => {
  const postId = ctx.$route?.params?.post_id;
  return typeof postId === 'string' && postId ? postId : null;
};

export const applyRoomRole = (ctx, role) => {
  ctx.room.isAdmin = role === 'Administrator';
  ctx.room.isFloorEditor = role === 'FloorEditor';
  ctx.room.isFloorMember = role === 'FloorMember';
  ctx.room.isRoomMember = role === 'RoomMember';
  ctx.$store.dispatch('doUpdateRoomRole', { role });
};

export const refreshRoomRole = async (ctx, { floorId, roomId, lifecycleGeneration = null } = {}) => {
  const currentFloorId = floorId || ctx.$route?.params?.floor_id || ctx.$store.getters.floorId;
  const currentRoomId = roomId || ctx.$route?.params?.room_id || ctx.$store.getters.roomId;
  if (!ctx.$store.getters.userIsLogin || !currentFloorId || !currentRoomId) return null;

  const roleRes = await chatApi.role({ floor_id: currentFloorId, room_id: currentRoomId });
  ensureTimelineRequestCurrent(ctx, lifecycleGeneration);
  const role = roleRes.data?.role || null;
  applyRoomRole(ctx, role);
  return role;
};

export const checkKickedUser = async (ctx, { lifecycleGeneration = null } = {}) => {
  if (!ctx.$store.getters.userIsLogin) return false;

  try {
    const kickedUserRes = await kickedUserApi.check({ floor_id: ctx.$route.params.floor_id });
    ensureTimelineRequestCurrent(ctx, lifecycleGeneration);
    if (kickedUserRes.data) {
      const message = ctx.$t('キックされているため、このフロアに入室できません');
      ctx.$store.dispatch('doUpdateErrorMessage', { message });
      ctx.$router.push({ name: 'Floor' });
    }
    return kickedUserRes.data;
  } catch (err) {
    throw err;
  }
};

export const checkRoomAndRoles = async (ctx, { lifecycleGeneration = null } = {}) => {
  const roomDetailRes = await roomApi.detail({ _id: ctx.$route.params.room_id });
  ensureTimelineRequestCurrent(ctx, lifecycleGeneration);
  const room = roomDetailRes.data;

  if (room.floor._id !== ctx.$route.params.floor_id) {
    throw new Error(ctx.$t('タイムラインの初期化に失敗しました'));
  }

  if (ctx.$store.getters.userIsLogin) {
    await refreshRoomRole(ctx, {
      floorId: room.floor._id,
      roomId: room._id,
      lifecycleGeneration,
    });
    ensureTimelineRequestCurrent(ctx, lifecycleGeneration);
  }

  if (room.member_only) {
    if (!ctx.$store.getters.userIsLogin) throw new Error(ctx.$t('入室の許可がありません'));
    if (!ctx.room.isAdmin && !ctx.room.isFloorEditor && !ctx.room.isFloorMember && !ctx.room.isRoomMember) {
      throw new Error(ctx.$t('入室の許可がありません'));
    }
  }

  ctx.$store.dispatch('doUpdateFloorId', { id: room.floor._id });
  ctx.$store.dispatch('doUpdateFloorTitle', { title: ctx.getTranslatedTitle(room.floor) });
  ctx.$store.dispatch('doUpdateFloorTargetLangs', { targetLangs: room.floor.target_langs });

  ctx.$store.dispatch('doUpdateRoomId', { id: room._id });
  ctx.$store.dispatch('doUpdateRoomTitle', { title: ctx.getTranslatedTitle(room) });

  ctx.room.title = ctx.$store.getters.roomTitle;
  ctx.room.description = ctx.getTranslatedDescription(room);
  ctx.room.creator = room.user?.username || '';
  ctx.room.creatorUser = room.user || null;
  ctx.room.createdAt = room.created_at;
  ctx.room.isMemberOnly = room.member_only;
  ctx.room.roomNotification = room.notification;
  ctx.room.showExternalShareButton = Boolean(room.external_sns_button);
  ctx.room.guestReactionOnly = room.guest_reaction_only;

  if (room.image_name) {
    ctx.room.imageUrl = `/media/${room.floor._id}/${room._id}/${room.image_name}`;
  }

  return room;
};

export const bootstrapRoomResources = async (ctx, room, { lifecycleGeneration = null } = {}) => {
  const resRoomTag = await tagApi.roomTag.list({ room_id: room._id });
  ensureTimelineRequestCurrent(ctx, lifecycleGeneration);
  ctx.room.tags = resRoomTag.data;
  if (typeof ctx.applyTimelineQueryFilters === 'function') {
    ctx.applyTimelineQueryFilters(ctx.$route?.query || {});
  } else if (ctx.ui.tempQueryTagNames?.length) {
    ctx.ui.localTagIds = ctx.ui.tempQueryTagNames
      .map((name) => ctx.findTagIdByNameOrTranslation(name.trim()))
      .filter((id) => id !== null);
  }

  ctx.$store.dispatch('doUpdateTagList', { list: [] });

  const { data: groupsRes } = await quickTextAPI.getGroups({ resource: 'room', resourceId: room._id });
  ensureTimelineRequestCurrent(ctx, lifecycleGeneration);
  const groups = Array.isArray(groupsRes) ? groupsRes : groupsRes?.docs || [];
  ctx.room.quickTextGroups = groups;

  ctx.room.quickTextItemsByGroup = Object.create(null);
  await Promise.all(
    groups.map(async (g) => {
      const { data: itemsRes } = await quickTextAPI.getItems({
        resource: 'room',
        resourceId: room._id,
        groupId: g._id,
      });
      ensureTimelineRequestCurrent(ctx, lifecycleGeneration);
      const items = Array.isArray(itemsRes) ? itemsRes : itemsRes?.docs || [];
      ctx.room.quickTextItemsByGroup[g._id] = items;
    })
  );

  if (ctx.$store.getters.userIsLogin) {
    const soundTagRes = await tagApi.soundTag.fetch({ floor_id: room.floor._id, room_id: room._id });
    ensureTimelineRequestCurrent(ctx, lifecycleGeneration);
    if (soundTagRes.data) {
      ctx.dialogs.sound.tagId = soundTagRes.data._id;
      ctx.dialogs.sound.tags = soundTagRes.data.tags;
    }
  } else {
    const guestSoundTags = ctx.$store.getters.guestSoundTags;
    const guestSoundTag = guestSoundTags.find(({ roomId }) => roomId === ctx.$store.getters.roomId);
    if (guestSoundTag) {
      ctx.dialogs.sound.tagId = guestSoundTag.roomId;
      ctx.dialogs.sound.tags = guestSoundTag.soundTags;
    }
  }

  if (!ctx.$store.getters.userIsLogin && !ctx.$store.getters.guestId) {
    await ctx.$store.dispatch('doEnsureGuestAuth');
    ensureTimelineRequestCurrent(ctx, lifecycleGeneration);
  }
};

export const initTimeLine = async (ctx) => {
  const lifecycleGeneration = captureTimelineLifecycle(ctx);
  ctx.initializationError = '';
  try {
    const isKicked = await checkKickedUser(ctx, { lifecycleGeneration });
    if (isKicked) {
      ctx.clearTimelineAnalytics?.();
      return;
    }

    const room = await checkRoomAndRoles(ctx, { lifecycleGeneration });
    await bootstrapRoomResources(ctx, room, { lifecycleGeneration });
    ensureTimelineRequestCurrent(ctx, lifecycleGeneration);

    ctx.timelineResourcesReady = true;
    ctx.activateTimelineAnalytics?.(room);
    ctx.connectInitialSocket();
    const postId = readRoutePostId(ctx);
    if (postId) {
      try {
        void Promise.resolve(ctx.fetchFocusPostAndAppend(postId)).catch(() => undefined);
      } catch (_error) {
        // フォーカス投稿の取得に失敗しても、ルームの閲覧計測を維持する。
      }
    }
  } catch (err) {
    ctx.clearTimelineAnalytics?.();
    const shouldIgnore =
      isStaleTimelineRequest(err) ||
      shouldIgnorePageLeaveError(err) ||
      (typeof ctx.shouldIgnoreTimelineRequestError === 'function' &&
        ctx.shouldIgnoreTimelineRequestError(err, lifecycleGeneration));
    if (shouldIgnore) return;

    const isAuthError = handleAuthErrorUtil(err, { store: ctx.$store, router: ctx.$router });
    if (isAuthError) return;

    let message = ctx.$t('タイムラインの初期化に失敗しました');
    const isApiError = Boolean(err?.isAxiosError || err?.response || err?.request || err?.config);
    if (isApiError) {
      const apiError = formatApiErrorMessage(err, { translate: ctx.$t });
      if (apiError.code || apiError.status) message = apiError.displayMessage || message;
    } else if (typeof err?.message === 'string' && err.message) {
      message = err.message;
    }
    ctx.initializationError = message;
    ctx.$store.dispatch('doUpdateErrorMessage', { message });
    if (message === ctx.$t('入室の許可がありません') && ctx.$route?.params?.floor_id) {
      ctx.$router.push({ name: 'Room', params: { floor_id: ctx.$route.params.floor_id } });
    }
  }
};
