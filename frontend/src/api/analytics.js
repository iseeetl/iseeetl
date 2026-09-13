import apiClient from '@/api/apiClient';

export const ANALYTICS_CONFIG_REQUEST_TIMEOUT_MS = 5000;

const fetchConfig = () =>
  apiClient.get('/api/analytics/config', {
    skipGuestRefresh: true,
    timeout: ANALYTICS_CONFIG_REQUEST_TIMEOUT_MS,
  });

const fetchIdentity = ({ signal } = {}) =>
  apiClient.get('/api/analytics/identity', {
    skipGuestRefresh: true,
    ...(signal ? { signal } : {}),
  });

export default {
  fetchConfig,
  fetchIdentity,
};
