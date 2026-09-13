import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import roomApi from '@/api/room';

describe('ルームAPI', () => {
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

  it('list はゲスト分岐でエンドポイントが切り替わる', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await roomApi.list({ floor_id: 'floor', isGuest: false });
    await roomApi.list({ floor_id: 'floor', isGuest: true });

    expect(calls[0].url).to.equal('/api/room');
    expect(calls[0].payload).to.deep.equal({ floor_id: 'floor' });
    expect(calls[1].url).to.equal('/api/room/guest');
    expect(calls[1].payload).to.deep.equal({ floor_id: 'floor' });
  });

  it('作成は通常パスを使い、更新は管理用パスとアップロードの進捗通知に対応する', async () => {
    const calls = [];
    const onUploadProgress = () => {};
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await roomApi.create({ title: 't' }, { onUploadProgress });
    await roomApi.update({ _id: 'normal-id' }, { management: false }, { onUploadProgress });
    await roomApi.update({ _id: 'id' }, { management: true }, { onUploadProgress });

    expect(calls[0].url).to.equal('/api/room/create');
    expect(calls[0].config).to.deep.equal({ onUploadProgress });
    expect(calls[1].url).to.equal('/api/room/update');
    expect(calls[1].config).to.deep.equal({ onUploadProgress });
    expect(calls[2].url).to.equal('/api/room/management/update');
    expect(calls[2].config).to.deep.equal({ onUploadProgress });
  });

  it('updateDisplayHidden は /api/room/update/roomdisplayhidden に送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await roomApi.updateDisplayHidden({ room_display_hidden: true });

    expect(calls[0].url).to.equal('/api/room/update/roomdisplayhidden');
    expect(calls[0].payload).to.deep.equal({ room_display_hidden: true });
  });

  it('詳細・削除・表示順・管理操作で対応するAPIを呼ぶ', async () => {
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

    await roomApi.detail({ room_id: 'room' });
    await roomApi.remove({ _id: 'id' });
    await roomApi.updateDisplayOrder({ room_id: 'room', display_order: 1 });
    await roomApi.managementPaginate({ page: 1, floor_id: 'floor' });
    await roomApi.managementSetDeleteState({ _id: 'id', delete_flg: false });

    expect(postCalls[0].url).to.equal('/api/room/detail');
    expect(postCalls[0].payload).to.deep.equal({ room_id: 'room' });
    expect(postCalls[1].url).to.equal('/api/room/delete');
    expect(postCalls[2].url).to.equal('/api/room/update/displayorder');
    expect(postCalls[3].url).to.equal('/api/room/management/delete-state');
    expect(getCalls[0].url).to.equal('/api/room/management/paginate');
    expect(getCalls[0].config).to.deep.equal({ params: { page: 1, floor_id: 'floor' } });
  });
});
