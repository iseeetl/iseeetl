import apiClient, { buildRequestConfig } from '@/api/apiClient';

const bootstrap = ({ guest_name, lang }) =>
  apiClient.post(
    '/api/guest/bootstrap',
    { guest_name, lang },
    buildRequestConfig({ withCredentials: true }, { skipGuestRefresh: true })
  );

const refresh = () =>
  apiClient.post('/api/guest/refresh', null, buildRequestConfig({ withCredentials: true }, { skipGuestRefresh: true }));

export default {
  bootstrap,
  refresh,
};
