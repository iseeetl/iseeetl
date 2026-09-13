import { expect, vi } from 'vitest';

import { createPageTracker } from '@/features/analytics/pageTracking.js';

const FLOOR_A_ID = '507f1f77bcf86cd799439011';
const FLOOR_B_ID = '507f1f77bcf86cd799439012';
const ROOM_A_ID = '507f191e810c19729de860ea';
const ROOM_B_ID = '507f191e810c19729de860eb';

const route = (name, extra = {}) => ({ name, ...extra });
const floorRoute = (floorId = FLOOR_A_ID) =>
  route('Room', { params: { floor_id: floorId } });
const timelineRoute = ({
  name = 'TimeLine',
  floorId = FLOOR_A_ID,
  roomId = ROOM_A_ID,
} = {}) => route(name, { params: { floor_id: floorId, room_id: roomId } });
const floorResource = (floorId = FLOOR_A_ID, title = ' フロアA ') => ({
  _id: floorId,
  title,
  description: '送信禁止',
});
const roomResource = ({
  floorId = FLOOR_A_ID,
  floorTitle = ' フロアA ',
  roomId = ROOM_A_ID,
  roomTitle = ' ルームA ',
} = {}) => ({
  _id: roomId,
  title: roomTitle,
  floor: { _id: floorId, title: floorTitle },
  body: '送信禁止本文',
});
const floorPageLocation = (floorId = FLOOR_A_ID) =>
  `https://app.example.invalid/floor/${floorId.toLowerCase()}`;
const timelinePageLocation = ({
  floorId = FLOOR_A_ID,
  roomId = ROOM_A_ID,
} = {}) => `${floorPageLocation(floorId)}/room/${roomId.toLowerCase()}`;

const eventCalls = (runtime, eventName) =>
  runtime.track.mock.calls.filter(([name]) => name === eventName);
const pageViewCalls = (runtime) => eventCalls(runtime, 'page_view');
const pageExitCalls = (runtime) => eventCalls(runtime, 'iseeetl_page_exit');
const eventCallOrders = (runtime, eventName) =>
  runtime.track.mock.calls.flatMap(([name], index) =>
    name === eventName ? [runtime.track.mock.invocationCallOrder[index]] : []
  );

const createHarness = ({ requestActivation = vi.fn(() => false) } = {}) => {
  let currentRoute = route('Login');
  const runtime = {
    pause: vi.fn(() => true),
    updatePageContext: vi.fn(() => true),
    track: vi.fn(() => true),
  };
  const tracker = createPageTracker({
    runtime,
    browserWindow: { location: { origin: 'https://app.example.invalid' } },
    getCurrentRoute: () => currentRoute,
    requestActivation,
  });
  return {
    runtime,
    tracker,
    requestActivation,
    setCurrentRoute: (value) => { currentRoute = value; },
  };
};

describe('アクセス解析のページ閲覧計測', () => {
  it('固定ルート分類からquery/hash/paramsなしの安全な非対象 page_viewを送る', () => {
    const { runtime, tracker } = createHarness();
    tracker.setReady(true);

    expect(
      tracker.handleNavigation(
        route('Login', { fullPath: '/login?token=secret#fragment', params: { id: 'raw' } })
      )
    ).to.equal(true);

    expect(runtime.track).toHaveBeenCalledWith('page_view', {
      page_group: 'login',
      page_location: 'https://app.example.invalid/login',
      page_title: 'login',
    });
    expect(runtime.updatePageContext.mock.invocationCallOrder[0]).to.be.lessThan(
      eventCallOrders(runtime, 'page_view')[0]
    );
    expect(JSON.stringify(runtime.track.mock.calls)).not.to.contain('secret');
    expect(JSON.stringify(runtime.track.mock.calls)).not.to.contain('fragment');
  });

  it('計測準備前の画面遷移は最新のものだけを保持し、現在のルートと一致する場合だけ送る', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(false, { acceptPending: true });
    const login = route('Login');
    const register = route('Register');
    setCurrentRoute(login);
    tracker.handleNavigation(login);
    setCurrentRoute(register);
    tracker.handleNavigation(register);

    expect(tracker.setReady(true)).to.equal(true);
    expect(pageViewCalls(runtime)).to.have.length(1);
    expect(pageViewCalls(runtime)[0][1].page_group).to.equal('register');
  });

  it('識別情報再準備だけでは送信済みpage_viewを再送しない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));

    tracker.setReady(false, { acceptPending: true });
    expect(tracker.prepareCurrentPage()).to.deep.equal({
      page_group: 'login',
      page_location: 'https://app.example.invalid/login',
      page_title: 'login',
    });
    expect(tracker.setReady(true)).to.equal(true);
    expect(pageViewCalls(runtime)).to.have.length(1);

    setCurrentRoute(route('Register'));
    expect(tracker.handleNavigation(route('Register'))).to.equal(true);
    expect(pageViewCalls(runtime)[1][1]).to.include({
      page_group: 'register',
      page_referrer: 'https://app.example.invalid/login',
    });
    expect(pageExitCalls(runtime)).to.deep.equal([
      ['iseeetl_page_exit', {
        page_group: 'login',
        page_location: 'https://app.example.invalid/login',
        page_title: 'login',
      }],
    ]);
  });

  it('初回の許可ルートで計測の起動を要求し、正規化したページ情報を準備する', () => {
    const requestActivation = vi.fn(() => true);
    const { runtime, tracker, setCurrentRoute } = createHarness({ requestActivation });
    const unsafeRoute = route('ResetPassword', {
      fullPath: '/user/resetpassword?token=secret#fragment',
      query: { token: 'secret' },
    });
    setCurrentRoute(unsafeRoute);

    expect(tracker.handleNavigation(unsafeRoute)).to.equal(false);
    expect(requestActivation).toHaveBeenCalledOnce();
    expect(tracker.prepareCurrentPage()).to.deep.equal({
      page_group: 'password_reset_form',
      page_location: 'https://app.example.invalid/user/resetpassword',
      page_title: 'password_reset_form',
    });
    expect(JSON.stringify(tracker.prepareCurrentPage())).not.to.contain('secret');
    expect(runtime.track).not.toHaveBeenCalled();
  });

  it('未知ルートと不正対象 IDでは実行環境を停止する', () => {
    const requestActivation = vi.fn(() => true);
    const { runtime, tracker, setCurrentRoute } = createHarness({ requestActivation });
    setCurrentRoute(route('UserManagement', { query: { token: 'secret' } }));

    expect(tracker.handleNavigation(route('UserManagement'))).to.equal(false);
    expect(tracker.handleNavigation(floorRoute('invalid'))).to.equal(false);
    expect(requestActivation).not.toHaveBeenCalled();
    expect(runtime.pause).toHaveBeenCalledTimes(2);
    expect(tracker.prepareCurrentPage()).to.equal(null);
    expect(runtime.track).not.toHaveBeenCalled();
  });

  it('準備中にcurrent ルートが変わった場合は古い保留ページを送らない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(false, { acceptPending: true });
    tracker.handleNavigation(route('Login'));
    setCurrentRoute(route('Setting'));

    expect(tracker.setReady(true)).to.equal(false);
    expect(runtime.track).not.toHaveBeenCalled();
  });

  it('同じページ内のクエリ変更、遷移失敗、未知のルートは送信しない', () => {
    const { runtime, tracker } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));
    tracker.handleNavigation(route('Login', { query: { keyword: 'secret' } }));
    tracker.handleNavigation(route('Setting'), new Error('cancelled'));
    tracker.handleNavigation(route('UserManagement'));

    expect(pageViewCalls(runtime)).to.have.length(1);
  });

  it('停止/失敗時はpendingとreferrerを破棄しdispose後は送らない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));
    tracker.clear();
    tracker.setReady(true);
    const register = route('Register');
    setCurrentRoute(register);
    tracker.handleNavigation(register);
    expect(pageViewCalls(runtime)[1][1]).not.to.have.property('page_referrer');

    tracker.setReady(false, { discardPending: true, acceptPending: false });
    setCurrentRoute(route('Setting'));
    tracker.dispose();
    expect(tracker.handleNavigation(route('Setting'))).to.equal(false);
    expect(pageViewCalls(runtime)).to.have.length(2);
  });

  it('page_viewの送信に失敗した場合は計測を停止する', () => {
    const { runtime, tracker } = createHarness();
    runtime.track.mockReturnValue(false);
    tracker.setReady(true);

    expect(tracker.handleNavigation(route('Login'))).to.equal(false);
    expect(runtime.track).toHaveBeenCalledOnce();
    expect(runtime.updatePageContext).toHaveBeenCalledOnce();
    expect(runtime.pause).toHaveBeenCalledOnce();
  });

  it('新設定失敗ではpage_viewを送らず再開後に1件だけ送る', () => {
    const { runtime, tracker } = createHarness();
    runtime.updatePageContext.mockReturnValue(false);
    tracker.setReady(true);

    expect(tracker.handleNavigation(route('Login'))).to.equal(false);
    expect(runtime.track).not.toHaveBeenCalled();
    expect(runtime.pause).toHaveBeenCalledOnce();

    runtime.updatePageContext.mockReturnValue(true);
    expect(tracker.prepareCurrentPage()).to.include({ page_group: 'login' });
    expect(tracker.setReady(true)).to.equal(true);
    expect(runtime.track).toHaveBeenCalledOnce();
    expect(runtime.updatePageContext).toHaveBeenCalledTimes(2);
  });

  it('終了確認位置成功後の設定失敗を再開しても確認位置を重複送信しない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));

    runtime.updatePageContext.mockReturnValueOnce(false);
    const register = route('Register');
    setCurrentRoute(register);
    expect(tracker.handleNavigation(register)).to.equal(false);
    expect(pageExitCalls(runtime)).to.have.length(1);
    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group))
      .to.deep.equal(['login']);

    runtime.updatePageContext.mockReturnValue(true);
    expect(tracker.prepareCurrentPage()).to.include({ page_group: 'login' });
    expect(tracker.setReady(true)).to.equal(true);

    expect(pageExitCalls(runtime)).to.have.length(1);
    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group))
      .to.deep.equal(['login', 'register']);
  });
});

describe('アクセス解析の仮想ページ計測', () => {
  it('プロフィール開始と通常終了を背面ページとの仮想遷移として送る', () => {
    const { runtime, tracker } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));

    const token = tracker.beginVirtualPage('Profile');
    expect(Object.isFrozen(token)).to.equal(true);
    expect(tracker.beginVirtualPage('Profile')).to.equal(null);
    expect(tracker.endVirtualPage(token, { restore: true })).to.equal(true);
    expect(tracker.endVirtualPage(token, { restore: true })).to.equal(false);

    expect(pageViewCalls(runtime).map(([, parameters]) => parameters)).to.deep.equal([
      {
        page_group: 'login',
        page_location: 'https://app.example.invalid/login',
        page_title: 'login',
      },
      {
        page_group: 'profile',
        page_location: 'https://app.example.invalid/profile',
        page_title: 'profile',
        page_referrer: 'https://app.example.invalid/login',
      },
      {
        page_group: 'login',
        page_location: 'https://app.example.invalid/login',
        page_title: 'login',
        page_referrer: 'https://app.example.invalid/profile',
      },
    ]);
    expect(runtime.updatePageContext).toHaveBeenCalledTimes(3);
    const pageViewOrders = eventCallOrders(runtime, 'page_view');
    const pageExitOrders = eventCallOrders(runtime, 'iseeetl_page_exit');
    expect(runtime.updatePageContext.mock.invocationCallOrder[0]).to.be.lessThan(
      pageViewOrders[0]
    );
    expect(pageExitOrders[0]).to.be.lessThan(
      runtime.updatePageContext.mock.invocationCallOrder[1]
    );
    expect(runtime.updatePageContext.mock.invocationCallOrder[1]).to.be.lessThan(
      pageViewOrders[1]
    );
    expect(pageExitOrders[1]).to.be.lessThan(
      runtime.updatePageContext.mock.invocationCallOrder[2]
    );
    expect(runtime.updatePageContext.mock.invocationCallOrder[2]).to.be.lessThan(
      pageViewOrders[2]
    );
  });

  it('タイムライン背面の対象名称をプロフィール終了後の復帰画面へ戻す', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    setCurrentRoute(current);
    tracker.setReady(true);
    tracker.handleNavigation(current);
    tracker.activateResourcePage(tracker.captureResourcePage(), roomResource());

    const token = tracker.beginVirtualPage('Profile');
    tracker.endVirtualPage(token);

    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'timeline',
      'profile',
      'timeline',
    ]);
    expect(pageViewCalls(runtime)[1][1]).not.to.have.any.keys(
      'floor_id',
      'floor_title',
      'room_id',
      'room_title'
    );
    expect(pageViewCalls(runtime)[2][1]).to.include({
      floor_id: FLOOR_A_ID,
      floor_title: 'フロアA',
      room_id: ROOM_A_ID,
      room_title: 'ルームA',
      page_referrer: 'https://app.example.invalid/profile',
    });
  });

  it('パスワード変更へ進む終了では背面画面を挟まない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));

    const token = tracker.beginVirtualPage('Profile');
    expect(
      tracker.endVirtualPage(token, {
        restore: false,
        deferUntilNavigation: true,
      })
    ).to.equal(true);
    const changePassword = route('ChangePassword');
    setCurrentRoute(changePassword);
    tracker.handleNavigation(changePassword);

    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'login',
      'profile',
      'change_password',
    ]);
    expect(pageViewCalls(runtime)[2][1].page_referrer).to.equal(
      'https://app.example.invalid/profile'
    );
  });

  it('準備前に閉じたプロフィールを後から送らない', () => {
    const requestActivation = vi.fn(() => true);
    const { runtime, tracker } = createHarness({ requestActivation });
    tracker.setReady(false, { acceptPending: true });
    tracker.handleNavigation(route('Login'));

    const token = tracker.beginVirtualPage('Profile');
    expect(tracker.endVirtualPage(token)).to.equal(true);
    expect(tracker.prepareCurrentPage()).to.include({ page_group: 'login' });
    expect(tracker.setReady(true)).to.equal(true);

    expect(runtime.track).toHaveBeenCalledOnce();
    expect(pageViewCalls(runtime)[0][1].page_group).to.equal('login');
  });

  it('対象解決がプロフィール表示中でも背面復帰時にpage_viewを送る', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    const onPageViewSent = vi.fn();
    setCurrentRoute(current);
    tracker.setReady(true);
    tracker.handleNavigation(current);
    const resourceToken = tracker.captureResourcePage();
    const profileToken = tracker.beginVirtualPage('Profile');

    expect(
      tracker.activateResourcePage(resourceToken, roomResource(), onPageViewSent)
    ).to.equal(true);
    expect(onPageViewSent).not.toHaveBeenCalled();
    expect(tracker.endVirtualPage(profileToken)).to.equal(true);

    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'profile',
      'timeline',
    ]);
    expect(onPageViewSent).toHaveBeenCalledOnce();
  });

  it('実ルート遷移でプロフィールトークンを失効させ新ルートだけを送る', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));
    const token = tracker.beginVirtualPage('Profile');

    const register = route('Register');
    setCurrentRoute(register);
    expect(tracker.handleNavigation(register)).to.equal(true);
    expect(tracker.endVirtualPage(token)).to.equal(false);

    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'login',
      'profile',
      'register',
    ]);
  });

  it('同じ分析ページ内のルート変更では仮想Profile終了時に背面コンテキストを復元する', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    setCurrentRoute(current);
    tracker.setReady(true);
    tracker.handleNavigation(current);
    tracker.activateResourcePage(tracker.captureResourcePage(), roomResource());
    const token = tracker.beginVirtualPage('Profile');

    const detail = timelineRoute({ name: 'TimeLinePostDetail' });
    detail.params.post_id = 'must-not-pass';
    setCurrentRoute(detail);
    expect(
      tracker.endVirtualPage(token, {
        restore: false,
        deferUntilNavigation: true,
        navigationAlreadyChanged: true,
      })
    ).to.equal(true);
    expect(tracker.handleNavigation(detail)).to.equal(false);

    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'timeline',
      'profile',
      'timeline',
    ]);
    expect(runtime.updatePageContext).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page_group: 'timeline',
        floor_title: 'フロアA',
        room_title: 'ルームA',
      })
    );
    expect(JSON.stringify(runtime.track.mock.calls)).not.to.contain('must-not-pass');
  });

  it('仮想Profile終了後のルート失敗では背面コンテキストへ戻す', () => {
    const { runtime, tracker } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));
    const token = tracker.beginVirtualPage('Profile');
    tracker.endVirtualPage(token, {
      restore: false,
      deferUntilNavigation: true,
    });

    expect(
      tracker.handleNavigation(route('ChangePassword'), new Error('cancelled'))
    ).to.equal(false);
    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'login',
      'profile',
    ]);
    expect(tracker.restoreDeferredVirtualPage(token)).to.equal(true);
    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'login',
      'profile',
      'login',
    ]);
  });

  it('RouterがafterEach前にrejectした場合は保留中の背面コンテキストを明示復旧する', () => {
    const { runtime, tracker } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));
    const token = tracker.beginVirtualPage('Profile');
    tracker.endVirtualPage(token, {
      restore: false,
      deferUntilNavigation: true,
    });

    expect(tracker.restoreDeferredVirtualPage(token)).to.equal(true);
    expect(tracker.restoreDeferredVirtualPage(token)).to.equal(false);
    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'login',
      'profile',
      'login',
    ]);
    expect(tracker.beginVirtualPage('Profile')).not.to.equal(null);
  });

  it('古い遷移失敗トークンでは新しいProfile終了保留を復旧しない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));

    const oldToken = tracker.beginVirtualPage('Profile');
    tracker.endVirtualPage(oldToken, {
      restore: false,
      deferUntilNavigation: true,
    });
    const register = route('Register');
    setCurrentRoute(register);
    expect(tracker.handleNavigation(register)).to.equal(true);

    const currentToken = tracker.beginVirtualPage('Profile');
    tracker.endVirtualPage(currentToken, {
      restore: false,
      deferUntilNavigation: true,
    });

    expect(tracker.restoreDeferredVirtualPage(oldToken)).to.equal(false);
    expect(tracker.beginVirtualPage('Profile')).to.equal(null);
    expect(tracker.restoreDeferredVirtualPage(currentToken)).to.equal(true);
    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'login',
      'profile',
      'register',
      'profile',
      'register',
    ]);
  });

  it('未送信Profileで実行環境再開中に閉じても背面コンテキストを維持する', () => {
    const requestActivation = vi.fn(() => true);
    const { runtime, tracker } = createHarness({ requestActivation });
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));
    tracker.suspend();

    const token = tracker.beginVirtualPage('Profile');
    expect(tracker.prepareCurrentPage()).to.deep.equal({
      page_group: 'login',
      page_location: 'https://app.example.invalid/login',
      page_title: 'login',
    });
    expect(tracker.endVirtualPage(token)).to.equal(true);
    expect(tracker.setReady(true)).to.equal(true);

    expect(runtime.updatePageContext).toHaveBeenLastCalledWith({
      page_group: 'login',
      page_location: 'https://app.example.invalid/login',
      page_title: 'login',
    });
    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group)).to.deep.equal([
      'login',
    ]);
  });

  it('許可していない仮想ページの開始を拒否する', () => {
    const { tracker } = createHarness();
    expect(tracker.beginVirtualPage('Login')).to.equal(null);
  });
});

describe('アクセス解析のフロア・ルーム画面の計測', () => {
  it('タイムライン→ルーム一覧で旧タイムラインを確定してから新コンテキストとpage_viewを送る', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const timeline = timelineRoute();
    setCurrentRoute(timeline);
    tracker.setReady(true);
    tracker.handleNavigation(timeline);
    tracker.activateResourcePage(tracker.captureResourcePage(), roomResource());

    const roomList = floorRoute();
    setCurrentRoute(roomList);
    tracker.handleNavigation(roomList);
    tracker.activateResourcePage(tracker.captureResourcePage(), floorResource());

    expect(pageViewCalls(runtime).map(([, parameters]) => parameters.page_group))
      .to.deep.equal(['timeline', 'room_list']);
    expect(pageExitCalls(runtime)).to.deep.equal([
      ['iseeetl_page_exit', {
        page_group: 'timeline',
        page_location: timelinePageLocation(),
        page_title: 'timeline',
        floor_id: FLOOR_A_ID,
        floor_title: 'フロアA',
        room_id: ROOM_A_ID,
        room_title: 'ルームA',
      }],
    ]);
    expect(pageExitCalls(runtime)[0][1]).not.to.have.property(
      'engagement_time_msec'
    );

    const exitOrder = eventCallOrders(runtime, 'iseeetl_page_exit')[0];
    const roomListConfigOrder = runtime.updatePageContext.mock.invocationCallOrder[1];
    const roomListPageViewOrder = eventCallOrders(runtime, 'page_view')[1];
    expect(exitOrder).to.be.lessThan(roomListConfigOrder);
    expect(roomListConfigOrder).to.be.lessThan(roomListPageViewOrder);
  });

  it('送信済みページから未解決対象へ移動中の実行環境再準備でも旧コンテキストを維持する', () => {
    const requestActivation = vi.fn(() => true);
    const { runtime, tracker, setCurrentRoute } = createHarness({ requestActivation });
    tracker.setReady(true);
    tracker.handleNavigation(route('Login'));

    tracker.setReady(false, { acceptPending: true });
    const current = timelineRoute();
    setCurrentRoute(current);
    expect(tracker.handleNavigation(current)).to.equal(false);
    expect(tracker.prepareCurrentPage()).to.deep.equal({
      page_group: 'login',
      page_location: 'https://app.example.invalid/login',
      page_title: 'login',
    });
    expect(tracker.setReady(true)).to.equal(true);
    expect(runtime.track).toHaveBeenCalledOnce();

    expect(
      tracker.activateResourcePage(tracker.captureResourcePage(), roomResource())
    ).to.equal(true);
    expect(pageViewCalls(runtime)).to.have.length(2);
    expect(pageExitCalls(runtime)).to.have.length(1);
    expect(pageViewCalls(runtime)[1][1]).to.include({
      page_group: 'timeline',
      floor_id: FLOOR_A_ID,
      room_id: ROOM_A_ID,
    });
  });

  it('画面のデータ取得がルート確定より先でも、対象設定の後にpage_viewを送る', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    setCurrentRoute(current);
    tracker.setReady(true);

    const token = tracker.captureResourcePage();
    expect(runtime.updatePageContext).not.toHaveBeenCalled();
    expect(runtime.track).not.toHaveBeenCalled();
    expect(tracker.activateResourcePage(token, roomResource())).to.equal(true);
    expect(runtime.updatePageContext.mock.invocationCallOrder[0]).to.be.lessThan(
      eventCallOrders(runtime, 'page_view')[0]
    );
    expect(tracker.handleNavigation(current)).to.equal(false);
    expect(runtime.track).toHaveBeenCalledOnce();
  });

  it('フロア取得まではpage_viewを送らず、取得後にIDとタイトル付きで1回だけ送る', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = floorRoute();
    setCurrentRoute(current);
    tracker.setReady(true);

    expect(tracker.handleNavigation(current)).to.equal(false);
    expect(runtime.track).not.toHaveBeenCalled();
    expect(runtime.updatePageContext).not.toHaveBeenCalled();

    const token = tracker.captureResourcePage();
    expect(Object.isFrozen(token)).to.equal(true);
    expect(tracker.activateResourcePage(token, floorResource())).to.equal(true);
    expect(tracker.activateResourcePage(token, floorResource())).to.equal(false);
    expect(runtime.track).toHaveBeenCalledOnce();
    expect(runtime.track).toHaveBeenCalledWith('page_view', {
      page_group: 'room_list',
      page_location: floorPageLocation(),
      page_title: 'room_list',
      floor_id: FLOOR_A_ID,
      floor_title: 'フロアA',
    });
    expect(JSON.stringify(runtime.track.mock.calls)).not.to.contain('送信禁止');
  });

  it('タイムライン取得が計測準備より先でも情報を保持し、準備完了後に1回だけ送る', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    setCurrentRoute(current);
    tracker.setReady(false, { acceptPending: true });
    tracker.handleNavigation(current);
    const token = tracker.captureResourcePage();

    expect(tracker.activateResourcePage(token, roomResource())).to.equal(true);
    expect(tracker.prepareCurrentPage()).to.deep.equal({
      page_group: 'timeline',
      page_location: timelinePageLocation(),
      page_title: 'timeline',
      floor_id: FLOOR_A_ID,
      floor_title: 'フロアA',
      room_id: ROOM_A_ID,
      room_title: 'ルームA',
    });
    expect(runtime.track).not.toHaveBeenCalled();
    expect(tracker.setReady(true)).to.equal(true);
    expect(runtime.track).toHaveBeenCalledOnce();
  });

  it('フロア A→Bとルーム A→Bを別ページ境界として送る', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(true);

    const floorA = floorRoute(FLOOR_A_ID);
    setCurrentRoute(floorA);
    tracker.handleNavigation(floorA);
    tracker.activateResourcePage(tracker.captureResourcePage(), floorResource(FLOOR_A_ID, 'A'));

    const floorB = floorRoute(FLOOR_B_ID);
    setCurrentRoute(floorB);
    tracker.handleNavigation(floorB);
    tracker.activateResourcePage(tracker.captureResourcePage(), floorResource(FLOOR_B_ID, 'B'));

    const roomA = timelineRoute({ floorId: FLOOR_B_ID, roomId: ROOM_A_ID });
    setCurrentRoute(roomA);
    tracker.handleNavigation(roomA);
    tracker.activateResourcePage(tracker.captureResourcePage(), roomResource({
      floorId: FLOOR_B_ID,
      floorTitle: 'B',
      roomId: ROOM_A_ID,
      roomTitle: 'Room A',
    }));

    const roomB = timelineRoute({ floorId: FLOOR_B_ID, roomId: ROOM_B_ID });
    setCurrentRoute(roomB);
    tracker.handleNavigation(roomB);
    tracker.activateResourcePage(tracker.captureResourcePage(), roomResource({
      floorId: FLOOR_B_ID,
      floorTitle: 'B',
      roomId: ROOM_B_ID,
      roomTitle: 'Room B',
    }));

    expect(pageViewCalls(runtime).map(([, parameters]) => [
      parameters.floor_id,
      parameters.room_id || null,
    ])).to.deep.equal([
      [FLOOR_A_ID, null],
      [FLOOR_B_ID, null],
      [FLOOR_B_ID, ROOM_A_ID],
      [FLOOR_B_ID, ROOM_B_ID],
    ]);
  });

  it('同じルームの一覧・投稿詳細・クエリ変更ではページ閲覧を再送しない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const list = timelineRoute();
    setCurrentRoute(list);
    tracker.setReady(true);
    tracker.handleNavigation(list);
    tracker.activateResourcePage(tracker.captureResourcePage(), roomResource());

    const detail = timelineRoute({ name: 'TimeLinePostDetail' });
    detail.query = { keyword: 'secret' };
    detail.params.post_id = 'raw-post-id';
    setCurrentRoute(detail);

    expect(tracker.handleNavigation(detail)).to.equal(false);
    expect(runtime.track).toHaveBeenCalledOnce();
    expect(JSON.stringify(runtime.track.mock.calls)).not.to.contain('raw-post-id');
  });

  it('ルート変更後の旧API応答とルート IDに一致しない対象を拒否する', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    tracker.setReady(true);
    const floorA = floorRoute(FLOOR_A_ID);
    setCurrentRoute(floorA);
    tracker.handleNavigation(floorA);
    const staleToken = tracker.captureResourcePage();

    const floorB = floorRoute(FLOOR_B_ID);
    setCurrentRoute(floorB);
    tracker.handleNavigation(floorB);
    const currentToken = tracker.captureResourcePage();

    expect(tracker.activateResourcePage(staleToken, floorResource(FLOOR_A_ID))).to.equal(false);
    expect(tracker.activateResourcePage(currentToken, floorResource(FLOOR_A_ID))).to.equal(false);
    expect(runtime.track).not.toHaveBeenCalled();
  });

  it('画面遷移に失敗した場合は旧対象のトークンと計測情報を保ち、新しいイベントを作らない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = floorRoute(FLOOR_A_ID);
    setCurrentRoute(current);
    tracker.setReady(true);
    tracker.handleNavigation(current);
    const token = tracker.captureResourcePage();

    expect(tracker.handleNavigation(floorRoute(FLOOR_B_ID), new Error('cancelled'))).to.equal(false);
    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.track).not.toHaveBeenCalled();
    expect(tracker.activateResourcePage(token, floorResource(FLOOR_A_ID))).to.equal(true);
    expect(runtime.track).toHaveBeenCalledOnce();
  });

  it('取得失敗や画面破棄後は未送信の対象情報を適用せず、遅れて届いた成功応答を拒否する', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    setCurrentRoute(current);
    tracker.setReady(true);
    tracker.handleNavigation(current);
    const token = tracker.captureResourcePage();

    expect(tracker.cancelResourcePage(token)).to.equal(true);
    expect(tracker.cancelResourcePage(token)).to.equal(false);
    expect(tracker.activateResourcePage(token, roomResource())).to.equal(false);
    expect(runtime.updatePageContext).not.toHaveBeenCalled();
    expect(runtime.track).not.toHaveBeenCalled();
  });

  it('次の対象へ遷移済みなら旧画面の取消で古い設定を送らない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const timeline = timelineRoute();
    setCurrentRoute(timeline);
    tracker.setReady(true);
    tracker.handleNavigation(timeline);
    const timelineToken = tracker.captureResourcePage();
    tracker.activateResourcePage(timelineToken, roomResource());

    const floor = floorRoute(FLOOR_B_ID);
    setCurrentRoute(floor);
    expect(tracker.cancelResourcePage(timelineToken)).to.equal(true);
    expect(runtime.updatePageContext).toHaveBeenCalledOnce();

    tracker.handleNavigation(floor);
    const floorToken = tracker.captureResourcePage();
    tracker.activateResourcePage(floorToken, floorResource(FLOOR_B_ID, 'B'));

    expect(runtime.updatePageContext).toHaveBeenCalledTimes(2);
    expect(runtime.updatePageContext.mock.calls[1][0]).to.include({
      floor_id: FLOOR_B_ID,
      floor_title: 'B',
    });
  });

  it('準備中に取り消した対象情報は、その後に準備が完了しても適用しない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    setCurrentRoute(current);
    tracker.setReady(false, { acceptPending: true });
    tracker.handleNavigation(current);
    const token = tracker.captureResourcePage();
    expect(tracker.activateResourcePage(token, roomResource())).to.equal(true);

    expect(tracker.cancelResourcePage(token)).to.equal(true);
    expect(tracker.setReady(true)).to.equal(true);
    expect(runtime.updatePageContext).not.toHaveBeenCalled();
    expect(runtime.track).not.toHaveBeenCalled();
  });

  it('対象ページのAPIは対象外ルートと偽のトークンを拒否する', () => {
    const { tracker } = createHarness();
    expect(tracker.captureResourcePage()).to.equal(null);
    expect(tracker.activateResourcePage(Object.freeze({}), floorResource())).to.equal(false);
    expect(tracker.cancelResourcePage(Object.freeze({}))).to.equal(false);
  });

  it('page_view実送信後にだけ完了コールバックを一度呼ぶ', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    const onPageViewSent = vi.fn();
    setCurrentRoute(current);
    tracker.setReady(false, { acceptPending: true });
    tracker.handleNavigation(current);

    expect(
      tracker.activateResourcePage(
        tracker.captureResourcePage(),
        roomResource(),
        onPageViewSent
      )
    ).to.equal(true);
    expect(onPageViewSent).not.toHaveBeenCalled();

    expect(tracker.setReady(true)).to.equal(true);
    expect(runtime.track).toHaveBeenCalledOnce();
    expect(onPageViewSent).toHaveBeenCalledOnce();
    expect(runtime.track.mock.invocationCallOrder[0]).to.be.lessThan(
      onPageViewSent.mock.invocationCallOrder[0]
    );
    expect(tracker.setReady(true)).to.equal(true);
    expect(onPageViewSent).toHaveBeenCalledOnce();
  });

  it('送信済みの画面遷移を取り消して再開した場合は設定だけを復元する', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = floorRoute();
    const duplicatePageViewCallback = vi.fn();
    setCurrentRoute(current);
    tracker.setReady(true);
    tracker.handleNavigation(current);
    const firstToken = tracker.captureResourcePage();
    tracker.activateResourcePage(firstToken, floorResource());

    expect(tracker.cancelResourcePage(firstToken)).to.equal(true);
    const secondToken = tracker.captureResourcePage();
    expect(
      tracker.activateResourcePage(
        secondToken,
        floorResource(),
        duplicatePageViewCallback
      )
    ).to.equal(true);

    expect(runtime.track).toHaveBeenCalledOnce();
    expect(duplicatePageViewCallback).not.toHaveBeenCalled();
    expect(runtime.updatePageContext).toHaveBeenLastCalledWith({
      page_group: 'room_list',
      page_location: floorPageLocation(),
      page_title: 'room_list',
      floor_id: FLOOR_A_ID,
      floor_title: 'フロアA',
    });
  });

  it('送信済み対象ページは一時停止後もコンテキストを復元してpage_viewを再送しない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    const onPageViewSent = vi.fn();
    setCurrentRoute(current);
    tracker.setReady(true);
    tracker.handleNavigation(current);
    tracker.activateResourcePage(
      tracker.captureResourcePage(),
      roomResource(),
      onPageViewSent
    );

    expect(runtime.track).toHaveBeenCalledOnce();
    expect(onPageViewSent).toHaveBeenCalledOnce();
    expect(tracker.suspend()).to.equal(true);
    expect(tracker.prepareCurrentPage()).to.deep.equal({
      page_group: 'timeline',
      page_location: timelinePageLocation(),
      page_title: 'timeline',
      floor_id: FLOOR_A_ID,
      floor_title: 'フロアA',
      room_id: ROOM_A_ID,
      room_title: 'ルームA',
    });

    expect(tracker.setReady(true)).to.equal(true);
    expect(runtime.track).toHaveBeenCalledOnce();
    expect(onPageViewSent).toHaveBeenCalledOnce();

    const setting = route('Setting');
    setCurrentRoute(setting);
    expect(tracker.handleNavigation(setting)).to.equal(true);
    expect(pageViewCalls(runtime)[1][1]).not.to.have.property('page_referrer');
  });

  it('対象解決が一時停止中でもtoken/contextを保持して再開後に1件送る', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = timelineRoute();
    const onPageViewSent = vi.fn();
    setCurrentRoute(current);
    tracker.setReady(true);
    tracker.handleNavigation(current);
    const token = tracker.captureResourcePage();

    tracker.suspend();
    expect(
      tracker.activateResourcePage(token, roomResource(), onPageViewSent)
    ).to.equal(true);
    expect(runtime.track).not.toHaveBeenCalled();
    expect(onPageViewSent).not.toHaveBeenCalled();

    expect(tracker.prepareCurrentPage()).to.include({
      floor_title: 'フロアA',
      room_title: 'ルームA',
    });
    expect(tracker.setReady(true)).to.equal(true);
    expect(runtime.track).toHaveBeenCalledOnce();
    expect(onPageViewSent).toHaveBeenCalledOnce();
  });

  it('一時停止中のルート変更は旧トークンを拒否して現在対象だけを再開する', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const floorA = floorRoute(FLOOR_A_ID);
    setCurrentRoute(floorA);
    tracker.setReady(true);
    tracker.handleNavigation(floorA);
    const staleToken = tracker.captureResourcePage();

    tracker.suspend();
    const floorB = floorRoute(FLOOR_B_ID);
    setCurrentRoute(floorB);
    tracker.handleNavigation(floorB);
    const currentToken = tracker.captureResourcePage();

    expect(
      tracker.activateResourcePage(staleToken, floorResource(FLOOR_A_ID, 'A'))
    ).to.equal(false);
    expect(
      tracker.activateResourcePage(currentToken, floorResource(FLOOR_B_ID, 'B'))
    ).to.equal(true);
    expect(runtime.track).not.toHaveBeenCalled();

    tracker.prepareCurrentPage();
    expect(tracker.setReady(true)).to.equal(true);
    expect(runtime.track).toHaveBeenCalledOnce();
    expect(pageViewCalls(runtime)[0][1]).to.include({
      floor_id: FLOOR_B_ID,
      floor_title: 'B',
    });
  });

  it('遅延した旧ルート hookは現在対象トークンとコンテキストを変更しない', () => {
    const { runtime, tracker, setCurrentRoute } = createHarness();
    const current = floorRoute(FLOOR_B_ID);
    setCurrentRoute(current);
    tracker.setReady(true);
    const currentToken = tracker.captureResourcePage();

    expect(tracker.handleNavigation(floorRoute(FLOOR_A_ID))).to.equal(false);
    expect(runtime.pause).not.toHaveBeenCalled();
    expect(runtime.track).not.toHaveBeenCalled();
    expect(
      tracker.activateResourcePage(
        currentToken,
        floorResource(FLOOR_B_ID, 'Floor B')
      )
    ).to.equal(true);
    expect(runtime.track).toHaveBeenCalledOnce();
    expect(pageViewCalls(runtime)[0][1].floor_id).to.equal(FLOOR_B_ID);
  });
});
