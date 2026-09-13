import { createApp } from 'vue';

import App from './App.vue';
import store from '@/store';
import { mountApplication } from './bootstrapApp';
import { createApplicationI18n, createI18nTranslator } from './i18n';
import { createApplicationRouter } from './router';
import { setApiApplicationStore } from '@/api/apiStoreAdapter';
import analyticsApi from '@/api/analytics.js';
import {
  createAnalyticsRuntime,
  normalizeAnalyticsConfigResponse,
} from '@/features/analytics/runtime.js';
import { createIdentityCoordinator } from '@/features/analytics/identityCoordinator.js';
import { createPageTracker } from '@/features/analytics/pageTracking.js';

export const ANALYTICS_EVENT_REPORTER_INJECTION_KEY = 'analyticsEventReporter';
export const ANALYTICS_PAGE_REPORTER_INJECTION_KEY = 'analyticsPageReporter';

export const createAnalyticsServices = ({
  applicationStore,
  analyticsApiImpl = analyticsApi,
  browserWindow = typeof window === 'undefined' ? null : window,
  documentObject = typeof document === 'undefined' ? null : document,
  loadGoogleTag,
} = {}) => {
  let coordinator = null;
  let configurationState = 'idle';
  let configurationGeneration = 0;
  let initializationPromise = null;
  let initializationGeneration = null;
  let unsubscribeConfiguration = null;
  const runtime = createAnalyticsRuntime({
    windowObject: browserWindow,
    documentObject,
    getIdentity: () => coordinator?.getIdentity() || null,
    ...(loadGoogleTag ? { loadGoogleTag } : {}),
  });
  const isAvailable = () =>
    configurationState === 'ready' &&
    applicationStore?.getters?.googleAnalyticsCapabilityEnabled === true &&
    runtime.isConfigured();
  let router = null;
  const pageTracker = createPageTracker({
    runtime,
    browserWindow,
    getCurrentRoute: () => router?.currentRoute?.value || null,
    requestActivation: () => {
      if (
        !coordinator ||
        !isAvailable()
      ) {
        return false;
      }
      void coordinator.start();
      return true;
    },
  });

  coordinator = createIdentityCoordinator({
    store: applicationStore,
    fetchIdentity: analyticsApiImpl.fetchIdentity,
    runtime,
    pageTracker,
    isAvailable,
  });

  const initialize = () => {
    if (isAvailable()) return Promise.resolve(true);
    if (initializationPromise) {
      const pendingInitialization = initializationPromise;
      if (initializationGeneration === configurationGeneration) {
        return pendingInitialization;
      }
      return pendingInitialization.then(() =>
        isAvailable() ? true : initialize()
      );
    }
    if (
      applicationStore?.getters?.googleAnalyticsCapabilityEnabled !== true ||
      typeof analyticsApiImpl?.fetchConfig !== 'function'
    ) {
      configurationState = 'unavailable';
      coordinator.markUnavailable();
      return Promise.resolve(false);
    }

    configurationState = 'loading';
    const requestGeneration = configurationGeneration;
    const request = Promise.resolve()
      .then(() => analyticsApiImpl.fetchConfig())
      .then(normalizeAnalyticsConfigResponse)
      .then(async (config) => {
        if (
          requestGeneration !== configurationGeneration ||
          applicationStore?.getters?.googleAnalyticsCapabilityEnabled !== true ||
          runtime.configure(config) !== true
        ) {
          throw new Error('analytics runtime configuration is unavailable');
        }
        configurationState = 'ready';
        if (coordinator.isObserving()) {
          await coordinator.start().catch(() => false);
        }
        return true;
      })
      .catch(() => {
        if (requestGeneration === configurationGeneration) {
          configurationState = 'unavailable';
          coordinator.markUnavailable();
        }
        return false;
      })
      .finally(() => {
        if (initializationPromise === request) {
          initializationPromise = null;
          initializationGeneration = null;
        }
      });
    initializationPromise = request;
    initializationGeneration = requestGeneration;
    return request;
  };

  let observedCapability =
    applicationStore?.getters?.googleAnalyticsCapabilityEnabled === true;
  if (typeof applicationStore?.subscribe === 'function') {
    unsubscribeConfiguration = applicationStore.subscribe(() => {
      const nextCapability =
        applicationStore?.getters?.googleAnalyticsCapabilityEnabled === true;
      if (nextCapability === observedCapability) return;
      observedCapability = nextCapability;
      configurationGeneration += 1;
      if (nextCapability) {
        void initialize();
        return;
      }
      configurationState = 'unavailable';
      coordinator.markUnavailable();
    });
  }

  return Object.freeze({
    initialize,
    isAvailable,
    runtime,
    eventReporter: Object.freeze({
      track: (eventName, parameters) => runtime.track(eventName, parameters),
    }),
    pageReporter: Object.freeze({
      capture: () => pageTracker.captureResourcePage(),
      activate: (token, resource, onPageViewSent = null) =>
        pageTracker.activateResourcePage(token, resource, onPageViewSent),
      cancel: (token) => pageTracker.cancelResourcePage(token),
      beginVirtualPage: (routeName) => pageTracker.beginVirtualPage(routeName),
      endVirtualPage: (token, options) => pageTracker.endVirtualPage(token, options),
      restoreDeferredVirtualPage: (token) => pageTracker.restoreDeferredVirtualPage(token),
    }),
    pageTracker,
    coordinator,
    setRouter: (value) => { router = value; },
    dispose: () => {
      unsubscribeConfiguration?.();
      unsubscribeConfiguration = null;
      coordinator.dispose();
      runtime.dispose();
    },
  });
};

export const createStoreAdapters = (applicationStore) => ({
  auth: {
    setInert: (active) => applicationStore.dispatch('doSetInertAppContainer', active),
    loadState: () => applicationStore.dispatch('doLoadState'),
    isLoggedIn: () => applicationStore.getters.userIsLogin,
    userRole: () => applicationStore.getters.userRole,
    logout: () => applicationStore.dispatch('doLogout'),
  },
});

export const createApplication = ({
  applicationStore = store,
  createAppImpl = createApp,
  configureApp = () => undefined,
  mountApplicationImpl = mountApplication,
  mountTarget = '#app',
  analyticsApiImpl,
  browserWindow = typeof window === 'undefined' ? null : window,
  documentObject = typeof document === 'undefined' ? null : document,
} = {}) => {
  setApiApplicationStore(applicationStore);
  const i18n = createApplicationI18n();
  const adapters = createStoreAdapters(applicationStore);
  let rootComponent = null;
  const analytics = createAnalyticsServices({
    applicationStore,
    analyticsApiImpl,
    browserWindow,
    documentObject,
  });

  const router = createApplicationRouter({
    ...adapters,
    closeNavigationUi: () => {
      if (rootComponent && typeof rootComponent.closeNavigationUi === 'function') {
        rootComponent.closeNavigationUi();
      }
    },
    translate: createI18nTranslator(i18n),
    browserWindow,
    documentObject,
    pageTracker: analytics.pageTracker,
  });
  analytics.setRouter(router);

  const createVueApp = () => {
    const app = createAppImpl(App);
    app.use(applicationStore);
    app.use(router);
    app.use(i18n);
    app.provide?.(ANALYTICS_EVENT_REPORTER_INJECTION_KEY, analytics.eventReporter);
    app.provide?.(ANALYTICS_PAGE_REPORTER_INJECTION_KEY, analytics.pageReporter);
    app.onUnmount?.(analytics.dispose);
    configureApp(app, { applicationStore, router, i18n });
    return app;
  };

  const mountVueApp = (app) => {
    rootComponent = app.mount(mountTarget);
    return rootComponent;
  };

  return {
    store: applicationStore,
    router,
    i18n,
    analytics,
    start: () =>
      mountApplicationImpl({
        store: applicationStore,
        router,
        createVueApp,
        mountVueApp,
        analytics,
      }),
  };
};
