const AppError = require('../../utils/appError');

const FloorInvite = require('../../models/FloorInvite');
const FloorMember = require('../../models/FloorMember');
const { findActiveFloor } = require('../_shared/activeResource');
const { hasFloorAccess, isAdminOrCreator } = require('../_shared/floorAccess');
const { buildInviteTokenExpiry, createInviteToken } = require('../_shared/inviteToken');
const { findUserOrThrow, requireAdminUser, buildMemberManagementOptions } = require('../_shared/memberHelpers');
const { revalidateFloorUserSockets } = require('../../socket/accessControl');

async function findFloorForMember(floorId) {
  return findActiveFloor(floorId, { error: { code: 'INVALID_PARAMS' } });
}

exports.list = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findUserOrThrow(decodedUserId, 'INVALID_PARAMS');

  const foundFloor = await findFloorForMember(floorId);

  const foundFloorMember = await FloorMember.findOne({ floor: floorId, user: decodedUserId });

  if (!hasFloorAccess({ role: decodedUserRole, floor: foundFloor, uid: decodedUserId, floorMember: foundFloorMember })) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const foundFloorMembers = await FloorMember.find({ floor: floorId })
    .populate('user', 'username image_name')
    .sort({ created_at: 'desc' })
    .lean();

  return foundFloorMembers;
};

exports.invite = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const period = body.period;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const foundFloor = await findFloorForMember(floorId);

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(decodedUserRole, foundFloor.user.toString(), decodedUserId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const token = createInviteToken();

  const tokenExpiry = buildInviteTokenExpiry(period);

  const newFloorInvite = {
    floor: floorId,
    user: decodedUserId,
    token: token,
    token_expiry: tokenExpiry,
  };

  const createdFloorInvite = await FloorInvite.create(newFloorInvite);

  return createdFloorInvite;
};

exports.create = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const inviteToken = body.invite_token;
  const decodedUserId = jwtPayload.user_id;

  await findUserOrThrow(decodedUserId, 'INVALID_PARAMS');

  const foundFloor = await findFloorForMember(floorId);
  if (foundFloor.user.toString() === decodedUserId) throw new AppError({ code: 'DONT_NEED_FLOOR_MEMBER' });

  const foundFloorInvite = await FloorInvite.findOne({ token: inviteToken, floor: floorId });
  if (foundFloorInvite === null) throw new AppError({ code: 'INVALID_PARAMS' });

  const now = new Date();
  if (now > foundFloorInvite.token_expiry) throw new AppError({ code: 'INVITE_EXPIRED' });

  const foundFloorMember = await FloorMember.findOne({ floor: floorId, user: decodedUserId });
  if (foundFloorMember !== null) throw new AppError({ code: 'ALREADY_FLOOR_MEMBER' });

  const newData = {
    floor: floorId,
    user: decodedUserId,
  };

  let createdFloorMember;
  try { createdFloorMember = await FloorMember.create(newData); } catch (error) {
    if (error.code === 11000 && error.keyPattern?.floor === 1 && error.keyPattern?.user === 1 && Object.keys(error.keyPattern).length === 2) {
      throw new AppError({ code: 'ALREADY_FLOOR_MEMBER' });
    }
    throw error;
  }
  const populatedFloorMember = await FloorMember.findById(createdFloorMember._id).populate('floor', 'title');

  return populatedFloorMember;
};

exports.delete = async (body, jwtPayload, io) => {
  const memberId = body._id;
  const floorId = body.floor_id;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const foundFloor = await findFloorForMember(floorId);

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(decodedUserRole, foundFloor.user.toString(), decodedUserId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const removedFloorMember = await FloorMember.findOneAndDelete({
    _id: memberId,
    floor: floorId,
  });
  if (!removedFloorMember) throw new AppError({ code: 'NOT_FOUND' });

  await revalidateFloorUserSockets(io, {
    floorId: removedFloorMember.floor || floorId,
    userId: removedFloorMember.user,
  });

  return removedFloorMember;
};

exports.leave = async (body, jwtPayload, io) => {
  const floorId = body.floor_id;
  const decodedUserId = jwtPayload.user_id;

  const filterQuery = {
    floor: floorId,
    user: decodedUserId,
  };

  const leaveFloorMember = await FloorMember.findOneAndDelete(filterQuery);
  if (!leaveFloorMember) throw new AppError({ code: 'NOT_FOUND' });

  await revalidateFloorUserSockets(io, {
    floorId,
    userId: decodedUserId,
  });
  return leaveFloorMember;
};

exports.managementPaginate = async (body, jwtPayload) => {
  const page = body.page;
  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  const options = buildMemberManagementOptions({
    page,
    populate: [
      {
        path: 'floor',
        select: 'title',
      },
      {
        path: 'user',
        select: 'username',
      },
    ],
  });

  const foundFloorMembers = await FloorMember.paginate({}, options);
  return foundFloorMembers;
};

// 管理者は、フロアの論理削除状態にかかわらず所属レコードをIDで物理削除できる。
exports.managementDelete = async (body, jwtPayload, io) => {
  const memberId = body._id;
  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  const removedFloorMember = await FloorMember.findOneAndDelete({ _id: memberId });
  if (!removedFloorMember) throw new AppError({ code: 'NOT_FOUND' });

  await revalidateFloorUserSockets(io, {
    floorId: removedFloorMember.floor,
    userId: removedFloorMember.user,
  });
  return removedFloorMember;
};
