const apiMountsPath = require.resolve('../../../routes/apiMounts');

const routePaths = {
  capabilities: require.resolve('../../../routes/capabilities.route'),
  analytics: require.resolve('../../../routes/analytics.route'),
  auth: require.resolve('../../../routes/auth.route'),
  guestToken: require.resolve('../../../routes/guest.route'),
  user: require.resolve('../../../routes/user.route'),
  floor: require.resolve('../../../routes/floor'),
  room: require.resolve('../../../routes/room'),
  upload: require.resolve('../../../routes/upload.route'),
  timeline: require.resolve('../../../routes/timeline'),
  postResource: require.resolve('../../../routes/timeline/postResource.route'),
  uploadResource: require.resolve('../../../routes/timeline/uploadResource.route'),
  guestTimeline: require.resolve('../../../routes/timeline/guest'),
  categoryTag: require.resolve('../../../routes/categoryTag.route'),
  soundTag: require.resolve('../../../routes/soundTag.route'),
  spam: require.resolve('../../../routes/spam.route'),
  kickedUser: require.resolve('../../../routes/kickedUser.route'),
  quickText: require.resolve('../../../routes/quickText.route'),
  v1: require.resolve('../../../routes/v1'),
  aiAnalysisSetting: require.resolve('../../../routes/aiAnalysisSetting.route'),
  floorAIAnalysisSetting: require.resolve('../../../routes/floor/floorAIAnalysisSetting.route'),
  roomAIAnalysisSetting: require.resolve('../../../routes/room/roomAIAnalysisSetting.route'),
};

describe('APIルートの登録', () => {
  test.each([
    ['/api/chat', 'timeline', 'timeline-router', 2, 1],
    ['/api/chat/guest', 'guestTimeline', 'guest-timeline-router', 2, 1],
    ['/api/auth', null, 'auth-router', 3, 2],
    ['/api/user', null, 'user-router', 2, 1],
    ['/api', 'floor', 'floor-router', 4, 1],
    ['/api', 'postResource', 'post-resource-router', 3, 1],
    ['/api', 'uploadResource', 'upload-resource-router', 3, 2],
  ])('%sはルータの前にアプリのSocket.IOを注入する', (path, factoryName, router, count, routerIndex) => {
    jest.resetModules();

    const factories = {
      capabilities: jest.fn(() => 'capabilities-router'),
      analytics: jest.fn(() => 'analytics-router'),
      floor: jest.fn(() => 'floor-router'),
      room: jest.fn(() => 'room-router'),
      timeline: jest.fn(() => 'timeline-router'),
      postResource: jest.fn(() => 'post-resource-router'),
      uploadResource: jest.fn(() => 'upload-resource-router'),
      guestTimeline: jest.fn(() => 'guest-timeline-router'),
      kickedUser: jest.fn(() => 'kicked-user-router'),
      v1: jest.fn(() => 'v1-router'),
    };
    const staticRoutes = {
      auth: 'auth-router',
      guestToken: 'guest-token-router',
      user: 'user-router',
      upload: 'upload-router',
      categoryTag: 'category-tag-router',
      soundTag: 'sound-tag-router',
      spam: 'spam-router',
      quickText: 'quick-text-router',
      aiAnalysisSetting: 'ai-analysis-setting-router',
      floorAIAnalysisSetting: 'floor-ai-analysis-setting-router',
      roomAIAnalysisSetting: 'room-ai-analysis-setting-router',
    };

    Object.entries(factories).forEach(([name, factory]) => {
      jest.doMock(routePaths[name], () => factory);
    });
    Object.entries(staticRoutes).forEach(([name, route]) => {
      jest.doMock(routePaths[name], () => route);
    });

    const io = { id: 'app-io' };
    const { buildApiMounts } = require(apiMountsPath);
    const capabilities = { googleAnalytics: false };
    const analyticsConfig = { userIdSecret: null };
    const mounts = buildApiMounts({ io, capabilities, analyticsConfig });
    const mount = mounts.find((candidate) => candidate.path === path && candidate.middlewares.includes(router));

    if (factoryName === 'floor') expect(factories.floor).toHaveBeenCalledWith(io);
    else if (factoryName) expect(factories[factoryName]).toHaveBeenCalledWith();
    expect(mount.middlewares).toHaveLength(count);
    expect(mount.middlewares[routerIndex]).toBe(router);

    const req = {};
    const next = jest.fn();
    mount.middlewares[0](req, {}, next);

    expect(req.io).toBe(io);
    expect(next).toHaveBeenCalledTimes(1);
    expect(factories.kickedUser).toHaveBeenCalledWith(io);
    expect(factories.analytics).toHaveBeenCalledWith({ capabilities, analyticsConfig });
  });

  test.each([
    ['/api/aianalysissetting', 'aiAnalysisSetting', 'ai-analysis-setting-router'],
    ['/api/flooraianalysissetting', 'floorAIAnalysisSetting', 'floor-ai-analysis-setting-router'],
    ['/api/roomaianalysissetting', 'roomAIAnalysisSetting', 'room-ai-analysis-setting-router'],
  ])('%sは対応するAI解析設定のルータを登録する', (path, routeName, router) => {
    jest.resetModules();

    Object.entries(routePaths).forEach(([name, modulePath]) => {
      jest.doMock(modulePath, () =>
        ['capabilities', 'analytics', 'floor', 'room', 'timeline', 'postResource', 'uploadResource', 'guestTimeline', 'kickedUser', 'v1'].includes(name)
          ? jest.fn(() => `${name}-router`)
          : name === routeName
            ? router
            : `${name}-router`
      );
    });

    const { buildApiMounts } = require(apiMountsPath);
    const mount = buildApiMounts().find((candidate) => candidate.path === path);

    expect(mount).toEqual({ path, middlewares: [router] });
  });

  test('アプリごとにアクセス解析ルータへ内部設定を注入する', () => {
    jest.resetModules();

    const analyticsFactory = jest.fn(({ analyticsConfig }) => ({ analyticsConfig }));
    jest.doMock(routePaths.analytics, () => analyticsFactory);
    jest.doMock(routePaths.capabilities, () => jest.fn(() => 'capabilities-router'));
    Object.entries(routePaths).forEach(([name, modulePath]) => {
      if (name === 'analytics' || name === 'capabilities') return;
      jest.doMock(modulePath, () =>
        ['floor', 'room', 'timeline', 'postResource', 'uploadResource', 'guestTimeline', 'kickedUser', 'v1'].includes(name)
          ? jest.fn(() => `${name}-router`)
          : `${name}-router`
      );
    });

    const { buildApiMounts } = require(apiMountsPath);
    const configA = { userIdSecret: 'a'.repeat(32) };
    const configB = { userIdSecret: 'b'.repeat(32) };
    const capabilities = { googleAnalytics: true };

    const mountA = buildApiMounts({ capabilities, analyticsConfig: configA })
      .find(({ path }) => path === '/api/analytics');
    const mountB = buildApiMounts({ capabilities, analyticsConfig: configB })
      .find(({ path }) => path === '/api/analytics');

    expect(mountA.middlewares[0]).toEqual({ analyticsConfig: configA });
    expect(mountB.middlewares[0]).toEqual({ analyticsConfig: configB });
    expect(mountA.middlewares[0]).not.toBe(mountB.middlewares[0]);
  });
});
