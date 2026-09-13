import apiClient, { buildRequestConfig } from '@/api/apiClient';

const list = (payload, options) => apiClient.post('/api/kickeduser', payload, buildRequestConfig(options));

const create = (payload, options) => apiClient.post('/api/kickeduser/create', payload, buildRequestConfig(options));

const remove = (payload, options) => apiClient.post('/api/kickeduser/delete', payload, buildRequestConfig(options));

const check = (payload, options) => apiClient.post('/api/kickeduser/check', payload, buildRequestConfig(options));

export default {
  list,
  create,
  remove,
  check,
};
