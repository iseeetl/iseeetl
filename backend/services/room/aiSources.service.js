const Chat = require('../../models/Chat');
const RoomTag = require('../../models/RoomTag');
const RoomAIAnalysisSetting = require('../../models/RoomAIAnalysisSetting');
const { authorizeRoomMetadataAccess } = require('./roomAccess.service');

exports.list = async ({ room_id: roomId }, identity) => {
  const { room } = await authorizeRoomMetadataAccess(roomId, identity);
  const [settings, history] = await Promise.all([
    RoomAIAnalysisSetting.find({ room: room._id, floor: room.floor, delete_flg: false }).select('room_tag').lean(),
    Chat.aggregate([
      { $match: { room: room._id, floor: room.floor, delete_flg: false } },
      { $project: { entries: { $concatArrays: [
        { $ifNull: ['$supplementaries', []] },
        { $reduce: { input: { $filter: { input: { $ifNull: ['$replies', []] }, as: 'reply', cond: { $ne: ['$$reply.delete_flg', true] } } }, initialValue: [],
          in: { $concatArrays: ['$$value', { $ifNull: ['$$this.supplementaries', []] }] } } },
      ] } } },
      { $unwind: '$entries' },
      { $match: { 'entries.delete_flg': { $ne: true }, 'entries.meta.analysis_kind': { $in: ['vision', 'speech', 'video', 'audioScene', 'conversation'] } } },
      { $group: { _id: { $ifNull: ['$entries.meta.analysis_trigger_tag', null] } } },
    ]),
  ]);
  const ids = [...new Set([...settings.map((s) => String(s.room_tag)), ...history.filter((h) => h._id).map((h) => String(h._id))])];
  const tags = await RoomTag.find({ room: room._id, floor: room.floor, _id: { $in: ids } })
    .select('_id name lang translations order delete_flg').sort({ order: 1, _id: 1 }).lean();
  const found = new Set(tags.map((tag) => String(tag._id)));
  return [
    ...tags,
    ...ids.filter((id) => !found.has(id)).map((id) => ({ _id: id, unavailable: true })),
    ...(history.some((h) => !h._id) ? [{ _id: '__unknown__', unknown: true }] : []),
  ];
};
