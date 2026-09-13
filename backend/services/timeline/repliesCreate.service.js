const { authorizeRoomAccess } = require('../../services/room/roomAccess.service');
const { TIMELINE_POPULATE_WITH_REPLIES } = require('./shared/chatPopulate');
const {
  isGoogleTranslateEnabled,
} = require('../../config/featureFlags');
const {
  isAIAnalysisExecutionEnabled,
} = require('../analysis/settings/capability');
const MEDIA_PATH = process.env.MEDIA_PATH;

const { validateMediaChanges } = require('../media/reference');
const { notifyReplyFilterMatch } = require('./shared/replyNotifications');
const { createTimelineReply } = require('./shared/replyCreate');
const {
  emitReplyCreate,
  translateReplyAfterCreate,
} = require('./shared/replyPostProcess');
const { notifyReplyPostAuthor, notifyReplyRepliers } = require('./shared/replyParticipantNotifications');
const { ensureChatBelongsToRoom } = require('./shared/roomConsistency');
const { validateRoomTagsForRoom } = require('./shared/roomTagValidation');
const { resolveMutationTargetLangs } = require('./shared/targetLanguages');

const { runReplyAnalyses } = require('../../services/analysis.service');
const { runBackgroundSteps } = require('../backgroundTaskRunner');

const { findChatByPostId } = require('./shared/replyContext');

exports.create = async (body, jwtPayload, io, { errors, requireContentOrMedia = false } = {}) => {
  const roomId = body.room_id;
  const postId = body.post_id;
  const content = body.content;
  const lang = body.lang;
  const roomTags = body.room_tags === undefined ? [] : body.room_tags;
  const animation = body.animation;
  const imageName = body.image_name;
  const imageThumbnailName = body.image_thumbnail_name;
  const imageCaption = body.image_caption;
  const videoName = body.video_name;
  const videoThumbnailName = body.video_thumbnail_name;
  const videoSubtitleOriginalname = body.video_subtitle_originalname;
  const videoSubtitleName = body.video_subtitle_name;
  const audioName = body.audio_name;
  const audioTitle = body.audio_title;
  const audioDescription = body.audio_description;
  const notifyAll = body.notify_all === true;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const { foundUser, foundRoom, foundFloor } = await authorizeRoomAccess(decodedUserId, decodedUserRole, roomId, { errors });
  const targetLangs = resolveMutationTargetLangs({
    requested: body.target_langs,
    floor: foundFloor,
    roomId: foundRoom._id,
    io,
    sourceLang: lang,
  });
  await validateRoomTagsForRoom(roomTags, { floorId: foundFloor._id, roomId: foundRoom._id });

  const foundChat = await findChatByPostId(postId, { roomId: foundRoom._id, code: errors?.post?.code });
  ensureChatBelongsToRoom(foundChat, foundRoom, 'INVALID_PARAMS');

  await validateMediaChanges({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    userId: decodedUserId,
    newItem: body,
  });

  const { responseChat, replacedContent } = await createTimelineReply({
    postId,
    content,
    populate: TIMELINE_POPULATE_WITH_REPLIES,
    buildReply: ({ replacedContent: replaced }) => ({
      user: decodedUserId,
      content: requireContentOrMedia && content === null ? null : replaced,
      lang,
      room_tags: roomTags,
      animation,
      image_name: imageName,
      image_thumbnail_name: imageThumbnailName,
      image_caption: imageCaption,
      video_name: videoName,
      video_thumbnail_name: videoThumbnailName,
      video_subtitle_originalname: videoSubtitleOriginalname,
      video_subtitle_name: videoSubtitleName,
      audio_name: audioName,
      audio_title: audioTitle,
      audio_description: audioDescription,
    }),
  });

  // 投稿者、既存の返信者、通知フィルタの一致者へ通知する。返信者本人は対象から除外する。
  await notifyReplyPostAuthor({
    foundChat,
    foundFloor,
    foundRoom,
    senderName: foundUser.username,
    replacedContent,
    excludeUserId: decodedUserId,
    logLabel: 'reply-notify (post author)',
  });

  await notifyReplyRepliers({
    foundChat,
    foundFloor,
    foundRoom,
    senderName: foundUser.username,
    replacedContent,
    excludeUserId: decodedUserId,
    logLabel: 'reply-notify (repliers)',
    buildContents: ({ senderName, snippet }) => ({
      ja: `${senderName}: 「${snippet}」`,
      en: `${senderName}: “${snippet}”`,
    }),
  });

  await notifyReplyFilterMatch({
    roomId: foundRoom._id,
    floorId: foundFloor._id,
    content: replacedContent,
    roomTags,
    username: foundUser.username,
    animation,
    excludeUserId: decodedUserId,
    logLabel: 'reply-notify (pushfilter)',
  });

  await emitReplyCreate(io, responseChat, { includeNotifyAll: true, notifyAll });

  const createdReply = responseChat.replies[responseChat.replies.length - 1];
  const translationEnabled = isGoogleTranslateEnabled();
  const analysisEnabled = isAIAnalysisExecutionEnabled();
  if (translationEnabled || analysisEnabled) {
    runBackgroundSteps('timeline.replies.create', {
      translation: async () => {
        if (translationEnabled) {
          await translateReplyAfterCreate({
            result: responseChat,
            targetLangs,
            io,
            actor: { type: 'user', id: decodedUserId },
          });
        }
      },
      analysis: async ({ signal }) => {
        if (analysisEnabled) {
          await runReplyAnalyses({
            chatId: responseChat._id,
            replyId: createdReply._id,
            targetLangs,
            io,
            mediaPath: MEDIA_PATH,
            signal,
          });
        }
      },
    }, { context: { postId: String(responseChat._id), replyId: String(createdReply._id) } });
  }

  return responseChat;
};
