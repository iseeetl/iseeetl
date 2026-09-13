const AppError = require('../utils/appError');
const FloorMember = require('../models/FloorMember');

const { authorizeRoomAccess } = require('../services/room/roomAccess.service');
const { discardTimelineMedia } = require('./media/discard.service');
const { findActiveUser, findActiveFloor, findRoomWithFloor } = require('./_shared/activeResource');
const { hasFloorAccess, isAdminOrCreator } = require('./_shared/floorAccess');
const { saveSanitizedImage } = require('./upload/imageStorage');
const { convertAudioToMp3 } = require('./upload/audioProcessor');
const { assertStoredFile, removeStoredFiles } = require('./upload/fileOperations');
const { createVideoThumbnail, resolveVideoThumbnailTarget } = require('./upload/videoProcessor');

const PROFILE_PATH = process.env.PROFILE_PATH;
const MEDIA_PATH = process.env.MEDIA_PATH;

// プロフィール画像は内容検証と再エンコードを終えてから公開領域へ保存する。
exports.uploadProfileImage = async (files, jwtPayload) => {
  const file = (files && files.image_file && files.image_file[0]) || null;
  const userId = jwtPayload && jwtPayload.user_id;
  const saved = await saveSanitizedImage({
    file,
    baseDir: PROFILE_PATH,
    segments: [userId],
    userId,
  });
  return { image_name: saved.filename };
};

// フロアの有効性と操作権限を確認してから、画像の内容検証・再エンコード・保存を行う。
exports.uploadFloorImage = async (body, files, jwtPayload) => {
  const floorId = body._id;
  const file = (files && files.image_file && files.image_file[0]) || null;
  const userId = jwtPayload && jwtPayload.user_id;
  const userRole = jwtPayload && jwtPayload.user_role;

  await findActiveUser(userId, { error: { code: 'INVALID_PERMISSION' } });
  const floor = await findActiveFloor(floorId, { error: { code: 'INVALID_PARAMS' } });
  if (!isAdminOrCreator(userRole, floor.user, userId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const saved = await saveSanitizedImage({
    file,
    baseDir: MEDIA_PATH,
    segments: [floorId],
    userId,
  });
  return { image_name: saved.filename };
};

// フロアとルームの所属関係および操作権限を確認してから、画像の内容検証・再エンコード・保存を行う。
exports.uploadRoomImage = async (body, files, jwtPayload) => {
  const floorId = body.floor_id;
  const roomId = body._id;
  const file = (files && files.image_file && files.image_file[0]) || null;
  const userId = jwtPayload && jwtPayload.user_id;
  const userRole = jwtPayload && jwtPayload.user_role;

  await findActiveUser(userId, { error: { code: 'INVALID_PERMISSION' } });
  const { floor } = await findRoomWithFloor(roomId, {
    roomError: { code: 'INVALID_PARAMS' },
    floorError: { code: 'INVALID_PARAMS' },
  });
  if (String(floor._id) !== String(floorId)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }

  const floorMember = await FloorMember.findOne({ floor: floor._id, user: userId }).lean();
  if (!hasFloorAccess({ role: userRole, floor, uid: userId, floorMember })) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const saved = await saveSanitizedImage({
    file,
    baseDir: MEDIA_PATH,
    segments: [floorId, roomId],
    userId,
  });
  return { image_name: saved.filename };
};

// ルームへのアクセス権を確認してから画像を検証・再エンコードし、サムネイルも生成する。
exports.uploadTimelineImage = async (body, files, jwtPayload) => {
  const userId = jwtPayload.user_id;
  const userRole = jwtPayload.user_role;
  const roomId = body.room_id;
  const file = (files && files.image_file && files.image_file[0]) || null;

  await authorizeRoomAccess(userId, userRole, roomId);
  const saved = await saveSanitizedImage({
    file,
    baseDir: MEDIA_PATH,
    segments: [body.floor_id, roomId],
    userId,
    createThumbnail: true,
  });
  return {
    image_name: saved.filename,
    image_thumbnail_name: saved.thumbnailFilename,
  };
};

// 認可後に動画のサムネイルを生成する。認可・生成中の失敗時は、保存済みの動画・字幕・サムネイルの削除処理を行う。
exports.uploadTimelineVideo = async (body, files, jwtPayload) => {
  const userId = jwtPayload.user_id;
  const userRole = jwtPayload.user_role;
  const roomId = body.room_id;

  const videoFile = (files && files.video_file && files.video_file[0]) || null;
  const subtitleFile = (files && files.video_subtitle_file && files.video_subtitle_file[0]) || null;

  const sourceFile = videoFile || subtitleFile;
  assertStoredFile(sourceFile);
  if (subtitleFile) assertStoredFile(subtitleFile);

  const video_name = (videoFile && videoFile.filename) || null;
  const thumbnailTarget = videoFile ? resolveVideoThumbnailTarget(videoFile) : null;

  try {
    await authorizeRoomAccess(userId, userRole, roomId);

    let subtitle_name = null;
    if (subtitleFile) {
      // 字幕はアップロード時に保存済みなので、追加処理せずファイル名を返す。
      subtitle_name = subtitleFile.filename;
    }

    if (!videoFile) {
      return { video_name: null, video_thumbnail_name: null, video_subtitle_name: subtitle_name };
    }

    await createVideoThumbnail(videoFile);

    return {
      video_name,
      video_thumbnail_name: thumbnailTarget.filename,
      video_subtitle_name: subtitle_name,
    };
  } catch (e) {
    await removeStoredFiles([videoFile?.path, thumbnailTarget?.path, subtitleFile?.path]);
    throw e;
  }
};

// 認可後に音声をMP3へ変換する。認可・変換中の失敗時は、保存済みの入力ファイルの削除処理を行う。
exports.uploadTimelineAudio = async (body, files, jwtPayload) => {
  const userId = jwtPayload.user_id;
  const userRole = jwtPayload.user_role;
  const roomId = body.room_id;
  const file = (files && files.audio_file && files.audio_file[0]) || null;
  assertStoredFile(file);

  try {
    await authorizeRoomAccess(userId, userRole, roomId);
    const converted = await convertAudioToMp3(file);
    return { audio_name: converted.filename };
  } catch (e) {
    await removeStoredFiles([file.path]);
    throw e;
  }
};

exports.discardTimelineMedia = discardTimelineMedia;
