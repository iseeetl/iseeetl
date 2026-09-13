import apiClient, { buildBasePath, buildRequestConfig } from '@/api/apiClient';
import { buildPaginateParams } from '@/api/pagination';

const buildRoomTagBase = (management) => buildBasePath('/api/roomtag', { management });
const buildFloorTagBase = (management) => buildBasePath('/api/floortag', { management });
const buildSoundTagBase = () => buildBasePath('/api/soundtag');
const buildCategoryTagBase = () => buildBasePath('/api/categorytag', { management: true });

const roomTag = {
  list: ({ room_id }, options) => apiClient.get(`/api/rooms/${encodeURIComponent(room_id)}/tags`, buildRequestConfig(options)),
  create: (payload, options) => apiClient.post('/api/roomtag/create', payload, buildRequestConfig(options)),
  update: (payload, { management = false } = {}, options) =>
    apiClient.post(`${buildRoomTagBase(management)}update`, payload, buildRequestConfig(options)),
  remove: (payload, options) => apiClient.post('/api/roomtag/delete', payload, buildRequestConfig(options)),
  importCsv: (payload, options) => apiClient.post('/api/roomtag/import', payload, buildRequestConfig(options)),
  exportCsv: ({ room_id }, options) => apiClient.get(`/api/rooms/${encodeURIComponent(room_id)}/tags`, buildRequestConfig(options)),
  resetToFloor: (payload, options) => apiClient.post('/api/roomtag/init', payload, buildRequestConfig(options)),
  managementPaginate: (payload, options) =>
    apiClient.get(
      '/api/roomtag/management/paginate',
      buildRequestConfig(options, { params: buildPaginateParams(payload) })
    ),
  managementSetDeleteState: (payload, options) =>
    apiClient.post('/api/roomtag/management/delete-state', payload, buildRequestConfig(options)),
};

const floorTag = {
  list: (payload, options) => apiClient.post('/api/floortag', payload, buildRequestConfig(options)),
  create: (payload, options) => apiClient.post('/api/floortag/create', payload, buildRequestConfig(options)),
  update: (payload, { management = false } = {}, options) =>
    apiClient.post(`${buildFloorTagBase(management)}update`, payload, buildRequestConfig(options)),
  remove: (payload, options) => apiClient.post('/api/floortag/delete', payload, buildRequestConfig(options)),
  importCsv: (payload, options) => apiClient.post('/api/floortag/import', payload, buildRequestConfig(options)),
  exportCsv: (payload, options) => apiClient.post('/api/floortag', payload, buildRequestConfig(options)),
  reset: (payload, options) => apiClient.post('/api/floortag/init', payload, buildRequestConfig(options)),
  managementPaginate: (payload, options) =>
    apiClient.get(
      '/api/floortag/management/paginate',
      buildRequestConfig(options, { params: buildPaginateParams(payload) })
    ),
  managementRemove: (payload, options) =>
    apiClient.post('/api/floortag/management/delete', payload, buildRequestConfig(options)),
};

const soundTag = {
  fetch: (payload, options) => apiClient.post('/api/soundtag', payload, buildRequestConfig(options)),
  create: (payload, options) => apiClient.post(`${buildSoundTagBase()}create`, payload, buildRequestConfig(options)),
  update: (payload, options) => apiClient.post(`${buildSoundTagBase()}update`, payload, buildRequestConfig(options)),
};

const categoryTag = {
  paginate: (payload, options) =>
    apiClient.get(
      `${buildCategoryTagBase()}paginate`,
      buildRequestConfig(options, { params: buildPaginateParams(payload) })
    ),
  create: (payload, options) => apiClient.post(`${buildCategoryTagBase()}create`, payload, buildRequestConfig(options)),
  update: (payload, options) => apiClient.post(`${buildCategoryTagBase()}update`, payload, buildRequestConfig(options)),
  remove: (payload, options) =>
    apiClient.post(`${buildCategoryTagBase()}delete`, payload, buildRequestConfig(options)),
  importCsv: (payload, options) =>
    apiClient.post(`${buildCategoryTagBase()}import`, payload, buildRequestConfig(options)),
  exportCsv: (payload, options) => apiClient.post(buildCategoryTagBase(), payload, buildRequestConfig(options)),
};

export default {
  roomTag,
  floorTag,
  soundTag,
  categoryTag,
};
