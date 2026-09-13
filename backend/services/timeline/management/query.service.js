const Chat = require('../../../models/Chat');
const User = require('../../../models/User');
const { escapeRegExp } = require('../../../utils/regex');
const { buildPaginationOptions } = require('../../_shared/paginationHelpers');
const serializeTimeline = require('../shared/timelineSerializer');
const { serializeTimelineForPublic } = serializeTimeline;
const { ensureRoomBelongsToFloor } = require('./context');

const paginate = async (body) => {
  const query = {};
  if (body.search) {
    const searchRegex = new RegExp(escapeRegExp(body.search), 'i');
    const foundUsers = await User.find({
      username: { $regex: searchRegex },
      delete_flg: false,
    })
      .select('_id')
      .lean();
    const userIds = foundUsers.map((user) => user._id);
    const conditions = [{ guest_name: { $regex: searchRegex } }, { 'replies.guest_name': { $regex: searchRegex } }];
    if (userIds.length > 0) {
      conditions.unshift(
        { user: { $in: userIds } },
        { 'replies.user': { $in: userIds } },
        { 'supplementaries.user': { $in: userIds } },
        { 'replies.supplementaries.user': { $in: userIds } }
      );
    }
    query.$or = conditions;
  }

  const page = await Chat.paginate(
    query,
    buildPaginationOptions({
      page: body.page,
      sort: { created_at: 'desc' },
      populate: [
        { path: 'floor', select: 'title', model: 'Floor' },
        { path: 'room', select: 'title', model: 'Room' },
        { path: 'user', select: 'username', model: 'User' },
        { path: 'replies.user', select: 'username', model: 'User' },
        { path: 'supplementaries.user', select: 'username', model: 'User' },
      ],
    })
  );
  return {
    ...page,
    docs: serializeTimelineForPublic(page.docs || [], { preserveDeleted: true }),
  };
};

const timelineQuery = (floorId, roomId) => Chat.find({ floor: floorId, room: roomId, delete_flg: false })
    .populate('floor', 'title description')
    .populate('room', 'title description')
    .populate('room_tags', 'name')
    .populate('user', 'username image_name')
    .populate('replies.user', 'username image_name')
    .populate('replies.room_tags', 'name')
    .populate('supplementaries.user', 'username image_name')
    .sort({ created_at: 'desc' })
    .lean();

const timeline = async (body) => {
  const floorId = body.floor_id;
  const roomId = body.room_id;
  await ensureRoomBelongsToFloor(floorId, roomId);

  const foundChats = await timelineQuery(floorId, roomId);

  return serializeTimeline(foundChats);
};

module.exports = {
  timelineQuery,
  paginate,
  timeline,
};
