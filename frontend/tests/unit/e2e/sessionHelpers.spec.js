import { expect, vi } from 'vitest';

const { clearBrowserSession } = require('../../e2e/specs/helpers/auth-security');
const { openLogin, waitForLoginSession, waitForUserRole } = require('../../e2e/specs/helpers/session-helpers');

const createSessionBrowser = (summary) => {
  const browser = {
    execute: vi.fn((_script, _args, callback) => {
      callback({ value: summary });
      return browser;
    }),
    pause: vi.fn().mockReturnThis(),
    assert: { ok: vi.fn() },
  };
  return browser;
};

describe('E2Eのログイン状態の確認', () => {
  it('通常のログイン画面遷移は既存Appを再利用する', () => {
    const browser = {
      launchUrl: 'http://localhost:3100',
      execute: vi.fn().mockReturnThis(),
      waitForElementVisible: vi.fn().mockReturnThis(),
    };

    openLogin(browser);

    expect(browser.execute).toHaveBeenCalledOnce();
    expect(browser.execute.mock.calls[0][1]).to.deep.equal(['http://localhost:3100/login']);
    expect(browser.waitForElementVisible).toHaveBeenCalledWith('#mail', 10000);
  });

  it('セッションを明示的に消去した直後のログインだけページを再読込する', () => {
    const browser = {
      launchUrl: 'http://localhost:3100',
      url: vi.fn().mockReturnThis(),
      deleteCookies: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
      waitForElementVisible: vi.fn().mockReturnThis(),
    };

    clearBrowserSession(browser);
    openLogin(browser);

    expect(browser.url.mock.calls).to.deep.equal([
      ['http://localhost:3100/manifest.json?e2e-session-reset=1'],
      ['http://localhost:3100/login'],
    ]);
    expect(browser.execute).toHaveBeenCalledOnce();
    expect(browser.waitForElementVisible).toHaveBeenCalledWith('#mail', 10000);
  });

  it('ログイン状態・認証情報・ロールが揃った場合だけ準備完了にする', () => {
    const browser = createSessionBrowser({ loggedIn: true, credentialPresent: true, role: 'Author' });

    waitForLoginSession(browser);
    waitForUserRole(browser, 'Author');

    expect(browser.pause).not.toHaveBeenCalled();
    expect(browser.assert.ok.mock.calls).to.deep.equal([
      [true, 'ログイン後のセッションを確認しました: role=Author'],
      [true, 'ユーザの権限を確認しました: Author'],
    ]);
  });

  it('公開された状態情報がない場合はログイン完了と扱わない', () => {
    const browser = createSessionBrowser(null);

    waitForLoginSession(browser, 40);

    expect(browser.pause).not.toHaveBeenCalled();
    expect(browser.assert.ok).toHaveBeenCalledWith(
      false,
      'ログイン後のセッションを確認できませんでした: loggedIn=false credentialPresent=false role=unknown'
    );
  });

  it('認証情報がない場合はログイン完了と扱わない', () => {
    const browser = createSessionBrowser({ loggedIn: true, credentialPresent: false, role: 'Author' });

    waitForLoginSession(browser, 40);

    expect(browser.assert.ok).toHaveBeenCalledWith(
      false,
      'ログイン後のセッションを確認できませんでした: loggedIn=true credentialPresent=false role=Author'
    );
  });

  it('ロールが一致しない場合はログイン完了と扱わない', () => {
    const browser = createSessionBrowser({ loggedIn: true, credentialPresent: true, role: 'Author' });

    waitForUserRole(browser, 'Editor', 12);

    expect(browser.pause).not.toHaveBeenCalled();
    expect(browser.assert.ok).toHaveBeenCalledWith(false, 'ユーザの権限が一致しません: 期待値=Editor 実際=Author');
  });
});
