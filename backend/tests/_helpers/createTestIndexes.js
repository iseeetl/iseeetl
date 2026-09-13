const User = require('../../models/User');
const FloorMember = require('../../models/FloorMember');
const RoomMember = require('../../models/RoomMember');
const KickedUser = require('../../models/KickedUser');

// アプリを起動しないテストでも、製品モデルの索引を隔離DBに準備する。
const createTestIndexes = async () => {
  for (const model of [User, FloorMember, RoomMember, KickedUser]) {
    await model.createIndexes();
  }
};

module.exports = { createTestIndexes };
