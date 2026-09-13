import { nextTick } from 'vue';
import { createMemoryHistory } from 'vue-router';
import { expect, vi } from 'vitest';

import {
  createAfterNavigationHandler,
  createApplicationRouter,
  synchronizeWebAppManifest,
} from '@/router.js';
import { isPlannedPageLeave, resetPlannedPageLeave } from '@/utils/plannedPageLeave.js';

vi.mock('@/views/Floor.vue', () => ({ default: { template: '<div />' } }));

const View = { template: '<div />' };
const routes = [
  { path: '/', name: 'Home', component: View, meta: { isPublic: true } },
  { path: '/login', name: 'Login', component: View, meta: { isPublic: true, title: 'ログイン' } },
  { path: '/public', name: 'Public', component: View, meta: { isPublic: true } },
  { path: '/protected', name: 'Protected', component: View, meta: { requiresAuth: true } },
  { path: '/management', name: 'Management', component: View, meta: { isManagement: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const createAdapters = () => {
  const state = {
    loggedIn: false,
    role: null,
  };
  return {
    state,
    auth: {
      setInert: vi.fn(),
      loadState: vi.fn(() => Promise.resolve()),
      isLoggedIn: vi.fn(() => state.loggedIn),
      userRole: vi.fn(() => state.role),
      logout: vi.fn(),
    },
  };
};

const createTestRouter = ({
  adapters = createAdapters(),
  closeNavigationUi = vi.fn(),
  pageTracker = null,
  useApplicationRoutes = false,
} = {}) => {
  const options = {
    history: createMemoryHistory(),
    auth: adapters.auth,
    closeNavigationUi,
    translate: (key) => key,
    browserWindow: window,
    documentObject: document,
    pageTracker,
  };
  if (!useApplicationRoutes) options.routes = routes;

  const router = createApplicationRouter(options);
  return { router, adapters, closeNavigationUi };
};

describe('ルート遷移とアクセス制御', () => {
  beforeEach(() => {
    resetPlannedPageLeave();
    delete window.ISeeeWebAppManifest;
    document.title = '';
  });

  it('公開ルートでは操作中のUIを閉じ、認証状態を参照せず遷移する', async () => {
    const { router, adapters, closeNavigationUi } = createTestRouter();

    await router.push('/public');
    await router.isReady();

    expect(router.currentRoute.value.name).to.equal('Public');
    expect(adapters.auth.setInert).toHaveBeenCalledWith(false);
    expect(closeNavigationUi).toHaveBeenCalledOnce();
    expect(adapters.auth.loadState).not.toHaveBeenCalled();
  });

  it('未ログインで認証必須のルートを開くと/loginへ移動する', async () => {
    const { router, adapters } = createTestRouter();

    await router.push('/protected');
    await router.isReady();

    expect(router.currentRoute.value.path).to.equal('/login');
    expect(adapters.auth.loadState).toHaveBeenCalledOnce();
    expect(adapters.auth.logout).toHaveBeenCalledOnce();
  });

  it('管理ルートは管理者だけを許可する', async () => {
    const denied = createAdapters();
    denied.state.loggedIn = true;
    denied.state.role = 'User';
    const deniedRouter = createTestRouter({ adapters: denied }).router;
    await deniedRouter.push('/management');
    await deniedRouter.isReady();
    expect(deniedRouter.currentRoute.value.path).to.equal('/login');

    const allowed = createAdapters();
    allowed.state.loggedIn = true;
    allowed.state.role = 'Administrator';
    const allowedRouter = createTestRouter({ adapters: allowed }).router;
    await allowedRouter.push('/management');
    await allowedRouter.isReady();
    expect(allowedRouter.currentRoute.value.name).to.equal('Management');
  });

  it('未知のルートはホームへ移動する', async () => {
    const { router } = createTestRouter();

    await router.push('/not-found');
    await router.isReady();

    expect(router.currentRoute.value.name).to.equal('Home');
  });

  it('リクエストログ管理のURLは未定義ルートとしてホームへ移動する', async () => {
    const adapters = createAdapters();
    adapters.state.loggedIn = true;
    adapters.state.role = 'Administrator';
    const { router } = createTestRouter({ adapters, useApplicationRoutes: true });

    await router.push('/management/log');
    await router.isReady();

    expect(router.currentRoute.value.path).to.equal('/');
    expect(router.currentRoute.value.name).to.equal('Floor');
  });

  it.each(['/floor/floor-id/quick-text', '/room/room-id/quick-text'])(
    '廃止した単語ページ %s はフロア一覧へ移動する',
    async (path) => {
      const { router } = createTestRouter({ useApplicationRoutes: true });

      await router.push(path);
      await router.isReady();

      expect(router.currentRoute.value.path).to.equal('/');
      expect(router.currentRoute.value.name).to.equal('Floor');
    }
  );

  it('遷移後に文書タイトルを更新する', async () => {
    const { router } = createTestRouter();
    await router.push('/public');
    await router.isReady();

    await router.push('/login');
    await nextTick();

    expect(document.title).to.equal('アイシータイムライン ログイン');
  });

  it('文書タイトルの更新後にアクセス解析へ遷移成功を通知する', async () => {
    const calls = [];
    const pageTracker = {
      handleNavigation: vi.fn(() => calls.push(`track:${document.title}`)),
    };
    const { router } = createTestRouter({ pageTracker });

    await router.push('/login');
    await router.isReady();
    await nextTick();

    expect(pageTracker.handleNavigation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Login' }),
      undefined
    );
    expect(calls).to.deep.equal(['track:アイシータイムライン ログイン']);
  });

  it('ブラウザの戻る・進むで実際の閲覧順に移動する', async () => {
    const { router } = createTestRouter();
    await router.push('/public');
    await router.push('/login');
    const move = (action) => new Promise((resolve) => {
      const remove = router.afterEach(() => { remove(); resolve(); });
      action();
    });
    await move(() => router.back());
    expect(router.currentRoute.value.path).to.equal('/public');
    await move(() => router.forward());
    expect(router.currentRoute.value.path).to.equal('/login');
  });

  it('manifest APIがあれば現在URLに合わせてリンクを更新する', async () => {
    const updateManifestLink = vi.fn();
    window.ISeeeWebAppManifest = { updateManifestLink };
    const { router } = createTestRouter();

    await router.push('/public');
    await router.isReady();

    expect(updateManifestLink).toHaveBeenCalledWith(document, window.location);
  });
});

describe('Webアプリマニフェストの同期', () => {
  it('iOSでマニフェストの切替条件を満たす場合は離脱予定として1回だけ再読込する', () => {
    const reload = vi.fn();
    const browserWindow = {
      location: {
        pathname: '/floor/0123456789abcdef01234567',
        reload,
      },
      navigator: { userAgent: 'iPhone Safari' },
      matchMedia: () => ({ matches: false }),
      ISeeeWebAppManifest: {
        updateManifestLink: vi.fn(),
        shouldReloadForManifest: () => true,
      },
    };

    expect(synchronizeWebAppManifest(browserWindow, document)).to.equal(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(isPlannedPageLeave()).to.equal(true);
  });

  it('マニフェスト更新による再読込ではアクセス解析へ遷移を通知しない', () => {
    const pageTracker = { handleNavigation: vi.fn() };
    const handler = createAfterNavigationHandler({
      translate: (key) => key,
      browserWindow: {
        location: { pathname: '/floor/0123456789abcdef01234567', reload: vi.fn() },
        navigator: { userAgent: 'iPhone Safari' },
        matchMedia: () => ({ matches: false }),
        ISeeeWebAppManifest: {
          updateManifestLink: vi.fn(),
          shouldReloadForManifest: () => true,
        },
      },
      documentObject: document,
      pageTracker,
    });

    handler({ name: 'Room' }, null, undefined);

    expect(pageTracker.handleNavigation).not.toHaveBeenCalled();
  });
});
