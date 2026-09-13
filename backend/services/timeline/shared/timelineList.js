const Chat = require('../../../models/Chat');
const serializeTimeline = require('./timelineSerializer');
const { applyGlobalServerQueryFilters, applyServerQueryFilters } = require('./serverQuery');

function buildTimelineListConditions(body) {
  const floorId = body.floor_id;
  const roomId = body.room_id;
  const from = body.from;
  const to = body.to;

  let limit = 10;
  const andCond = [{ floor: floorId }, { room: roomId }, { delete_flg: false }];
  if (from) andCond.push({ created_at: { $lt: new Date(from) } });
  if (to) {
    andCond.push({ created_at: { $gte: new Date(to) } });
    limit = 200;
  }

  return { andCond, limit };
}

async function listTimelineChats({ body, populate }) {
  const { andCond, limit } = buildTimelineListConditions(body);
  await applyGlobalServerQueryFilters(body, andCond);
  await applyServerQueryFilters(body, andCond);

  const foundChats = await Chat.find({ $and: andCond })
    .populate(populate)
    .sort({ created_at: 'desc' })
    .limit(limit)
    .lean()
    .exec();

  return foundChats.map(serializeTimeline);
}

module.exports = { buildTimelineListConditions, listTimelineChats };
