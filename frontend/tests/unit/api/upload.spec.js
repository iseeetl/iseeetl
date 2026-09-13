import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import uploadApi from '@/api/upload';

describe('アップロードAPI', () => {
  let originalPost;

  beforeEach(() => {
    originalPost = apiClient.post;
  });

  afterEach(() => {
    apiClient.post = originalPost;
  });

  const formDataLike = (values = {}) => ({
    get: (field) => values[field],
  });

  it('アップロード時にmultipartのヘッダを付ける', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await uploadApi.uploadProfileImage({ file: true });

    expect(calls[0].url).to.equal('/api/fileupload/profile/image');
    expect(calls[0].config).to.deep.equal({ headers: { 'content-type': 'multipart/form-data' } });
  });

  it('アップロードの種類に対応するAPIを呼ぶ', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    const onUploadProgress = () => {};
    const payload = formDataLike({
      _id: 'room-1',
      floor_id: 'floor-1',
      room_id: 'room-1',
    });
    const cases = [
      ['uploadProfileImage', '/api/fileupload/profile/image', undefined],
      ['uploadFloorImage', '/api/fileupload/floor/image', { floor_id: 'room-1' }],
      ['uploadRoomImage', '/api/fileupload/room/image', { floor_id: 'floor-1', room_id: 'room-1' }],
    ];

    for (const [methodName, url, params] of cases) {
      await uploadApi[methodName](payload, { onUploadProgress });
      const call = calls.shift();
      expect(call.url).to.equal(url);
      expect(call.payload).to.equal(payload);
      const expectedConfig = {
        headers: { 'content-type': 'multipart/form-data' },
        onUploadProgress,
      };
      if (params) expectedConfig.params = params;
      expect(call.config).to.deep.equal(expectedConfig);
    }
  });

  it.each([
    ['uploadTimelineImage', 'image', ['image_file']],
    ['uploadTimelineVideo', 'video', ['video_file', 'video_subtitle_file']],
    ['uploadTimelineAudio', 'audio', ['audio_file']],
  ])('%sはルームIDをURLに、ファイルだけをmultipartの本文に含める', async (method, kind, fields) => {
    const original = new FormData();
    original.append('room_id', 'room/1');
    original.append('floor_id', 'floor-1');
    for (const field of fields) original.append(field, new File(['data'], `${field}.dat`));
    const calls = [];
    apiClient.post = (...args) => { calls.push(args); return Promise.resolve({ data: {} }); };
    await uploadApi[method](original);
    const [url, body, config] = calls[0];
    expect(url).to.equal(`/api/rooms/room%2F1/timeline/uploads/${kind}`);
    expect([...body.keys()]).to.deep.equal(fields);
    for (const field of fields) expect(body.get(field)).to.equal(original.get(field));
    expect(original.get('floor_id')).to.equal('floor-1');
    expect(config).to.deep.equal({ headers: { 'content-type': 'multipart/form-data' } });
  });

  it('未添付メディアの破棄は専用APIへJSONで送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };
    const payload = {
      floor_id: 'floor-1',
      room_id: 'room-1',
      file_names: ['image.png'],
    };

    await uploadApi.discardTimelineMedia(payload);

    expect(calls[0].url).to.equal('/api/rooms/room-1/timeline/uploads/discard');
    expect(calls[0].payload).to.deep.equal({ file_names: ['image.png'] });
    expect(calls[0].config).to.deep.equal({});
  });
});
