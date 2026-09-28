import chatApi from '@/api/chat';

export const getEmptyTimelineMessage = (room, language, translate) => {
  const original = room?.empty_message?.trim();
  if (!original) return translate('まだ投稿がありません。投稿されると、ここに表示されます。');
  if (!room.lang || room.lang === language) return original;
  const translated = room.empty_message_translations?.find((entry) => entry.lang === language)?.content;
  return translated?.trim() || original;
};

export const markTimelineHasPosts = (ctx) => {
  ctx.timeline.emptyStateRequest += 1;
  ctx.timeline.isEmpty = false;
};

export const refreshTimelineEmptyState = async (ctx) => {
  const request = ++ctx.timeline.emptyStateRequest;
  const generation = ctx.captureTimelineLifecycle();
  const isCurrent = () => ctx.canApplyTimelineRequest(generation) && request === ctx.timeline.emptyStateRequest;
  ctx.timeline.isEmpty = null;
  try {
    // 絞り込みや取得済みページの件数では、ルーム全体の投稿の有無を判断できない。
    const { data } = await chatApi.fetchPosts({
      floor_id: ctx.$store.getters.floorId,
      room_id: ctx.$store.getters.roomId,
      isGuest: !ctx.$store.getters.userIsLogin,
    });
    if (!isCurrent()) return;
    const posts = Array.isArray(data) ? data : data?.posts;
    ctx.timeline.isEmpty = Array.isArray(posts) ? posts.length === 0 : null;
  } catch {
    if (isCurrent()) ctx.timeline.isEmpty = null;
  }
};
