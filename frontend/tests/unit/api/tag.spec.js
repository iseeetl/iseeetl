import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import tagApi from '@/api/tag';

describe('タグAPI', () => {
  let originalPost;
  let originalGet;

  beforeEach(() => {
    originalPost = apiClient.post;
    originalGet = apiClient.get;
  });

  afterEach(() => {
    apiClient.post = originalPost;
    apiClient.get = originalGet;
  });

  it('roomTag の list/create は基底パスを使う', async () => {
    const calls = [];
    const onUploadProgress = () => {};
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    apiClient.get = (url, config) => { calls.push({ url, config }); return Promise.resolve({ data: {} }); };

    await tagApi.roomTag.list({ room_id: 'room' });
    await tagApi.roomTag.create({ room_id: 'room' }, { onUploadProgress });

    expect(calls[0].url).to.equal('/api/rooms/room/tags');
    expect(calls[0].payload).to.equal(undefined);
    expect(calls[1].url).to.equal('/api/roomtag/create');
    expect(calls[1].config).to.deep.equal({ onUploadProgress });
  });

  it('roomTag の update は management 指定でパスが切り替わる', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await tagApi.roomTag.update({ _id: 'normal-id' }, { management: false });
    await tagApi.roomTag.update({ _id: 'management-id' }, { management: true });

    expect(calls[0].url).to.equal('/api/roomtag/update');
    expect(calls[1].url).to.equal('/api/roomtag/management/update');
  });

  it('roomTag の update/remove/import/export/reset は期待するパスを使う', async () => {
    const postCalls = [];
    const getCalls = [];
    apiClient.post = (url, payload, config) => {
      postCalls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };
    apiClient.get = (url, config) => {
      getCalls.push({ url, config });
      return Promise.resolve({ data: {} });
    };

    await tagApi.roomTag.update({ _id: 'id' }, { management: true });
    await tagApi.roomTag.remove({ _id: 'id' });
    await tagApi.roomTag.importCsv({ file: true });
    await tagApi.roomTag.exportCsv({ room_id: 'room' });
    await tagApi.roomTag.resetToFloor({ room_id: 'room' });
    await tagApi.roomTag.managementPaginate({ page: 1 });
    await tagApi.roomTag.managementSetDeleteState({ _id: 'id', delete_flg: true });

    expect(postCalls[0].url).to.equal('/api/roomtag/management/update');
    expect(postCalls[1].url).to.equal('/api/roomtag/delete');
    expect(postCalls[2].url).to.equal('/api/roomtag/import');
    expect(postCalls[3].url).to.equal('/api/roomtag/init');
    expect(postCalls[4].url).to.equal('/api/roomtag/management/delete-state');
    expect(getCalls[0].url).to.equal('/api/rooms/room/tags');
    expect(getCalls[1].url).to.equal('/api/roomtag/management/paginate');
    expect(getCalls[1].config).to.deep.equal({ params: { page: 1 } });
  });

  it('floorTag の update は management 指定でパスが切り替わる', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await tagApi.floorTag.update({ _id: 'id' }, { management: false });
    await tagApi.floorTag.update({ _id: 'id' }, { management: true });

    expect(calls[0].url).to.equal('/api/floortag/update');
    expect(calls[1].url).to.equal('/api/floortag/management/update');
  });

  it('floorTag の create/remove/import/export/reset は期待するパスを使う', async () => {
    const postCalls = [];
    const getCalls = [];
    apiClient.post = (url, payload, config) => {
      postCalls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };
    apiClient.get = (url, config) => {
      getCalls.push({ url, config });
      return Promise.resolve({ data: {} });
    };

    const onUploadProgress = () => {};
    await tagApi.floorTag.create({ floor_id: 'floor' }, { onUploadProgress });
    await tagApi.floorTag.remove({ _id: 'id' });
    await tagApi.floorTag.importCsv({ file: true });
    await tagApi.floorTag.exportCsv({ floor_id: 'floor' });
    await tagApi.floorTag.reset({ floor_id: 'floor' });
    await tagApi.floorTag.managementPaginate({ page: 1 });
    await tagApi.floorTag.managementRemove({ _id: 'id' });

    expect(postCalls[0].url).to.equal('/api/floortag/create');
    expect(postCalls[0].config).to.deep.equal({ onUploadProgress });
    expect(postCalls[1].url).to.equal('/api/floortag/delete');
    expect(postCalls[2].url).to.equal('/api/floortag/import');
    expect(postCalls[3].url).to.equal('/api/floortag');
    expect(postCalls[4].url).to.equal('/api/floortag/init');
    expect(postCalls[5].url).to.equal('/api/floortag/management/delete');
    expect(getCalls[0].url).to.equal('/api/floortag/management/paginate');
    expect(getCalls[0].config).to.deep.equal({ params: { page: 1 } });
  });

  it('categoryTag は management 基底パスを使う', async () => {
    const postCalls = [];
    const getCalls = [];
    apiClient.post = (url, payload, config) => {
      postCalls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };
    apiClient.get = (url, config) => {
      getCalls.push({ url, config });
      return Promise.resolve({ data: {} });
    };

    await tagApi.categoryTag.paginate({ page: 1 });
    await tagApi.categoryTag.exportCsv({});

    expect(getCalls[0].url).to.equal('/api/categorytag/management/paginate');
    expect(getCalls[0].config).to.deep.equal({ params: { page: 1 } });
    expect(postCalls[0].url).to.equal('/api/categorytag/management/');
  });

  it('categoryTag の create/update/import は management 基底パスを使う', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await tagApi.categoryTag.create({ name: 'tag' });
    await tagApi.categoryTag.update({ _id: 'id' });
    await tagApi.categoryTag.remove({ _id: 'id' });
    await tagApi.categoryTag.importCsv({ file: true });

    expect(calls[0].url).to.equal('/api/categorytag/management/create');
    expect(calls[1].url).to.equal('/api/categorytag/management/update');
    expect(calls[2].url).to.equal('/api/categorytag/management/delete');
    expect(calls[3].url).to.equal('/api/categorytag/management/import');
  });

  it('soundTag の fetch は soundtag エンドポイントを使う', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await tagApi.soundTag.fetch({ room_id: 'room' });

    expect(calls[0].url).to.equal('/api/soundtag');
  });

  it('soundTag の create/update は soundtag エンドポイントを使う', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await tagApi.soundTag.create({ name: 'tag' });
    await tagApi.soundTag.update({ _id: 'id' });

    expect(calls[0].url).to.equal('/api/soundtag/create');
    expect(calls[1].url).to.equal('/api/soundtag/update');
  });
});
