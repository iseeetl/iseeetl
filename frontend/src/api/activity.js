import api from '@/api/apiClient';
const base = roomId => `/api/rooms/${encodeURIComponent(roomId)}/activity`;
export default {
  capability: () => api.get('/api/capabilities/activity'),
  list: (roomId, options) => api.post(`${base(roomId)}/search`, options),
  preferences: roomId => api.get(`${base(roomId)}/preferences`),
  savePreferences: (roomId, value) => api.put(`${base(roomId)}/preferences`, value),
  markRead: (roomId, eventIds) => api.post(`${base(roomId)}/read`, { eventIds }),
  target: (roomId, eventId) => api.get(`${base(roomId)}/${encodeURIComponent(eventId)}/target`),
  subscriptions: roomId => api.get(`${base(roomId)}/subscriptions`),
  subscribe: (roomId, postId, enabled) => api.put(`${base(roomId)}/subscriptions/${encodeURIComponent(postId)}`, { enabled }),
};
