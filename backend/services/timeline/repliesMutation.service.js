const { publishSocketEvent } = require('../../socket/publication');
const AppError = require('../../utils/appError');
const { resolveInsideBaseDir } = require('../../utils/safePath');
const {
  isGoogleTranslateEnabled,
} = require('../../config/featureFlags');
const {
  isAIAnalysisExecutionEnabled,
} = require('../analysis/settings/capability');
const { authorizeRoomAccess } = require('../../services/room/roomAccess.service');
const serializeTimeline = require('./shared/timelineSerializer');
const MEDIA_PATH = process.env.MEDIA_PATH;

const Chat = require('../../models/Chat');

const { replaceSpams } = require('../../services/spam.service');
const { deleteMediaItem } = require('../media/fileCleanup');
const { validateMediaChanges } = require('../media/reference');
const { cleanupReplacedMedia } = require('./shared/timelineMediaLifecycle');
const { translateReplyIfNeeded } = require('../../services/timeline/timelineTranslation.service');
const { attachReplyNotificationEvent } = require('./shared/replyPostProcess');
const { validateRoomTagsForRoom } = require('./shared/roomTagValidation');
const { persistReplyAnalysisSourceMutation } = require('./shared/analysisSourceMutation');
const {
  TIMELINE_MUTABLE_FIELDS,
  buildMediaSnapshotMatch,
  buildMediaStateMatch,
  mergeTimelinePatch,
} = require('./shared/partialMutation');
const { resolveMutationTargetLangs } = require('./shared/targetLanguages');
const { assertResourceContent, isUnchangedResource } = require('./shared/resourceMutation');

const { runReplyAnalyses } = require('../../services/analysis.service');
const { runBackgroundSteps } = require('../backgroundTaskRunner');
const {
  withAIAnalysisIntegrityLock,
} = require('../analysis/settings/referenceIntegrity');

const {
  buildReplyNotFoundError,
  ensureReplyContext,
  findChatByPostId,
  findReplyOrThrow,
  canEditReply,
  populateReplies,
} = require('./shared/replyContext');

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const buildRequestedSetFields = (body, effective) =>
  Object.fromEntries(
    TIMELINE_MUTABLE_FIELDS
      .filter((field) => hasOwn(body, field))
      .map((field) => [field, effective[field]])
  );

exports.update = async (body, jwtPayload, io, { errors, requireContentOrMedia = false } = {}) => {
  const roomId = body.room_id;
  const postId = body.post_id;
  const replyId = body._id;
  const notifyAll = body.notify_all === true;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const { foundRoom, foundFloor, foundFloorMember } = await authorizeRoomAccess(decodedUserId, decodedUserRole, roomId, { errors });

  const foundChat = await findChatByPostId(postId, { roomId: foundRoom._id, code: errors?.post?.code });
  ensureReplyContext(foundChat, foundRoom, postId);
  const { reply: foundReply } = findReplyOrThrow(foundChat, replyId, errors?.reply?.code);

  if (!canEditReply({ role: decodedUserRole, floor: foundFloor, floorMember: foundFloorMember, reply: foundReply, userId: decodedUserId })) {
    throw new AppError({ code: errors?.permission?.code || 'INVALID_PERMISSION' });
  }

  const effectiveReply = mergeTimelinePatch(foundReply, body);
  if (requireContentOrMedia) assertResourceContent(effectiveReply);
  if (hasOwn(body, 'room_tags')) {
    await validateRoomTagsForRoom(effectiveReply.room_tags, { floorId: foundFloor._id, roomId: foundRoom._id });
  }
  const targetLangs = resolveMutationTargetLangs({
    requested: body.target_langs,
    floor: foundFloor,
    roomId: foundRoom._id,
    io,
    sourceLang: effectiveReply.lang,
  });

  await validateMediaChanges({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    userId: decodedUserId,
    newItem: effectiveReply,
    oldItem: foundReply,
    exclude: { kind: 'reply', postId: foundChat._id, replyId },
  });

  const replacedContent = requireContentOrMedia
    ? (hasOwn(body, 'content') && effectiveReply.content !== null
      ? await replaceSpams(effectiveReply.content)
      : effectiveReply.content)
    : await replaceSpams(effectiveReply.content || '');

  const updateReply = {
    ...effectiveReply,
    _id: foundReply._id,
    content: replacedContent,
    updated_at: Date.now(),
  };
  const translationSourceChanged =
    foundReply.content !== updateReply.content || foundReply.lang !== updateReply.lang;
  const unchanged = requireContentOrMedia && isUnchangedResource(foundReply, updateReply);
  if (unchanged && !notifyAll) return serializeTimeline(await populateReplies(foundChat));
  const translationEnabled = isGoogleTranslateEnabled();
  if (translationSourceChanged && translationEnabled) {
    updateReply.translations = [];
  }

  const replySetFields = {
    ...buildRequestedSetFields(body, updateReply),
    updated_at: updateReply.updated_at,
  };
  if (updateReply.translations !== effectiveReply.translations) {
    replySetFields.translations = updateReply.translations;
  }
  const sourceMutation = unchanged ? { document: foundChat, sourceChanged: false } : await persistReplyAnalysisSourceMutation({
    baseQuery: { _id: foundChat._id, room: foundRoom._id, delete_flg: false },
    replyId,
    initialSource: foundReply,
    desiredSource: updateReply,
    setFields: replySetFields,
    replyMatch: {
      ...buildMediaSnapshotMatch(foundReply, body),
      ...(requireContentOrMedia ? { ...buildMediaStateMatch(foundReply), content: foundReply.content ?? null, lang: foundReply.lang } : {}),
    },
  }).catch((error) => {
    if (requireContentOrMedia && error.code === 'INVALID_PARAMS') throw new AppError({ code: 'CONFLICT' });
    throw error;
  });
  const sourceChanged = sourceMutation.sourceChanged;
  const populatedChat = await populateReplies(sourceMutation.document);
  if (!populatedChat) throw buildReplyNotFoundError();
  const postForEmit = serializeTimeline(populatedChat);

  const analysisEnabled = isAIAnalysisExecutionEnabled();
  await cleanupReplacedMedia({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    oldItem: foundReply,
    newItem: updateReply,
  });

  await publishSocketEvent('REPLY_UPDATE', () => {
    // 通知専用の情報はDBに保存せず、送信するデータだけに付ける。
    // スキーマにない項目も送信できるよう、Mongooseのドキュメントを通常のオブジェクトに変換する。
    const emitData = postForEmit ? JSON.parse(JSON.stringify(postForEmit)) : postForEmit;
    if (emitData && Array.isArray(emitData.replies)) {
      const target = emitData.replies.find((r) => String(r?._id) === String(replyId));
      attachReplyNotificationEvent(target, notifyAll);
    }

    {
      const roomIdSafe =
        typeof postForEmit.room === 'object' && postForEmit.room?._id
          ? postForEmit.room._id.toString()
          : postForEmit.room.toString();
      return io.to(roomIdSafe).emit('REPLY_UPDATE', emitData);
    }
  });

  // 翻訳と再解析はバックグラウンドで実行する。
  if (translationEnabled || (analysisEnabled && sourceChanged)) {
    runBackgroundSteps(
      'timeline.replies.update',
      {
        translation: async () => {
          if (
            translationEnabled &&
            targetLangs.length > 0 &&
            updateReply.content &&
            updateReply.content.trim() !== '' &&
            translationSourceChanged
          ) {
            await translateReplyIfNeeded({
              chatId: postForEmit._id,
              reply: { _id: updateReply._id, content: updateReply.content, lang: updateReply.lang },
              targetLangs,
              io,
              userId: decodedUserId,
            });
          }
        },
        analysis: async ({ signal }) => {
          if (analysisEnabled && sourceChanged) {
            await runReplyAnalyses({
              chatId: postForEmit._id,
              replyId,
              targetLangs,
              io,
              mediaPath: MEDIA_PATH,
              signal,
            });
          }
        },
      },
      { context: { postId: String(postForEmit._id), replyId: String(replyId) } }
    );
  }

  return postForEmit;
};

exports.delete = async (body, jwtPayload, io, { errors } = {}) => {
  const roomId = body.room_id;
  const postId = body.post_id;
  const replyId = body._id;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const { foundRoom, foundFloor, foundFloorMember } = await authorizeRoomAccess(decodedUserId, decodedUserRole, roomId, { errors });

  const foundChat = await findChatByPostId(postId, { roomId: foundRoom._id, code: errors?.post?.code });
  ensureReplyContext(foundChat, foundRoom, postId);
  const { reply } = findReplyOrThrow(foundChat, replyId, errors?.reply?.code);

  if (!canEditReply({ role: decodedUserRole, floor: foundFloor, floorMember: foundFloorMember, reply, userId: decodedUserId })) {
    throw new AppError({ code: errors?.permission?.code || 'INVALID_PERMISSION' });
  }

  const now = Date.now();
  const mediaSnapshot = buildMediaStateMatch(reply);
  const populatedChat = await withAIAnalysisIntegrityLock(() =>
    populateReplies(
      Chat.findOneAndUpdate(
        {
          _id: foundChat._id,
          room: foundRoom._id,
          delete_flg: false,
          replies: { $elemMatch: { _id: replyId, delete_flg: false, ...mediaSnapshot } },
        },
        {
          $set: {
            'replies.$[reply].updated_at': now,
            'replies.$[reply].delete_flg': true,
            'replies.$[reply].deleted_at': now,
          },
        },
        {
          arrayFilters: [{
            'reply._id': replyId,
            'reply.delete_flg': false,
            ...Object.fromEntries(
              Object.entries(mediaSnapshot).map(([field, value]) => [`reply.${field}`, value])
            ),
          }],
          new: true,
          runValidators: true,
        }
      )
    )
  );
  if (!populatedChat) throw new AppError({ code: errors?.conflict?.code || 'INVALID_PARAMS' });

  const result = serializeTimeline(populatedChat);

  const baseDir = resolveInsideBaseDir(process.env.MEDIA_PATH, [String(foundFloor._id), String(foundRoom._id)]);
  await deleteMediaItem(baseDir, reply);

  await publishSocketEvent('REPLY_DELETE', () => io.to(result.room._id).emit('REPLY_DELETE', result));

  return result;
};
