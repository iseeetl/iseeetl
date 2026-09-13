const { resolveFrontendBaseUrl } = require('./backend-url');

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`このテストには${key}が必要です`);
  }
  return value;
};

const getBaseUrl = (browser) => {
  const envUrl = process.env.VUE_DEV_SERVER_URL || '';
  return resolveFrontendBaseUrl(browser.launchUrl || envUrl || 'http://localhost:3100');
};

const resolveAppTarget = (browser, targetUrl) => {
  const baseUrl = getBaseUrl(browser);
  let target;
  try {
    target = new URL(String(targetUrl || ''), `${baseUrl}/`);
  } catch (_) {
    browser.assert.ok(false, 'アプリの遷移先には有効なURLを指定してください。');
    return null;
  }
  if (target.origin !== baseUrl) {
    browser.assert.ok(false, 'アプリの遷移先にはE2E用フロントエンドの専用オリジンを使用してください。');
    return null;
  }
  return target;
};

const navigateToApp = (browser, targetUrl) => {
  const target = resolveAppTarget(browser, targetUrl);
  if (!target) {
    return browser;
  }

  browser.execute(
    function (url) {
      const target = new URL(url, window.location.href);
      const app = document.querySelector('#app');
      const canUseSpa =
        window.location.origin === target.origin && app && app.childElementCount > 0;

      if (!canUseSpa) {
        window.location.assign(target.href);
        return { mode: 'document' };
      }

      const location = `${target.pathname}${target.search}${target.hash}`;
      window.history.pushState({}, '', location);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return { mode: 'spa' };
    },
    [target.href]
  );
  return browser;
};

const navigateDirectToApp = (browser, targetUrl) => {
  const target = resolveAppTarget(browser, targetUrl);
  if (!target) return browser;

  browser.url('about:blank').url(target.href);
  return browser;
};

const waitForAppBootstrap = (browser, label, timeoutMs = 20000) => {
  browser.executeAsync(
    function (limitMs, done) {
      const startedAt = Date.now();
      const readState = function () {
        const app = document.querySelector('#app');
        const recovery = document.querySelector('#chunk-load-recovery .chunk-load-recovery');
        return {
          appChildCount: app ? app.childElementCount : 0,
          documentReadyState: document.readyState,
          hasAppContainer: !!document.querySelector('#app_container'),
          path: String(window.location.pathname || '').replace(/\/invite\/[^/]+/g, '/invite/[token]'),
          recoveryVisible: !!(
            recovery &&
            (recovery.offsetParent || recovery.getClientRects().length)
          ),
        };
      };
      const check = function () {
        const state = readState();
        if (state.hasAppContainer || state.recoveryVisible || Date.now() - startedAt >= limitMs) {
          done(state);
          return;
        }
        setTimeout(check, 250);
      };
      check();
    },
    [timeoutMs],
    (result) => {
      const state = result && result.value ? result.value : {
        appChildCount: 0,
        documentReadyState: 'unknown',
        hasAppContainer: false,
        path: '',
        recoveryVisible: false,
      };
      browser.assert.ok(
        state.hasAppContainer && !state.recoveryVisible,
        `${label || 'アプリの初期化'}: ${JSON.stringify(state)}`
      );
    }
  );
  return browser;
};

const findOptionalElement = (browser, selector, callback) => {
  browser.elements('css selector', selector, (result) => {
    const elements = result && Array.isArray(result.value) ? result.value : [];
    callback({
      status: elements.length > 0 ? 0 : -1,
      value: elements.length > 0 ? elements[0] : null,
    });
  });
};

const clearSessionState = (browser, done) => {
  browser
    .deleteCookies()
    .execute(
      function () {
        try {
          localStorage.removeItem('iseeetl_store');
          localStorage.removeItem('persist:root');
          sessionStorage.clear();
        } catch (_) {
          return { ok: false };
        }
        return { ok: true };
      },
      [],
      () => {
        if (typeof done === 'function') done();
      }
    );
};

const buildLoginUrl = (browser, floorId, roomId) => {
  const baseUrl = getBaseUrl(browser);
  return `${baseUrl.replace(/\/$/, '')}/login?floor_id=${encodeURIComponent(floorId)}&room_id=${encodeURIComponent(
    roomId
  )}`;
};

const waitForVisibleElement = (browser, selector, maxAttempts, onDone, attempt = 0) => {
  browser.execute(
    function (sel) {
      const node = document.querySelector(sel);
      const visible = !!(node && (node.offsetParent || node.getClientRects().length));
      return { visible };
    },
    [selector],
    (result) => {
      const visible = !!(result && result.value && result.value.visible);
      if (visible) {
        onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        onDone(false);
        return;
      }
      browser.pause(500, () => waitForVisibleElement(browser, selector, maxAttempts, onDone, attempt + 1));
    }
  );
};

const clickTimelineReconnect = (browser, onDone) => {
  browser.execute(
    function () {
      const button = document.querySelector('[data-testid="timeline-socket-status"] .socket-status__button');
      if (!button) return { clicked: false };
      const visible = !!(button.offsetParent || button.getClientRects().length);
      if (!visible) return { clicked: false };
      button.click();
      return { clicked: true };
    },
    [],
    (result) => {
      const clicked = !!(result && result.value && result.value.clicked);
      if (typeof onDone === 'function') onDone(clicked);
    }
  );
};

const waitForTimelineConnected = (browser, options = {}, attempt = 0) => {
  const { maxAttempts = 60, reconnectEvery = 8, reloadAttempt = 25, timelineUrl = '' } = options;

  browser.execute(
    function () {
      const visible = (node) => !!(node && (node.offsetParent || node.getClientRects().length));
      const connectedNode = document.querySelector('[data-testid="timeline-connected"]');
      const reconnectButton = document.querySelector('[data-testid="timeline-socket-status"] .socket-status__button');
      const socketStatus = document.querySelector('[data-testid="timeline-socket-status"] .socket-status__text');
      return {
        url: window.location.href,
        connectedVisible: visible(connectedNode),
        timelinePageVisible: visible(document.querySelector('.timeline-page')),
        reconnectVisible: visible(reconnectButton),
        socketStatus: socketStatus ? socketStatus.textContent.trim() : '',
        columnCount: document.querySelectorAll('.timeline-inner').length,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.connectedVisible) {
        return;
      }

      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `タイムラインに接続されていません: ${JSON.stringify(state)}`);
        return;
      }

      const continueWait = () => {
        const shouldReloadByCount = timelineUrl && attempt === reloadAttempt;
        const shouldReloadByState =
          timelineUrl &&
          !state.timelinePageVisible &&
          attempt > 0 &&
          attempt % 6 === 0 &&
          (!state.url || state.url.indexOf('/floor/') === -1 || state.url.indexOf('/room/') === -1);

        if (shouldReloadByCount || shouldReloadByState) {
          navigateToApp(browser, timelineUrl);
        }
        browser.pause(1000, () => waitForTimelineConnected(browser, options, attempt + 1));
      };

      if (state.reconnectVisible && attempt > 0 && attempt % reconnectEvery === 0) {
        clickTimelineReconnect(browser, () => continueWait());
        return;
      }

      continueWait();
    }
  );
};

const loginToTimeline = (browser, options) => {
  const {
    mail,
    password,
    floorId,
    roomId,
    waitForConnected = true,
    onTimelineVisibleFailure,
    waitForConnectedAttempts = 60,
    resetSession = true,
  } = options || {};
  const loginUrl = buildLoginUrl(browser, floorId, roomId);
  const baseUrl = getBaseUrl(browser).replace(/\/$/, '');
  const timelineUrl = `${baseUrl}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;

  if (resetSession) {
    browser.perform((done) => {
      clearSessionState(browser, done);
    });
  }

  navigateToApp(browser, loginUrl)
    .perform((done) => {
      const loginWithForm = () => {
        browser
          .waitForElementVisible('#mail', 10000)
          .clearValue('#mail')
          .setValue('#mail', mail)
          .clearValue('#password')
          .setValue('#password', password)
          .waitForElementVisible('[data-testid="login-submit"]', 10000)
          .click('[data-testid="login-submit"]');
      };

      findOptionalElement(browser, '#mail', (mailResult) => {
        if (mailResult.status === 0) {
          loginWithForm();
          done();
          return;
        }

        browser.execute(
          function () {
            try {
              const raw = localStorage.getItem('iseeetl_store');
              if (!raw) return { isLogin: false, hasToken: false };
              const store = JSON.parse(raw);
              const user = store && store.user ? store.user : {};
              return { isLogin: !!user.isLogin, hasToken: !!user.token };
            } catch (_) {
              return { isLogin: false, hasToken: false };
            }
          },
          [],
          (stateResult) => {
            const state = stateResult && stateResult.value ? stateResult.value : { isLogin: false, hasToken: false };
            if (state.isLogin && state.hasToken) {
              done();
              return;
            }
            navigateToApp(browser, `${baseUrl}/login`);
            loginWithForm();
            done();
          }
        );
      });
    })
    .perform((done) => {
      waitForVisibleElement(browser, '.timeline-page', 20, (visible) => {
        if (visible) {
          done();
          return;
        }
        navigateToApp(browser, timelineUrl);
        waitForVisibleElement(browser, '.timeline-page', 40, (retryVisible) => {
          if (!retryVisible && typeof onTimelineVisibleFailure === 'function') {
            onTimelineVisibleFailure(browser);
          }
          done();
        });
      });
    });

  if (waitForConnected) {
    waitForTimelineConnected(browser, {
      maxAttempts: waitForConnectedAttempts,
      timelineUrl,
    });
  }
};

module.exports = {
  requireEnv,
  getBaseUrl,
  navigateToApp,
  navigateDirectToApp,
  waitForAppBootstrap,
  findOptionalElement,
  buildLoginUrl,
  loginToTimeline,
};
