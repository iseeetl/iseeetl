import apiClient, { buildBasePath, buildRequestConfig } from '@/api/apiClient';
import { buildPaginateParams } from '@/api/pagination';

const buildBase = () => buildBasePath('/api/spam', { management: true });

const paginate = (payload, options) =>
  apiClient.get(`${buildBase()}paginate`, buildRequestConfig(options, { params: buildPaginateParams(payload) }));

const create = (payload, options) => apiClient.post(`${buildBase()}create`, payload, buildRequestConfig(options));

const update = (payload, options) => apiClient.post(`${buildBase()}update`, payload, buildRequestConfig(options));

const remove = (payload, options) => apiClient.post(`${buildBase()}delete`, payload, buildRequestConfig(options));

export default {
  paginate,
  create,
  update,
  remove,
};
