import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import roomMemberApi from '@/api/roomMember';

describe('ルームメンバーAPI', () => {
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

    await roomMemberApi.list({ room_id: 'room' });
    await roomMemberApi.invite({ room_id: 'room', period: 7 });
    await roomMemberApi.leave({ room_id: 'room' });
    await roomMemberApi.remove({ _id: 'id' });

    expect(calls[0].url).to.equal('/api/roommember');
    expect(calls[1].url).to.equal('/api/roommember/invite');
    expect(calls[2].url).to.equal('/api/roommember/leave');
    expect(calls[3].url).to.equal('/api/roommember/delete');
  });

  it('招待からの参加と管理操作で対応するAPIを呼ぶ', async () => {
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

    await roomMemberApi.createByInvite({ room_id: 'room', invite_token: 'token' }, { onUploadProgress });
    await roomMemberApi.managementPaginate({ page: 1 });
    await roomMemberApi.managementDelete({ _id: 'id' });

    expect(postCalls[0].url).to.equal('/api/roommember/create');
    expect(postCalls[0].config).to.deep.equal({ onUploadProgress });
    expect(postCalls[1].url).to.equal('/api/roommember/management/delete');
    expect(getCalls[0].url).to.equal('/api/roommember/management/paginate');
    expect(getCalls[0].config).to.deep.equal({ params: { page: 1 } });
  });
});
