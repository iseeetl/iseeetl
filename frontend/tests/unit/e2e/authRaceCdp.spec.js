import { EventEmitter } from 'node:events';

import { expect, vi } from 'vitest';

import {
  AUTH_RACE_FETCH_PATTERNS,
  GUEST_REFRESH_SCENARIO,
  USER_401_SCENARIO,
  classifyAuthRaceRequest,
  installAuthRaceCdpController,
} from '../../e2e/specs/helpers/auth-race-cdp';

const APPLICATION_ORIGIN = 'http://localhost:3100';

const browserFor = (connection) => ({
  launchUrl: APPLICATION_ORIGIN,
  driver: { createCDPConnection: vi.fn(async () => connection) },
});

const emitPausedRequest = (socket, requestId, method, url) => {
  socket.emit(
    'message',
    Buffer.from(
      JSON.stringify({
        method: 'Fetch.requestPaused',
        params: { requestId, request: { method, url } },
      })
    )
  );
};

describe('認証競合E2Eの通信制御', () => {
  it('専用オリジン・パス・メソッド・クエリだけを認証競合リクエストとして分類する', () => {
    expect(
      classifyAuthRaceRequest(
        `${APPLICATION_ORIGIN}/api/user/detail?e2e_auth_race=user-401`,
        'GET',
        APPLICATION_ORIGIN
      )
    ).to.equal('user-401');
    expect(
      classifyAuthRaceRequest(
        `${APPLICATION_ORIGIN}/api/user/detail?e2e_auth_race=guest-refresh`,
        'GET',
        APPLICATION_ORIGIN
      )
    ).to.equal('guest-initial-401');
    expect(
      classifyAuthRaceRequest(
        `${APPLICATION_ORIGIN}/api/guest/refresh`,
        'POST',
        APPLICATION_ORIGIN
      )
    ).to.equal('guest-refresh');
    expect(
      classifyAuthRaceRequest(
        `${APPLICATION_ORIGIN}/api/user/detail?e2e_auth_race=user-401&extra=1`,
        'GET',
        APPLICATION_ORIGIN
      )
    ).to.equal('unexpected');
    expect(
      classifyAuthRaceRequest(
        'http://localhost:5100/api/user/detail?e2e_auth_race=user-401',
        'GET',
        APPLICATION_ORIGIN
      )
    ).to.equal('unrelated');
  });

  it('ユーザ 401とゲスト更新を個別に保留し、安全な件数だけを公開する', async () => {
    const socket = new EventEmitter();
    const send = vi.fn(async () => ({ result: {} }));
    const connection = { _wsConnection: socket, send };
    const controller = await installAuthRaceCdpController(browserFor(connection));

    expect(send).toHaveBeenCalledWith('Fetch.enable', { patterns: AUTH_RACE_FETCH_PATTERNS });

    expect(controller.beginScenario(USER_401_SCENARIO)).to.equal(true);
    emitPausedRequest(
      socket,
      'user-request',
      'GET',
      `${APPLICATION_ORIGIN}/api/user/detail?e2e_auth_race=user-401`
    );
    await controller.waitForHeldRequest('user-401');
    expect(controller.summary()).to.include({
      user401RequestCount: 1,
      heldRequestCount: 1,
    });
    await controller.releaseUser401();
    expect(controller.completeScenario(USER_401_SCENARIO)).to.equal(true);

    expect(controller.beginScenario(GUEST_REFRESH_SCENARIO)).to.equal(true);
    emitPausedRequest(
      socket,
      'guest-initial',
      'GET',
      `${APPLICATION_ORIGIN}/api/user/detail?e2e_auth_race=guest-refresh`
    );
    await vi.waitFor(() =>
      expect(controller.summary().guestInitial401RequestCount).to.equal(1)
    );
    emitPausedRequest(
      socket,
      'guest-refresh',
      'POST',
      `${APPLICATION_ORIGIN}/api/guest/refresh`
    );
    await controller.waitForHeldRequest('guest-refresh');
    await controller.releaseGuestRefresh();
    expect(controller.completeScenario(GUEST_REFRESH_SCENARIO)).to.equal(true);

    expect(controller.summary()).to.deep.include({
      scenario: 'idle',
      user401RequestCount: 1,
      guestInitial401RequestCount: 1,
      guestRefreshRequestCount: 1,
      unexpectedRequestCount: 0,
      handlerErrorCount: 0,
      connectionErrorCount: 0,
      heldRequestCount: 0,
    });
    expect(JSON.stringify(controller.summary())).not.to.contain('discarded-stale-credential');
    expect(send.mock.calls.filter(([method]) => method === 'Fetch.fulfillRequest'))
      .to.have.length(3);

    const stopped = await controller.stop();
    expect(stopped).to.include({
      listenerAttached: false,
      fetchEnabled: false,
      stopped: true,
      teardownErrorCount: 0,
    });
    expect(send).toHaveBeenCalledWith('Fetch.disable', {});
  });

  it('対象シナリオ以外のゲスト認証更新はバックエンドへ送る', async () => {
    const socket = new EventEmitter();
    const send = vi.fn(async () => ({ result: {} }));
    const controller = await installAuthRaceCdpController(
      browserFor({ _wsConnection: socket, send })
    );

    emitPausedRequest(
      socket,
      'normal-guest-refresh',
      'POST',
      `${APPLICATION_ORIGIN}/api/guest/refresh`
    );
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith('Fetch.continueRequest', {
        requestId: 'normal-guest-refresh',
      })
    );
    expect(controller.summary().guestRefreshRequestCount).to.equal(0);
    await controller.stop();
  });
});
