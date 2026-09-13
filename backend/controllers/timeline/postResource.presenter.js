const stringId = (value) => value == null ? null : String(value._id || value);
const date = (value) => value == null ? null : new Date(value).toISOString();

function presentPostMutation(post) {
  const user = post.user;
  return {
    _id: stringId(post),
    room_id: stringId(post.room),
    user: user && typeof user.username === 'string'
      ? { _id: stringId(user), username: user.username, image_name: user.image_name ?? null }
      : null,
    content: post.content || null,
    lang: post.lang,
    room_tags: (post.room_tags || []).map(stringId),
    animation: post.animation ?? null,
    media: {
      image: post.image_name ? {
        file_name: post.image_name,
        thumbnail_name: post.image_thumbnail_name ?? null,
        caption: post.image_caption ?? null,
      } : null,
      video: post.video_name ? {
        file_name: post.video_name,
        thumbnail_name: post.video_thumbnail_name ?? null,
        subtitle: post.video_subtitle_name ? {
          file_name: post.video_subtitle_name,
          original_name: post.video_subtitle_originalname ?? null,
        } : null,
      } : null,
      audio: post.audio_name ? {
        file_name: post.audio_name,
        title: post.audio_title ?? null,
        description: post.audio_description ?? null,
      } : null,
    },
    created_at: date(post.created_at),
    updated_at: date(post.updated_at),
  };
}

module.exports = { presentPostMutation };
