const fs = require('fs').promises;
const path = require('path');
const AppError = require('../../../utils/appError');
const { resolveMongoIdPath } = require('../../../utils/safePath');
const { ensureRoomBelongsToFloor } = require('./context');
const { timelineQuery } = require('./query.service');
const serializeTimeline = require('../shared/timelineSerializer');

async function estimateJson(floorId, roomId) {
  const cursor = timelineQuery(floorId, roomId).cursor({ batchSize: 1 });
  let bytes = 2;
  let count = 0;
  try {
    for await (const chat of cursor) {
      const [item] = serializeTimeline([chat]);
      if (!item) continue;
      // ブラウザと同じJSON形式で、配列全体をメモリに保持せず投稿ごとにサイズを数える。
      const single = JSON.stringify([item], null, '  ');
      bytes += Buffer.byteLength(single) - 2;
      count += 1;
    }
  } finally { await cursor.close(); }
  return { estimatedBytes: bytes, itemCount: count };
}

async function estimateMedia(floorId, roomId) {
  const root = resolveMongoIdPath(process.env.MEDIA_PATH, [floorId, roomId], {
    createError: () => new AppError({ code: 'INVALID_PARAMS' }),
  });
  let bytes = 98; // 非圧縮ZIPの概算として、ZIP64の終端構造などの容量を含める。
  let count = 0;
  async function walk(directory) {
    const entries = await fs.opendir(directory);
    for await (const entry of entries) {
      const target = path.join(directory, entry.name);
      const stat = await fs.lstat(target);
      const nameBytes = Buffer.byteLength(path.relative(root, target).split(path.sep).join('/'));
      bytes += 200 + 2 * nameBytes;
      if (stat.isDirectory()) await walk(target);
      else {
        bytes += stat.isSymbolicLink() ? Buffer.byteLength(await fs.readlink(target)) : stat.size;
        count += 1;
      }
    }
  }
  await walk(root);
  return { estimatedBytes: bytes, itemCount: count };
}

async function estimate(body) {
  const { floor_id: floorId, room_id: roomId, type } = body;
  if (!['json', 'media'].includes(type)) throw new AppError({ code: 'INVALID_PARAMS' });
  await ensureRoomBelongsToFloor(floorId, roomId);
  const result = type === 'json' ? await estimateJson(floorId, roomId) : await estimateMedia(floorId, roomId);
  return { ...result, type, approximate: true };
}
module.exports = { estimate };
