import apiClient, { buildRequestConfig } from '@/api/apiClient';
import { buildPaginateParams } from '@/api/pagination';

const fetchDetail = ({ room_id, post_id, isGuest }) => isGuest
  ? apiClient.post('/api/chat/guest/detail', { post_id })
  : apiClient.get(postPath(room_id, post_id));

const fetchPosts = ({
  floor_id,
  room_id,
  from = null,
  to = null,
  globalServerQuery = null,
  serverQuery = null,
  isGuest,
}) => {
  if (isGuest) return apiClient.post('/api/chat/guest', { floor_id, room_id, from, to, globalServerQuery, serverQuery });
  const range = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  if (!globalServerQuery && !serverQuery) return apiClient.get(postPath(room_id), { params: range });
  return apiClient.post(`${postPath(room_id)}/search`, { ...range,
    ...(globalServerQuery ? { globalServerQuery } : {}), ...(serverQuery ? { serverQuery } : {}),
  });
};

const role = (payload) => apiClient.post('/api/chat/role', payload);

const createPushFilter = (payload) => apiClient.post('/api/chat/pushfilter', payload);

const updatePushFilter = ({ id, ...payload }) => apiClient.put(`/api/chat/pushfilter/${id}`, payload);

const deletePushFilter = ({ id }) => apiClient.delete(`/api/chat/pushfilter/${id}`);

const postPath = (roomId, postId) => `/api/rooms/${encodeURIComponent(roomId)}/timeline/posts${
  postId == null ? '' : `/${encodeURIComponent(postId)}`
}`;

const createPost = ({ room_id, ...body }, options) =>
  apiClient.post(postPath(room_id), body, buildRequestConfig(options));

const updatePost = ({ room_id, _id, ...body }, options) =>
  apiClient.patch(postPath(room_id, _id), body, buildRequestConfig(options));

const createGuestPost = (payload, options) =>
  apiClient.post('/api/chat/guest/post', payload, buildRequestConfig(options));

const replyPath = (roomId, postId, replyId) => `${postPath(roomId, postId)}/replies${replyId == null ? '' : `/${encodeURIComponent(replyId)}`}`;
const supplementPath = (roomId, postId, replyId, supplementId) => `${replyId == null ? postPath(roomId, postId) : replyPath(roomId, postId, replyId)}/supplements${supplementId == null ? '' : `/${encodeURIComponent(supplementId)}`}`;

const createReply = ({ room_id, post_id, ...body }, options) =>
  apiClient.post(replyPath(room_id, post_id), body, buildRequestConfig(options));

const updateReply = ({ room_id, post_id, _id, ...body }, options) =>
  apiClient.patch(replyPath(room_id, post_id, _id), body, buildRequestConfig(options));

const createGuestReply = (payload, options) =>
  apiClient.post('/api/chat/guest/reply', payload, buildRequestConfig(options));

const createSupplement = ({ room_id, post_id, ...body }, options) =>
  apiClient.post(supplementPath(room_id, post_id, null), body, buildRequestConfig(options));

const createReplySupplement = ({ room_id, post_id, reply_id, ...body }, options) =>
  apiClient.post(supplementPath(room_id, post_id, reply_id), body, buildRequestConfig(options));

const updateSupplement = ({ room_id, post_id, _id, ...body }, options) =>
  apiClient.patch(supplementPath(room_id, post_id, null, _id), body, buildRequestConfig(options));

const updateReplySupplement = ({ room_id, post_id, reply_id, _id, ...body }, options) =>
  apiClient.patch(supplementPath(room_id, post_id, reply_id, _id), body, buildRequestConfig(options));

const deletePost = ({ room_id, _id }, options) =>
  apiClient.delete(postPath(room_id, _id), buildRequestConfig(options));

const deleteReply = ({ room_id, post_id, _id }, options) =>
  apiClient.delete(replyPath(room_id, post_id, _id), buildRequestConfig(options));

const deleteSupplement = ({ room_id, post_id, _id }, options) =>
  apiClient.delete(supplementPath(room_id, post_id, null, _id), buildRequestConfig(options));

const deleteReplySupplement = ({ room_id, post_id, reply_id, _id }, options) =>
  apiClient.delete(supplementPath(room_id, post_id, reply_id, _id), buildRequestConfig(options));

const tagPost = ({ room_id, _id, room_tags }, options) =>
  apiClient.put(`${postPath(room_id, _id)}/tags`, { room_tags }, buildRequestConfig(options));

const tagReply = ({ room_id, post_id, _id, room_tags }, options) =>
  apiClient.put(`${replyPath(room_id, post_id, _id)}/tags`, { room_tags }, buildRequestConfig(options));

const transcribeAudio = (formData, options) =>
  apiClient.post('/api/chat/transcription/audio', formData, buildRequestConfig(options));

const managementTimelineEstimate = (payload, options) =>
  apiClient.post('/api/chat/management/timeline/estimate', payload, buildRequestConfig(options));

const managementTimeline = (payload, options) =>
  apiClient.post('/api/chat/management/timeline', payload, buildRequestConfig(options));

const managementTimelineMedia = (payload, options) =>
  apiClient.post('/api/chat/management/timeline/media', payload, buildRequestConfig(options));

const managementPaginate = (payload, options) =>
  apiClient.get('/api/chat/management/paginate', buildRequestConfig(options, { params: buildPaginateParams(payload) }));

const manageDelete = (payload, options) =>
  apiClient.post('/api/chat/management/delete', payload, buildRequestConfig(options));

const buildReactionUrl = ({ isUser, replyId, supplementId, action, includeTrailingSlash }) => {
  const suffix = action ? `/${action}` : includeTrailingSlash ? '/' : '';
  let url = '/api/chat';

  if (supplementId !== null) {
    if (replyId !== null) {
      url += isUser ? `/reply/supplement/reaction${suffix}` : `/guest/reply/supplement/reaction${suffix}`;
    } else {
      url += isUser ? `/supplement/reaction${suffix}` : `/guest/supplement/reaction${suffix}`;
    }
  } else if (replyId !== null) {
    url += isUser ? `/reply/reaction${suffix}` : `/guest/reply/reaction${suffix}`;
  } else {
    url += isUser ? `/reaction${suffix}` : `/guest/reaction${suffix}`;
  }

  return url;
};

const buildReactionPayload = ({ postId, reactionType, replyId, supplementId, action, reactionId }) => {
  const payload = { post_id: postId };
  if (action !== 'delete') {
    payload.type = reactionType;
  } else if (reactionId) {
    payload.reaction_id = reactionId;
  }
  if (supplementId !== null) {
    payload.supplement_id = supplementId;
  }
  if (replyId !== null) {
    payload.reply_id = replyId;
  }
  return payload;
};

const addReaction = async ({
  postId,
  reactionType,
  replyId = null,
  supplementId = null,
  isUser,
  guestName,
  includeTrailingSlash = false,
}) => {
  const url = buildReactionUrl({ isUser, replyId, supplementId, action: '', includeTrailingSlash });
  const payload = buildReactionPayload({ postId, reactionType, replyId, supplementId, action: '' });

  if (!isUser) {
    payload.guest_name = guestName;
  }

  const config = isUser ? undefined : { withCredentials: true };
  return apiClient.post(url, payload, config);
};

const toggleReaction = async ({
  postId,
  reactionType,
  replyId = null,
  supplementId = null,
  isUser,
  isDelete,
  reactionId,
  guestName,
  includeTrailingSlash = true,
}) => {
  const action = isDelete ? 'delete' : '';
  const url = buildReactionUrl({ isUser, replyId, supplementId, action, includeTrailingSlash });
  const payload = buildReactionPayload({ postId, reactionType, replyId, supplementId, action, reactionId });

  if (!isUser) {
    payload.guest_name = guestName;
  }

  const config = isUser ? undefined : { withCredentials: true };
  return apiClient.post(url, payload, config);
};

export default {
  fetchDetail,
  fetchPosts,
  role,
  createPushFilter,
  updatePushFilter,
  deletePushFilter,
  createPost,
  updatePost,
  createGuestPost,
  createReply,
  updateReply,
  createGuestReply,
  createSupplement,
  createReplySupplement,
  updateSupplement,
  updateReplySupplement,
  deletePost,
  deleteReply,
  deleteSupplement,
  deleteReplySupplement,
  tagPost,
  tagReply,
  transcribeAudio,
  managementTimelineEstimate,
  managementTimeline,
  managementTimelineMedia,
  managementPaginate,
  manageDelete,
  addReaction,
  toggleReaction,
};
