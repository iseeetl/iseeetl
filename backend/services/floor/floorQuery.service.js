const ROLES = require('../../constants/roles');
const { escapeRegExp } = require('../../utils/regex');
const { buildPaginationOptions } = require('../_shared/paginationHelpers');

const Floor = require('../../models/Floor');
const FloorMember = require('../../models/FloorMember');

const { findActiveUser, findActiveFloor } = require('../_shared/activeResource');

exports.guestPaginate = async (body) => {
  const { page, search } = body;

  const options = buildPaginationOptions({
    page,
    limit: 9,
    sort: { created_at: 'desc' },
    populate: { path: 'user', select: 'username image_name' },
    lean: true,
  });

  const query = { floor_display_hidden: { $ne: true }, delete_flg: false };

  if (search) {
    const pattern = escapeRegExp(search);
    query.$or = [{ title: { $regex: pattern, $options: 'i' } }, { description: { $regex: pattern, $options: 'i' } }];
  }

  const result = await Floor.paginate(query, options);

  return result;
};

// 非表示フロアも、管理者には全件、その他のユーザには所属するフロアを表示する。
// フロア編集者には自分が作成したフロアも表示する。いずれも論理削除済みは除外する。
exports.paginate = async (body, jwtPayload) => {
  const { page, search } = body;

  let searchQuery = null;
  if (search) {
    const pattern = escapeRegExp(search);
    searchQuery = [{ title: { $regex: pattern, $options: 'i' } }, { description: { $regex: pattern, $options: 'i' } }];
  }

  const options = buildPaginationOptions({
    page,
    limit: 9,
    sort: { created_at: 'desc' },
    populate: { path: 'user', select: 'username image_name' },
    lean: true,
  });

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  let query;

  if (decodedUserRole === ROLES.ADMINISTRATOR) {
    query = { delete_flg: false };
    if (searchQuery) query.$or = searchQuery;
  } else if (decodedUserRole === ROLES.EDITOR) {
    const floorIdsWithUser = await FloorMember.find({ user: decodedUserId }).distinct('floor');

    const myQuery = [
      { floor_display_hidden: { $ne: true }, delete_flg: false },
      { floor_display_hidden: true, _id: { $in: floorIdsWithUser }, delete_flg: false },
      { user: decodedUserId, delete_flg: false },
    ];

    query = searchQuery ? { $and: [{ $or: myQuery }, { $or: searchQuery }] } : { $or: myQuery };
  } else {
    const floorIdsWithUser = await FloorMember.find({ user: decodedUserId }).distinct('floor');

    const myQuery = [
      { floor_display_hidden: { $ne: true }, delete_flg: false },
      { floor_display_hidden: true, _id: { $in: floorIdsWithUser }, delete_flg: false },
    ];

    query = searchQuery ? { $and: [{ $or: myQuery }, { $or: searchQuery }] } : { $or: myQuery };
  }

  const result = await Floor.paginate(query, options);

  return result;
};

exports.getRole = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PARAMS' } });

  const foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PARAMS' } });

  const foundFloorMember = await FloorMember.findOne({ floor: floorId, user: decodedUserId });

  if (decodedUserRole === ROLES.ADMINISTRATOR) return { role: ROLES.ADMINISTRATOR };
  if (foundFloor.user.toString() === decodedUserId && decodedUserRole === ROLES.EDITOR)
    return { role: ROLES.FLOOR_EDITOR };
  if (foundFloorMember !== null) return { role: ROLES.FLOOR_MEMBER };
  return { role: ROLES.AUTHOR };
};

// 非表示設定は一覧表示だけを制御するため、詳細取得では非表示フロアも対象にする。
exports.getDetail = async (body) => {
  const floorId = body._id;

  const floor = await findActiveFloor(floorId);

  return floor;
};
