const replySupplementsService = require('../timeline/replySupplements.service');
const { assertDeveloper } = require('./common');
const {
  adaptReplySupplementCreate,
  adaptReplySupplementDelete,
  adaptReplySupplementUpdate,
} = require('./timelineMutation.adapter');

async function delegate({ body, jwtPayload, io }, adapt, operation) {
  assertDeveloper(jwtPayload);
  const input = adapt(body);
  const result = await operation(input, jwtPayload, io);
  return { result };
}

const createReplySupplement = (context) =>
  delegate(context, adaptReplySupplementCreate, replySupplementsService.createReplySupplement);

const updateReplySupplement = (context) =>
  delegate(context, adaptReplySupplementUpdate, replySupplementsService.updateReplySupplement);

const deleteReplySupplement = (context) =>
  delegate(context, adaptReplySupplementDelete, replySupplementsService.deleteReplySupplement);

module.exports = {
  createReplySupplement,
  deleteReplySupplement,
  updateReplySupplement,
};
