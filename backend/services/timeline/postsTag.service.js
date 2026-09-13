const { publishSocketEvent } = require('../../socket/publication');
const AppError = require('../../utils/appError');
const {
  isGoogleTranslateEnabled,
} = require('../../config/featureFlags');
const {
  isAIAnalysisExecutionEnabled,
} = require('../analysis/settings/capability');

const serializeTimeline = require('./shared/timelineSerializer');
const { authorizeRoomAccess } = require('../../services/room/roomAccess.service');

const Chat = require('../../models/Chat');

const { ensureChatBelongsToRoom } = require('./shared/roomConsistency');
const { validateRoomTagsForRoom } = require('./shared/roomTagValidation');
const { persistPostAnalysisSourceMutation } = require('./shared/analysisSourceMutation');
const { runPostAnalyses } = require('../../services/analysis.service');
const { translateMainContentIfNeeded } = require('../../services/timeline/timelineTranslation.service');
const { runBackgroundSteps } = require('../backgroundTaskRunner');

const MEDIA_PATH = process.env.MEDIA_PATH;
const { findActiveChatOrThrow } = require('./shared/postContext');
const { areRoomTagSetsEqual } = require('./shared/analysisSourceRevision');
const { resolveMutationTargetLangs } = require('./shared/targetLanguages');

exports.updateTag = async (body, jwtPayload, io, { errors, skipUnchanged = false } = {}) => {
  const roomId = body.room_id;
  const postId = body._id;
  const roomTags = body.room_tags;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const { foundRoom, foundFloor } = await authorizeRoomAccess(decodedUserId, decodedUserRole, roomId, { errors });
  await validateRoomTagsForRoom(roomTags, { floorId: foundFloor._id, roomId: foundRoom._id });

  // 変更前後のタグを比較するため、現在の投稿を取得する。
  const beforeChat = await findActiveChatOrThrow(postId, {
    roomId: foundRoom._id,
    error: errors?.post,
    populate: { path: 'room_tags', select: 'name lang' },
    lean: true,
  });
  ensureChatBelongsToRoom(beforeChat, roomId, 'INVALID_PARAMS');
  if (skipUnchanged && areRoomTagSetsEqual(beforeChat.room_tags, roomTags)) return serializeTimeline(beforeChat);
  const targetLangs = resolveMutationTargetLangs({ requested: body.target_langs, floor: foundFloor, roomId: foundRoom._id, io, sourceLang: beforeChat.lang });

  const sourceMutation = await persistPostAnalysisSourceMutation({
    baseQuery: { _id: postId, room: foundRoom._id, delete_flg: false },
    initialSource: beforeChat,
    desiredSource: { ...beforeChat, room_tags: roomTags },
    setFields: { room_tags: roomTags },
  }).catch((error) => {
    if (errors?.conflict && error.code === 'INVALID_PARAMS') throw new AppError(errors.conflict);
    throw error;
  });
  const updatedChat =
    typeof sourceMutation.document.populate === 'function'
      ? await sourceMutation.document.populate([
          { path: 'user', select: 'username image_name delete_flg' },
          { path: 'replies.user', select: 'username image_name delete_flg' },
          { path: 'replies.supplementaries.user', select: 'username image_name delete_flg' },
          { path: 'supplementaries.user', select: 'username image_name delete_flg' },
        ])
      : sourceMutation.document;
  const sourceChanged = sourceMutation.sourceChanged;

  if (!updatedChat) throw new AppError({ code: 'INVALID_PARAMS' });

  const analysisEnabled = isAIAnalysisExecutionEnabled();
  const translationEnabled = isGoogleTranslateEnabled();
  // 更新後の投稿全体を通知するため、関連データを含めて再取得する。
  const afterTagChat = await Chat.findOne({ _id: postId, delete_flg: false })
    .populate('user', 'username image_name delete_flg')
    .populate('replies.user', 'username image_name delete_flg')
    .populate('replies.supplementaries.user', 'username image_name delete_flg')
    .populate('supplementaries.user', 'username image_name delete_flg');
  const result = serializeTimeline(afterTagChat);
  await publishSocketEvent('TAG_UPDATE', () => io.to(result.room._id).emit('TAG_UPDATE', result));

  if (translationEnabled || (analysisEnabled && sourceChanged)) {
    runBackgroundSteps(
      'timeline.posts.updateTag',
      {
        translation: async () => {
          const chatDoc = await Chat.findById(result._id).populate('room_tags', 'name lang translations').lean();

          if (translationEnabled && chatDoc.content && chatDoc.content.trim() !== '') {
            await translateMainContentIfNeeded({
              userId: decodedUserId,
              chatId: chatDoc._id.toString(),
              content: chatDoc.content,
              lang: chatDoc.lang,
              targetLangs,
              io,
            });
          }
        },
        analysis: async ({ signal }) => {
          if (!analysisEnabled || !sourceChanged) return;
          await runPostAnalyses({
            chatId: result._id,
            targetLangs,
            io,
            mediaPath: MEDIA_PATH,
            signal,
          });
        },
      },
      { context: { postId: String(result._id) } }
    );
  }

  return result;
};
