const serializeTimeline = require('./shared/timelineSerializer');
const AppError = require('../../utils/appError');
const { authorizeRoomAccess } = require('../../services/room/roomAccess.service');
const { validateMediaChanges } = require('../media/reference');
const { resolveMutationTargetLangs } = require('./shared/targetLanguages');
const {
  isGoogleTranslateEnabled,
} = require('../../config/featureFlags');
const {
  isAIAnalysisExecutionEnabled,
} = require('../analysis/settings/capability');

const { createTimelinePost } = require('./shared/postCreate');
const { validateRoomTagsForRoom } = require('./shared/roomTagValidation');
const { runPostAnalyses } = require('../../services/analysis.service');
const { translateMainContentIfNeeded } = require('../../services/timeline/timelineTranslation.service');
const { runBackgroundSteps } = require('../backgroundTaskRunner');

const MEDIA_PATH = process.env.MEDIA_PATH;

exports.create = async (body, jwtPayload, io, { errors, requireContentOrMedia = false } = {}) => {
  const roomId = body.room_id;
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

  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;

  const { foundUser, foundRoom, foundFloor } = await authorizeRoomAccess(decodedUserId, decodedUserRole, roomId, { errors });
  if (
    body.floor_id !== undefined &&
    String(body.floor_id).toLowerCase() !== String(foundFloor._id).toLowerCase()
  ) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
  const targetLangs = resolveMutationTargetLangs({
    requested: body.target_langs,
    floor: foundFloor,
    roomId: foundRoom._id,
    io,
    sourceLang: lang,
  });
  await validateRoomTagsForRoom(roomTags, { floorId: foundFloor._id, roomId: foundRoom._id });
  await validateMediaChanges({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    userId: decodedUserId,
    newItem: body,
  });

  const { responseChat, replacedContent } = await createTimelinePost({
    content,
    buildCreateData: ({ replacedContent: replaced }) => ({
      floor: foundFloor._id,
      room: foundRoom._id,
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
    buildResult: async (createdChat) => {
      const populatedChat = await createdChat.populate([{ path: 'user', select: 'username image_name delete_flg' }]);
      return serializeTimeline(populatedChat);
    },
    notify: {
      roomId: foundRoom._id,
      floorId: foundFloor._id,
      roomTags,
      username: foundUser.username,
      animation,
      excludeUserId: decodedUserId,
    },
    io,
  });

  // 翻訳とAI解析はバックグラウンドで実行する。
  const translationEnabled = isGoogleTranslateEnabled();
  const analysisEnabled = isAIAnalysisExecutionEnabled();
  if (translationEnabled || analysisEnabled) {
    runBackgroundSteps('timeline.posts.create', {
      translation: async () => {
        if (translationEnabled) {
          await translateMainContentIfNeeded({
            userId: decodedUserId,
            chatId: responseChat._id,
            content: replacedContent,
            lang,
            targetLangs,
            io,
          });
        }
      },
      analysis: async ({ signal }) => {
        if (analysisEnabled) {
          await runPostAnalyses({
            chatId: responseChat._id,
            targetLangs,
            io,
            mediaPath: MEDIA_PATH,
            signal,
          });
        }
      },
    }, { context: { postId: String(responseChat._id) } });
  }

  return responseChat;
};
