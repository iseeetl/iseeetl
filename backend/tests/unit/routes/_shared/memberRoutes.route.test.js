const memberRoutesPath = require.resolve('../../../../routes/_shared/memberRoutes');

const setup = ({ includeContains, includeManagementDelete }) => {
  jest.resetModules();

  let router;
  let managementRoute;
  const createRouter = () => {
    managementRoute = {
      get: jest.fn(),
      post: jest.fn(),
    };
    managementRoute.get.mockReturnValue(managementRoute);
    managementRoute.post.mockReturnValue(managementRoute);
    router = {
      post: jest.fn(),
      route: jest.fn(() => managementRoute),
    };
    return router;
  };

  jest.doMock('express', () => ({
    Router: () => createRouter(),
  }));

  const { buildMemberRouter } = require(memberRoutesPath);

  const controller = {
    list: jest.fn(),
    invite: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    leave: jest.fn(),
    contains: jest.fn(),
    managementPaginate: jest.fn(),
    managementDelete: jest.fn(),
  };

  const ensureJsonWebToken = jest.fn();
  const ensureAdminUser = jest.fn();
  const validateMongoId = jest.fn((field) => `validateMongoId:${field}`);
  const validatePage = jest.fn((field) => `validatePage:${field}`);
  const validatePeriod = jest.fn((field) => `validatePeriod:${field}`);
  const validateInviteToken = jest.fn((field) => `validateInviteToken:${field}`);
  const finalize = jest.fn();

  const built = buildMemberRouter({
    controller,
    ensureJsonWebToken,
    ensureAdminUser,
    validateMongoId,
    validatePage,
    validatePeriod,
    validateInviteToken,
    listIdField: 'floor_id',
    deleteValidators: ['deleteValidator'],
    includeContains,
    includeManagementDelete,
    finalize,
  });

  const { assignQueryToBody } = require('../../../../routes/_shared/queryToBody');

  return {
    router,
    managementRoute,
    validateMongoId,
    built,
    assignQueryToBody,
    ensureJsonWebToken,
    ensureAdminUser,
    finalize,
    controller,
  };
};

describe('メンバー用の共通ルーティング', () => {
  test('任意のルートが有効なら登録する', () => {
    const {
      router,
      managementRoute,
      built,
      validateMongoId,
      assignQueryToBody,
      ensureJsonWebToken,
      ensureAdminUser,
      finalize,
      controller,
    } = setup({ includeContains: true, includeManagementDelete: true });

    expect(built).toBe(router);

    const paths = [...router.post.mock.calls, ...router.route.mock.calls].map((call) => call[0]);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/',
        '/invite',
        '/create',
        '/delete',
        '/leave',
        '/contains',
        '/management/paginate',
        '/management/delete',
      ])
    );

    const managementPaginateHandlers = [
      assignQueryToBody,
      ensureJsonWebToken,
      ensureAdminUser,
      ['validatePage:page'],
      finalize,
      controller.managementPaginate,
    ];
    expect(router.route).toHaveBeenCalledWith('/management/paginate');
    expect(managementRoute.get).toHaveBeenCalledWith(...managementPaginateHandlers);
    expect(managementRoute.post).toHaveBeenCalledWith(...managementPaginateHandlers);

    expect(validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(validateMongoId).toHaveBeenCalledWith('_id');
  });

  test('任意のルートが無効なら登録しない', () => {
    const { router } = setup({ includeContains: false, includeManagementDelete: false });

    const paths = [...router.post.mock.calls, ...router.route.mock.calls].map((call) => call[0]);
    expect(paths).toEqual(
      expect.arrayContaining(['/', '/invite', '/create', '/delete', '/leave', '/management/paginate'])
    );
    expect(paths).not.toContain('/contains');
    expect(paths).not.toContain('/management/delete');
  });
});
