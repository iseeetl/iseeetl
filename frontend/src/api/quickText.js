import apiClient, { withAuth } from '@/api/apiClient';

const RESOURCE_BUILDERS = {
  management: () => '/api/management/quick-text',
  floor: (resourceId) => `/api/floors/${resourceId}/quick-text`,
  room: (resourceId) => `/api/rooms/${resourceId}/quick-text`,
};

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const normalizeArgs = (tokenOrOptions, options) => {
  if (isObject(tokenOrOptions) && !options) {
    return { token: null, options: tokenOrOptions };
  }
  return { token: tokenOrOptions, options: options || {} };
};

const resolveBase = (resource = 'management', resourceId) => {
  const builder = RESOURCE_BUILDERS[resource];
  if (!builder) throw new Error(`Unknown quick text resource: ${resource}`);
  if (resource !== 'management' && !resourceId) {
    throw new Error(`resourceId is required for ${resource} quick text`);
  }
  return builder(resourceId);
};

const buildConfig = (token, params) => withAuth(token, params ? { params } : {});

const buildPayload = (fields) => {
  const payload = {};
  Object.keys(fields).forEach((key) => {
    if (fields[key] !== undefined) payload[key] = fields[key];
  });
  return payload;
};

const buildGroupPayload = ({ order, title, lang }) => buildPayload({ order, title, lang });
const buildItemPayload = ({ order, label, lang }) => buildPayload({ order, label, lang });

export default {
  getGroupsAll(tokenOrOptions, options) {
    const { token, options: opts } = normalizeArgs(tokenOrOptions, options);
    const { resource = 'management' } = opts;
    if (resource !== 'management') {
      throw new Error('getGroupsAll is only available for management quick text');
    }
    const base = resolveBase(resource);
    return apiClient.get(`${base}/groups/all`, withAuth(token));
  },
  getGroups(tokenOrOptions, options) {
    const { token, options: opts } = normalizeArgs(tokenOrOptions, options);
    const { resource = 'management', resourceId, page = 1, lang = null } = opts;
    const base = resolveBase(resource, resourceId);
    const params = {};
    if (resource === 'management') params.page = page;
    if (resource === 'room') params.lang = lang;
    return apiClient.get(`${base}/groups`, buildConfig(token, Object.keys(params).length ? params : null));
  },
  createGroup(tokenOrOptions, options) {
    const { token, options: opts } = normalizeArgs(tokenOrOptions, options);
    const { resource = 'management', resourceId } = opts;
    const base = resolveBase(resource, resourceId);
    const payload = buildGroupPayload(opts);
    return apiClient.post(`${base}/groups`, payload, withAuth(token));
  },
  updateGroup(tokenOrOptions, options) {
    const { token, options: opts } = normalizeArgs(tokenOrOptions, options);
    const { resource = 'management', resourceId, id } = opts;
    const base = resolveBase(resource, resourceId);
    const payload = buildGroupPayload(opts);
    return apiClient.patch(`${base}/groups/${id}`, payload, withAuth(token));
  },
  deleteGroup(tokenOrOptions, options) {
    const { token, options: opts } = normalizeArgs(tokenOrOptions, options);
    const { resource = 'management', resourceId, id } = opts;
    const base = resolveBase(resource, resourceId);
    return apiClient.delete(`${base}/groups/${id}`, withAuth(token));
  },

  getItems(tokenOrOptions, options) {
    const { token, options: opts } = normalizeArgs(tokenOrOptions, options);
    const { resource = 'management', resourceId, groupId, lang = null } = opts;
    const base = resolveBase(resource, resourceId);
    const params = resource === 'room' ? { lang } : null;
    return apiClient.get(`${base}/groups/${groupId}/items`, buildConfig(token, params));
  },
  createItem(tokenOrOptions, options) {
    const { token, options: opts } = normalizeArgs(tokenOrOptions, options);
    const { resource = 'management', resourceId, groupId } = opts;
    const base = resolveBase(resource, resourceId);
    const payload = buildItemPayload(opts);
    return apiClient.post(`${base}/groups/${groupId}/items`, payload, withAuth(token));
  },
  updateItem(tokenOrOptions, options) {
    const { token, options: opts } = normalizeArgs(tokenOrOptions, options);
    const { resource = 'management', resourceId, id } = opts;
    const base = resolveBase(resource, resourceId);
    const payload = buildItemPayload(opts);
    return apiClient.patch(`${base}/items/${id}`, payload, withAuth(token));
  },
  deleteItem(tokenOrOptions, options) {
    const { token, options: opts } = normalizeArgs(tokenOrOptions, options);
    const { resource = 'management', resourceId, id } = opts;
    const base = resolveBase(resource, resourceId);
    return apiClient.delete(`${base}/items/${id}`, withAuth(token));
  },
};
