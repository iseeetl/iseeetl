import apiClient, { buildBasePath, buildRequestConfig } from '@/api/apiClient';
import { buildPaginateParams } from '@/api/pagination';

const buildBase = (management) => buildBasePath('/api/room', { management });

const list = ({ floor_id, isGuest }) => {
  const url = isGuest ? '/api/room/guest' : '/api/room';
  return apiClient.post(url, { floor_id });
};

const detail = (payload) => apiClient.post('/api/room/detail', payload);

const create = (payload, options) => apiClient.post('/api/room/create', payload, buildRequestConfig(options));

const update = (payload, { management = false } = {}, options) =>
  apiClient.post(`${buildBase(management)}update`, payload, buildRequestConfig(options));

const remove = (payload) => apiClient.post('/api/room/delete', payload);

const updateDisplayOrder = (payload) => apiClient.post('/api/room/update/displayorder', payload);

const updateDisplayHidden = (payload) => apiClient.post('/api/room/update/roomdisplayhidden', payload);

const managementPaginate = (payload) => {
  const params = buildPaginateParams(payload);
  if (payload && payload.floor_id) params.floor_id = payload.floor_id;
  return apiClient.get('/api/room/management/paginate', { params });
};
const managementSetDeleteState = (payload) =>
  apiClient.post('/api/room/management/delete-state', payload);

export default {
  list,
  detail,
  create,
  update,
  remove,
  updateDisplayOrder,
  updateDisplayHidden,
  managementPaginate,
  managementSetDeleteState,
};
