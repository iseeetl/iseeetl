import { createStore } from 'vuex';

import root from './root.js';
import { createRootState } from './rootState.js';

const storeOptions = {
  ...root,
};

export const createApplicationStore = (overrides = {}) =>
  createStore({
    ...storeOptions,
    state: createRootState(),
    ...overrides,
    modules: {
      ...(storeOptions.modules || {}),
      ...(overrides.modules || {}),
    },
  });

const store = createApplicationStore();

export default store;
