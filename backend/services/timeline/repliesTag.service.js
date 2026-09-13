const { publishSocketEvent } = require('../../socket/publication');
const AppError = require('../../utils/appError');
const {
  isAIAnalysisExecutionEnabled,
} = require('../analysis/settings/capability');
const { authorizeRoomAccess } = require('../../services/room/roomAccess.service');
const serializeTimeline = require('./shared/timelineSerializer');
const MEDIA_PATH = process.env.MEDIA_PATH;

const Chat = require('../../models/Chat');

const { validateRoomTagsForRoom } = require('./shared/roomTagValidation');
const { persistReplyAnalysisSourceMutation } = require('./shared/analysisSourceMutation');

const { runReplyAnalyses } = require('../../services/analysis.service');
const { runBackgroundTask } = require('../backgroundTaskRunner');
const { areRoomTagSetsEqual } = require('./shared/analysisSourceRevision');
const { resolveMutationTargetLangs } = require('./shared/targetLanguages');

const {
  ensureReplyContext,
  findChatByReplyId,
  findChatByPostId,
  findReplyOrThrow,
  populateReplies,
} = require('./shared/replyContext');

exports.updateTag = async (body, jwtPayload, io, { errors, skipUnchanged = false } = {}) => {
  const roomId = body.room_id;
  const replyId = body._id;
  const roomTags = body.room_tags;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const { foundRoom, foundFloor } = await authorizeRoomAccess(decodedUserId, decodedUserRole, roomId, { errors });
  await validateRoomTagsForRoom(roomTags, { floorId: foundFloor._id, roomId: foundRoom._id });

  // 変更前後のタグを比較するため、現在の返信を取得する。
  const beforeChat = body.post_id
    ? await findChatByPostId(body.post_id, { roomId: foundRoom._id, code: errors?.post?.code })
    : await findChatByReplyId(replyId, {
    populate: { path: 'replies.room_tags', select: 'name lang' },
    lean: true,
  });
  ensureReplyContext(beforeChat, foundRoom, body.post_id || null);
  const { reply: beforeReply } = findReplyOrThrow(beforeChat, replyId, errors?.reply?.code);
  if (skipUnchanged && areRoomTagSetsEqual(beforeReply.room_tags, roomTags)) return serializeTimeline(beforeChat);
  const targetLangs = resolveMutationTargetLangs({ floor: foundFloor, roomId: foundRoom._id, io, sourceLang: beforeReply.lang });

  const sourceMutation = await persistReplyAnalysisSourceMutation({
    baseQuery: { _id: beforeChat._id, room: foundRoom._id, delete_flg: false },
    replyId,
    initialSource: beforeReply,
    desiredSource: { ...beforeReply, room_tags: roomTags },
    setFields: { room_tags: roomTags },
  }).catch((error) => {
    if (errors?.conflict && error.code === 'INVALID_PARAMS') throw new AppError(errors.conflict);
    throw error;
  });
  const sourceChanged = sourceMutation.sourceChanged;
  const populatedChat = await populateReplies(sourceMutation.document);

  if (!populatedChat) throw new AppError({ code: 'INVALID_PARAMS' });

  const analysisEnabled = isAIAnalysisExecutionEnabled();
  // 更新後の投稿全体を通知するため、関連データを含めて再取得する。
  const latest = await populateReplies(Chat.findById(populatedChat._id));
  const result = serializeTimeline(latest);
  await publishSocketEvent('TAG_UPDATE', () => io.to(result.room._id).emit('TAG_UPDATE', result));

  if (analysisEnabled && sourceChanged) {
    runBackgroundTask(
      'timeline.replies.updateTag',
      ({ signal }) =>
        runReplyAnalyses({
          chatId: result._id,
          replyId,
          targetLangs,
          io,
          mediaPath: MEDIA_PATH,
          signal,
        }),
      { context: { postId: String(result._id), replyId: String(replyId) } }
    );
  }

  return result;
};
