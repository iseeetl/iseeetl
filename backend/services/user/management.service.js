const { revokeUserSessions } = require('../../socket/configurationRevocation');
const AppError = require('../../utils/appError');
const ROLES = require('../../constants/roles');
const User = require('../../models/User');
const { escapeRegExp } = require('../../utils/regex');
const { withKeyedLocks } = require('../../utils/keyedLock');
const { disconnectUserSessionSockets, revalidateUserSockets } = require('../../socket/accessControl');
const { requireAdminUser } = require('../_shared/memberHelpers');
const { buildPaginationOptions, withOptionalDeleteFlag } = require('../_shared/paginationHelpers');
const { buildDeleteFlagUpdate } = require('../_shared/updateHelpers');
const aiAnalysisSettingService = require('../analysis/settings/setting.service');
const {
  assertNoActiveAIAnalysisReferences,
  withAIAnalysisIntegrityLock,
} = require('../analysis/settings/referenceIntegrity');

const MANAGEMENT_ASSIGNABLE_ROLES = new Set([ROLES.AUTHOR, ROLES.EDITOR, ROLES.DEVELOPER]);
const managementUserKey = (id) => `management-user:${String(id)}`;
const normalizeDeleteFlg = (value) =>
  value === true || value === 1 || value === 'true' || value === '1';

const getUserListPaginate = async (body, jwtPayload) => {
  await requireAdminUser(jwtPayload.user_id);

  let query = {};
  if (body.search) {
    const pattern = escapeRegExp(body.search);
    query = {
      $or: [{ username: { $regex: pattern, $options: 'i' } }, { mail: { $regex: pattern, $options: 'i' } }],
    };
  }
  query = withOptionalDeleteFlag(query, body.delete_flg);

  return User.paginate(
    query,
    buildPaginationOptions({ page: body.page, sort: { created_at: 'desc' } })
  );
};

const assertManagementChangeAllowed = ({ foundUser, role }) => {
  const assignsUnmanagedRole = foundUser.role !== role && !MANAGEMENT_ASSIGNABLE_ROLES.has(role);
  const changesAdministratorAccess =
    foundUser.role === ROLES.ADMINISTRATOR && role !== ROLES.ADMINISTRATOR;
  if (assignsUnmanagedRole || changesAdministratorAccess) {
    throw new AppError({ code: 'CONFLICT' });
  }
};

const managementUpdateUser = async (body, jwtPayload, io) => {
  const id = body._id;
  const username = body.username;
  const mail = body.mail;
  const password = body.password;
  const role = body.role;
  const expectedDeleteFlg = normalizeDeleteFlg(body.delete_flg);

  await requireAdminUser(jwtPayload.user_id);

  return withKeyedLocks([managementUserKey(id)], async () => {
    const foundUser = await User.findById(id);
    if (!foundUser) throw new AppError({ code: 'INVALID_PARAMS' });
    if (foundUser.delete_flg !== expectedDeleteFlg) {
      throw new AppError({ code: 'CONFLICT' });
    }
    assertManagementChangeAllowed({ foundUser, role });

    const updateUserData = {};
    const roleChanged = foundUser.role !== role;
    if (foundUser.username !== username) updateUserData.username = username;
    if (typeof password !== 'undefined') updateUserData.password = password;
    if (roleChanged) updateUserData.role = role;
    updateUserData.updated_at = Date.now();

    if (foundUser.mail !== mail) {
      if (mail !== null && (await User.findOne({ mail }))) {
        throw new AppError({ code: 'USER_EMAIL_ALREADY_USED' });
      }
      updateUserData.mail = mail;
    }

    const invalidatesExistingSessions = typeof password !== 'undefined';
    const updateOperation = invalidatesExistingSessions
      ? { $set: updateUserData, $inc: { session_version: 1 } }
      : updateUserData;
    const updateOptions = { new: true, runValidators: true };

    const updatedUser = await User.findOneAndUpdate(
      { _id: id, delete_flg: expectedDeleteFlg },
      updateOperation,
      updateOptions
    );
    if (!updatedUser) {
      const currentUser = await User.findById(id);
      throw new AppError({ code: currentUser ? 'CONFLICT' : 'INVALID_PARAMS' });
    }

    // DB更新後にSocketの処理だけ失敗した場合も再試行できるよう、同じ要求の再送時にも実行する。
    // パスワード更新では全セッションを失効させ、それ以外は現在の役割でアクセス権を確認し直す。
    if (invalidatesExistingSessions) await revokeUserSessions(io, id);
    else await revalidateUserSockets(io, { userId: id, userRole: updatedUser.role });

    return updatedUser;
  });
};

const managementSetDeleteState = async (body, jwtPayload, io) => {
  const id = body._id;
  const deleteFlg = normalizeDeleteFlg(body.delete_flg);

  await requireAdminUser(jwtPayload.user_id);

  const updatedUser = await withAIAnalysisIntegrityLock(async () => {
    const foundUser = await User.findById(id);
    if (!foundUser) throw new AppError({ code: 'NOT_FOUND' });
    if (foundUser.role === ROLES.ADMINISTRATOR) throw new AppError({ code: 'CONFLICT' });
    if (foundUser.delete_flg === deleteFlg) return foundUser;
    if (deleteFlg) await assertNoActiveAIAnalysisReferences('user', id);

    const updateData = {
      ...buildDeleteFlagUpdate({ deleteFlg, alwaysSetDeletedAt: true }),
      updated_at: Date.now(),
    };
    const updateOperation = deleteFlg
      ? { $set: updateData, $inc: { session_version: 1 } }
      : { $set: updateData };
    const updatedUser = await User.findOneAndUpdate(
      { _id: id, delete_flg: !deleteFlg },
      updateOperation,
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      const currentUser = await User.findById(id);
      throw new AppError({ code: currentUser ? 'CONFLICT' : 'NOT_FOUND' });
    }
    return updatedUser;
  });

  // DBの参照整合性を守るロックは、Socketの切断処理を始める前に解放する。
  // 削除済みでも切断を試み、前回の要求でDB更新後に切断だけが失敗した場合に再試行できるようにする。
  if (deleteFlg) await disconnectUserSessionSockets(io, id);
  return updatedUser;
};

const searchAIAnalysisResultUsers = (body, jwtPayload) =>
  aiAnalysisSettingService.searchResultUsers(body, jwtPayload);

module.exports = {
  getUserListPaginate,
  managementSetDeleteState,
  managementUpdateUser,
  searchAIAnalysisResultUsers,
};
