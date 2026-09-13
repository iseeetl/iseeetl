import { nextTick } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import managementRoutes from './routes/management.js';
import publicRoutes from './routes/public.js';
import { beginPlannedPageLeave } from './utils/plannedPageLeave.js';

const fallbackRoute = {
  path: '/:pathMatch(.*)*',
  redirect: '/',
};

const hasMeta = (route, key) => route.matched.some((record) => record.meta && record.meta[key]);

export const synchronizeWebAppManifest = (
  browserWindow = typeof window === 'undefined' ? null : window,
  documentObject = typeof document === 'undefined' ? null : document
) => {
  if (!browserWindow || !documentObject) return false;
  const manifestApi = browserWindow.ISeeeWebAppManifest;
  if (!manifestApi || typeof manifestApi.updateManifestLink !== 'function') return false;

  manifestApi.updateManifestLink(documentObject, browserWindow.location);

  const shouldReload =
    typeof manifestApi.shouldReloadForManifest === 'function' &&
    manifestApi.shouldReloadForManifest(
      browserWindow.location,
      browserWindow.navigator,
      typeof browserWindow.matchMedia === 'function' ? browserWindow.matchMedia.bind(browserWindow) : null
    );
  if (!shouldReload || !browserWindow.location || typeof browserWindow.location.reload !== 'function') return false;

  beginPlannedPageLeave();
  browserWindow.location.reload();
  return true;
};

export const createNavigationGuard =
  ({ auth, closeNavigationUi = () => {} }) =>
  async (to) => {
    auth.setInert(false);
    closeNavigationUi();

    if (hasMeta(to, 'isPublic')) return true;

    const requiresAuth = hasMeta(to, 'requiresAuth') || hasMeta(to, 'isManagement');
    if (!requiresAuth) return true;

    await auth.loadState();

    if (!auth.isLoggedIn()) {
      auth.logout();
      return { path: '/login' };
    }

    if (hasMeta(to, 'isManagement') && auth.userRole() !== 'Administrator') {
      auth.logout();
      return { path: '/login' };
    }

    return true;
  };

export const updateDocumentTitle = ({ route, translate, documentObject }) => {
  if (!documentObject) return;
  const baseTitle = translate('アイシータイムライン');
  const routeTitle = route.meta && route.meta.title ? translate(route.meta.title) : '';
  documentObject.title = routeTitle ? `${baseTitle} ${routeTitle}` : baseTitle;
};

export const createAfterNavigationHandler =
  ({ translate, browserWindow, documentObject, pageTracker }) =>
  (to, from, failure) => {
    if (synchronizeWebAppManifest(browserWindow, documentObject)) return;

    void nextTick(() => {
      updateDocumentTitle({ route: to, translate, documentObject });
      pageTracker?.handleNavigation?.(to, failure);
    });
  };

export const createApplicationRouter = ({
  history = createWebHistory('/'),
  routes = [...publicRoutes, ...managementRoutes, fallbackRoute],
  auth,
  closeNavigationUi,
  translate = (key) => key,
  browserWindow = typeof window === 'undefined' ? null : window,
  documentObject = typeof document === 'undefined' ? null : document,
  pageTracker = null,
} = {}) => {
  if (!auth) {
    throw new TypeError('createApplicationRouter requires an auth adapter.');
  }

  const router = createRouter({
    history,
    routes,
  });

  router.beforeEach(createNavigationGuard({ auth, closeNavigationUi }));
  router.afterEach(
    createAfterNavigationHandler({
      translate,
      browserWindow,
      documentObject,
      pageTracker,
    })
  );

  return router;
};
