import apiClient, { buildRequestConfig } from '@/api/apiClient';
import { buildPaginateParams } from '@/api/pagination';

const list = (payload, options) => apiClient.post('/api/floormember', payload, buildRequestConfig(options));

const invite = (payload, options) => apiClient.post('/api/floormember/invite', payload, buildRequestConfig(options));

const leave = (payload, options) => apiClient.post('/api/floormember/leave', payload, buildRequestConfig(options));

const remove = (payload, options) => apiClient.post('/api/floormember/delete', payload, buildRequestConfig(options));

const createByInvite = (payload, options) =>
  apiClient.post('/api/floormember/create', payload, buildRequestConfig(options));

const managementPaginate = (payload, options) =>
  apiClient.get(
    '/api/floormember/management/paginate',
    buildRequestConfig(options, { params: buildPaginateParams(payload) })
  );

const managementDelete = (payload, options) =>
  apiClient.post('/api/floormember/management/delete', payload, buildRequestConfig(options));

export default {
  list,
  invite,
  leave,
  remove,
  createByInvite,
  managementPaginate,
  managementDelete,
};
