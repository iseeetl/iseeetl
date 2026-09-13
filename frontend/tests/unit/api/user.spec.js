import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import userApi from '@/api/user';

describe('ユーザAPI', () => {
  let originalGet;
  let originalPost;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPost = apiClient.post;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
  });

  it('ユーザ詳細をGET /api/user/detailで取得する', async () => {
    const calls = [];
    apiClient.get = (url, config) => {
      calls.push({ url, config });
      return Promise.resolve({ data: {} });
    };

    await userApi.fetchDetail();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].url).to.equal('/api/user/detail');
    expect(calls[0].config).to.equal(undefined);
  });

  it('プロフィール更新時に入力データとアップロードの進捗通知を送る', async () => {
    const calls = [];
    const onUploadProgress = () => {};
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await userApi.updateProfile({ username: 'name' }, { onUploadProgress });

    expect(calls[0].url).to.equal('/api/user/update');
    expect(calls[0].payload).to.deep.equal({ username: 'name' });
    expect(calls[0].config).to.deep.equal({ onUploadProgress });
  });

  it('パスワード変更は/api/user/changepasswordへPOSTで送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await userApi.changePassword({ current: 'old', password: 'new' });

    expect(calls[0].url).to.equal('/api/user/changepassword');
    expect(calls[0].payload).to.deep.equal({ current: 'old', password: 'new' });
    expect(calls[0].config).to.equal(undefined);
  });

  it('管理操作は管理用パスを使う', async () => {
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

    await userApi.managementPaginate({ page: 1 });
    await userApi.managementUpdate({ _id: 'id', delete_flg: true });
    await userApi.managementSetDeleteState({ _id: 'id', delete_flg: false });

    expect(getCalls[0].url).to.equal('/api/user/management/paginate');
    expect(getCalls[0].config).to.deep.equal({ params: { page: 1 } });
    expect(postCalls[0].url).to.equal('/api/user/management/update');
    expect(postCalls[1].url).to.equal('/api/user/management/delete-state');
  });
});
