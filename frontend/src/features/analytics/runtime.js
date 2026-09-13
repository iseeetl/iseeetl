import {
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_PARAMETER_ALLOWLIST,
  buildAnalyticsEventPayload,
  buildAnalyticsPageContext,
} from './contract.js';

export const GOOGLE_TAG_SCRIPT_ID = 'iseeetl-google-analytics-tag';
export const GOOGLE_TAG_BASE_URL = 'https://www.googletagmanager.com/gtag/js';
export const GOOGLE_TAG_LOAD_TIMEOUT_MS = 5000;
export const GOOGLE_ANALYTICS_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/u;

export const normalizeAnalyticsConfigResponse = (response) => {
  const data = response?.data;
  const descriptor = data && typeof data === 'object'
    ? Object.getOwnPropertyDescriptor(data, 'measurement_id')
    : null;
  const measurementId = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ? descriptor.value
    : null;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).length !== 1 ||
    typeof measurementId !== 'string' ||
    measurementId.trim() !== measurementId ||
    !GOOGLE_ANALYTICS_MEASUREMENT_ID_PATTERN.test(measurementId)
  ) {
    throw new TypeError('analytics config response is invalid');
  }
  return Object.freeze({ measurementId });
};

const REGISTERED_ANALYTICS_USER_ID = /^ga1_[a-f0-9]{64}$/u;
const VISITOR_TYPES = new Set(['guest', 'registered']);
const FIXED_CONFIG = Object.freeze({
  send_page_view: false,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  cookie_domain: 'none',
  cookie_path: '/',
});

const buildGoogleTagUrl = (measurementId) =>
  `${GOOGLE_TAG_BASE_URL}?id=${encodeURIComponent(measurementId)}`;

export const loadGoogleTagScript = ({
  measurementId,
  documentObject = typeof document === 'undefined' ? null : document,
  windowObject = typeof window === 'undefined' ? null : window,
} = {}) => {
  if (!measurementId || !documentObject || !windowObject) return Promise.resolve(false);

  const source = buildGoogleTagUrl(measurementId);
  const existingScript = documentObject.getElementById(GOOGLE_TAG_SCRIPT_ID);
  if (existingScript && existingScript.src !== source) {
    return Promise.reject(new Error('Google tag already uses a different Measurement ID.'));
  }
  if (existingScript?.dataset?.loaded === 'true') return Promise.resolve(true);

  const script = existingScript || documentObject.createElement('script');
  if (!existingScript) {
    script.id = GOOGLE_TAG_SCRIPT_ID;
    script.src = source;
    script.async = true;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;

    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      windowObject.clearTimeout(timeoutId);
    };
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleLoad = () => {
      settle(() => {
        script.dataset.loaded = 'true';
        resolve(true);
      });
    };
    const handleError = () => {
      settle(() => {
        script.remove();
        reject(new Error('Google tag failed to load.'));
      });
    };
    const handleTimeout = () => {
      settle(() => {
        script.remove();
        reject(new Error('Google tag load timed out.'));
      });
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    timeoutId = windowObject.setTimeout(handleTimeout, GOOGLE_TAG_LOAD_TIMEOUT_MS);
    if (!existingScript) documentObject.head.appendChild(script);
  });
};

const normalizeIdentity = ({ userId, visitorType } = {}) => {
  if (!VISITOR_TYPES.has(visitorType)) return null;
  if (visitorType === 'guest') {
    if (userId !== undefined && userId !== null && userId !== '') return null;
    return Object.freeze({ visitorType: 'guest' });
  }
  if (typeof userId !== 'string' || !REGISTERED_ANALYTICS_USER_ID.test(userId)) return null;
  return Object.freeze({ visitorType: 'registered', userId });
};

export const createAnalyticsRuntime = ({
  windowObject = typeof window === 'undefined' ? null : window,
  documentObject = typeof document === 'undefined' ? null : document,
  loadGoogleTag = loadGoogleTagScript,
  now = () => new Date(),
  getIdentity = () => null,
} = {}) => {
  let measurementId = '';

  let disposed = false;
  let paused = true;
  let ready = false;
  let generation = 0;
  let tagLoaded = false;
  let tagLoadPromise = null;
  let javascriptInitialized = false;
  let configured = false;
  let registeredIdentityConfigured = false;
  let currentPageContext = null;

  const setDisabled = (disabled) => {
    if (!windowObject || !measurementId) return false;
    try {
      windowObject[`ga-disable-${measurementId}`] = disabled;
      return true;
    } catch (_error) {
      return false;
    }
  };

  const configure = ({ measurementId: nextMeasurementId } = {}) => {
    if (
      disposed ||
      typeof nextMeasurementId !== 'string' ||
      !GOOGLE_ANALYTICS_MEASUREMENT_ID_PATTERN.test(nextMeasurementId)
    ) {
      return false;
    }
    if (measurementId) return measurementId === nextMeasurementId;
    measurementId = nextMeasurementId;
    if (!setDisabled(true)) {
      measurementId = '';
      return false;
    }
    return true;
  };

  const ensureDataLayer = () => {
    if (!windowObject) return null;
    try {
      if (!windowObject.dataLayer) windowObject.dataLayer = [];
      return typeof windowObject.dataLayer.push === 'function' ? windowObject.dataLayer : null;
    } catch (_error) {
      return null;
    }
  };

  const pushCommand = function () {
    try {
      const dataLayer = ensureDataLayer();
      if (!dataLayer) return false;
      dataLayer.push(arguments);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const readIdentity = () => {
    try {
      return normalizeIdentity(getIdentity());
    } catch (_error) {
      return null;
    }
  };

  const normalizePageContext = (pageContext, identity) => {
    if (!identity || !pageContext || typeof pageContext !== 'object') return null;
    const candidate = {
      page_group: pageContext.page_group,
      page_location: pageContext.page_location,
      page_title: pageContext.page_title,
      visitor_type: identity.visitorType,
    };
    if (Object.prototype.hasOwnProperty.call(pageContext, 'page_referrer')) {
      candidate.page_referrer = pageContext.page_referrer;
    }
    ['floor_id', 'floor_title', 'room_id', 'room_title'].forEach((name) => {
      if (Object.prototype.hasOwnProperty.call(pageContext, name)) {
        candidate[name] = pageContext[name];
      }
    });
    const payload = buildAnalyticsPageContext(candidate);
    if (!payload) return null;
    return Object.freeze({
      page_group: payload.page_group,
      page_location: payload.page_location,
      page_title: payload.page_title,
      page_referrer: payload.page_referrer || '',
      floor_id: payload.floor_id || null,
      floor_title: payload.floor_title || null,
      room_id: payload.room_id || null,
      room_title: payload.room_title || null,
      visitor_type: payload.visitor_type,
    });
  };

  const buildConfiguration = (
    identity,
    pageContext,
    { clearUserId = false, update = false } = {}
  ) => ({
    ...FIXED_CONFIG,
    ...(update ? { update: true } : {}),
    ...pageContext,
    ...(clearUserId
      ? { user_id: null }
      : identity?.visitorType === 'registered'
        ? { user_id: identity.userId }
        : {}),
  });

  const pushConfiguration = (identity, pageContext, options) =>
    pushCommand('config', measurementId, buildConfiguration(identity, pageContext, options));

  const ensureTagLoaded = () => {
    if (tagLoaded) return Promise.resolve(true);
    if (!tagLoadPromise) {
      tagLoadPromise = Promise.resolve()
        .then(() =>
          loadGoogleTag({
            measurementId,
            source: buildGoogleTagUrl(measurementId),
            documentObject,
            windowObject,
          })
        )
        .then((result) => {
          if (result === false) throw new Error('Google tag loader was unavailable.');
          tagLoaded = true;
          return true;
        })
        .catch((error) => {
          tagLoadPromise = null;
          throw error;
        });
    }
    return tagLoadPromise;
  };

  const suspend = () => {
    generation += 1;
    paused = true;
    ready = false;
    return !measurementId || setDisabled(true);
  };

  const failClosed = () => {
    suspend();
    return false;
  };

  const pause = () => {
    if (disposed) return false;
    return suspend();
  };

  const resume = async ({ pageContext } = {}) => {
    const initialIdentity = readIdentity();
    if (
      disposed ||
      !measurementId ||
      !windowObject ||
      !documentObject ||
      !normalizePageContext(pageContext, initialIdentity)
    ) {
      return failClosed();
    }

    generation += 1;
    const activeGeneration = generation;
    paused = false;
    ready = false;
    if (!setDisabled(true)) return failClosed();

    if (!ensureDataLayer()) return failClosed();

    try {
      await ensureTagLoaded();
    } catch (_error) {
      if (activeGeneration === generation && !disposed) failClosed();
      return false;
    }

    if (disposed || paused || activeGeneration !== generation) return false;

    if (!javascriptInitialized) {
      if (!pushCommand('js', now())) return failClosed();
      javascriptInitialized = true;
    }
    const currentIdentity = readIdentity();
    const normalizedPageContext = normalizePageContext(pageContext, currentIdentity);
    if (
      !currentIdentity ||
      !normalizedPageContext ||
      !pushConfiguration(currentIdentity, normalizedPageContext, { update: configured })
    ) {
      return failClosed();
    }

    configured = true;
    currentPageContext = normalizedPageContext;
    registeredIdentityConfigured = currentIdentity.visitorType === 'registered';
    if (!setDisabled(false)) return failClosed();
    ready = true;
    return true;
  };

  const clearUserIdentity = () => {
    if (disposed) return false;
    if (!registeredIdentityConfigured || !configured) return false;
    const cleared = pushConfiguration(null, currentPageContext, {
      clearUserId: true,
      update: true,
    });
    if (cleared) registeredIdentityConfigured = false;
    return cleared;
  };

  const clearPageContext = () => {
    if (disposed || !paused) return false;
    currentPageContext = null;
    return true;
  };

  const updatePageContext = (pageContext) => {
    const currentIdentity = readIdentity();
    const normalizedPageContext = normalizePageContext(pageContext, currentIdentity);
    if (
      disposed ||
      paused ||
      !ready ||
      !configured ||
      !normalizedPageContext ||
      !pushConfiguration(currentIdentity, normalizedPageContext, { update: true })
    ) {
      return false;
    }
    currentPageContext = normalizedPageContext;
    registeredIdentityConfigured = currentIdentity.visitorType === 'registered';
    return true;
  };

  const track = (eventName, parameters = {}) => {
    const currentIdentity = readIdentity();
    if (disposed || paused || !ready || !currentIdentity) return false;
    if (typeof eventName !== 'string' || eventName === '' || eventName.trim() !== eventName) return false;
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return false;

    try {
      const allowedParameters = ANALYTICS_EVENT_PARAMETER_ALLOWLIST[eventName];
      if (!allowedParameters) return false;
      const candidate = Object.create(null);
      allowedParameters.forEach((name) => {
        if (name === 'visitor_type') return;
        const descriptor = Object.getOwnPropertyDescriptor(parameters, name);
        if (!descriptor) return;
        if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          Object.defineProperty(candidate, name, {
            configurable: true,
            enumerable: true,
            value: descriptor.value,
            writable: true,
          });
        }
      });
      candidate.visitor_type = currentIdentity.visitorType;
      const payload = buildAnalyticsEventPayload(eventName, candidate);
      if (!payload) return false;
      const commandPayload = [ANALYTICS_EVENTS.PAGE_VIEW, ANALYTICS_EVENTS.PAGE_EXIT]
        .includes(eventName)
        ? {
            ...payload,
            floor_id: payload.floor_id || null,
            floor_title: payload.floor_title || null,
            room_id: payload.room_id || null,
            room_title: payload.room_title || null,
          }
        : payload;
      return pushCommand('event', eventName, commandPayload);
    } catch (_error) {
      return false;
    }
  };

  const dispose = () => {
    if (disposed) return false;
    suspend();
    registeredIdentityConfigured = false;
    currentPageContext = null;
    disposed = true;
    return true;
  };

  return Object.freeze({
    configure,
    resume,
    pause,
    dispose,
    track,
    updatePageContext,
    clearUserIdentity,
    clearPageContext,
    hasRegisteredUserId: () => registeredIdentityConfigured,
    isConfigured: () => measurementId !== '',
    isPaused: () => paused,
    isReady: () => ready,
  });
};
