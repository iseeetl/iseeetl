const fs = require('fs');

const AppError = require('../../utils/appError');
const { isMongoId, resolveLeafFilePath, resolveMongoIdPath } = require('../../utils/safePath');
const { authorizeRoomAccess } = require('../room/roomAccess.service');
const {
  isMediaFileReferenced,
  parseMediaFileName,
} = require('./reference');

const MEDIA_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.mp4', '.ogv', '.webm', '.mov', '.srt', '.vtt', '.mp3'];

const MAX_DISCARD_FILES = 6;

const invalidParams = () => new AppError({ code: 'INVALID_PARAMS' });
const isManagedMediaName = (fileName) => {
  const parsed = parseMediaFileName(fileName);
  return parsed && MEDIA_EXTENSIONS.includes(parsed.extension) ? parsed : null;
};

const removeFile = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
};

const discardTimelineMedia = async (body, jwtPayload) => {
  const rawFloorId = body?.floor_id;
  const rawRoomId = body?.room_id;
  const rawUserId = String(jwtPayload?.user_id || '');
  const userRole = jwtPayload?.user_role;
  const fileNames = [...new Set(body?.file_names || [])];

  if (
    !isMongoId(rawFloorId) ||
    !isMongoId(rawRoomId) ||
    !isMongoId(rawUserId) ||
    fileNames.length < 1 ||
    fileNames.length > MAX_DISCARD_FILES
  ) {
    throw invalidParams();
  }

  const floorId = rawFloorId.toLowerCase();
  const roomId = rawRoomId.toLowerCase();
  const userId = rawUserId.toLowerCase();

  const { foundFloor, foundRoom } = await authorizeRoomAccess(userId, userRole, roomId);
  if (String(foundFloor?._id) !== floorId || String(foundRoom?._id) !== roomId) {
    throw invalidParams();
  }

  const mediaRoot = process.env.MEDIA_PATH;
  if (typeof mediaRoot !== 'string' || !mediaRoot) throw invalidParams();
  const roomDir = resolveMongoIdPath(mediaRoot, [floorId, roomId], { createError: invalidParams });

  const candidates = fileNames.map((fileName) => {
    const parsed = isManagedMediaName(fileName);
    const filePath = resolveLeafFilePath(roomDir, fileName, { createError: invalidParams });
    if (
      !parsed ||
      parsed.userId.toLowerCase() !== userId.toLowerCase()
    ) {
      throw invalidParams();
    }

    return { fileName, filePath };
  });

  // 全入力と参照状態を確定してから削除を始め、後続要素の不正やDB失敗で
  // 先行要素だけが消える部分成功を避ける。
  const candidatesWithReferences = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      referenced: await isMediaFileReferenced({ roomId, fileName: candidate.fileName }),
    }))
  );

  const discarded = [];
  const retained = [];
  for (const { fileName, filePath, referenced } of candidatesWithReferences) {
    if (referenced) {
      retained.push(fileName);
      continue;
    }

    await removeFile(filePath);
    discarded.push(fileName);
  }

  return {
    discarded_file_names: discarded,
    retained_file_names: retained,
  };
};

module.exports = {
  discardTimelineMedia,
};
