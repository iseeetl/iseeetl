const { publishSocketEvent } = require('../../socket/publication');
const path = require('path');
const ROLES = require('../../constants/roles');
const AppError = require('../../utils/appError');
const {
  isGoogleTranslateEnabled,
} = require('../../config/featureFlags');
const {
  isAIAnalysisExecutionEnabled,
} = require('../analysis/settings/capability');

const serializeTimeline = require('./shared/timelineSerializer');
const { authorizeRoomAccess } = require('../../services/room/roomAccess.service');
const { deleteMediaItem } = require('../media/fileCleanup');
const { validateMediaChanges } = require('../media/reference');
const { cleanupReplacedMedia } = require('./shared/timelineMediaLifecycle');
const {
  TIMELINE_MUTABLE_FIELDS,
  buildMediaSnapshotMatch,
  buildMediaStateMatch,
  mergeTimelinePatch,
} = require('./shared/partialMutation');
const { resolveMutationTargetLangs } = require('./shared/targetLanguages');

const Chat = require('../../models/Chat');

const { replaceSpams } = require('../../services/spam.service');
const { ensureChatBelongsToRoom } = require('./shared/roomConsistency');
const { validateRoomTagsForRoom } = require('./shared/roomTagValidation');
const {
  persistPostAnalysisSourceMutation,
  buildExpectedRevisionCondition,
} = require('./shared/analysisSourceMutation');
const { areRoomTagSetsEqual } = require('./shared/analysisSourceRevision');
const { runPostAnalyses } = require('../../services/analysis.service');
const { translateMainContentIfNeeded } = require('../../services/timeline/timelineTranslation.service');
const { runBackgroundSteps } = require('../backgroundTaskRunner');
const {
  withAIAnalysisIntegrityLock,
} = require('../analysis/settings/referenceIntegrity');

const MEDIA_PATH = process.env.MEDIA_PATH;
const { findActiveChatOrThrow } = require('./shared/postContext');

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;

const buildRequestedSetFields = (body, effective) =>
  Object.fromEntries(
    TIMELINE_MUTABLE_FIELDS
      .filter((field) => hasOwn(body, field))
      .map((field) => [field, effective[field]])
  );

exports.update = async (body, jwtPayload, io, { errors, requireContentOrMedia = false } = {}) => {
  const roomId = body.room_id;
  const postId = body._id;

  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;

  const { foundRoom, foundFloor, foundFloorMember } = await authorizeRoomAccess(decodedUserId, decodedUserRole, roomId, { errors });

  const foundChat = await findActiveChatOrThrow(postId, { roomId: foundRoom._id, error: errors?.post });
  ensureChatBelongsToRoom(foundChat, foundRoom, errors?.post?.code || 'INVALID_PARAMS');

  let hasPermission = false;
  if (decodedUserRole === ROLES.ADMINISTRATOR) hasPermission = true;
  else if (foundFloor.user.toString() === decodedUserId && decodedUserRole === ROLES.EDITOR) hasPermission = true;
  else if (foundFloorMember !== null) hasPermission = true;
  else if (foundChat.user && foundChat.user.toString() === decodedUserId) hasPermission = true;
  if (!hasPermission) throw new AppError({ code: errors?.permission?.code || 'INVALID_PERMISSION' });

  // 認可後の現在値に指定項目を重ね、省略した値を保存・検証時に保持する。
  const effectiveBody = mergeTimelinePatch(foundChat, body);
  const {
    content,
    lang,
    room_tags: roomTags,
  } = effectiveBody;
  if (requireContentOrMedia && !content?.trim() &&
      ![effectiveBody.image_name, effectiveBody.video_name, effectiveBody.audio_name].some(Boolean)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
  const targetLangs = resolveMutationTargetLangs({
    requested: body.target_langs,
    floor: foundFloor,
    roomId: foundRoom._id,
    io,
    sourceLang: lang,
  });

  if (hasOwn(body, 'room_tags')) {
    await validateRoomTagsForRoom(roomTags, { floorId: foundFloor._id, roomId: foundRoom._id });
  }

  await validateMediaChanges({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    userId: decodedUserId,
    newItem: effectiveBody,
    oldItem: foundChat,
    exclude: { kind: 'post', postId },
  });

  // 本文が更新対象のときだけスパム語を置換し、省略された現在値は変更しない。
  const contentRequested = hasOwn(body, 'content');
  const replacedContent = contentRequested
    ? (requireContentOrMedia && content === null ? null : await replaceSpams(content || ''))
    : content;
  const desiredPost = { ...effectiveBody, content: replacedContent };
  const translationSourceChanged =
    foundChat.content !== replacedContent || foundChat.lang !== lang;

  if (requireContentOrMedia && TIMELINE_MUTABLE_FIELDS.every((field) =>
    field === 'room_tags'
      ? areRoomTagSetsEqual(foundChat[field], desiredPost[field])
      : (foundChat[field] ?? null) === (desiredPost[field] ?? null))) {
    await foundChat.populate('user', 'username image_name delete_flg');
    return serializeTimeline(foundChat);
  }

  // 現在値で補った項目は検証にだけ使い、DBには要求で指定された項目だけを書き込む。
  const updateFields = {
    ...buildRequestedSetFields(body, desiredPost),
    updated_at: Date.now(),
  };
  const translationEnabled = isGoogleTranslateEnabled();
  if (translationSourceChanged && translationEnabled) {
    updateFields.translations = [];
  }

  const sourceMutation = await persistPostAnalysisSourceMutation({
    baseQuery: {
      _id: postId,
      room: foundRoom._id,
      delete_flg: false,
      ...buildMediaSnapshotMatch(foundChat, body),
      ...(requireContentOrMedia ? {
        ...buildExpectedRevisionCondition(foundChat),
        ...buildMediaStateMatch(foundChat),
        content: foundChat.content ?? null,
      } : {}),
    },
    initialSource: foundChat,
    desiredSource: desiredPost,
    setFields: updateFields,
  }).catch((error) => {
    if (requireContentOrMedia && error.code === 'INVALID_PARAMS') {
      throw new AppError({ code: errors?.conflict?.code || 'CONFLICT' });
    }
    throw error;
  });
  const sourceChanged = sourceMutation.sourceChanged;

  const analysisEnabled = isAIAnalysisExecutionEnabled();

  // 更新後の投稿全体を通知するため、関連データを含めて再取得する。
  const populatedChat = await Chat.findOne({ _id: postId, delete_flg: false })
    .populate('user', 'username image_name delete_flg')
    .populate('supplementaries.user', 'username image_name delete_flg')
    .populate('replies.user', 'username image_name delete_flg')
    .populate('replies.supplementaries.user', 'username image_name delete_flg');
  const result = serializeTimeline(populatedChat);

  await cleanupReplacedMedia({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    oldItem: foundChat,
    newItem: desiredPost,
  });

  await publishSocketEvent('POST_UPDATE', () => io.to(result.room._id).emit('POST_UPDATE', result));

  // 翻訳とAI解析はバックグラウンドで実行する。
  if (translationEnabled || (analysisEnabled && sourceChanged)) {
    runBackgroundSteps(
      'timeline.posts.update',
      {
        translation: async () => {
          if (
            translationEnabled &&
            targetLangs.length > 0 &&
            (replacedContent || '').trim() !== '' &&
            translationSourceChanged
          ) {
            await translateMainContentIfNeeded({
              userId: decodedUserId,
              chatId: result._id,
              content: replacedContent,
              lang,
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

exports.delete = async (body, jwtPayload, io, { errors } = {}) => {
  const roomId = body.room_id;
  const postId = body._id;

  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;

  const { foundRoom, foundFloor, foundFloorMember } = await authorizeRoomAccess(decodedUserId, decodedUserRole, roomId, { errors });

  const foundChat = await findActiveChatOrThrow(postId, { roomId: foundRoom._id, error: errors?.post });
  ensureChatBelongsToRoom(foundChat, foundRoom, errors?.post?.code || 'INVALID_PARAMS');

  // サイト管理者、フロアを作成したフロア編集者、フロアメンバー、投稿者本人のいずれかに許可する。
  let hasPermission = false;
  if (decodedUserRole === ROLES.ADMINISTRATOR) hasPermission = true;
  else if (foundFloor.user.toString() === decodedUserId && decodedUserRole === ROLES.EDITOR) hasPermission = true;
  else if (foundFloorMember !== null) hasPermission = true;
  else if (foundChat.user && foundChat.user.toString() === decodedUserId) hasPermission = true;
  if (!hasPermission) throw new AppError({ code: errors?.permission?.code || 'INVALID_PERMISSION' });

  const updatedChat = await withAIAnalysisIntegrityLock(() =>
    Chat.findOneAndUpdate(
      {
        _id: postId,
        room: foundRoom._id,
        delete_flg: false,
        ...buildMediaStateMatch(foundChat),
      },
      { $set: { delete_flg: true, updated_at: Date.now(), deleted_at: Date.now() } },
      { new: true, runValidators: true }
    )
      .populate('user', 'username image_name delete_flg')
      .populate('supplementaries.user', 'username image_name delete_flg')
      .populate('replies.user', 'username image_name delete_flg')
      .populate('replies.supplementaries.user', 'username image_name delete_flg')
  );

  if (!updatedChat) throw new AppError({ code: errors?.conflict?.code || 'INVALID_PARAMS' });

  const result = serializeTimeline(updatedChat);

  const baseDir = path.join(MEDIA_PATH, foundFloor._id.toString(), foundRoom._id.toString());
  await deleteMediaItem(baseDir, foundChat);

  await publishSocketEvent('POST_DELETE', () => io.to(result.room._id).emit('POST_DELETE', result));

  return result;
};
