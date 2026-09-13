import apiClient, { buildRequestConfig } from '@/api/apiClient';
import { buildPaginateParams } from '@/api/pagination';

const fetchDetail = () => apiClient.get('/api/user/detail');

const updateProfile = (payload, options) => apiClient.post('/api/user/update', payload, buildRequestConfig(options));

const changePassword = (payload) => apiClient.post('/api/user/changepassword', payload);

const managementPaginate = (payload) =>
  apiClient.get('/api/user/management/paginate', { params: buildPaginateParams(payload) });

const managementUpdate = (payload) => apiClient.post('/api/user/management/update', payload);
const managementSetDeleteState = (payload) =>
  apiClient.post('/api/user/management/delete-state', payload);

export default {
  fetchDetail,
  updateProfile,
  changePassword,
  managementPaginate,
  managementUpdate,
  managementSetDeleteState,
};
