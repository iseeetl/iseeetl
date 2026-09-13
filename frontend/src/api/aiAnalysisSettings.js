import apiClient, { buildRequestConfig } from '@/api/apiClient';

const buildCommonPaginateParams = (payload = {}) => ({
  page: payload.page,
  search: payload.search ?? '',
});

const common = {
  defaultResultUser: (options) =>
    apiClient.post('/api/aianalysissetting/management/default-result-user', {}, buildRequestConfig(options)),
  list: (payload = {}, options) =>
    apiClient.post('/api/aianalysissetting/management', payload, buildRequestConfig(options)),
  paginate: (payload, options) =>
    apiClient.get(
      '/api/aianalysissetting/management/paginate',
      buildRequestConfig(options, { params: buildCommonPaginateParams(payload) })
    ),
  create: (payload, options) =>
    apiClient.post('/api/aianalysissetting/management/create', payload, buildRequestConfig(options)),
  update: (payload, options) =>
    apiClient.post('/api/aianalysissetting/management/update', payload, buildRequestConfig(options)),
  remove: (payload, options) =>
    apiClient.post('/api/aianalysissetting/management/delete', payload, buildRequestConfig(options)),
};

const buildScopedApi = (basePath) => ({
  defaultResultUser: (payload, options) =>
    apiClient.post(`${basePath}/default-result-user`, payload, buildRequestConfig(options)),
  list: (payload, options) => apiClient.post(basePath, payload, buildRequestConfig(options)),
  create: (payload, options) => apiClient.post(`${basePath}/create`, payload, buildRequestConfig(options)),
  update: (payload, options) => apiClient.post(`${basePath}/update`, payload, buildRequestConfig(options)),
  remove: (payload, options) => apiClient.post(`${basePath}/delete`, payload, buildRequestConfig(options)),
  searchResultUsers: (payload, options) =>
    apiClient.post(`${basePath}/result-users/search`, payload, buildRequestConfig(options)),
});

const categoryTags = {
  list: (payload = {}, options) =>
    apiClient.post('/api/categorytag/management', payload, buildRequestConfig(options)),
};

const resultUsers = {
  search: (payload, options) =>
    apiClient.post('/api/user/ai-analysis-result-users/search', payload, buildRequestConfig(options)),
};

export { buildCommonPaginateParams };

export default {
  common,
  floor: buildScopedApi('/api/flooraianalysissetting'),
  room: buildScopedApi('/api/roomaianalysissetting'),
  categoryTags,
  resultUsers,
};
