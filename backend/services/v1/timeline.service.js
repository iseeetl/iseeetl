const mongoose = require('mongoose');

const roomTagService = require('../room/roomTag.service');
const postsService = require('../timeline/posts.service');
const { assertDeveloper, assertFields, invalidParams } = require('./common');

const V1_ROOM_ACCESS_ERRORS = {
  user: { code: 'TOKEN_INVALID' },
  room: { code: 'NOT_FOUND' },
  floor: { code: 'NOT_FOUND' },
  kicked: { code: 'FORBIDDEN' },
  permission: { code: 'FORBIDDEN' },
};

function normalizeObjectId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw invalidParams();
  return new mongoose.Types.ObjectId(value).toString();
}

function buildRoomTimelineInput(params = {}, body = {}) {
  const input = {
    floor_id: normalizeObjectId(params.floor_id),
    room_id: normalizeObjectId(params.room_id),
  };

  for (const field of ['floor_id', 'room_id']) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    if (normalizeObjectId(body[field]) !== input[field]) throw invalidParams();
  }

  return input;
}

async function listRoomTimeline({ body = {}, jwtPayload, params = {} }) {
  assertDeveloper(jwtPayload);
  const input = buildRoomTimelineInput(params, body);
  const chats = await postsService.list(input, jwtPayload, { errors: V1_ROOM_ACCESS_ERRORS });
  return { result: chats };
}

async function listRoomTags({ body, jwtPayload }) {
  assertDeveloper(jwtPayload);
  assertFields(body, ['floor_id', 'room_id']);

  const tags = await roomTagService.list(
    { room_id: body.room_id },
    { jwtPayload, errors: V1_ROOM_ACCESS_ERRORS }
  );

  return { result: tags };
}

module.exports = {
  listRoomTags,
  listRoomTimeline,
};
