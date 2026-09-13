const Chat = require('../../../models/Chat');
const AppError = require('../../../utils/appError');
const { resolveInsideBaseDir } = require('../../../utils/safePath');
const { deleteMediaItem } = require('../../media/fileCleanup');
const serializeTimeline = require('../shared/timelineSerializer');
const { serializeTimelineForPublic } = serializeTimeline;
const {
  withAIAnalysisIntegrityLock,
} = require('../../analysis/settings/referenceIntegrity');

const buildDeleteUpdate = ({ targetPath, deleteFlg, now }) => ({
  $set: {
    [`${targetPath}.updated_at`]: now,
    [`${targetPath}.delete_flg`]: deleteFlg,
    [`${targetPath}.deleted_at`]: deleteFlg ? now : null,
  },
});

const findById = (items, id) =>
  (items || []).find((item) => item?._id && item._id.toString() === id);

const resolveNestedTarget = ({ post, postId, replyId, supplementId }) => {
  if (replyId && supplementId) {
    const reply = findById(post.replies, replyId);
    const item = reply && findById(reply.supplementaries, supplementId);
    if (!reply || !item) throw new AppError({ code: 'NOT_FOUND' });
    return {
      item,
      query: { _id: postId, 'replies._id': replyId, 'replies.supplementaries._id': supplementId },
      targetPath: 'replies.$[reply].supplementaries.$[supplement]',
      arrayFilters: [{ 'reply._id': replyId }, { 'supplement._id': supplementId }],
    };
  }

  if (replyId) {
    const item = findById(post.replies, replyId);
    if (!item) throw new AppError({ code: 'NOT_FOUND' });
    return {
      item,
      query: { _id: postId, 'replies._id': replyId },
      targetPath: 'replies.$[reply]',
      arrayFilters: [{ 'reply._id': replyId }],
    };
  }

  const item = findById(post.supplementaries, supplementId);
  if (!item) throw new AppError({ code: 'NOT_FOUND' });
  return {
    item,
    query: { _id: postId, 'supplementaries._id': supplementId },
    targetPath: 'supplementaries.$[supplement]',
    arrayFilters: [{ 'supplement._id': supplementId }],
  };
};

const updateNestedTarget = async ({ target, deleteFlg, now }) => {
  const updated = await withAIAnalysisIntegrityLock(() =>
    Chat.findOneAndUpdate(
      target.query,
      buildDeleteUpdate({ targetPath: target.targetPath, deleteFlg, now }),
      { arrayFilters: target.arrayFilters, new: true, runValidators: true }
    )
  );
  if (!updated) throw new AppError({ code: 'INVALID_PARAMS' });
  return updated;
};

const deleteTimelineItem = async (body) => {
  const postId = body.post_id;
  const replyId = body.reply_id || null;
  const supplementId = body.supplement_id || null;
  const deleteFlg = body.delete_flg;
  if (!postId) throw new AppError({ code: 'INVALID_PARAMS' });

  const post = await Chat.findById(postId).lean();
  if (!post) throw new AppError({ code: 'NOT_FOUND' });

  const now = Date.now();
  const baseDir = resolveInsideBaseDir(process.env.MEDIA_PATH, [String(post.floor), String(post.room)], {
    createError: () => new AppError({ code: 'INVALID_PARAMS' }),
  });

  if (replyId || supplementId) {
    const target = resolveNestedTarget({ post, postId, replyId, supplementId });
    const updated = await updateNestedTarget({ target, deleteFlg, now });
    if (deleteFlg) await deleteMediaItem(baseDir, target.item);
    return serializeTimelineForPublic(updated, { preserveDeleted: true });
  }

  const updated = await withAIAnalysisIntegrityLock(() =>
    Chat.findByIdAndUpdate(
      postId,
      { delete_flg: deleteFlg, updated_at: now, deleted_at: deleteFlg ? now : null },
      { new: true, runValidators: true }
    )
  );
  if (!updated) throw new AppError({ code: 'INVALID_PARAMS' });
  if (deleteFlg) await deleteMediaItem(baseDir, post);
  return serializeTimelineForPublic(updated, { preserveDeleted: true });
};

module.exports = {
  delete: deleteTimelineItem,
};
