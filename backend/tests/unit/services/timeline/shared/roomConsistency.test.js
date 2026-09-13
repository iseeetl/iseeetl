const mongoose = require('mongoose');
const AppError = require('../../../../../utils/appError');
const { toIdString, ensureChatBelongsToRoom } = require('../../../../../services/timeline/shared/roomConsistency');

describe('roomConsistencyの検証', () => {
  test('toIdString: ObjectId を文字列へ変換できる', () => {
    const id = new mongoose.Types.ObjectId();
    expect(toIdString(id)).toBe(id.toString());
  });

  test('toIdString: _id を持つオブジェクトを変換できる', () => {
    const id = new mongoose.Types.ObjectId();
    expect(toIdString({ _id: id })).toBe(id.toString());
  });

  test('ensureChatBelongsToRoom: 同一ルームなら例外を投げない', () => {
    const roomId = new mongoose.Types.ObjectId();
    expect(() => ensureChatBelongsToRoom({ room: roomId }, roomId)).not.toThrow();
  });

  test('ensureChatBelongsToRoom: 異なるルームなら AppError', () => {
    const chatRoomId = new mongoose.Types.ObjectId();
    const expectedRoomId = new mongoose.Types.ObjectId();
    expect(() => ensureChatBelongsToRoom({ room: chatRoomId }, expectedRoomId)).toThrow(AppError);
  });
});
