import axios from 'axios';
import { getApiApplicationStore } from '@/api/apiStoreAdapter';
import { resolveApiErrorTranslationKey } from '@/api/apiErrorMessages';
import { captureAuthSnapshot, isAuthSnapshotCurrent, isSameAuthSnapshot } from '@/store/root/authRuntime.js';

const requestAuthSnapshots = new WeakMap();

const resolveApiBaseUrl = () => {
  return import.meta.env.VITE_APP_URL || '';
};

const API_BASE_URL = resolveApiBaseUrl();

const normalizeUrl = (url) => {
  if (!API_BASE_URL || typeof url !== 'string') return url;
  if (!url.startsWith(API_BASE_URL)) return url;
  const trimmed = url.slice(API_BASE_URL.length);
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const normalizeBasePath = (basePath) => {
  if (!basePath) return '';
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
};

const buildBasePath = (basePath, { management = false } = {}) => {
  const normalized = normalizeBasePath(basePath);
  if (!normalized) return '';
  return management ? `${normalized}/management/` : `${normalized}/`;
};

const buildRequestConfig = (options = {}, baseConfig) => {
  const config = baseConfig ? { ...baseConfig } : {};
  if (!options) return config;
  if (options.onUploadProgress) config.onUploadProgress = options.onUploadProgress;
  if (options.withCredentials) config.withCredentials = true;
  if (options.responseType) config.responseType = options.responseType;
  if (options.params) config.params = options.params;
  return config;
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const store = getApiApplicationStore();
  requestAuthSnapshots.set(config, captureAuthSnapshot(store));
  config.url = normalizeUrl(config.url);
  if (!config.headers) config.headers = {};
  const existingAuth = config.headers.authorization || config.headers.Authorization;
  const userToken = store?.getters?.userToken;
  if (!existingAuth && userToken) {
    config.headers.authorization = `Bearer ${userToken}`;
  }
  config._userAuthRequest = Boolean(existingAuth || userToken);
  const guestTokenHeader = config.headers['X-Guest-Token'] || config.headers['x-guest-token'];
  if (!guestTokenHeader && !store?.getters?.userIsLogin) {
    const guestToken = store?.getters?.guestToken;
    if (guestToken) config.headers['X-Guest-Token'] = guestToken;
  }
  return config;
});

const isUnauthorized = (error) => error?.response?.status === 401;

const SESSION_UNAUTHORIZED_CODES = new Set(['TOKEN_INVALID', 'TOKEN_EXPIRED', 'UNAUTHORIZED']);

const getApiErrorCode = (error) => error?.response?.data?.error?.code || error?.response?.data?.code || null;

const isAuthenticationUnauthorized = (error) => {
  if (!isUnauthorized(error)) return false;
  const code = getApiErrorCode(error);
  return !code || SESSION_UNAUTHORIZED_CODES.has(code);
};

let guestRefreshRequest = null;
const refreshGuestToken = (authSnapshot) => {
  if (
    guestRefreshRequest &&
    isSameAuthSnapshot(guestRefreshRequest.authSnapshot, authSnapshot) &&
    isAuthSnapshotCurrent(authSnapshot)
  ) {
    return guestRefreshRequest.promise;
  }
  const store = getApiApplicationStore();
  const promise = store.dispatch('doRefreshGuestToken', { authSnapshot }).finally(() => {
    if (guestRefreshRequest?.promise === promise) guestRefreshRequest = null;
  });
  guestRefreshRequest = { authSnapshot, promise };
  return promise;
};

let userLogoutRequest = null;
const logoutUser = (authSnapshot) => {
  if (
    userLogoutRequest &&
    isSameAuthSnapshot(userLogoutRequest.authSnapshot, authSnapshot) &&
    isAuthSnapshotCurrent(authSnapshot)
  ) {
    return userLogoutRequest.promise;
  }

  const store = getApiApplicationStore();
  const promise = Promise.resolve()
    .then(() => store.dispatch('doLogout', { authSnapshot }))
    .catch(() => undefined)
    .finally(() => {
      if (userLogoutRequest?.promise === promise) userLogoutRequest = null;
    });
  userLogoutRequest = { authSnapshot, promise };
  return promise;
};

const markUserLogoutHandled = (error) => {
  if (!error.config) error.config = {};
  error.config._userLogoutHandled = true;
};

const handleUnauthorized = async (error) => {
  if (!isUnauthorized(error)) return Promise.reject(error);

  const config = error?.config || {};
  if (config.skipAuthRecovery) return Promise.reject(error);
  if (!isAuthenticationUnauthorized(error)) return Promise.reject(error);

  const store = getApiApplicationStore();
  const authSnapshot = requestAuthSnapshots.get(config) || captureAuthSnapshot(store);
  if (!isAuthSnapshotCurrent(authSnapshot)) {
    markUserLogoutHandled(error);
    return Promise.reject(error);
  }
  const isLogin = store?.getters?.userIsLogin;
  const matchingLogout =
    userLogoutRequest && isSameAuthSnapshot(userLogoutRequest.authSnapshot, authSnapshot);
  if (matchingLogout || isLogin) {
    markUserLogoutHandled(error);
    await logoutUser(authSnapshot);
    return Promise.reject(error);
  }

  if (config._userAuthRequest) {
    markUserLogoutHandled(error);
    return Promise.reject(error);
  }

  if (config._guestRetry || config.skipGuestRefresh) {
    return Promise.reject(error);
  }

  try {
    await refreshGuestToken(authSnapshot);
    if (!isAuthSnapshotCurrent(authSnapshot)) return Promise.reject(error);
    config._guestRetry = true;
    if (!isAuthSnapshotCurrent(authSnapshot)) return Promise.reject(error);
    return apiClient(config);
  } catch {
    return Promise.reject(error);
  }
};

apiClient.interceptors.response.use((response) => response, handleUnauthorized);

const withAuth = (token, config = {}) => {
  if (!token) return config;
  const rawToken = String(token);
  const headerValue = rawToken.startsWith('Bearer ') ? rawToken : `Bearer ${rawToken}`;
  const headers = { ...(config.headers || {}), authorization: headerValue };
  return { ...config, headers };
};

const extractErrorPayload = (data) => {
  if (!data || typeof data !== 'object') return null;
  if (!data.error || typeof data.error !== 'object') return null;
  return data.error;
};

const normalizeApiError = (error) => {
  const response = error?.response;
  const payload = extractErrorPayload(response?.data);
  const code = payload?.code || null;
  const requestId = payload?.requestId || null;
  const details = payload?.details || null;
  const message =
    payload?.message ||
    (typeof response?.data === 'string' ? response.data : null) ||
    response?.statusText ||
    error?.message ||
    null;
  return {
    status: response?.status || null,
    code,
    message,
    requestId,
    details,
  };
};

const applyTranslation = (message, translate) => {
  if (!message || typeof translate !== 'function') return message;
  try {
    return translate(message);
  } catch {
    return message;
  }
};

const formatApiErrorMessage = (error, { translate } = {}) => {
  const normalized = normalizeApiError(error);
  if (!normalized.code && !normalized.message && !normalized.status) {
    return { ...normalized, displayMessage: '' };
  }
  let message = resolveApiErrorTranslationKey(
    normalized.code,
    normalized.details,
    normalized.status
  );
  message = applyTranslation(message, translate);

  return { ...normalized, displayMessage: message };
};

const appendApiErrorMessage = (baseMessage, error, { translate, wrapper = 'space' } = {}) => {
  const { displayMessage } = formatApiErrorMessage(error, { translate });
  if (!displayMessage) return baseMessage;
  if (wrapper === 'paren') return `${baseMessage}（${displayMessage}）`;
  if (wrapper === 'bracket') return `${baseMessage} (${displayMessage})`;
  if (wrapper === 'space') return `${baseMessage} ${displayMessage}`;
  return `${baseMessage}${wrapper}${displayMessage}`;
};

export {
  API_BASE_URL,
  buildBasePath,
  buildRequestConfig,
  withAuth,
  isUnauthorized,
  isAuthenticationUnauthorized,
  normalizeApiError,
  formatApiErrorMessage,
  appendApiErrorMessage,
};
export default apiClient;
