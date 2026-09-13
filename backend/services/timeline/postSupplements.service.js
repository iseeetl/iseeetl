const { publishSocketEvent } = require('../../socket/publication');
const { assertResourceContent, isUnchangedResource } = require('./shared/resourceMutation');
const { SUPPLEMENT_MUTABLE_FIELDS } = require('./shared/partialMutation');
const logger = require('../../utils/logger');
const { deleteMediaItem } = require('../media/fileCleanup');
const { validateMediaChanges } = require('../media/reference');
const { cleanupReplacedMedia } = require('./shared/timelineMediaLifecycle');
const {
  buildMediaStateMatch,
  buildSupplementMutation,
  mergeTimelinePatch,
} = require('./shared/partialMutation');
const { resolveMutationTargetLangs } = require('./shared/targetLanguages');
const { isGoogleTranslateEnabled } = require('../../config/featureFlags');
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
const { translateSupplementIfNeeded } = require('../../services/timeline/timelineTranslation.service');
const { notifySupplementAuthor, notifySupplementPushFilter } = require('./shared/supplementNotifications');
const { runBackgroundTask } = require('../backgroundTaskRunner');

const hasDefinedOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value || {}, key) && value[key] !== undefined;

exports.create = async (body, jwtPayload, io, { errors, requireContentOrMedia = false } = {}) => {
  const postId = body.post_id;
  const content = body.content;

  const decodedUserId = jwtPayload.user_id;

  const context = await resolveSupplementContext({
    body,
    jwtPayload,
    errors,
    notFoundCode: errors?.post?.code || 'NOT_FOUND',
  });
  const { foundUser, foundRoom, foundFloor, chat: foundChat } = context;
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
      { _id: postId, room: foundRoom._id, delete_flg: false },
      { $push: { supplementaries: newSupplement } },
      { new: true, runValidators: true }
    ),
    notFoundCode: errors?.post?.code || 'NOT_FOUND',
  });

  await notifySupplementAuthor({
    authorId: foundChat.user ? foundChat.user.toString() : null,
    excludeUserId: decodedUserId,
    senderName: foundUser.username,
    content: replacedContent,
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    headings: NOTIFICATION_MESSAGES.SUPPLEMENT_POST_AUTHOR,
    logger,
    logPrefix: 'supplement-notify (post author)',
  });

  await notifySupplementPushFilter({
    roomId: foundRoom._id,
    floorId: foundFloor._id,
    senderName: foundUser.username,
    content: replacedContent,
    excludeUserId: decodedUserId,
    headings: NOTIFICATION_MESSAGES.SUPPLEMENT_PUSHFILTER,
    logger,
    logPrefix: 'supplement-notify (pushfilter)',
  });

  await publishSocketEvent('SUPPLEMENT_CREATE', () => io.to(result.room._id).emit('SUPPLEMENT_CREATE', result));

  const createdSupplement = result.supplementaries[result.supplementaries.length - 1];
  if (isGoogleTranslateEnabled()) {
    runBackgroundTask(
      'timeline.postSupplements.create',
      () =>
        translateSupplementIfNeeded({
          chatId: result._id,
          supplementId: createdSupplement._id,
          content: createdSupplement.content,
          lang: createdSupplement.lang,
          targetLangs,
          userId: decodedUserId,
          io,
        }),
      { context: { postId: String(result._id), supplementId: String(createdSupplement._id) } }
    );
  }

  return result;
};

exports.update = async (body, jwtPayload, io, { errors, requireContentOrMedia = false } = {}) => {
  const postId = body.post_id;
  const supplementId = body._id;

  const decodedUserId = jwtPayload.user_id;

  const context = await resolveSupplementContext({
    body,
    jwtPayload,
    errors,
    notFoundCode: errors?.post?.code || 'NOT_FOUND',
  });
  const { foundRoom, foundFloor } = context;
  const supplement = resolveEditableSupplement({
    context,
    supplementId,
    code: errors?.post?.code || 'NOT_FOUND',
    excludeDeleted: true,
  });
  const effectiveBody = mergeTimelinePatch(supplement, body);
  const contentProvided = hasDefinedOwn(body, 'content');
  const content = effectiveBody.content;
  if (requireContentOrMedia) assertResourceContent(effectiveBody);
  const targetLangs = resolveMutationTargetLangs({
    requested: body.target_langs,
    floor: foundFloor,
    roomId: foundRoom._id,
    io,
    sourceLang: effectiveBody.lang,
  });

  await validateMediaChanges({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    userId: decodedUserId,
    newItem: effectiveBody,
    oldItem: supplement,
    exclude: { kind: 'postSupplement', postId, supplementId },
  });

  const replacedContent = contentProvided ? (requireContentOrMedia && content === null ? null : await replaceSpams(content || '')) : content;
  const translationEnabled = isGoogleTranslateEnabled();

  const updateSupplement = buildUpdatedSupplementPayloadFromBody({
    body: effectiveBody,
    supplement,
    replacedContent,
  });
  const translationSourceChanged =
    supplement.content !== updateSupplement.content || supplement.lang !== updateSupplement.lang;
  if (requireContentOrMedia && isUnchangedResource(supplement, updateSupplement, SUPPLEMENT_MUTABLE_FIELDS)) {
    return persistSupplementMutation({ query: Promise.resolve(context.chat), notFoundCode: 'NOT_FOUND' });
  }
  const { set, snapshotMatch } = buildSupplementMutation({
    current: supplement,
    patch: body,
    updated: updateSupplement,
    targetPath: 'supplementaries.$[supplement]',
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
        supplementaries: {
          $elemMatch: { _id: supplementId, delete_flg: false, ...snapshotMatch, ...(requireContentOrMedia ? { ...buildMediaStateMatch(supplement), content: supplement.content ?? null } : {}) },
        },
      },
      { $set: set },
      {
        arrayFilters: [{ 'supplement._id': supplementId, 'supplement.delete_flg': false }],
        new: true,
        runValidators: true,
      }
    ),
    notFoundCode: errors?.conflict?.code || 'NOT_FOUND',
  });

  await cleanupReplacedMedia({
    floorId: foundFloor._id,
    roomId: foundRoom._id,
    oldItem: supplement,
    newItem: effectiveBody,
  });

  await publishSocketEvent('SUPPLEMENT_UPDATE', () => io.to(result.room._id).emit('SUPPLEMENT_UPDATE', result));

  if (translationEnabled) {
    runBackgroundTask(
      'timeline.postSupplements.update',
      async () => {
        if (shouldTranslateSupplementUpdate({ currentSupplement: supplement, updatedSupplement: updateSupplement, targetLangs })) {
          await translateSupplementIfNeeded({
            chatId: result._id,
            supplementId: updateSupplement._id,
            content: updateSupplement.content,
            lang: updateSupplement.lang,
            targetLangs,
            userId: decodedUserId,
            io,
          });
        }
      },
      { context: { postId: String(result._id), supplementId: String(updateSupplement._id) } }
    );
  }

  return result;
};

exports.delete = async (body, jwtPayload, io, { errors } = {}) => {
  const postId = body.post_id;
  const supplementId = body._id;

  const context = await resolveSupplementContext({
    body,
    jwtPayload,
    errors,
    notFoundCode: errors?.post?.code || 'NOT_FOUND',
  });
  const { foundRoom, foundFloor } = context;
  const supplement = resolveEditableSupplement({
    context,
    supplementId,
    code: errors?.post?.code || 'NOT_FOUND',
    excludeDeleted: true,
  });

  const now = Date.now();
  const mediaSnapshot = buildMediaStateMatch(supplement);
  const result = await persistSupplementMutation({
    query: Chat.findOneAndUpdate(
      {
        _id: postId,
        room: foundRoom._id,
        delete_flg: false,
        supplementaries: {
          $elemMatch: { _id: supplementId, delete_flg: false, ...mediaSnapshot },
        },
      },
      {
        $set: {
          'supplementaries.$[supplement].updated_at': now,
          'supplementaries.$[supplement].delete_flg': true,
          'supplementaries.$[supplement].deleted_at': now,
        },
      },
      {
        arrayFilters: [{
          'supplement._id': supplementId,
          'supplement.delete_flg': false,
          ...Object.fromEntries(
            Object.entries(mediaSnapshot).map(([field, value]) => [`supplement.${field}`, value])
          ),
        }],
        new: true,
        runValidators: true,
      }
    ),
    notFoundCode: errors?.conflict?.code || 'NOT_FOUND',
  });

  const baseDir = resolveSupplementMediaDir({ floorId: foundFloor._id, roomId: foundRoom._id });
  await deleteMediaItem(baseDir, supplement);

  await publishSocketEvent('SUPPLEMENT_DELETE', () => io.to(result.room._id).emit('SUPPLEMENT_DELETE', result));

  return result;
};
