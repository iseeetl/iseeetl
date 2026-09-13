const ROLES = require('../../../constants/roles');
const AppError = require('../../../utils/appError');
const { isGoogleTranslateEnabled } = require('../../../config/featureFlags');
const { findChatOrThrow } = require('./reactionHelpers');
const { ensureChatBelongsToRoom, toIdString } = require('./roomConsistency');

async function findChatInRoomOrThrow({ postId, room, notFoundCode = 'INVALID_PARAMS' }) {
  let chat;
  try {
    chat = await findChatOrThrow(postId);
  } catch (error) {
    if (error instanceof AppError) throw new AppError({ code: notFoundCode });
    throw error;
  }
  ensureChatBelongsToRoom(chat, room, notFoundCode);
  return chat;
}

function findReplyInChatOrThrow({ chat, replyId, code = 'INVALID_PARAMS', excludeDeleted = false }) {
  const targetReplyId = toIdString(replyId);
  const reply = (chat?.replies || []).find((r) => {
    if (!r) return false;
    if (excludeDeleted && r.delete_flg) return false;
    return toIdString(r._id) === targetReplyId;
  });
  if (!reply) throw new AppError({ code });
  return reply;
}

function findSupplementOrThrow({ supplementaries, supplementId, code = 'INVALID_PARAMS', excludeDeleted = false }) {
  const targetSupplementId = toIdString(supplementId);
  const supplement = (supplementaries || []).find((s) => {
    if (!s) return false;
    if (excludeDeleted && s.delete_flg) return false;
    return toIdString(s._id) === targetSupplementId;
  });
  if (!supplement) throw new AppError({ code });
  return supplement;
}

function canEditSupplement({ role, floor, floorMember, supplementUser, userId }) {
  if (role === ROLES.ADMINISTRATOR) return true;
  if (toIdString(floor?.user) === toIdString(userId) && role === ROLES.EDITOR) return true;
  if (floorMember !== null) return true;
  const supplementUserId = toIdString(supplementUser);
  return !!supplementUserId && supplementUserId === toIdString(userId);
}

function buildSupplementPayload({
  userId,
  replacedContent,
  lang,
  imageName,
  imageThumbnailName,
  imageCaption,
  videoName,
  videoThumbnailName,
  videoSubtitleOriginalname,
  videoSubtitleName,
  audioName,
  audioTitle,
  audioDescription,
}) {
  return {
    user: userId,
    content: replacedContent,
    lang,
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
  };
}

function buildUpdatedSupplementPayload({
  supplement,
  replacedContent,
  lang,
  imageName,
  imageThumbnailName,
  imageCaption,
  videoName,
  videoThumbnailName,
  videoSubtitleOriginalname,
  videoSubtitleName,
  audioName,
  audioTitle,
  audioDescription,
}) {
  const updatedSupplement = {
    ...supplement.toObject(),
    updated_at: Date.now(),
    content: replacedContent,
    lang,
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
  };
  if (
    (supplement.content !== updatedSupplement.content || supplement.lang !== updatedSupplement.lang) &&
    isGoogleTranslateEnabled()
  ) {
    updatedSupplement.translations = [];
  }
  return updatedSupplement;
}

const supplementFieldsFromBody = (body = {}) => ({
  lang: body.lang,
  imageName: body.image_name,
  imageThumbnailName: body.image_thumbnail_name,
  imageCaption: body.image_caption,
  videoName: body.video_name,
  videoThumbnailName: body.video_thumbnail_name,
  videoSubtitleOriginalname: body.video_subtitle_originalname,
  videoSubtitleName: body.video_subtitle_name,
  audioName: body.audio_name,
  audioTitle: body.audio_title,
  audioDescription: body.audio_description,
});

const buildSupplementPayloadFromBody = ({ body, userId, replacedContent }) =>
  buildSupplementPayload({ userId, replacedContent, ...supplementFieldsFromBody(body) });

const buildUpdatedSupplementPayloadFromBody = ({ body, supplement, replacedContent }) =>
  buildUpdatedSupplementPayload({ supplement, replacedContent, ...supplementFieldsFromBody(body) });

function buildMediaState({ imageName, imageThumbnailName, videoName, videoThumbnailName, videoSubtitleName, audioName }) {
  return {
    image: { main: imageName, thumb: imageThumbnailName },
    video: { main: videoName, thumb: videoThumbnailName, subtitle: videoSubtitleName },
    audio: { main: audioName },
  };
}

module.exports = {
  buildMediaState,
  buildSupplementPayload,
  buildSupplementPayloadFromBody,
  buildUpdatedSupplementPayload,
  buildUpdatedSupplementPayloadFromBody,
  canEditSupplement,
  findChatInRoomOrThrow,
  findReplyInChatOrThrow,
  findSupplementOrThrow,
};
