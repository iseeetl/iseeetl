import { expect } from 'vitest';
import apiClient from '@/api/apiClient';
import capabilitiesApi, { CAPABILITIES_REQUEST_TIMEOUT_MS } from '@/api/capabilities';

describe('機能の有効状態を取得するAPI', () => {
  it('認証を初期化せず、タイムアウト付きで機能の有効状態を取得する', async () => {
    const response = { data: { googleLogin: false } };
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(response);

    expect(await capabilitiesApi.fetchCapabilities()).to.equal(response);
    expect(get).toHaveBeenCalledWith('/api/capabilities', {
      timeout: CAPABILITIES_REQUEST_TIMEOUT_MS,
      skipGuestRefresh: true,
    });
    expect(CAPABILITIES_REQUEST_TIMEOUT_MS).to.be.greaterThan(0);
  });
});
