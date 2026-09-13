import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import roomMemberApi from '@/api/roomMember';
import CompleteRoomInvite from '@/views/CompleteRoomInvite.vue';

const createRouter = (pushCalls = []) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/login', name: 'Login' }],
  });
  router.push = (to) => {
    pushCalls.push(to);
    return Promise.resolve();
  };
  return router;
};

const buildViewWithoutLifecycle = (view) => ({
  ...view,
  created() {},
  mounted() {},
  beforeUnmount() {},
});

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createWrapper = (overrides = {}) =>
  shallowMount(overrides.runCreated ? CompleteRoomInvite : buildViewWithoutLifecycle(CompleteRoomInvite), {
    router: overrides.router || createRouter(),
    mocks: {
      $route: overrides.route || { params: {} },
      $store: overrides.store || { dispatch: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('ルーム招待の完了画面', () => {
  let originalCreateByInvite;

  beforeEach(() => {
    originalCreateByInvite = roomMemberApi.createByInvite;
  });

  afterEach(() => {
    roomMemberApi.createByInvite = originalCreateByInvite;
  });

  it('画面見出しに共通view-titleを使用する', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('h1.view-title').exists()).to.equal(true);
  });

  it('参加処理中は結果を隠して多重実行を拒否し、成功後だけルームリンクを表示する', async () => {
    const request = createDeferred();
    let requestCount = 0;
    roomMemberApi.createByInvite = () => {
      requestCount += 1;
      return request.promise;
    };

    const wrapper = createWrapper();
    await wrapper.setData({ floorId: 'f1', roomId: 'r1', inviteToken: 'token' });
    const firstRequest = wrapper.vm.joinRoomByInvite();
    const duplicateRequest = wrapper.vm.joinRoomByInvite();
    await wrapper.vm.$nextTick();

    expect(requestCount).to.equal(1);
    expect(duplicateRequest).to.be.instanceOf(Promise);
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('true');
    expect(wrapper.find('[role="status"]').text()).to.equal('読み込み中です');
    expect(wrapper.find('[role="alert"]').exists()).to.equal(false);
    expect(wrapper.findComponent({ name: 'RouterLink' }).exists()).to.equal(false);

    request.resolve({ data: { room: { title: 'Room' } } });
    await firstRequest;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isError).to.equal(false);
    expect(wrapper.vm.roomTitle).to.equal('Room');
    expect(wrapper.vm.message).to.include('Room');
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('false');
    expect(wrapper.find('[role="status"]').exists()).to.equal(false);
    expect(wrapper.findComponent({ name: 'RouterLink' }).props('to')).to.deep.equal({
      path: '/floor/f1/room/r1',
    });
    expect(wrapper.text()).to.not.include('再試行');
  });

  it('参加失敗後だけエラーとフロア一覧への退避導線を表示する', async () => {
    const request = createDeferred();
    roomMemberApi.createByInvite = () => request.promise;
    const wrapper = createWrapper();
    await wrapper.setData({ floorId: 'f1', roomId: 'r1', inviteToken: 'token' });

    const pendingRequest = wrapper.vm.joinRoomByInvite();
    request.reject({ response: { status: 400 } });
    await pendingRequest;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isError).to.equal(true);
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('false');
    expect(wrapper.find('[role="alert"]').text()).to.include('ルームメンバーの参加に失敗しました');
    expect(wrapper.findComponent({ name: 'RouterLink' }).props('to')).to.deep.equal({ path: '/' });
    expect(wrapper.text()).to.not.include('ルームへ移動する');
    expect(wrapper.text()).to.not.include('再試行');
  });

  it('必須ルートパラメータが欠ける場合はAPIを呼ばずエラーを表示する', () => {
    let requestCount = 0;
    roomMemberApi.createByInvite = () => {
      requestCount += 1;
      return Promise.resolve();
    };

    const wrapper = createWrapper({
      runCreated: true,
      route: { params: { floor_id: 'f1', room_id: 'r1' } },
    });

    expect(requestCount).to.equal(0);
    expect(wrapper.vm.isError).to.equal(true);
    expect(wrapper.find('[role="alert"]').text()).to.equal('ルームメンバーの参加に失敗しました');
    expect(wrapper.findComponent({ name: 'RouterLink' }).props('to')).to.deep.equal({ path: '/' });
  });

  it('招待参加で401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    roomMemberApi.createByInvite = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      router: createRouter(pushCalls),
      store: { dispatch: (type) => dispatchCalls.push(type) },
    });
    await wrapper.setData({ floorId: 'f1', roomId: 'r1', inviteToken: 'token' });
    await wrapper.vm.joinRoomByInvite();

    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls).to.deep.include({ name: 'Login' });
    expect(wrapper.vm.isError).to.equal(true);
  });
});
