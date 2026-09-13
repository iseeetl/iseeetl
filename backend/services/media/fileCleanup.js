const path = require('path');
const fsPromises = require('fs').promises;
const logger = require('../../utils/logger');
const { resolveInsideBaseDir, resolveLeafFilePath } = require('../../utils/safePath');
const { isMediaFileReferenced } = require('./reference');

async function deleteFileIfExists(filePath) {
  try {
    await fsPromises.access(filePath);
    await fsPromises.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.error('Error deleting file:', err);
    }
  }
}

function resolveRoomContext(baseDir) {
  const mediaRoot = process.env.MEDIA_PATH;
  if (typeof mediaRoot !== 'string' || !mediaRoot) return null;
  const relative = path.relative(path.resolve(mediaRoot), path.resolve(baseDir));
  const segments = relative.split(path.sep).filter(Boolean);
  if (relative.startsWith('..') || segments.length !== 2) return null;
  return { floorId: segments[0], roomId: segments[1] };
}

async function deleteFiles(baseDir, fileNames = [], referenceContext = null) {
  const context = referenceContext || resolveRoomContext(baseDir);
  for (const fileName of fileNames) {
    if (!fileName) continue;
    if (context) {
      try {
        const referenced = await isMediaFileReferenced({ roomId: context.roomId, fileName });
        if (referenced) continue;
      } catch (err) {
        logger.error('Error checking media references:', err);
        continue;
      }
    }
    let filePath;
    try {
      filePath = resolveLeafFilePath(baseDir, fileName);
    } catch {
      logger.warn('Skipped unsafe media cleanup path', { fileName });
      continue;
    }
    await deleteFileIfExists(filePath);
  }
}

// oldMediaとnewMediaのimage・video・audioを比較し、主ファイルや字幕の変更で不要になったファイルを削除する。
// 削除候補がルーム内で引き続き参照されている場合は残す。
async function deleteMediaDiff({ floorId, roomId, oldMedia, newMedia }) {
  let baseDir;
  try {
    baseDir = resolveInsideBaseDir(process.env.MEDIA_PATH, [String(floorId), String(roomId)]);
  } catch (err) {
    logger.error('Error resolving media cleanup directory:', err);
    return;
  }

  const oldImageMain = oldMedia.image && oldMedia.image.main;
  const newImageMain = newMedia.image && newMedia.image.main;
  if (oldImageMain && oldImageMain !== newImageMain) {
    await deleteFiles(baseDir, [
      oldImageMain,
      oldMedia.image && oldMedia.image.thumb,
    ], { floorId, roomId });
  }

  const oldVideoMain = oldMedia.video && oldMedia.video.main;
  const newVideoMain = newMedia.video && newMedia.video.main;
  const oldVideoSubtitle = oldMedia.video && oldMedia.video.subtitle;
  const newVideoSubtitle = newMedia.video && newMedia.video.subtitle;
  if (oldVideoMain && oldVideoMain !== newVideoMain) {
    await deleteFiles(baseDir, [
      oldVideoMain,
      oldMedia.video && oldMedia.video.thumb,
      oldMedia.video && oldMedia.video.subtitle,
    ], { floorId, roomId });
  } else if (oldVideoSubtitle && oldVideoSubtitle !== newVideoSubtitle) {
    await deleteFiles(baseDir, [oldVideoSubtitle], { floorId, roomId });
  }

  const oldAudioMain = oldMedia.audio && oldMedia.audio.main;
  const newAudioMain = newMedia.audio && newMedia.audio.main;
  if (oldAudioMain && oldAudioMain !== newAudioMain) {
    await deleteFiles(baseDir, [oldAudioMain], { floorId, roomId });
  }
}

// baseDirにはルームの保存先を指定し、投稿・返信・付加情報のメディア名から削除対象を集める。
// ルーム内で引き続き参照されているファイルは残す。
async function deleteMediaItem(baseDir, item) {
  if (!item) return;

  const files = [];

  if (item.image_name) files.push(item.image_name);
  if (item.image_thumbnail_name) files.push(item.image_thumbnail_name);
  if (item.video_name) files.push(item.video_name);
  if (item.video_thumbnail_name) files.push(item.video_thumbnail_name);
  if (item.video_subtitle_name) files.push(item.video_subtitle_name);
  if (item.audio_name) files.push(item.audio_name);

  await deleteFiles(baseDir, files);
}

module.exports = {
  deleteFileIfExists,
  deleteFiles,
  deleteMediaDiff,
  deleteMediaItem,
};
