// 期限切れを試す場合は、BackendとE2Eに設定するトークンの有効期間を合わせる。
// GUEST_ACCESS_TTLにE2E_GUEST_ACCESS_TTL_SECONDSを、GUEST_REFRESH_TTLにE2E_GUEST_REFRESH_TTL_SECONDSを合わせる。
// E2E_GUEST_EXPIRY_SCENARIOのaccessまたはrefreshで、期限切れにするトークンを選ぶ。
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const { openGuestTimeline } = require('../../helpers/guest-helpers');
const { disconnectTimelineSocket, reconnectTimelineSocket } = require('../../helpers/timeline-two-client');
const {
  readSessionSummary,
  waitForTimelineReady,
  startTimelineProbe,
  readTimelineProbe,
  stopTimelineProbe,
} = require('../../helpers/e2e-public-contract');

let guestReconnectProbeId = '';

const parsePositiveSeconds = (value) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
};

const waitForGuestAuthReady = (browser, onReady, attempt = 0) => {
  const maxAttempts = 80;
  readSessionSummary(browser, (state) => {
    const ready = Boolean(
      state && !state.loggedIn && state.guestIdPresent && state.credentialPresent
    );
    if (ready) {
      browser.assert.ok(true, 'タイムラインを開く前にゲストの認証を確認しました。');
      onReady(true);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(
        false,
        `ゲストの認証を確認できませんでした(loggedIn=${Boolean(state && state.loggedIn)}, ` +
          `guestIdPresent=${Boolean(state && state.guestIdPresent)}, ` +
          `credentialPresent=${Boolean(state && state.credentialPresent)}).`
      );
      onReady(false);
      return;
    }
    browser.pause(250, () => waitForGuestAuthReady(browser, onReady, attempt + 1));
  });
};

const armGuestReconnectProbe = (browser, onArmed) => {
  if (guestReconnectProbeId) stopTimelineProbe(browser, guestReconnectProbeId);
  waitForTimelineReady(browser, { requireRoomReady: true }, (ready, summary) => {
    browser.assert.ok(Boolean(summary && summary.mounted), 'ゲストのタイムラインが表示されています。');
    browser.assert.ok(Boolean(summary && summary.connected), '再接続前にゲストのSocketが接続されています。');
    browser.assert.ok(Boolean(summary && summary.connectionId), 'ゲストのSocketに接続IDがあります。');
    browser.assert.ok(Boolean(summary && summary.roomReady), '再接続前にゲストがROOM_STATUS_UPDATEを受信しました。');
    if (!ready) {
      if (onArmed) onArmed(false);
      return;
    }
    startTimelineProbe(browser, 'connection-state', (id) => {
      guestReconnectProbeId = id;
      if (onArmed) onArmed(Boolean(id));
    });
  });
};

const waitForGuestReconnectResult = (
  browser,
  { expectGuestIdPreserved = true, label = 'ゲストの再接続' } = {},
  onDone,
  attempt = 0
) => {
  const maxAttempts = 80;
  readTimelineProbe(browser, guestReconnectProbeId, (state) => {
    const identityMatches = expectGuestIdPreserved
      ? Boolean(state && state.guestIdentityPreserved)
      : Boolean(state && state.guestIdentityChanged);
    const completed = Boolean(
      state &&
        state.found &&
        state.connectionChanged &&
        state.credentialChanged &&
        identityMatches &&
        state.roomReady
    );
    if (completed || attempt >= maxAttempts) {
      browser.assert.ok(Boolean(state && state.found), `${label}: 再接続の検証用の監視を引き続き利用できます。`);
      browser.assert.ok(Boolean(state && state.connectionChanged), `${label}: 新しい接続IDを取得しました。`);
      browser.assert.ok(Boolean(state && state.credentialChanged), `${label}: ゲストの認証情報が変わりました。`);
      browser.assert.ok(identityMatches, `${label}: ゲストの識別情報が想定した復旧経路と一致しました。`);
      browser.assert.ok(Boolean(state && state.roomReady), `${label}: タイムラインのルームに再参加しました。`);
      stopTimelineProbe(browser, guestReconnectProbeId);
      guestReconnectProbeId = '';
      if (onDone) onDone(completed, state || {});
      return;
    }
    browser.pause(250, () =>
      waitForGuestReconnectResult(browser, { expectGuestIdPreserved, label }, onDone, attempt + 1)
    );
  });
};

const waitForConfiguredExpiry = (browser, seconds, label, onDone) => {
  browser.pause((seconds + 1) * 1000, () => {
    browser.assert.ok(true, `${label}: 設定した期限内での有効期限切れの待機が完了しました。`);
    onDone();
  });
};

const reconnectAfterExpiredRefreshToken = (browser, onDone) => {
  browser
    .waitForElementVisible('[data-testid="timeline-socket-status"] .socket-status__button', 20000)
    .click('[data-testid="timeline-socket-status"] .socket-status__button');
  waitForGuestReconnectResult(
    browser,
    { expectGuestIdPreserved: false, label: '更新トークンの期限切れからの初期化' },
    onDone
  );
};

const runShortTtlAccessRecoveryAssertions = (browser, { expectedAccessTtlSeconds }) => {
  armGuestReconnectProbe(browser, (armed) => {
    if (!armed) return browser.end();
    disconnectTimelineSocket(browser);
    waitForConfiguredExpiry(browser, expectedAccessTtlSeconds, 'ゲストのアクセストークン', () => {
      reconnectTimelineSocket(browser);
      waitForGuestReconnectResult(
        browser,
        { expectGuestIdPreserved: true, label: '期限切れのアクセストークンを更新' },
        () => browser.end()
      );
    });
  });
};

const runShortTtlRefreshRecoveryAssertions = (browser, { expectedRefreshTtlSeconds }) => {
  armGuestReconnectProbe(browser, (armed) => {
    if (!armed) return browser.end();
    waitForConfiguredExpiry(browser, expectedRefreshTtlSeconds, 'ゲストの更新トークン', () => {
      disconnectTimelineSocket(browser);
      reconnectAfterExpiredRefreshToken(browser, () => browser.end());
    });
  });
};

module.exports = {
  'ゲストの再接続時に認証を更新してタイムラインへ再参加する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const expectedAccessTtlSeconds = parsePositiveSeconds(process.env.E2E_GUEST_ACCESS_TTL_SECONDS);
    const expectedRefreshTtlSeconds = parsePositiveSeconds(process.env.E2E_GUEST_REFRESH_TTL_SECONDS);
    const expiryScenario = String(process.env.E2E_GUEST_EXPIRY_SCENARIO || '').trim();
    const shortTtlMode = expectedAccessTtlSeconds > 0 || expectedRefreshTtlSeconds > 0;

    if (!editorMail || !editorPassword) {
      browser.assert.ok(false, 'ゲストの再接続のE2Eには、手順書に記載されたフロア編集ユーザの認証情報が必要です。');
      browser.end();
      return;
    }
    if (
      shortTtlMode &&
      (!expectedAccessTtlSeconds ||
        !expectedRefreshTtlSeconds ||
        expectedRefreshTtlSeconds - expectedAccessTtlSeconds < 3 ||
        !['access', 'refresh'].includes(expiryScenario))
    ) {
      browser.assert.ok(
        false,
        '短いTTLのモードには、手順書の2種類のTTL値、3秒の更新猶予、有効期限切れのテストが必要です。'
      );
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Guest Reconnect Floor ${stamp}`;
    const roomTitle = `E2E Guest Reconnect Room ${stamp}`;
    const state = prepareFloorRoom(browser, { editorMail, editorPassword, floorTitle, roomTitle });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'ゲストの再接続のE2E用のフロアIDまたはルームIDを取得できませんでした。');
        browser.end();
        return;
      }

      waitForGuestAuthReady(browser, (ready) => {
        if (!ready) return browser.end();
        openGuestTimeline(browser, state.floorId, state.roomId);
        if (shortTtlMode) {
          const options = { expectedAccessTtlSeconds, expectedRefreshTtlSeconds };
          if (expiryScenario === 'access') runShortTtlAccessRecoveryAssertions(browser, options);
          else runShortTtlRefreshRecoveryAssertions(browser, options);
          return;
        }
        armGuestReconnectProbe(browser, (armed) => {
          if (!armed) return browser.end();
          disconnectTimelineSocket(browser);
          reconnectTimelineSocket(browser);
          waitForGuestReconnectResult(browser, {}, () => browser.end());
        });
      });
    });
  },
};
