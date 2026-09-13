import { expect, vi } from 'vitest';

const { clearBrowserSession } = require('../../e2e/specs/helpers/auth-security');

describe('E2Eの認証状態の初期化', () => {
  it('保存状態を消すため同一オリジンの静的documentへ移動する', () => {
    const browser = {
      launchUrl: 'http://localhost:3100',
      url: vi.fn().mockReturnThis(),
      deleteCookies: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
    };

    clearBrowserSession(browser);

    expect(browser.url).toHaveBeenCalledOnce();
    expect(browser.url).toHaveBeenCalledWith('http://localhost:3100/manifest.json?e2e-session-reset=1');
    expect(browser.deleteCookies).toHaveBeenCalledOnce();
    expect(browser.execute).toHaveBeenCalledOnce();
  });
});
