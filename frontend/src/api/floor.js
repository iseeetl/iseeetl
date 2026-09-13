import apiClient, { buildBasePath, buildRequestConfig } from '@/api/apiClient';
import { buildPaginateParams } from '@/api/pagination';

const buildBase = (management) => buildBasePath('/api/floor', { management });

const paginate = ({ page, search, isGuest }) => {
  const url = isGuest ? '/api/floor/guest/paginate' : '/api/floor/paginate';
  return apiClient.post(url, { page, search });
};

const updateDisplayHidden = ({ floor_display_hidden }) =>
  apiClient.post('/api/floor/update/floordisplayhidden', { floor_display_hidden });

const detail = (payload) => apiClient.post('/api/floor/detail', payload);

const role = (payload) => apiClient.post('/api/floor/role', payload);

const create = (payload, options) => apiClient.post('/api/floor/create', payload, buildRequestConfig(options));

const update = (payload, { management = false } = {}, options) =>
  apiClient.post(`${buildBase(management)}update`, payload, buildRequestConfig(options));

const remove = (payload) => apiClient.post('/api/floor/delete', payload);

const managementPaginate = (payload) =>
  apiClient.get('/api/floor/management/paginate', { params: buildPaginateParams(payload) });
const managementDetail = (payload) => apiClient.post('/api/floor/management/detail', payload);
const managementSetDeleteState = (payload) =>
  apiClient.post('/api/floor/management/delete-state', payload);

export default {
  paginate,
  updateDisplayHidden,
  detail,
  role,
  create,
  update,
  remove,
  managementPaginate,
  managementDetail,
  managementSetDeleteState,
};
