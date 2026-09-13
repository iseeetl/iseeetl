import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import guestApi from '@/api/guest';

describe('ゲスト認証API', () => {
  let originalPost;

  beforeEach(() => {
    originalPost = apiClient.post;
  });

  afterEach(() => {
    apiClient.post = originalPost;
  });

  it('初期化は /api/guest/bootstrap を credentials 付きで送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await guestApi.bootstrap({ guest_name: 'guest', lang: 'ja' });

    expect(calls[0].url).to.equal('/api/guest/bootstrap');
    expect(calls[0].payload).to.deep.equal({ guest_name: 'guest', lang: 'ja' });
    expect(calls[0].config).to.deep.equal({ withCredentials: true, skipGuestRefresh: true });
  });

  it('更新は /api/guest/refresh を credentials 付きで送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await guestApi.refresh();

    expect(calls[0].url).to.equal('/api/guest/refresh');
    expect(calls[0].payload).to.equal(null);
    expect(calls[0].config).to.deep.equal({ withCredentials: true, skipGuestRefresh: true });
  });
});
