const isMine = (obj, { userId, guestId } = {}) => {
  if (!obj) return false;
  if (obj.user && obj.user._id && obj.user._id === userId) return true;
  if (obj.guest_id && obj.guest_id === guestId) return true;
  return false;
};

export const shouldNotifyReply = ({ post, reply, userId, guestId, roomNotification }) => {
  if (roomNotification === false) return false;
  if (isMine(reply, { userId, guestId })) return false;
  if (reply && reply.animation) return false;

  const forceNotify = reply && reply.notify_all === true;

  const isMyPost = isMine(post, { userId, guestId });

  const hasMyOldReply =
    post &&
    Array.isArray(post.replies) &&
    post.replies.some((r) => r._id !== reply._id && isMine(r, { userId, guestId }));

  const hasMySuppOnPost =
    post && Array.isArray(post.supplementaries) && post.supplementaries.some((s) => isMine(s, { userId, guestId }));

  const hasMySuppOnReplies =
    post &&
    Array.isArray(post.replies) &&
    post.replies.some((r) => {
      if (r._id === reply._id) return false;
      return Array.isArray(r.supplementaries) && r.supplementaries.some((s) => isMine(s, { userId, guestId }));
    });

  const shouldNotifyMe = isMyPost || hasMyOldReply || hasMySuppOnPost || hasMySuppOnReplies;

  if (!forceNotify && !shouldNotifyMe) return false;
  return true;
};

export const buildReplyNotificationCard = (post, reply) => {
  const occurrenceId =
    reply.notification_event_id || reply.notified_at || reply.updated_at || reply.created_at || reply._id;

  return {
    origin_id: post._id,
    _id: `${post._id}:reply-notification:${occurrenceId}`,
    replyNotification: reply,
    user: post.user,
    guest_name: post.guest_name,
    content: post.content,
    room_tags: post.room_tags,
    created_at: post.created_at,
    image_name: post.image_name,
    audio_name: post.audio_name,
    video_name: post.video_name,
    floor: post.floor,
    room: post.room,
    replies: post.replies,
    lang: post.lang,
  };
};

export const shouldNotifyReaction = ({ post, reaction, userId, guestId, roomNotification }) => {
  if (roomNotification === false) return false;
  if (isMine(reaction, { userId, guestId })) return false;

  const isMyPost = isMine(post, { userId, guestId });
  if (!isMyPost) return false;

  return true;
};

export const buildReactionNotificationCard = (post, reaction) => ({
  origin_id: post._id,
  _id: post._id + reaction._id,
  reactionNotification: reaction,
  user: post.user,
  guest_name: post.guest_name,
  content: post.content,
  room_tags: post.room_tags,
  created_at: post.created_at,
  image_name: post.image_name,
  audio_name: post.audio_name,
  video_name: post.video_name,
  floor: post.floor,
  room: post.room,
  reactions: post.reactions,
});

export const appendNotificationCardToConditionless = ({
  filters,
  indexes,
  baseCard,
  ensurePostsArray,
  isParentVisible,
  getHideParent,
  skipIfParentVisible = true,
}) => {
  if (!Array.isArray(filters) || !Array.isArray(indexes)) return;
  indexes.forEach((i) => {
    if (skipIfParentVisible && typeof isParentVisible === 'function' && isParentVisible(i)) return;
    if (typeof ensurePostsArray === 'function') ensurePostsArray(i);
    const arrI = filters[i]?.posts;
    if (!Array.isArray(arrI)) return;
    const hideParent = typeof getHideParent === 'function' ? getHideParent(i, arrI) : false;
    if (!arrI.some((p) => p._id === baseCard._id)) {
      arrI.unshift({ ...baseCard, hideParent });
    }
  });
};
