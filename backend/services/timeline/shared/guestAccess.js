const AppError = require('../../../utils/appError');
const { findActiveRoom, findActiveFloor } = require('../../_shared/activeResource');

const defaultNotFound = { code: 'NOT_FOUND' };
const defaultMemberOnly = { code: 'FORBIDDEN' };

const buildError = (custom, fallback) => ({
  code: custom?.code || fallback.code,
});

async function ensureGuestRoomContext(roomId, { notFound, memberOnly, roomDoc } = {}) {
  const notFoundError = buildError(notFound, defaultNotFound);
  const memberOnlyError = buildError(memberOnly, defaultMemberOnly);

  const room =
    roomDoc ||
    (await findActiveRoom(roomId, {
      error: { code: notFoundError.code },
    }));

  if (room.member_only) {
    throw new AppError({ code: memberOnlyError.code });
  }

  const floor = await findActiveFloor(room.floor.toString(), {
    error: { code: notFoundError.code },
  });

  return { room, floor };
}

module.exports = { ensureGuestRoomContext };
