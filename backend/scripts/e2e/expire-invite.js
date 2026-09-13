const mongoose = require('mongoose');
const { loadE2EEnvironment, resolveE2EResetEnvironment, assertE2EResetConnection } = require('./environment');

// 期限切れの検証用に、作成直後のE2E用招待だけを更新する。
const expireInvite = async ({ kind, inviteId, floorId, roomId, userId }) => {
  const ids = [inviteId, floorId, userId, ...(kind === 'room' ? [roomId] : [])];
  if (!['floor', 'room'].includes(kind) || ids.some((id) => !/^[a-f0-9]{24}$/i.test(String(id || '')))) {
    throw new Error('E2E用の招待データの対象が不正です。');
  }
  const { databaseUri } = resolveE2EResetEnvironment(loadE2EEnvironment({ environment: {} }));
  const connection = mongoose.createConnection();
  try {
    await connection.openUri(databaseUri, { serverSelectionTimeoutMS: 10000 });
    const database = assertE2EResetConnection(connection);
    const oid = (id) => new mongoose.Types.ObjectId(id);
    const floor = await database.collection('floors').findOne({
      _id: oid(floorId), user: oid(userId), title: /^E2E Coverage /,
    });
    if (!floor) throw new Error('テスト用フロアの所有者が一致しません。');
    const result = await database.collection(`${kind}invites`).updateOne({
      _id: oid(inviteId), floor: oid(floorId), user: oid(userId),
      ...(kind === 'room' ? { room: oid(roomId) } : {}),
      created_at: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
      token_expiry: { $gt: new Date() },
    }, { $set: { token_expiry: new Date(Date.now() - 60000) } });
    if (result.modifiedCount !== 1) throw new Error('テスト用の招待を1件だけ更新できませんでした。');
  } catch {
    throw new Error('E2E用の招待期限切れデータの準備に失敗しました。');
  } finally {
    await connection.close();
  }
};

module.exports = { expireInvite };
