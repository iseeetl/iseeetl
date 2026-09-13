import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import spamApi from '@/api/spam';

describe('スパム管理API', () => {
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

  it('一覧・作成・更新・削除は管理用パスを使う', async () => {
    const postCalls = [];
    const getCalls = [];
    const onUploadProgress = () => {};
    apiClient.post = (url, payload, config) => {
      postCalls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };
    apiClient.get = (url, config) => {
      getCalls.push({ url, config });
      return Promise.resolve({ data: {} });
    };

    await spamApi.paginate({ page: 1 });
    await spamApi.create({ word: 'x' }, { onUploadProgress });
    await spamApi.update({ _id: 'id', word: 'y' }, { onUploadProgress });
    await spamApi.remove({ _id: 'id' }, { onUploadProgress });

    expect(getCalls[0].url).to.equal('/api/spam/management/paginate');
    expect(getCalls[0].config).to.deep.equal({ params: { page: 1 } });
    expect(postCalls[0].url).to.equal('/api/spam/management/create');
    expect(postCalls[1].url).to.equal('/api/spam/management/update');
    expect(postCalls[2].url).to.equal('/api/spam/management/delete');
  });
});
