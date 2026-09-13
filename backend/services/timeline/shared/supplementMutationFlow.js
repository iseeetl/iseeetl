const AppError = require('../../../utils/appError');
const { resolveInsideBaseDir } = require('../../../utils/safePath');
const { authorizeRoomAccess } = require('../../room/roomAccess.service');
const serializeTimeline = require('./timelineSerializer');
const {
  canEditSupplement,
  findChatInRoomOrThrow,
  findReplyInChatOrThrow,
  findSupplementOrThrow,
} = require('./supplementCommon');

const SUPPLEMENT_POPULATE = [
  { path: 'user', select: 'username image_name delete_flg' },
  { path: 'supplementaries.user', select: 'username image_name delete_flg' },
  { path: 'replies.user', select: 'username image_name delete_flg' },
  { path: 'replies.supplementaries.user', select: 'username image_name delete_flg' },
];

const resolveSupplementContext = async ({ body, jwtPayload, includeReply = false, notFoundCode, errors }) => {
  const userId = jwtPayload.user_id;
  const role = jwtPayload.user_role;
  const access = await authorizeRoomAccess(userId, role, body.room_id, {
    floorSelect: '_id user title target_langs',
    errors,
  });
  const chat = await findChatInRoomOrThrow({
    postId: body.post_id,
    room: access.foundRoom,
    notFoundCode,
  });
  const reply = includeReply
    ? findReplyInChatOrThrow({ chat, replyId: body.reply_id, code: notFoundCode, excludeDeleted: true })
    : null;
  return { ...access, chat, reply, role, userId, errors };
};

const resolveEditableSupplement = ({ context, supplementId, code, excludeDeleted = true }) => {
  const supplement = findSupplementOrThrow({
    supplementaries: context.reply ? context.reply.supplementaries : context.chat.supplementaries,
    supplementId,
    code,
    excludeDeleted,
  });
  if (
    !canEditSupplement({
      role: context.role,
      floor: context.foundFloor,
      floorMember: context.foundFloorMember,
      supplementUser: supplement.user,
      userId: context.userId,
    })
  ) {
    throw new AppError({ code: context.errors?.permission?.code || 'INVALID_PERMISSION' });
  }
  return supplement;
};

const persistSupplementMutation = async ({ query, notFoundCode }) => {
  const candidate = await query;
  if (!candidate) throw new AppError({ code: notFoundCode });
  const populated = typeof candidate.populate === 'function'
    ? await candidate.populate(SUPPLEMENT_POPULATE)
    : candidate;
  if (!populated) throw new AppError({ code: notFoundCode });
  return serializeTimeline(populated);
};

const shouldTranslateSupplementUpdate = ({ currentSupplement, updatedSupplement, targetLangs }) =>
  Array.isArray(targetLangs) &&
  targetLangs.length > 0 &&
  typeof updatedSupplement?.content === 'string' &&
  updatedSupplement.content.trim() !== '' &&
  (
    updatedSupplement.content !== currentSupplement?.content ||
    updatedSupplement.lang !== currentSupplement?.lang
  );

const resolveSupplementMediaDir = ({ floorId, roomId }) =>
  resolveInsideBaseDir(process.env.MEDIA_PATH, [String(floorId), String(roomId)]);

module.exports = {
  persistSupplementMutation,
  resolveEditableSupplement,
  resolveSupplementContext,
  resolveSupplementMediaDir,
  shouldTranslateSupplementUpdate,
};
