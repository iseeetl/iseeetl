const { getBaseUrl } = require('./login');

const pendingSessionResets = new WeakSet();

const consumeBrowserSessionReset = (browser) => {
  const pending = pendingSessionResets.has(browser);
  if (pending) pendingSessionResets.delete(browser);
  return pending;
};

const clearBrowserSession = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  pendingSessionResets.add(browser);
  browser
    .url(`${base}/manifest.json?e2e-session-reset=1`)
    .deleteCookies()
    .execute(function () {
      try {
        localStorage.removeItem('iseeetl_store');
        localStorage.removeItem('persist:root');
        sessionStorage.clear();
        return { ok: true };
      } catch (_) {
        return { ok: false };
      }
    });
};

const waitForPath = (browser, expectedPath, expectedSearch = null, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      return {
        path: window.location.pathname || '',
        search: window.location.search || '',
      };
    },
    [],
    (result) => {
      const location = result && result.value ? result.value : { path: '', search: '' };
      const pathMatched = location.path === expectedPath;
      const searchMatched = expectedSearch === null || location.search === expectedSearch;
      if (pathMatched && searchMatched) {
        browser.assert.ok(true, `遷移先が一致しました: ${location.path}${location.search}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `遷移先が一致しません: 期待値=${expectedPath}${expectedSearch || ''} 実際=${location.path}${
            location.search
          }`
        );
        return;
      }
      browser.pause(300, () => waitForPath(browser, expectedPath, expectedSearch, attempt + 1));
    }
  );
};

module.exports = {
  clearBrowserSession,
  consumeBrowserSessionReset,
  waitForPath,
};
