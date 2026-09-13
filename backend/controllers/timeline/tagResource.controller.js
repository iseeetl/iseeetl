const posts = require('../../services/timeline/posts.service');
const replies = require('../../services/timeline/replies.service');
const { mapTagRequest } = require('../../validates/timelineResource');
const options = require('./resourceOptions');

exports.handle = (kind) => async (req, res, next) => {
  try {
    const input = mapTagRequest(req.params, req.body, kind);
    const post = await (kind === 'reply' ? replies : posts).updateTag(input, req.jwtPayload, req.io, { ...options, skipUnchanged: true });
    const item = kind === 'reply' ? post.replies.find((reply) => String(reply._id) === input._id) : post;
    return res.json({ post_id: String(post._id), ...(kind === 'reply' ? { reply_id: input._id } : {}),
      room_tags: item.room_tags.map((tag) => String(tag._id || tag)) });
  } catch (error) { return next(error); }
};
