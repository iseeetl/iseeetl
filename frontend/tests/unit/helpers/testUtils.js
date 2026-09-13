import { shallowMount as vueTestUtilsShallowMount } from '@vue/test-utils';

const noopDirective = {
  beforeMount() {},
  mounted() {},
  beforeUpdate() {},
  updated() {},
  beforeUnmount() {},
  unmounted() {},
};

const defaultDirectives = {
  clipboard: noopDirective,
};

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a><slot /></a>',
};

const defaultStubs = {
  RouterLink: RouterLinkStub,
  RouterView: true,
};

const listenerName = (eventName) =>
  `on${eventName
    .split(/[-:]/u)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join('')}`;

const normalizeListeners = (listeners = {}) =>
  Object.fromEntries(Object.entries(listeners).map(([eventName, handler]) => [listenerName(eventName), handler]));

const normalizeMountOptions = (options = {}) => {
  const {
    mocks = {},
    stubs = {},
    directives = {},
    listeners = {},
    scopedSlots = {},
    provide = {},
    router,
    global = {},
    attrs = {},
    ...mountOptions
  } = options;

  const plugins = [...(global.plugins || [])];
  const routerMocks = router
    ? {
        $router: router,
        $route: router._testRoute || router.currentRoute?.value || { params: {}, query: {} },
      }
    : {};

  return {
    ...mountOptions,
    attrs: {
      ...attrs,
      ...normalizeListeners(listeners),
    },
    slots: {
      ...(mountOptions.slots || {}),
      ...scopedSlots,
    },
    global: {
      ...global,
      plugins,
      mocks: {
        ...routerMocks,
        ...(global.mocks || {}),
        ...mocks,
      },
      stubs: {
        ...defaultStubs,
        ...(global.stubs || {}),
        ...stubs,
      },
      directives: {
        ...defaultDirectives,
        ...(global.directives || {}),
        ...directives,
      },
      provide: {
        ...(global.provide || {}),
        ...provide,
      },
    },
  };
};

export const setTestRoute = (router, location) => {
  router._testRoute = router.resolve(location);
  void router.replace(location);
  return router;
};

export const shallowMount = (component, options) =>
  vueTestUtilsShallowMount(component, normalizeMountOptions(options));
