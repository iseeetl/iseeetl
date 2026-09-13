import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import floorMemberApi from '@/api/floorMember';

describe('フロアメンバーAPI', () => {
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

  it('一覧・招待・脱退・削除で対応するAPIを呼ぶ', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await floorMemberApi.list({ floor_id: 'floor' });
    await floorMemberApi.invite({ floor_id: 'floor', period: 7 });
    await floorMemberApi.leave({ floor_id: 'floor' });
    await floorMemberApi.remove({ _id: 'id', floor_id: 'floor' });

    expect(calls[0].url).to.equal('/api/floormember');
    expect(calls[1].url).to.equal('/api/floormember/invite');
    expect(calls[2].url).to.equal('/api/floormember/leave');
    expect(calls[3].url).to.equal('/api/floormember/delete');
  });

  it('招待からの参加と管理用の一覧・削除で対応するAPIを呼ぶ', async () => {
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

    await floorMemberApi.createByInvite({ floor_id: 'floor', invite_token: 'token' }, { onUploadProgress });
    await floorMemberApi.managementPaginate({ page: 1 });
    await floorMemberApi.managementDelete({ _id: 'member-id' });

    expect(postCalls[0].url).to.equal('/api/floormember/create');
    expect(postCalls[0].config).to.deep.equal({ onUploadProgress });
    expect(getCalls[0].url).to.equal('/api/floormember/management/paginate');
    expect(getCalls[0].config).to.deep.equal({ params: { page: 1 } });
    expect(postCalls[1].url).to.equal('/api/floormember/management/delete');
    expect(postCalls[1].payload).to.deep.equal({ _id: 'member-id' });
  });
});
