import apiClient, { buildRequestConfig } from '@/api/apiClient';
import { buildPaginateParams } from '@/api/pagination';

const list = (payload, options) => apiClient.post('/api/roommember', payload, buildRequestConfig(options));

const invite = (payload, options) => apiClient.post('/api/roommember/invite', payload, buildRequestConfig(options));

const leave = (payload, options) => apiClient.post('/api/roommember/leave', payload, buildRequestConfig(options));

const remove = (payload, options) => apiClient.post('/api/roommember/delete', payload, buildRequestConfig(options));

const createByInvite = (payload, options) =>
  apiClient.post('/api/roommember/create', payload, buildRequestConfig(options));

const managementPaginate = (payload, options) =>
  apiClient.get(
    '/api/roommember/management/paginate',
    buildRequestConfig(options, { params: buildPaginateParams(payload) })
  );

const managementDelete = (payload, options) =>
  apiClient.post('/api/roommember/management/delete', payload, buildRequestConfig(options));

export default {
  list,
  invite,
  leave,
  remove,
  createByInvite,
  managementPaginate,
  managementDelete,
};
