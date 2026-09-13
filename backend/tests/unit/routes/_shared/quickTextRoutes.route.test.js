const quickTextRoutesPath = require.resolve('../../../../routes/_shared/quickTextRoutes');

const setup = ({ listRequiresJwt, listIdentityMiddleware }) => {
  jest.resetModules();

  let router;
  const createRouter = () => {
    router = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    };
    return router;
  };

  jest.doMock('express', () => ({
    Router: () => createRouter(),
  }));

  const { buildQuickTextRouter } = require(quickTextRoutesPath);

  const ensureJsonWebToken = jest.fn();
  const ctrl = {
    listGroups: jest.fn(),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn(),
    listItems: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
  };
  const validators = {
    group: {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    },
    item: {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    },
  };

  const built = buildQuickTextRouter({
    scope: 'floor',
    ctrl,
    validators,
    ensureJsonWebToken,
    listRequiresJwt,
    listIdentityMiddleware,
  });

  return { router, ensureJsonWebToken, ctrl, validators, built };
};

describe('単語用の共通ルーティング', () => {
  test('認証が必要なグループと単語の書込ルートを登録する', () => {
    const { router, ensureJsonWebToken, ctrl, validators, built } = setup({ listRequiresJwt: true });
    const base = '/floors/:floorId/quick-text';

    expect(built).toBe(router);
    expect(router.post.mock.calls).toEqual([
      [`${base}/groups`, ensureJsonWebToken, validators.group.create, ctrl.createGroup],
      [`${base}/groups/:groupId/items`, ensureJsonWebToken, validators.item.create, ctrl.createItem],
    ]);
    expect(router.patch.mock.calls).toEqual([
      [`${base}/groups/:id`, ensureJsonWebToken, validators.group.update, ctrl.updateGroup],
      [`${base}/items/:id`, ensureJsonWebToken, validators.item.update, ctrl.updateItem],
    ]);
    expect(router.delete.mock.calls).toEqual([
      [`${base}/groups/:id`, ensureJsonWebToken, validators.group.remove, ctrl.deleteGroup],
      [`${base}/items/:id`, ensureJsonWebToken, validators.item.remove, ctrl.deleteItem],
    ]);
  });

  test('一覧の認証が必要な場合はJWT認証を適用する', () => {
    const { router, ensureJsonWebToken, ctrl, validators } = setup({ listRequiresJwt: true });
    const base = '/floors/:floorId/quick-text';

    expect(router.get.mock.calls).toEqual([
      [`${base}/groups`, ensureJsonWebToken, validators.group.list, ctrl.listGroups],
      [`${base}/groups/:groupId/items`, ensureJsonWebToken, validators.item.list, ctrl.listItems],
    ]);
  });

  test('一覧の認証が不要な場合はJWT認証を適用しない', () => {
    const { router, ctrl, validators } = setup({ listRequiresJwt: false });
    const base = '/floors/:floorId/quick-text';

    expect(router.get.mock.calls).toEqual([
      [`${base}/groups`, validators.group.list, ctrl.listGroups],
      [`${base}/groups/:groupId/items`, validators.item.list, ctrl.listItems],
    ]);
  });

  test('一覧の認証が不要でも任意認証が指定されていれば適用する', () => {
    const listIdentityMiddleware = jest.fn();
    const { router, ctrl, validators } = setup({
      listRequiresJwt: false,
      listIdentityMiddleware,
    });
    const base = '/floors/:floorId/quick-text';

    expect(router.get.mock.calls).toEqual([
      [`${base}/groups`, listIdentityMiddleware, validators.group.list, ctrl.listGroups],
      [`${base}/groups/:groupId/items`, listIdentityMiddleware, validators.item.list, ctrl.listItems],
    ]);
  });
});
