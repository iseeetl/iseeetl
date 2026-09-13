const readSessionSummary = (browser, onReady) => {
  browser.execute(
    function () {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.getSessionSummary() : null;
    },
    [],
    (result) => onReady(result && result.value ? result.value : null)
  );
};

const readTimelineSummary = (browser, onReady) => {
  browser.execute(
    function () {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.getTimelineSummary() : null;
    },
    [],
    (result) => onReady(result && result.value ? result.value : null)
  );
};

const waitForTimelineReady = (
  browser,
  { requireRoomReady = false, maxAttempts = 80, interval = 250 } = {},
  onReady,
  attempt = 0
) => {
  readTimelineSummary(browser, (summary) => {
    const ready = Boolean(
      summary &&
        summary.mounted &&
        summary.connected &&
        summary.connectionId &&
        (!requireRoomReady || summary.roomReady)
    );
    if (ready || attempt >= maxAttempts) {
      onReady(ready, summary);
      return;
    }
    browser.pause(interval, () =>
      waitForTimelineReady(
        browser,
        { requireRoomReady, maxAttempts, interval },
        onReady,
        attempt + 1
      )
    );
  });
};

const startTimelineProbe = (browser, type, onReady) => {
  browser.execute(
    function (probeType) {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.startTimelineProbe(probeType) : '';
    },
    [type],
    (result) => {
      const id = result && typeof result.value === 'string' ? result.value : '';
      browser.assert.ok(Boolean(id), `${type}の検証用の監視を開始しました。`);
      if (onReady) onReady(id);
    }
  );
};

const readTimelineProbe = (browser, id, onReady) => {
  browser.execute(
    function (probeId) {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.readTimelineProbe(probeId) : null;
    },
    [id],
    (result) => onReady(result && result.value ? result.value : null)
  );
};

const stopTimelineProbe = (browser, id) => {
  if (!id) return;
  browser.execute(
    function (probeId) {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.stopTimelineProbe(probeId) : false;
    },
    [id]
  );
};

const disconnectTimeline = (browser, onReady) => {
  browser.execute(
    function () {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.disconnectTimeline() : false;
    },
    [],
    (result) => {
      const accepted = Boolean(result && result.value);
      browser.assert.ok(accepted, '現在のタイムラインの切断要求が受け付けられました。');
      if (onReady) onReady(accepted);
    }
  );
};

const openSecondaryTimelineConnection = (browser, roomId, onReady) => {
  browser.execute(
    function (targetRoomId) {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.openSecondaryTimelineConnection(targetRoomId) : '';
    },
    [roomId],
    (result) => {
      const id = result && typeof result.value === 'string' ? result.value : '';
      browser.assert.ok(Boolean(id), '2本目のタイムライン接続を開きました。');
      if (onReady) onReady(id);
    }
  );
};

const readSecondaryTimelineConnection = (browser, id, onReady) => {
  browser.execute(
    function (connectionId) {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.readSecondaryTimelineConnection(connectionId) : null;
    },
    [id],
    (result) => onReady(result && result.value ? result.value : null)
  );
};

const closeSecondaryTimelineConnection = (browser, id) => {
  if (!id) return;
  browser.execute(
    function (connectionId) {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.closeSecondaryTimelineConnection(connectionId) : false;
    },
    [id]
  );
};

const verifyCapturedCredentialRejected = (browser, id, onReady) => {
  browser.executeAsync(
    function (probeId, done) {
      const contract = window.__ISEEETL_E2E__;
      if (!contract) {
        done(null);
        return;
      }
      contract.verifyCapturedCredentialRejected(probeId).then(done, () => done(null));
    },
    [id],
    (result) => onReady(result && result.value ? result.value : null)
  );
};

const startAuthRaceRequest = (browser, scenario, onReady) => {
  browser.execute(
    function (targetScenario) {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.startAuthRaceRequest(targetScenario) : '';
    },
    [scenario],
    (result) => {
      const id = result && typeof result.value === 'string' ? result.value : '';
      browser.assert.ok(Boolean(id), `${scenario}: 認証の競合テストの要求を開始しました。`);
      if (onReady) onReady(id);
    }
  );
};

const readAuthRaceRequest = (browser, id, onReady) => {
  browser.execute(
    function (requestId) {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.readAuthRaceRequest(requestId) : null;
    },
    [id],
    (result) => onReady(result && result.value ? result.value : null)
  );
};

const waitForAuthRaceRequest = (browser, id, onReady, attempt = 0) => {
  const maxAttempts = 40;
  readAuthRaceRequest(browser, id, (summary) => {
    if (summary?.settled || attempt >= maxAttempts) {
      browser.assert.ok(Boolean(summary?.found), '認証の競合テストの要求を引き続き監視できます。');
      browser.assert.ok(Boolean(summary?.settled), '認証の競合テストの要求が完了しました。');
      browser.assert.equal(summary?.outcome, 'rejected', '認証の競合テストの要求結果は401のままです。');
      browser.assert.equal(summary?.status, 401, '認証の競合テストのHTTPステータスは401のままです。');
      if (onReady) onReady(Boolean(summary?.settled), summary || {});
      return;
    }
    browser.pause(250, () => waitForAuthRaceRequest(browser, id, onReady, attempt + 1));
  });
};

const stopAuthRaceRequest = (browser, id) => {
  if (!id) return;
  browser.execute(
    function (requestId) {
      const contract = window.__ISEEETL_E2E__;
      return contract ? contract.stopAuthRaceRequest(requestId) : false;
    },
    [id],
    (result) => {
      browser.assert.ok(Boolean(result && result.value), '認証の競合テストの要求の監視を停止しました。');
    }
  );
};

module.exports = {
  readSessionSummary,
  readTimelineSummary,
  waitForTimelineReady,
  startTimelineProbe,
  readTimelineProbe,
  stopTimelineProbe,
  disconnectTimeline,
  openSecondaryTimelineConnection,
  readSecondaryTimelineConnection,
  closeSecondaryTimelineConnection,
  verifyCapturedCredentialRejected,
  startAuthRaceRequest,
  readAuthRaceRequest,
  waitForAuthRaceRequest,
  stopAuthRaceRequest,
};
