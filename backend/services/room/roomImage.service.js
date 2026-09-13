const fs = require('fs').promises;
const AppError = require('../../utils/appError');
const { resolveMongoIdPath, resolveLeafFilePath } = require('../../utils/safePath');
const { parseMediaFileName, isMediaFileReferenced } = require('../media/reference');
const { deleteFiles } = require('../media/fileCleanup');

const validateRoomImage = async ({ room, imageName, userId }) => {
  // 既存画像の保持は他の編集者・管理者にも許可する。
  if (!imageName || imageName === room.image_name) return;
  const parsed = parseMediaFileName(imageName);
  if (!parsed || parsed.thumbnail || parsed.userId !== String(userId) || !['.jpg', '.jpeg', '.png'].includes(parsed.extension)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
  const directory = resolveMongoIdPath(process.env.MEDIA_PATH, [String(room.floor), String(room._id)]);
  const filePath = resolveLeafFilePath(directory, imageName);
  try {
    if (!(await fs.stat(filePath)).isFile()) throw new Error('not a file');
    await fs.access(filePath);
  } catch { throw new AppError({ code: 'INVALID_PARAMS' }); }
  if (await isMediaFileReferenced({ roomId: room._id, fileName: imageName })) throw new AppError({ code: 'INVALID_PARAMS' });
};

const removeReplacedRoomImage = async (room, imageName) => {
  if (!room.image_name || room.image_name === imageName) return;
  const directory = resolveMongoIdPath(process.env.MEDIA_PATH, [String(room.floor), String(room._id)]);
  await deleteFiles(directory, [room.image_name], { roomId: room._id });
};

module.exports = { validateRoomImage, removeReplacedRoomImage };
