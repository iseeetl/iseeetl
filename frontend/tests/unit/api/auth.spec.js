import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import authApi from '@/api/auth';

describe('認証API', () => {
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

  it('ログインは /api/auth/login に credentials 付きで送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await authApi.login({ mail: 'user@example.com', password: 'secret' });

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].url).to.equal('/api/auth/login');
    expect(calls[0].payload).to.deep.equal({ mail: 'user@example.com', password: 'secret' });
    expect(calls[0].config).to.deep.equal({ withCredentials: true });
  });

  it('register は /api/auth/register/ に credentials 付きで送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await authApi.register({ mail: 'user@example.com', password: 'secret' });

    expect(calls[0].url).to.equal('/api/auth/register/');
    expect(calls[0].payload).to.deep.equal({ mail: 'user@example.com', password: 'secret' });
    expect(calls[0].config).to.deep.equal({ withCredentials: true });
  });

  it('activate は /api/auth/activate に credentials 付きで送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await authApi.activate({ token: 'token' });

    expect(calls[0].url).to.equal('/api/auth/activate');
    expect(calls[0].payload).to.deep.equal({ token: 'token' });
    expect(calls[0].config).to.deep.equal({ withCredentials: true });
  });

  it('loginWithGoogle は id_token と lang を送信する', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await authApi.loginWithGoogle({ idToken: 'token', lang: 'en' });

    expect(calls[0].url).to.equal('/api/auth/google/login');
    expect(calls[0].payload).to.deep.equal({ id_token: 'token', lang: 'en' });
    expect(calls[0].config).to.deep.equal({ withCredentials: true });
  });

  it('fetchPushIdentity は認証済み通知ID APIを呼ぶ', async () => {
    const calls = [];
    apiClient.get = (url, config) => {
      calls.push({ url, config });
      return Promise.resolve({ data: {} });
    };

    await authApi.fetchPushIdentity();

    expect(calls).to.deep.equal([{ url: '/api/auth/push-identity', config: { withCredentials: true } }]);
  });

  it('パスワードリセットは期待するエンドポイントを使う', async () => {
    const calls = [];
    apiClient.post = (url, payload, config) => {
      calls.push({ url, payload, config });
      return Promise.resolve({ data: {} });
    };

    await authApi.sendResetPasswordLink({ mail: 'user@example.com' });
    await authApi.verifyResetPasswordToken({ token: 'token' });
    await authApi.resetPassword({ password: 'new', token: 'token' });

    expect(calls[0].url).to.equal('/api/auth/resetpassword/sendmail');
    expect(calls[1].url).to.equal('/api/auth/resetpassword/verify');
    expect(calls[2].url).to.equal('/api/auth/resetpassword');
    expect(calls[0].config).to.deep.equal({ withCredentials: true });
    expect(calls[1].config).to.deep.equal({ withCredentials: true });
    expect(calls[2].config).to.deep.equal({ withCredentials: true });
  });
  it('ログアウトはCookie付きで送信し、失敗時の認証復旧を再帰させない', async () => {
    let request;
    apiClient.post = (...args) => { request = args; return Promise.resolve({ status: 204 }); };
    await authApi.logout();
    expect(request).toEqual(['/api/auth/logout', {}, { withCredentials: true, skipAuthRecovery: true }]);
  });

});
