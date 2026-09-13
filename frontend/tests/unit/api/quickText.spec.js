import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import quickTextAPI from '@/api/quickText';

describe('単語API', () => {
  let originalGet;
  let originalPost;
  let originalPatch;
  let originalDelete;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPost = apiClient.post;
    originalPatch = apiClient.patch;
    originalDelete = apiClient.delete;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    apiClient.patch = originalPatch;
    apiClient.delete = originalDelete;
  });

  it('全グループの取得は認証ヘッダ付きで管理APIを呼ぶ', async () => {
    const calls = [];
    apiClient.get = (url, config) => {
      calls.push({ url, config });
      return Promise.resolve({ data: {} });
    };

    await quickTextAPI.getGroupsAll('token');

    expect(calls[0].url).to.equal('/api/management/quick-text/groups/all');
    expect(calls[0].config).to.deep.equal({
      headers: { authorization: 'Bearer token' },
    });
  });

  it('ルームのグループ取得では言語を指定する', async () => {
    const calls = [];
    apiClient.get = (url, config) => {
      calls.push({ url, config });
      return Promise.resolve({ data: {} });
    };

    await quickTextAPI.getGroups('token', { resource: 'room', resourceId: 'room1', lang: 'ja' });

    expect(calls[0].url).to.equal('/api/rooms/room1/quick-text/groups');
    expect(calls[0].config).to.deep.equal({
      headers: { authorization: 'Bearer token' },
      params: { lang: 'ja' },
    });
  });

  it('フロアの単語作成では入力データをPOSTで送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await quickTextAPI.createItem('token', {
      resource: 'floor',
      resourceId: 'floor1',
      groupId: 'group1',
      order: 2,
      label: 'hello',
      lang: 'ja',
    });

    expect(calls[0].url).to.equal('/api/floors/floor1/quick-text/groups/group1/items');
    expect(calls[0].payload).to.deep.equal({ order: 2, label: 'hello', lang: 'ja' });
    expect(calls[0].config).to.deep.equal({
      headers: { authorization: 'Bearer token' },
    });
  });

  it('ルームIDが未指定ならエラーにする', () => {
    expect(() => quickTextAPI.getGroups({ resource: 'room' })).to.throw('resourceId');
  });
});
