import apiClient from '@/api/apiClient';

export const CAPABILITIES_REQUEST_TIMEOUT_MS = 5000;

const fetchCapabilities = () =>
  apiClient.get('/api/capabilities', {
    timeout: CAPABILITIES_REQUEST_TIMEOUT_MS,
    skipGuestRefresh: true,
  });

export default {
  fetchCapabilities,
};
