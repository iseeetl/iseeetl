const replies = require('../../services/timeline/replies.service');
const postSupplements = require('../../services/timeline/postSupplements.service');
const replySupplements = require('../../services/timeline/replySupplements.service');
const { mapTimelineRequest } = require('../../validates/timelineResource');
const { presentPostMutation } = require('./postResource.presenter');
const options = require('./resourceOptions');

const services = { reply: replies, postSupplement: postSupplements, replySupplement: {
  create: replySupplements.createReplySupplement,
  update: replySupplements.updateReplySupplement,
  delete: replySupplements.deleteReplySupplement,
} };

const present = (post, input, operation, kind) => {
  const reply = kind === 'replySupplement'
    ? post.replies.find((item) => String(item._id) === input.reply_id)
    : null;
  const items = kind === 'reply' ? post.replies : reply ? reply.supplementaries : post.supplementaries;
  const item = operation === 'create' ? items[items.length - 1] : items.find((value) => String(value._id) === input._id);
  const dto = presentPostMutation({ ...item, room: post.room });
  if (kind !== 'reply') { delete dto.room_tags; delete dto.animation; }
  return { ...dto, post_id: String(post._id), ...(reply ? { reply_id: String(reply._id) } : {}) };
};

exports.handle = (kind, operation) => async (req, res, next) => {
  try {
    const input = mapTimelineRequest(req.params, req.body, operation, kind);
    const result = await services[kind][operation](input, req.jwtPayload, req.io, options);
    if (operation === 'delete') return res.status(204).end();
    return res.status(operation === 'create' ? 201 : 200).json(present(result, input, operation, kind));
  } catch (error) { return next(error); }
};
