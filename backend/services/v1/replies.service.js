const repliesService = require('../timeline/replies.service');
const { assertDeveloper } = require('./common');
const {
  adaptReplyCreate,
  adaptReplyDelete,
  adaptReplyUpdate,
} = require('./timelineMutation.adapter');

async function delegate({ body, jwtPayload, io }, adapt, operation) {
  assertDeveloper(jwtPayload);
  const input = adapt(body);
  const result = await operation(input, jwtPayload, io);
  return { result };
}

const createReply = (context) =>
  delegate(context, adaptReplyCreate, repliesService.create);

const updateReply = (context) =>
  delegate(context, adaptReplyUpdate, repliesService.update);

const deleteReply = (context) =>
  delegate(context, adaptReplyDelete, repliesService.delete);

module.exports = {
  createReply,
  deleteReply,
  updateReply,
};
