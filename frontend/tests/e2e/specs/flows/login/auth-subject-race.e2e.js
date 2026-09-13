const {
  GUEST_REFRESH_SCENARIO,
  USER_401_SCENARIO,
  installAuthRaceCdpController,
} = require('../../helpers/auth-race-cdp');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { logoutIfPossible } = require('../../helpers/guest-helpers');
const {
  readSessionSummary,
  startAuthRaceRequest,
  stopAuthRaceRequest,
  waitForAuthRaceRequest,
} = require('../../helpers/e2e-public-contract');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');

const state = {
  controller: null,
  scenariosCompleted: false,
};

const waitForGuestSession = (browser, onReady, attempt = 0) => {
  const maxAttempts = 40;
  readSessionSummary(browser, (summary) => {
    const ready = Boolean(
      summary &&
        summary.loggedIn === false &&
        summary.guestIdPresent === true &&
        summary.credentialPresent === true
    );
    if (ready || attempt >= maxAttempts) {
      browser.assert.ok(ready, '更新応答を遅延させるテストの前に、ゲストのセッションを確認しました。');
      if (onReady) onReady(ready, summary || {});
      return;
    }
    browser.pause(250, () => waitForGuestSession(browser, onReady, attempt + 1));
  });
};

const beginScenario = (browser, scenario) => {
  browser.perform(() => {
    browser.assert.ok(
      state.controller?.beginScenario(scenario) === true,
      `${scenario}: CDPで応答を制御するテストを開始しました。`
    );
  });
};

const waitForHeldResponse = (browser, kind) => {
  browser.perform((done) => {
    state.controller.waitForHeldRequest(kind).then(
      (summary) => {
        browser.assert.equal(summary.heldRequestCount, 1, `${kind}: 応答を保留しています。`);
        done();
      },
      () => {
        browser.assert.ok(false, `${kind}: 応答を保留できませんでした。`);
        done();
      }
    );
  });
};

const releaseHeldResponse = (browser, label, release) => {
  browser.perform((done) => {
    Promise.resolve()
      .then(release)
      .then(
        (summary) => {
          browser.assert.equal(summary.heldRequestCount, 0, `${label}: 保留した応答を返しました。`);
          done();
        },
        () => {
          browser.assert.ok(false, `${label}: 保留した応答を返せませんでした。`);
          done();
        }
      );
  });
};

const completeScenario = (browser, scenario) => {
  browser.perform(() => {
    browser.assert.ok(
      state.controller?.completeScenario(scenario) === true,
      `${scenario}: CDPで応答を制御するテストが完了しました。`
    );
  });
};

const assertCurrentAuthorSession = (browser, label) => {
  waitForUserRole(browser, 'Author');
  readSessionSummary(browser, (summary) => {
    browser.assert.ok(summary?.loggedIn === true, `${label}: 登録ユーザのセッションを維持しています。`);
    browser.assert.equal(summary?.role, 'Author', `${label}: 現在の投稿者を維持しています。`);
    browser.assert.ok(summary?.userIdPresent === true, `${label}: 現在のユーザの識別情報を維持しています。`);
    browser.assert.ok(summary?.guestIdPresent === false, `${label}: 古いゲストの識別情報が復元されていません。`);
    browser.assert.ok(summary?.credentialPresent === true, `${label}: 現在の認証情報を維持しています。`);
  });
};

const validateControllerSummary = (browser) => {
  browser.perform(() => {
    const summary = state.controller.summary();
    const expected = {
      scenario: 'idle',
      user401RequestCount: 1,
      guestInitial401RequestCount: 1,
      guestRefreshRequestCount: 1,
      unexpectedRequestCount: 0,
      handlerErrorCount: 0,
      connectionErrorCount: 0,
      teardownErrorCount: 0,
      activeHandlerCount: 0,
      heldRequestCount: 0,
      listenerAttached: true,
      fetchEnabled: true,
      stopped: false,
    };
    Object.entries(expected).forEach(([name, value]) => {
      browser.assert.equal(summary[name], value, `認証の競合テストのCDP通信確認: ${name}`);
    });
    state.scenariosCompleted = true;
  });
};

const finishBrowserSession = (browser, done, error = null) => {
  try {
    browser.end((result) => {
      const browserError = result instanceof Error || result?.status === -1;
      done(error || (browserError ? new Error('認証の競合テストのブラウザセッションが終了しませんでした。') : undefined));
    });
  } catch (_error) {
    done(error || new Error('認証の競合テストのブラウザセッションの終了を開始できませんでした。'));
  }
};

module.exports = {
  before(browser, done) {
    state.controller = null;
    state.scenariosCompleted = false;
    installAuthRaceCdpController(browser).then(
      (controller) => {
        state.controller = controller;
        done();
      },
      () => done(new Error('認証の競合テスト用のCDP応答制御を準備できませんでした。'))
    );
  },

  after(browser, done) {
    if (!state.controller) {
      finishBrowserSession(browser, done);
      return;
    }
    state.controller.stop().then(
      (summary) => {
        const lifecycleFailed =
          summary.listenerAttached ||
          summary.fetchEnabled ||
          !summary.stopped ||
          summary.heldRequestCount !== 0 ||
          summary.activeHandlerCount !== 0 ||
          summary.handlerErrorCount !== 0 ||
          summary.connectionErrorCount !== 0 ||
          summary.teardownErrorCount !== 0;
        const completionFailed = state.scenariosCompleted && (
          summary.user401RequestCount !== 1 ||
          summary.guestInitial401RequestCount !== 1 ||
          summary.guestRefreshRequestCount !== 1 ||
          summary.unexpectedRequestCount !== 0
        );
        const error = lifecycleFailed || completionFailed
          ? new Error(`認証の競合テストのCDPの後片付けに失敗しました: ${JSON.stringify(summary)}`)
          : null;
        finishBrowserSession(browser, done, error);
      },
      () => finishBrowserSession(browser, done, new Error('認証の競合テスト用のCDP応答制御の後片付けに失敗しました。'))
    );
  },

  '遅れて届いた401応答やゲスト認証の更新で現在の認証情報を上書きしない': (browser) => {
    const editor = {
      mail: process.env.E2E_FLOOR_EDITOR_MAIL || '',
      password: process.env.E2E_FLOOR_EDITOR_PASSWORD || '',
    };
    const author = {
      mail: process.env.E2E_USER_MAIL || '',
      password: process.env.E2E_USER_PASSWORD || '',
    };
    if (!editor.mail || !editor.password || !author.mail || !author.password) {
      browser.assert.ok(false, '認証の競合テストには、Git管理されたフロア編集ユーザと投稿者のアカウントが必要です。');
      return;
    }
    if (editor.mail === author.mail) {
      browser.assert.ok(false, '認証の競合テストでは、フロア編集ユーザと投稿者のアカウントを分けてください。');
      return;
    }

    let userRequestId = '';
    let guestRequestId = '';

    clearBrowserSession(browser);
    loginByForm(browser, editor);
    waitForUserRole(browser, 'Editor');

    beginScenario(browser, USER_401_SCENARIO);
    startAuthRaceRequest(browser, USER_401_SCENARIO, (requestId) => {
      userRequestId = requestId;
    });
    waitForHeldResponse(browser, 'user-401');

    logoutIfPossible(browser);
    loginByForm(browser, author);
    waitForUserRole(browser, 'Author');
    releaseHeldResponse(browser, '以前のユーザへの401応答', () => state.controller.releaseUser401());
    browser.perform(() => {
      if (!userRequestId) browser.assert.ok(false, 'ユーザの401応答を検証する要求の結果を取得できませんでした。');
      else waitForAuthRaceRequest(browser, userRequestId);
    });
    assertCurrentAuthorSession(browser, '以前のユーザへの401応答');
    browser.perform(() => stopAuthRaceRequest(browser, userRequestId));
    completeScenario(browser, USER_401_SCENARIO);

    logoutIfPossible(browser);
    waitForGuestSession(browser);
    beginScenario(browser, GUEST_REFRESH_SCENARIO);
    startAuthRaceRequest(browser, GUEST_REFRESH_SCENARIO, (requestId) => {
      guestRequestId = requestId;
    });
    waitForHeldResponse(browser, 'guest-refresh');

    loginByForm(browser, author);
    waitForUserRole(browser, 'Author');
    releaseHeldResponse(browser, '以前のゲストの更新応答', () => state.controller.releaseGuestRefresh());
    browser.perform(() => {
      if (!guestRequestId) browser.assert.ok(false, 'ゲストの更新要求の検証結果を取得できませんでした。');
      else waitForAuthRaceRequest(browser, guestRequestId);
    });
    assertCurrentAuthorSession(browser, '以前のゲストの更新応答');
    browser.perform(() => stopAuthRaceRequest(browser, guestRequestId));
    completeScenario(browser, GUEST_REFRESH_SCENARIO);
    validateControllerSummary(browser);
  },
};
