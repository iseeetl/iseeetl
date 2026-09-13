import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import floorApi from '@/api/floor';

describe('フロアAPI', () => {
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

  it('paginate はゲスト分岐でエンドポイントが切り替わる', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await floorApi.paginate({ page: 1, search: 'a', isGuest: false });
    await floorApi.paginate({ page: 2, search: null, isGuest: true });

    expect(calls[0].url).to.equal('/api/floor/paginate');
    expect(calls[0].payload).to.deep.equal({ page: 1, search: 'a' });
    expect(calls[1].url).to.equal('/api/floor/guest/paginate');
    expect(calls[1].payload).to.deep.equal({ page: 2, search: null });
  });

  it('作成は通常パスを使い、更新は管理用パスとアップロードの進捗通知に対応する', async () => {
    const calls = [];
    const onUploadProgress = () => {};
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await floorApi.create({ title: 't' }, { onUploadProgress });
    await floorApi.update({ _id: 'normal-id' }, { management: false }, { onUploadProgress });
    await floorApi.update({ _id: 'id' }, { management: true }, { onUploadProgress });

    expect(calls[0].url).to.equal('/api/floor/create');
    expect(calls[0].config).to.deep.equal({ onUploadProgress });
    expect(calls[1].url).to.equal('/api/floor/update');
    expect(calls[1].config).to.deep.equal({ onUploadProgress });
    expect(calls[2].url).to.equal('/api/floor/management/update');
    expect(calls[2].config).to.deep.equal({ onUploadProgress });
  });

  it('updateDisplayHidden は /api/floor/update/floordisplayhidden に送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await floorApi.updateDisplayHidden({ floor_display_hidden: true });

    expect(calls[0].url).to.equal('/api/floor/update/floordisplayhidden');
    expect(calls[0].payload).to.deep.equal({ floor_display_hidden: true });
  });

  it('detail/role/remove/management は期待するパスを使う', async () => {
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

    await floorApi.detail({ floor_id: 'floor' });
    await floorApi.role({ floor_id: 'floor' });
    await floorApi.remove({ _id: 'id' });
    await floorApi.managementPaginate({ page: 1 });
    await floorApi.managementDetail({ _id: 'id' });
    await floorApi.managementSetDeleteState({ _id: 'id', delete_flg: true });

    expect(postCalls[0].url).to.equal('/api/floor/detail');
    expect(postCalls[0].payload).to.deep.equal({ floor_id: 'floor' });
    expect(postCalls[1].url).to.equal('/api/floor/role');
    expect(postCalls[2].url).to.equal('/api/floor/delete');
    expect(postCalls[3].url).to.equal('/api/floor/management/detail');
    expect(postCalls[3].payload).to.deep.equal({ _id: 'id' });
    expect(postCalls[4].url).to.equal('/api/floor/management/delete-state');
    expect(getCalls[0].url).to.equal('/api/floor/management/paginate');
    expect(getCalls[0].config).to.deep.equal({ params: { page: 1 } });
  });
});
