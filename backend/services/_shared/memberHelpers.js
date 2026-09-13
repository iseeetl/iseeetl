const ROLES = require('../../constants/roles');
const AppError = require('../../utils/appError');
const { buildPaginationLabels, buildPaginationOptions } = require('./paginationHelpers');

const { findActiveUser } = require('./activeResource');

async function findUserOrThrow(userId, code = 'NOT_FOUND') {
  return findActiveUser(userId, { error: { code } });
}

function ensureAdminRole(user) {
  if (user.role !== ROLES.ADMINISTRATOR) throw new AppError({ code: 'FORBIDDEN' });
}

async function requireAdminUser(userId) {
  const user = await findUserOrThrow(userId, 'NOT_FOUND');
  ensureAdminRole(user);
  return user;
}

function buildMemberManagementOptions({ page, populate }) {
  return buildPaginationOptions({
    page,
    sort: { created_at: 'desc' },
    populate,
    lean: true,
  });
}

module.exports = {
  findUserOrThrow,
  ensureAdminRole,
  requireAdminUser,
  buildPaginationLabels,
  buildPaginationOptions,
  buildMemberManagementOptions,
};
