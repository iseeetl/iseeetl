const { publishSocketEvent } = require('../../socket/publication');
const { assertResourceContent, isUnchangedResource } = require('./shared/resourceMutation');
const { SUPPLEMENT_MUTABLE_FIELDS } = require('./shared/partialMutation');
const { deleteMediaItem } = require('../media/fileCleanup');
const { validateMediaChanges } = require('../media/reference');
const { cleanupReplacedMedia } = require('./shared/timelineMediaLifecycle');
const { isGoogleTranslateEnabled } = require('../../config/featureFlags');
const logger = require('../../utils/logger');
const NOTIFICATION_MESSAGES = require('../../constants/notificationMessages');
const {
  buildSupplementPayloadFromBody,
  buildUpdatedSupplementPayloadFromBody,
} = require('./shared/supplementCommon');
const {
  persistSupplementMutation,
  resolveEditableSupplement,
  resolveSupplementContext,
  resolveSupplementMediaDir,
  shouldTranslateSupplementUpdate,
} = require('./shared/supplementMutationFlow');

const Chat = require('../../models/Chat');

const { replaceSpams } = require('../../services/spam.service');
const { translateReplySupplementIfNeeded } = require('../../services/timeline/timelineTranslation.service');
const { notifySupplementAuthor, notifySupplementPushFilter } = require('./shared/supplementNotifications');
const { runBackgroundTask } = require('../backgroundTaskRunner');
const {
  buildMediaStateMatch,
  buildSupplementMutation,
  mergeTimelinePatch,
} = require('./shared/partialMutation');
const { resolveMutationTargetLangs } = require('./shared/targetLanguages');

const hasDefinedOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value || {}, key) && value[key] !== undefined;

exports.createReplySupplement = async (body, jwtPayload, io, { errors, requireContentOrMedia = false } = {}) => {
  const postId = body.post_id;
  const replyId = body.reply_id;
  const content = body.content;
  const decodedUserId = jwtPayload.user_id;

  const context = await resolveSupplementContext({
    body,
    jwtPayload,
    errors,
    includeReply: true,
    notFoundCode: errors?.post?.code || 'INVALID_PARAMS',
  });
  const { foundUser, foundRoom, foundFloor, reply } = context;
  const targetLangs = resolveMutationTargetLangs({
    requested: body.target_langs,
    floor: foundFloor,
    roomId: foundRoom._id,
    io,
    sourceLang: body.lang,
  });

  await validateMediaChanges({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    userId: decodedUserId,
    newItem: body,
  });

  const replacedContent = await replaceSpams(content || '');

  const newSupplement = buildSupplementPayloadFromBody({
    body,
    userId: decodedUserId,
    replacedContent: requireContentOrMedia && content === null ? null : replacedContent,
  });

  const result = await persistSupplementMutation({
    query: Chat.findOneAndUpdate(
      {
        _id: postId,
        room: foundRoom._id,
        delete_flg: false,
        replies: { $elemMatch: { _id: replyId, delete_flg: false } },
      },
      {
        $push: {
          'replies.$[reply].supplementaries': newSupplement,
        },
      },
      {
        arrayFilters: [{ 'reply._id': replyId, 'reply.delete_flg': false }],
        new: true,
        runValidators: true,
      }
    ),
    notFoundCode: errors?.post?.code || 'INVALID_PARAMS',
  });

  await notifySupplementAuthor({
    authorId: reply.user ? reply.user.toString() : null,
    excludeUserId: decodedUserId,
    senderName: foundUser.username,
    content: replacedContent,
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    headings: NOTIFICATION_MESSAGES.SUPPLEMENT_REPLY_AUTHOR,
    userQuery: { reply_push_enabled: true },
    logger,
    logPrefix: 'reply-supplement notify (reply author)',
  });

  await notifySupplementPushFilter({
    roomId: foundRoom._id,
    floorId: foundFloor._id,
    senderName: foundUser.username,
    content: replacedContent,
    excludeUserId: decodedUserId,
    headings: NOTIFICATION_MESSAGES.SUPPLEMENT_PUSHFILTER,
    logger,
    logPrefix: 'reply-supplement notify (pushfilter)',
  });

  const targetReply = result.replies.find((r) => r._id.toString() === replyId);
  const createdSupplement = targetReply.supplementaries[targetReply.supplementaries.length - 1];

  await publishSocketEvent('REPLY_SUPPLEMENT_CREATE', () => io.to(result.room._id).emit('REPLY_SUPPLEMENT_CREATE', result, createdSupplement));

  // 翻訳はバックグラウンドで実行し、失敗しても付加情報の保存結果に影響させない。
  if (isGoogleTranslateEnabled()) {
    runBackgroundTask('timeline.replySupplements.create', () =>
      translateReplySupplementIfNeeded({
        chatId: result._id,
        replyId: replyId,
        supplementId: createdSupplement._id,
        content: createdSupplement.content,
        lang: createdSupplement.lang,
        targetLangs: targetLangs,
        userId: decodedUserId,
        io,
      }), {
        context: { postId: String(result._id), replyId: String(replyId), supplementId: String(createdSupplement._id) },
        defer: false,
      });
  }

  return result;
};

exports.updateReplySupplement = async (body, jwtPayload, io, { errors, requireContentOrMedia = false } = {}) => {
  const postId = body.post_id;
  const replyId = body.reply_id;
  const id = body._id;
  const decodedUserId = jwtPayload.user_id;

  const context = await resolveSupplementContext({
    body,
    jwtPayload,
    errors,
    includeReply: true,
    notFoundCode: errors?.post?.code || 'INVALID_PARAMS',
  });
  const { foundRoom, foundFloor } = context;
  const supplement = resolveEditableSupplement({
    context,
    supplementId: id,
    code: errors?.post?.code || 'INVALID_PARAMS',
  });
  const effectiveSupplement = mergeTimelinePatch(supplement, body);
  if (requireContentOrMedia) assertResourceContent(effectiveSupplement);
  const contentProvided = hasDefinedOwn(body, 'content');
  const targetLangs = resolveMutationTargetLangs({
    requested: body.target_langs,
    floor: foundFloor,
    roomId: foundRoom._id,
    io,
    sourceLang: effectiveSupplement.lang,
  });

  await validateMediaChanges({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    userId: decodedUserId,
    newItem: effectiveSupplement,
    oldItem: supplement,
    exclude: {
      kind: 'replySupplement',
      postId,
      replyId,
      supplementId: id,
    },
  });

  const replacedContent = contentProvided
    ? (requireContentOrMedia && effectiveSupplement.content === null ? null : await replaceSpams(effectiveSupplement.content || ''))
    : effectiveSupplement.content;
  const translationEnabled = isGoogleTranslateEnabled();

  const updateSupp = buildUpdatedSupplementPayloadFromBody({
    body: effectiveSupplement,
    supplement,
    replacedContent,
  });
  const translationSourceChanged =
    supplement.content !== updateSupp.content || supplement.lang !== updateSupp.lang;
  if (requireContentOrMedia && isUnchangedResource(supplement, updateSupp, SUPPLEMENT_MUTABLE_FIELDS)) {
    return persistSupplementMutation({ query: Promise.resolve(context.chat), notFoundCode: 'NOT_FOUND' });
  }
  const { set, snapshotMatch } = buildSupplementMutation({
    current: supplement,
    patch: body,
    updated: updateSupp,
    targetPath: 'replies.$[reply].supplementaries.$[supplement]',
    derivedFields:
      translationEnabled && translationSourceChanged
        ? ['translations']
        : [],
  });

  const result = await persistSupplementMutation({
    query: Chat.findOneAndUpdate(
      {
        _id: postId,
        room: foundRoom._id,
        delete_flg: false,
        replies: {
          $elemMatch: {
            _id: replyId,
            delete_flg: false,
            supplementaries: {
              $elemMatch: { _id: id, delete_flg: false, ...snapshotMatch, ...(requireContentOrMedia ? { ...buildMediaStateMatch(supplement), content: supplement.content ?? null } : {}) },
            },
          },
        },
      },
      {
        $set: set,
      },
      {
        arrayFilters: [
          { 'reply._id': replyId, 'reply.delete_flg': false },
          { 'supplement._id': id, 'supplement.delete_flg': false },
        ],
        new: true,
        runValidators: true,
      }
    ),
    notFoundCode: errors?.conflict?.code || 'INVALID_PARAMS',
  });

  await cleanupReplacedMedia({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    oldItem: supplement,
    newItem: updateSupp,
  });

  await publishSocketEvent('REPLY_SUPPLEMENT_UPDATE', () => io.to(result.room._id).emit('REPLY_SUPPLEMENT_UPDATE', result));

  // 翻訳はバックグラウンドで実行し、失敗しても付加情報の保存結果に影響させない。
  if (
    translationEnabled &&
    shouldTranslateSupplementUpdate({ currentSupplement: supplement, updatedSupplement: updateSupp, targetLangs })
  ) {
    runBackgroundTask('timeline.replySupplements.update', () =>
      translateReplySupplementIfNeeded({
        chatId: result._id,
        replyId: replyId,
        supplementId: updateSupp._id,
        content: updateSupp.content,
        lang: updateSupp.lang,
        targetLangs: targetLangs,
        userId: decodedUserId,
        io,
      }), {
        context: { postId: String(result._id), replyId: String(replyId), supplementId: String(updateSupp._id) },
        defer: false,
      });
  }

  return result;
};

exports.deleteReplySupplement = async (body, jwtPayload, io, { errors } = {}) => {
  const postId = body.post_id;
  const replyId = body.reply_id;
  const id = body._id;

  const context = await resolveSupplementContext({
    body,
    jwtPayload,
    errors,
    includeReply: true,
    notFoundCode: errors?.post?.code || 'INVALID_PARAMS',
  });
  const { foundRoom, foundFloor } = context;
  const supplement = resolveEditableSupplement({
    context,
    supplementId: id,
    code: errors?.post?.code || 'INVALID_PARAMS',
  });

  const now = Date.now();
  const mediaSnapshot = buildMediaStateMatch(supplement);
  const result = await persistSupplementMutation({
    query: Chat.findOneAndUpdate(
      {
        _id: postId,
        room: foundRoom._id,
        delete_flg: false,
        replies: {
          $elemMatch: {
            _id: replyId,
            delete_flg: false,
            supplementaries: {
              $elemMatch: { _id: id, delete_flg: false, ...mediaSnapshot },
            },
          },
        },
      },
      {
        $set: {
          'replies.$[reply].supplementaries.$[supplement].updated_at': now,
          'replies.$[reply].supplementaries.$[supplement].delete_flg': true,
          'replies.$[reply].supplementaries.$[supplement].deleted_at': now,
        },
      },
      {
        arrayFilters: [
          { 'reply._id': replyId, 'reply.delete_flg': false },
          {
            'supplement._id': id,
            'supplement.delete_flg': false,
            ...Object.fromEntries(
              Object.entries(mediaSnapshot).map(([field, value]) => [`supplement.${field}`, value])
            ),
          },
        ],
        new: true,
        runValidators: true,
      }
    ),
    notFoundCode: errors?.conflict?.code || 'INVALID_PARAMS',
  });

  const baseDir = resolveSupplementMediaDir({ floorId: foundFloor._id, roomId: foundRoom._id });
  await deleteMediaItem(baseDir, supplement);

  await publishSocketEvent('REPLY_SUPPLEMENT_DELETE', () => io.to(result.room._id).emit('REPLY_SUPPLEMENT_DELETE', result));

  return result;
};
