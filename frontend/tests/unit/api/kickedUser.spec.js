import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import kickedUserApi from '@/api/kickedUser';

describe('キック管理API', () => {
  let originalPost;

  beforeEach(() => {
    originalPost = apiClient.post;
  });

  afterEach(() => {
    apiClient.post = originalPost;
  });

  it('一覧・登録・解除・確認で対応するAPIを呼ぶ', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await kickedUserApi.list({ floor_id: 'floor' });
    await kickedUserApi.create({ floor_id: 'floor', user_id: 'user' });
    await kickedUserApi.remove({ _id: 'id' });
    await kickedUserApi.check({ floor_id: 'floor' });

    expect(calls[0].url).to.equal('/api/kickeduser');
    expect(calls[1].url).to.equal('/api/kickeduser/create');
    expect(calls[2].url).to.equal('/api/kickeduser/delete');
    expect(calls[3].url).to.equal('/api/kickeduser/check');
  });

  it('アップロードの進捗通知を設定できる', async () => {
    const calls = [];
    const onUploadProgress = () => {};
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await kickedUserApi.create({ floor_id: 'floor', user_id: 'user' }, { onUploadProgress });

    expect(calls[0].config).to.deep.equal({ onUploadProgress });
  });
});
