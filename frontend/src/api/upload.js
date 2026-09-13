import apiClient, { buildRequestConfig } from '@/api/apiClient';

const readFormValue = (formData, field) => {
  if (!formData || typeof formData.get !== 'function') return undefined;
  const value = formData.get(field);
  return value == null ? undefined : String(value);
};

const buildUploadConfig = (options = {}, params) => {
  return buildRequestConfig(
    { ...options, ...(params ? { params } : {}) },
    { headers: { 'content-type': 'multipart/form-data' } }
  );
};

const uploadProfileImage = (formData, options) =>
  apiClient.post('/api/fileupload/profile/image', formData, buildUploadConfig(options));

const uploadFloorImage = (formData, options) =>
  apiClient.post(
    '/api/fileupload/floor/image',
    formData,
    buildUploadConfig(options, { floor_id: readFormValue(formData, '_id') })
  );

const uploadRoomImage = (formData, options) =>
  apiClient.post(
    '/api/fileupload/room/image',
    formData,
    buildUploadConfig(options, {
      floor_id: readFormValue(formData, 'floor_id'),
      room_id: readFormValue(formData, '_id'),
    })
  );

const timelineUploadPath = (roomId) => `/api/rooms/${encodeURIComponent(roomId)}/timeline/uploads`;

const uploadTimeline = (kind, fields, formData, options) => {
  const files = new FormData();
  for (const field of fields) {
    const file = formData.get(field);
    if (file != null) files.append(field, file);
  }
  return apiClient.post(
    `${timelineUploadPath(readFormValue(formData, 'room_id'))}/${kind}`,
    files,
    buildUploadConfig(options)
  );
};
const uploadTimelineImage = (formData, options) => uploadTimeline('image', ['image_file'], formData, options);
const uploadTimelineVideo = (formData, options) =>
  uploadTimeline('video', ['video_file', 'video_subtitle_file'], formData, options);
const uploadTimelineAudio = (formData, options) => uploadTimeline('audio', ['audio_file'], formData, options);

const discardTimelineMedia = ({ room_id, file_names }, options) =>
  apiClient.post(`${timelineUploadPath(room_id)}/discard`, { file_names }, buildRequestConfig(options));

export default {
  discardTimelineMedia,
  uploadProfileImage,
  uploadFloorImage,
  uploadRoomImage,
  uploadTimelineImage,
  uploadTimelineVideo,
  uploadTimelineAudio,
};
