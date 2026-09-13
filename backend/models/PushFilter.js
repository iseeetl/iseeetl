const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Webプッシュ通知で照合する絞り込み条件を保存する。
const PushFilterSchema = new Schema(
  {
    floor: {
      type: Schema.Types.ObjectId,
      ref: 'Floor',
      required: true,
    },
    room: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // 絞り込みダイアログで編集した条件の構造を保持する。
    conditions: { type: Object, required: true },
  }
);
PushFilterSchema.index({ floor: 1, room: 1 });

module.exports = mongoose.model('PushFilter', PushFilterSchema);
