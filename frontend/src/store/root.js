import { authDomain } from './root/auth.js';
import { authRuntimePlugin } from './root/authRuntime.js';
import { capabilitiesDomain } from './root/capabilities.js';
import { contextDomain } from './root/context.js';
import { feedbackDomain } from './root/feedback.js';
import { persistenceDomain, saveState } from './root/persistence.js';
import { preferencesDomain } from './root/preferences.js';
import { createRootState } from './rootState.js';

const domains = [
  authDomain,
  capabilitiesDomain,
  contextDomain,
  preferencesDomain,
  feedbackDomain,
  persistenceDomain,
];

const mergeDomainSection = (section) =>
  domains.reduce((merged, domain) => Object.assign(merged, domain[section] || {}), {});

export default {
  state: createRootState(),
  getters: mergeDomainSection('getters'),
  mutations: mergeDomainSection('mutations'),
  actions: mergeDomainSection('actions'),
  plugins: [saveState, authRuntimePlugin],
};
