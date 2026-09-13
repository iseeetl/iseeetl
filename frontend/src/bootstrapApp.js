import { initializeOneSignalSdk } from '@/utils/onesignalHelpers';

const swallowBootstrapError = (phase) => (error) => {
  const logger =
    (typeof window !== 'undefined' && window.console) ||
    (typeof globalThis !== 'undefined' && globalThis.console);
  if (logger && typeof logger.error === 'function') {
    logger.error(`[bootstrapApp] ${phase} failed`, error);
  }
  return null;
};

const startAnalyticsInitialization = (analytics) => {
  if (!analytics || typeof analytics.initialize !== 'function') return;

  try {
    void Promise.resolve(analytics.initialize()).catch(
      swallowBootstrapError('initializeAnalytics')
    );
  } catch (error) {
    swallowBootstrapError('initializeAnalytics')(error);
  }
};

const initializeApplicationState = async (store, initializeOneSignalSdkImpl, analytics) => {
  if (!store || typeof store.dispatch !== 'function') return;

  await store.dispatch('doLoadState').catch(swallowBootstrapError('doLoadState'));
  await store.dispatch('doLoadCapabilities').catch(swallowBootstrapError('doLoadCapabilities'));
  startAnalyticsInitialization(analytics);
  if (store.getters?.oneSignalPushAvailable === true) {
    const initialized = await initializeOneSignalSdkImpl()
      .then((result) => result === true)
      .catch((error) => {
        swallowBootstrapError('initializeOneSignalSdk')(error);
        return false;
      });
    if (initialized) {
      await store.dispatch('doEnsureOneSignalIdentity').catch(swallowBootstrapError('doEnsureOneSignalIdentity'));
    }
  }
  await store.dispatch('doEnsureGuestAuth').catch(swallowBootstrapError('doEnsureGuestAuth'));
  analytics?.coordinator?.observe?.();
};

export const mountApplication = async ({
  store,
  router,
  createVueApp,
  mountVueApp,
  initializeOneSignalSdkImpl = initializeOneSignalSdk,
  analytics = null,
}) => {
  await initializeApplicationState(store, initializeOneSignalSdkImpl, analytics);

  const app = typeof createVueApp === 'function' ? createVueApp() : null;
  if (router && typeof router.isReady === 'function') {
    await router.isReady();
  }

  return typeof mountVueApp === 'function' ? mountVueApp(app) : app;
};

// アプリの生成までを行う呼び出し元向け。ルートの準備とマウントは行わない。
export const bootstrapApp = ({ store, createVueApp, initializeOneSignalSdkImpl = initializeOneSignalSdk }) =>
  mountApplication({
    store,
    router: null,
    createVueApp,
    mountVueApp: null,
    initializeOneSignalSdkImpl,
  });
