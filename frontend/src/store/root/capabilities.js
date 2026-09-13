const getCapabilitiesApi = async () => {
  const capabilitiesApiModule = await import('@/api/capabilities.js');
  return capabilitiesApiModule?.default || capabilitiesApiModule;
};

const LEGACY_CAPABILITY_KEYS = Object.freeze([
  'googleLogin',
  'lineLogin',
  'mailDelivery',
  'oneSignalPush',
  'googleTranslate',
  'openaiTranscription',
  'openaiAnalysis',
]);

export const CAPABILITY_KEYS = Object.freeze([...LEGACY_CAPABILITY_KEYS, 'googleAnalytics']);

export const createCapabilityValues = () =>
  CAPABILITY_KEYS.reduce((values, key) => {
    values[key] = false;
    return values;
  }, {});

export const createCapabilitiesState = () => ({
  status: 'idle',
  values: createCapabilityValues(),
});

export const normalizeCapabilityValues = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('capability response must be an object');
  }
  const responseKeys = Object.keys(payload);
  if (
    (responseKeys.length !== LEGACY_CAPABILITY_KEYS.length && responseKeys.length !== CAPABILITY_KEYS.length) ||
    responseKeys.some((key) => !CAPABILITY_KEYS.includes(key))
  ) {
    throw new TypeError('capability response must contain only supported keys');
  }

  return CAPABILITY_KEYS.reduce((values, key) => {
    if (key === 'googleAnalytics' && !Object.prototype.hasOwnProperty.call(payload, key)) {
      values[key] = false;
      return values;
    }
    if (!Object.prototype.hasOwnProperty.call(payload, key) || typeof payload[key] !== 'boolean') {
      throw new TypeError(`capability response must contain boolean ${key}`);
    }
    values[key] = payload[key];
    return values;
  }, {});
};

const hasPublicConfigValue = (value) => typeof value === 'string' && value.trim().length > 0;
const capabilityEnabled = (state, key) =>
  state.capabilities.status === 'ready' && state.capabilities.values[key] === true;

export const capabilitiesDomain = {
  getters: {
    capabilityStatus: (state) => state.capabilities.status,
    capabilitiesFailed: (state) => state.capabilities.status === 'error',
    googleLoginAvailable: (state) =>
      capabilityEnabled(state, 'googleLogin') &&
      hasPublicConfigValue(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID),
    lineLoginAvailable: (state) => capabilityEnabled(state, 'lineLogin'),
    mailDeliveryAvailable: (state) => capabilityEnabled(state, 'mailDelivery'),
    oneSignalPushAvailable: (state) =>
      capabilityEnabled(state, 'oneSignalPush') && hasPublicConfigValue(import.meta.env.VITE_ONESIGNAL_APP_ID),
    googleTranslateAvailable: (state) => capabilityEnabled(state, 'googleTranslate'),
    openaiTranscriptionAvailable: (state) => capabilityEnabled(state, 'openaiTranscription'),
    openaiAnalysisAvailable: (state) => capabilityEnabled(state, 'openaiAnalysis'),
    googleAnalyticsCapabilityEnabled: (state) => capabilityEnabled(state, 'googleAnalytics'),
  },
  mutations: {
    startCapabilitiesLoad(state) {
      state.capabilities.status = 'loading';
      state.capabilities.values = createCapabilityValues();
    },
    setCapabilitiesReady(state, values) {
      state.capabilities.status = 'ready';
      state.capabilities.values = normalizeCapabilityValues(values);
    },
    setCapabilitiesError(state) {
      state.capabilities.status = 'error';
      state.capabilities.values = createCapabilityValues();
    },
  },
  actions: {
    async doLoadCapabilities({ commit }) {
      commit('startCapabilitiesLoad');
      try {
        const capabilitiesApi = await getCapabilitiesApi();
        const response = await capabilitiesApi.fetchCapabilities();
        const values = normalizeCapabilityValues(response?.data);
        commit('setCapabilitiesReady', values);
        return values;
      } catch {
        const values = createCapabilityValues();
        commit('setCapabilitiesError');
        return values;
      }
    },
  },
};
