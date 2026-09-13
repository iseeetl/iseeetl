jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));

const ROLES = require('../../../../constants/roles');
const AppError = require('../../../../utils/appError');
const User = require('../../../../models/User');

const {
  findUserOrThrow,
  ensureAdminRole,
  requireAdminUser,
  buildPaginationLabels,
} = require('../../../../services/_shared/memberHelpers');

describe('メンバー管理の共通処理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('対象ユーザを取得する', async () => {
    User.findOne.mockResolvedValue({ _id: 'u1' });
    const user = await findUserOrThrow('u1');
    expect(user._id).toBe('u1');
  });

  test('管理者以外の権限を拒否する', () => {
    expect(() => ensureAdminRole({ role: ROLES.EDITOR })).toThrow(AppError);
  });

  test('管理者であればユーザ情報を返す', async () => {
    User.findOne.mockResolvedValue({ _id: 'admin', role: ROLES.ADMINISTRATOR });
    const user = await requireAdminUser('admin');
    expect(user._id).toBe('admin');
  });

  test('管理者でなければユーザ情報を返さず拒否する', async () => {
    User.findOne.mockResolvedValue({ _id: 'editor', role: ROLES.EDITOR });
    await expect(requireAdminUser('editor')).rejects.toBeInstanceOf(AppError);
  });

  test('ページ単位の一覧に必要なキー名を返す', () => {
    const labels = buildPaginationLabels();
    expect(labels).toEqual(
      expect.objectContaining({
        totalDocs: 'total',
        docs: 'docs',
        hasNextPage: 'hasNextPage',
        meta: null,
      })
    );
  });
});
