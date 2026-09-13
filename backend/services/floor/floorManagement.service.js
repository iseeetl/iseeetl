const { revokeFloor } = require('../../socket/configurationRevocation');
const AppError = require('../../utils/appError');
const { isGoogleTranslateEnabled } = require('../../config/featureFlags');
const { escapeRegExp } = require('../../utils/regex');
const { buildPaginationOptions, withOptionalDeleteFlag } = require('../_shared/paginationHelpers');
const { buildDeleteFlagUpdate } = require('../_shared/updateHelpers');
const { requireAdminUser } = require('../_shared/memberHelpers');

const Floor = require('../../models/Floor');

const translationService = require('../translation.service');
const { removeFileBestEffort } = require('../upload/fileCleanup');
const { refreshFloorResourceTranslations, targetLanguagesChanged } = require('./floorProvisioning.service');
const {
  withAIAnalysisIntegrityLock,
} = require('../analysis/settings/referenceIntegrity');

exports.managementPaginate = async (body, jwtPayload) => {
  const { page, search } = body;

  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  let query = {};
  if (search) {
    const pattern = escapeRegExp(search);
    query.$or = [{ title: { $regex: pattern, $options: 'i' } }, { description: { $regex: pattern, $options: 'i' } }];
  }
  query = withOptionalDeleteFlag(query, body.delete_flg);

  const options = buildPaginationOptions({
    page,
    sort: { created_at: 'desc' },
    populate: { path: 'user', select: 'username' },
    lean: true,
  });

  return Floor.paginate(query, options);
};

// 管理者による確認では、論理削除済みのフロアも取得対象に含める。
exports.managementGetDetail = async (body, jwtPayload) => {
  await requireAdminUser(jwtPayload.user_id);

  const floor = await Floor.findById(body._id).populate('user', 'username image_name');
  if (!floor) throw new AppError({ code: 'NOT_FOUND' });
  return floor;
};

// 管理者が編集する場合も、delete_flgは期待する現在の状態との一致確認に使う。
// 削除状態の変更は専用APIで行う。
exports.managementUpdate = async (body, jwtPayload) => {
  const id = body._id;
  const title = body.title;
  const description = body.description;
  const imageName = body.image_name;
  const floorDisplayHidden = body.floor_display_hidden;
  const expectedDeleteFlg = body.delete_flg;
  const lang = body.lang;
  const requestedTargetLangs = body.target_langs;

  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  const foundFloor = await Floor.findOne({ _id: id });
  if (!foundFloor) throw new AppError({ code: 'NOT_FOUND' });
  if (foundFloor.delete_flg !== expectedDeleteFlg) {
    throw new AppError({ code: 'CONFLICT' });
  }
  const translationEnabled = isGoogleTranslateEnabled();
  const targetLangs = translationEnabled
    ? requestedTargetLangs
    : Array.isArray(foundFloor.target_langs)
      ? foundFloor.target_langs
      : [];

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

  const updateFloor = {
    title: title,
    description: description,
    lang: lang,
    target_langs: targetLangs,
    image_name: imageName,
    floor_display_hidden: floorDisplayHidden,
    updated_at: Date.now(),
  };
  if (translationEnabled && (isContentModified || isChangeTargetLangs || isLangChanged)) {
    updateFloor.translations = titleAndDescriptionTranslations;
  }

  const updatedFloor = await Floor.findOneAndUpdate(
    { _id: id, delete_flg: expectedDeleteFlg },
    updateFloor,
    {
      new: true,
      runValidators: true,
    }
  ).populate('user', 'username image_name');
  if (!updatedFloor) {
    const currentFloor = await Floor.findById(id);
    throw new AppError({ code: currentFloor ? 'CONFLICT' : 'NOT_FOUND' });
  }

  if (foundFloor.image_name && foundFloor.image_name !== updatedFloor.image_name) {
    await removeFileBestEffort({
      baseDir: process.env.MEDIA_PATH,
      segments: [foundFloor._id],
      fileName: foundFloor.image_name,
      context: { floorId: String(foundFloor._id), kind: 'floor-image' },
    });
  }

  if (translationEnabled && isChangeTargetLangs) {
    await refreshFloorResourceTranslations({ floorId: id, userId: decodedUserId, targetLangs });
  }

  return updatedFloor;
};

exports.managementSetDeleteState = async (body, jwtPayload, io) => {
  const id = body._id;
  const deleteFlg = body.delete_flg;

  await requireAdminUser(jwtPayload.user_id);
  let changed = false;
  const result = await withAIAnalysisIntegrityLock(async () => {
    const foundFloor = await Floor.findById(id);
    if (!foundFloor) throw new AppError({ code: 'NOT_FOUND' });
    if (foundFloor.delete_flg === deleteFlg) {
      return foundFloor.populate('user', 'username image_name');
    }
    const updatedFloor = await Floor.findOneAndUpdate(
      { _id: id, delete_flg: !deleteFlg },
      {
        ...buildDeleteFlagUpdate({ deleteFlg, alwaysSetDeletedAt: true }),
        updated_at: Date.now(),
      },
      { new: true, runValidators: true }
    ).populate('user', 'username image_name');
    if (!updatedFloor) {
      const currentFloor = await Floor.findById(id);
      throw new AppError({ code: currentFloor ? 'CONFLICT' : 'NOT_FOUND' });
    }
    changed = true;
    return updatedFloor;
  });
  if (changed && deleteFlg) await revokeFloor(io, id);
  return result;
};
