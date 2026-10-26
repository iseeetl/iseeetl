const id = (v) => String(v?._id || v || '');
export const normalizeUpdatePreference = (value = {}) => ({
  enabled: value?.enabled === true,
  scope: value?.scope === 'all' ? 'all' : 'related',
  alternative: value?.alternative !== false,
  supplement: value?.supplement !== false,
  reaction: value?.reaction === true,
});
export const sanitizeUpdatePreferences = (value) => Object.fromEntries(
  Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    .filter(([key]) => /^[a-f0-9]{24}$/i.test(key)).map(([key, pref]) => [key, normalizeUpdatePreference(pref)]));
const mine = (value, getters) => !!value && ((getters.userId && id(value.user) === getters.userId) ||
  (getters.guestId && value.guest_id === getters.guestId));
export const involvedInPost = (post, getters) => [post, ...(post.replies || [])].some(item =>
  mine(item, getters) || (item.reactions || []).some(x => mine(x, getters)) ||
  (item.alternative_reactions || []).some(x => mine(x, getters)) ||
  (item.supplementaries || []).some(s => mine(s, getters) || (s.reactions || []).some(x => mine(x, getters))));
export const noticeTarget = (post, notice) => {
  const item = notice.replyId ? post.replies?.find(x => id(x) === notice.replyId) : post;
  return notice.supplementId ? item?.supplementaries?.find(x => id(x) === notice.supplementId) : item;
};
export const noticeVisible = (notice, post, getters) => {
  const pref = normalizeUpdatePreference(getters.roomUpdatePreference?.(notice.roomId));
  if (!pref.enabled || !pref[notice.kind] || !post || (pref.scope === 'related' && !involvedInPost(post, getters))) return false;
  const target = noticeTarget(post, notice);
  if (!target || target.delete_flg) return false;
  if (notice.supplementId && getters.isSupplementVisible?.(target, notice.roomId) === false) return false;
  if ((notice.kind === 'alternative' || notice.media) && getters.displayAlternativeText === false) return false;
  return true;
};
// Compare the received post with the already loaded post. Translation-only updates are not new notices.
export const diffPostUpdates = (before, after) => {
  if (!before || !after || id(before) !== id(after)) return [];
  const changes = [];
  const visit = (old, item, replyId = null, supplementId = null) => {
    if (!old || !item || item.delete_flg) return;
    const target = { replyId, supplementId };
    for (const [media, field] of [['image','image_caption'],['video','video_description'],['audio','audio_description']]) {
      if (item[`${media}_name`] && item[`${media}_name`] === old[`${media}_name`] &&
        (item[field] || '') !== (old[field] || '')) changes.push({ ...target, kind:'alternative', media });
    }
    for (const field of ['reactions','alternative_reactions']) {
      const oldIds = new Set((old[field] || []).map(id));
      for (const reaction of item[field] || []) if (!oldIds.has(id(reaction)))
        changes.push({ ...target, kind:'reaction', media: field === 'alternative_reactions' ? reaction.media_kind : null,
          reactionId:id(reaction), actor:reaction });
    }
    for (const supp of item.supplementaries || []) {
      if (supp.delete_flg) continue;
      const oldSupp = old.supplementaries?.find(x => id(x) === id(supp));
      if (!oldSupp || oldSupp.content !== supp.content || oldSupp.title !== supp.title)
        changes.push({ replyId, supplementId:id(supp), kind:'supplement' });
      if (oldSupp) visit(oldSupp, supp, replyId, id(supp));
    }
  };
  visit(before, after);
  for (const reply of after.replies || []) visit(before.replies?.find(x => id(x) === id(reply)), reply, id(reply));
  return changes;
};
export const collectUpdateNotices = (ctx, post) => {
  const getters = ctx.$store?.getters;
  const roomId = id(post?.room);
  if (!getters || !normalizeUpdatePreference(getters.roomUpdatePreference?.(roomId)).enabled) return;
  const before = (ctx.timeline?.filters || []).flatMap(f => f.posts || []).find(p => id(p) === id(post) && !p.origin_id);
  if (!before) return;
  const notices = diffPostUpdates(before, post).filter(change => !change.actor || !mine(change.actor, getters))
    .map(change => ({ kind:change.kind, replyId:change.replyId, supplementId:change.supplementId, media:change.media, roomId, postId:id(post), at:Date.now() }))
    .filter(n => noticeVisible(n, post, getters));
  if (notices.length) ctx.$store.commit?.('appendUpdateNotices', notices);
};
