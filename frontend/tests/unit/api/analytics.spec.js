import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import analyticsApi, {
  ANALYTICS_CONFIG_REQUEST_TIMEOUT_MS,
} from '@/api/analytics';

describe('アクセス解析API', () => {
  it('公開設定のリクエストをタイムアウトで打ち切る', () => {
    expect(ANALYTICS_CONFIG_REQUEST_TIMEOUT_MS).to.be.greaterThan(0);
  });

  it('認証を更新せずにアクセス解析の公開設定を取得する', async () => {
    const response = { data: { measurement_id: 'G-UNIT1234' } };
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(response);

    expect(await analyticsApi.fetchConfig()).to.equal(response);
    expect(get).toHaveBeenCalledWith('/api/analytics/config', {
      skipGuestRefresh: true,
      timeout: ANALYTICS_CONFIG_REQUEST_TIMEOUT_MS,
    });
  });

  it('ゲストトークンを再発行せずに計測用の識別情報を取得する', async () => {
    const response = {
      data: {
        analytics_user_id: `ga1_${'a'.repeat(64)}`,
        visitor_type: 'registered',
        identity_version: 'v1',
      },
    };
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(response);

    expect(await analyticsApi.fetchIdentity()).to.equal(response);
    expect(get).toHaveBeenCalledWith('/api/analytics/identity', {
      skipGuestRefresh: true,
    });
  });

  it('呼出元のAbortSignalをリクエストへ渡す', async () => {
    const signal = new AbortController().signal;
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {} });

    await analyticsApi.fetchIdentity({ signal });

    expect(get).toHaveBeenCalledWith('/api/analytics/identity', {
      skipGuestRefresh: true,
      signal,
    });
  });
});
