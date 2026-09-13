const ROLES = require('../../constants/roles');
const { revokeFloor } = require('../../socket/configurationRevocation');
const AppError = require('../../utils/appError');
const { isGoogleTranslateEnabled } = require('../../config/featureFlags');

const Floor = require('../../models/Floor');

const translationService = require('../translation.service');
const { removeFileBestEffort } = require('../upload/fileCleanup');
const { findActiveUser, findActiveFloor } = require('../_shared/activeResource');
const { isAdminOrCreator } = require('../_shared/floorAccess');
const {
  withAIAnalysisIntegrityLock,
} = require('../analysis/settings/referenceIntegrity');
const {
  provisionFloorResources,
  refreshFloorResourceTranslations,
  rollbackFloorProvisioning,
  targetLanguagesChanged,
} = require('./floorProvisioning.service');

// フロア作成時に、共通タグと単語グループ・単語をフロア用にコピーする。
exports.create = async (body, jwtPayload) => {
  const title = body.title;
  const description = body.description;
  const floorDisplayHidden = body.floor_display_hidden;
  const lang = body.lang;
  const targetLangs = isGoogleTranslateEnabled() ? body.target_langs : [];

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  // サイト管理者またはフロア編集者だけに許可する。
  const allowedRoles = [ROLES.ADMINISTRATOR, ROLES.EDITOR];
  if (!allowedRoles.includes(decodedUserRole)) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PERMISSION' } });

  const titleAndDescriptionTranslations = targetLangs.length
    ? await translationService.translateTitleAndDescription(
        decodedUserId,
        title,
        description,
        lang,
        targetLangs
      )
    : [];

  const newFloor = {
    user: decodedUserId,
    title,
    description,
    lang,
    target_langs: targetLangs,
    translations: titleAndDescriptionTranslations,
    floor_display_hidden: floorDisplayHidden,
  };

  const createdFloor = await Floor.create(newFloor);
  const populatedFloor = await createdFloor.populate('user', 'username image_name');

  try {
    await provisionFloorResources({
      floorId: createdFloor._id,
      userId: decodedUserId,
      targetLangs,
    });
  } catch (error) {
    await rollbackFloorProvisioning({ floorId: createdFloor._id });
    throw error;
  }

  return populatedFloor;
};

exports.update = async (body, jwtPayload) => {
  const floorId = body._id;
  const title = body.title;
  const description = body.description;
  const lang = body.lang;
  const requestedTargetLangs = body.target_langs;
  const imageName = body.image_name;
  const floorDisplayHidden = body.floor_display_hidden;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PERMISSION' } });

  const foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PERMISSION' } });
  const translationEnabled = isGoogleTranslateEnabled();
  const targetLangs = translationEnabled
    ? requestedTargetLangs
    : Array.isArray(foundFloor.target_langs)
      ? foundFloor.target_langs
      : [];

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(decodedUserRole, foundFloor.user.toString(), decodedUserId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const isContentModified = foundFloor.title !== title || foundFloor.description !== description;

  const isLangChanged = foundFloor.lang !== lang;

  const isChangeTargetLangs = targetLanguagesChanged(foundFloor.target_langs, targetLangs);

  let titleAndDescriptionTranslations = [];
  if (translationEnabled && (isContentModified || isChangeTargetLangs || isLangChanged)) {
    titleAndDescriptionTranslations = await translationService.translateTitleAndDescription(
      decodedUserId,
      title,
      description,
      lang,
      targetLangs
    );
  }

  const updateData = {
    title,
    description,
    lang,
    target_langs: targetLangs,
    image_name: imageName,
    floor_display_hidden: floorDisplayHidden,
    updated_at: Date.now(),
  };
  if (translationEnabled && (isContentModified || isChangeTargetLangs || isLangChanged)) {
    updateData.translations = titleAndDescriptionTranslations;
  }

  const updatedFloor = await Floor.findByIdAndUpdate(floorId, updateData, {
    new: true,
    runValidators: true,
  }).populate('user', 'username image_name');

  if (foundFloor.image_name && foundFloor.image_name !== updatedFloor.image_name) {
    await removeFileBestEffort({
      baseDir: process.env.MEDIA_PATH,
      segments: [foundFloor._id],
      fileName: foundFloor.image_name,
      context: { floorId: String(foundFloor._id), kind: 'floor-image' },
    });
  }

  if (translationEnabled && isChangeTargetLangs) {
    await refreshFloorResourceTranslations({ floorId, userId: decodedUserId, targetLangs });
  }

  return updatedFloor;
};

exports.updateFloorDisplayHidden = async (body, jwtPayload) => {
  const floorDisplayHidden = body.floor_display_hidden;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PERMISSION' } });

  // サイト管理者またはフロア編集者だけに許可する。
  const allowedRoles = [ROLES.ADMINISTRATOR, ROLES.EDITOR];
  if (!allowedRoles.includes(decodedUserRole)) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }

  // フロア編集者は自分が作成した未削除のフロアだけを更新できる。
  let query = { user: decodedUserId, delete_flg: false };
  // サイト管理者は未削除の全フロアを更新できる。
  if (decodedUserRole === ROLES.ADMINISTRATOR) {
    query = { delete_flg: false };
  }

  const writeResult = await Floor.updateMany(
    query,
    { floor_display_hidden: floorDisplayHidden },
    { runValidators: true }
  );
  const updatedFloors = {
    matched: writeResult.matchedCount ?? writeResult.n ?? 0,
    modified: writeResult.modifiedCount ?? writeResult.nModified ?? 0,
  };

  return updatedFloors;
};

exports.delete = async (body, jwtPayload, io) => {
  const floorId = body._id;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PERMISSION' } });

  const foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PERMISSION' } });

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(decodedUserRole, foundFloor.user.toString(), decodedUserId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const updateData = {
    updated_at: Date.now(),
    delete_flg: true,
    deleted_at: Date.now(),
  };

  const updatedFloor = await withAIAnalysisIntegrityLock(() =>
    Floor.findByIdAndUpdate(floorId, updateData, { new: true }).populate(
      'user',
      'username image_name'
    )
  );

  if (updatedFloor) await revokeFloor(io, floorId);
  return updatedFloor;
};
