const TIMELINE_POPULATE_WITH_REACTIONS = [
  { path: 'user', select: 'username image_name delete_flg' },
  { path: 'supplementaries.user', select: 'username image_name delete_flg' },
  { path: 'reactions.user', select: 'username image_name delete_flg' },
  { path: 'replies.user', select: 'username image_name delete_flg' },
  { path: 'replies.supplementaries.user', select: 'username image_name delete_flg' },
];

const TIMELINE_POPULATE_WITH_REPLIES = [
  { path: 'user', select: 'username image_name delete_flg' },
  { path: 'supplementaries.user', select: 'username image_name delete_flg' },
  { path: 'replies.user', select: 'username image_name delete_flg' },
  { path: 'replies.supplementaries.user', select: 'username image_name delete_flg' },
];

module.exports = {
  TIMELINE_POPULATE_WITH_REACTIONS,
  TIMELINE_POPULATE_WITH_REPLIES,
};
