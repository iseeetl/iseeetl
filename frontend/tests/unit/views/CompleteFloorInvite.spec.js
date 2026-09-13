import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import floorMemberApi from '@/api/floorMember';
import CompleteFloorInvite from '@/views/CompleteFloorInvite.vue';

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
  shallowMount(overrides.runCreated ? CompleteFloorInvite : buildViewWithoutLifecycle(CompleteFloorInvite), {
    router: overrides.router || createRouter(),
    mocks: {
      $route: overrides.route || { params: {} },
      $store: overrides.store || { dispatch: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('フロア招待の完了画面', () => {
  let originalCreateByInvite;

  beforeEach(() => {
    originalCreateByInvite = floorMemberApi.createByInvite;
  });

  afterEach(() => {
    floorMemberApi.createByInvite = originalCreateByInvite;
  });

  it('画面見出しに共通view-titleを使用する', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('h1.view-title').exists()).to.equal(true);
  });

  it('参加処理中は結果を隠して多重実行を拒否し、成功後だけフロアリンクを表示する', async () => {
    const request = createDeferred();
    let requestCount = 0;
    floorMemberApi.createByInvite = () => {
      requestCount += 1;
      return request.promise;
    };

    const wrapper = createWrapper();
    const firstRequest = wrapper.vm.joinFloorByInvite('f1', 'token');
    const duplicateRequest = wrapper.vm.joinFloorByInvite('f1', 'token');
    await wrapper.vm.$nextTick();

    expect(requestCount).to.equal(1);
    expect(duplicateRequest).to.be.instanceOf(Promise);
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('true');
    expect(wrapper.find('[role="status"]').text()).to.equal('読み込み中です');
    expect(wrapper.find('[role="alert"]').exists()).to.equal(false);
    expect(wrapper.findComponent({ name: 'RouterLink' }).exists()).to.equal(false);

    request.resolve({ data: { floor: { _id: 'f1', title: 'Floor' } } });
    await firstRequest;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isError).to.equal(false);
    expect(wrapper.vm.floor_id).to.equal('f1');
    expect(wrapper.vm.message).to.equal(
      'Floor フロアに参加しました。 参加したフロアでは、ルームの作成、更新、削除ができます。'
    );
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('false');
    expect(wrapper.find('[role="status"]').exists()).to.equal(false);
    expect(wrapper.findComponent({ name: 'RouterLink' }).props('to')).to.deep.equal({ path: '/floor/f1' });
    expect(wrapper.text()).to.not.include('再試行');
  });

  it('参加失敗後だけエラーとフロア一覧への退避導線を表示する', async () => {
    const request = createDeferred();
    floorMemberApi.createByInvite = () => request.promise;
    const wrapper = createWrapper();

    const pendingRequest = wrapper.vm.joinFloorByInvite('f1', 'token');
    request.reject({ response: { status: 400 } });
    await pendingRequest;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isError).to.equal(true);
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('false');
    expect(wrapper.find('[role="alert"]').text()).to.include('フロアメンバーへの参加に失敗しました');
    expect(wrapper.findComponent({ name: 'RouterLink' }).props('to')).to.deep.equal({ path: '/' });
    expect(wrapper.text()).to.not.include('フロアへ移動する');
    expect(wrapper.text()).to.not.include('再試行');
  });

  it('必須ルートパラメータが欠ける場合はAPIを呼ばずエラーを表示する', () => {
    let requestCount = 0;
    floorMemberApi.createByInvite = () => {
      requestCount += 1;
      return Promise.resolve();
    };

    const wrapper = createWrapper({
      runCreated: true,
      route: { params: { floor_id: 'f1' } },
    });

    expect(requestCount).to.equal(0);
    expect(wrapper.vm.isError).to.equal(true);
    expect(wrapper.find('[role="alert"]').text()).to.equal('フロアメンバーへの参加に失敗しました');
    expect(wrapper.findComponent({ name: 'RouterLink' }).props('to')).to.deep.equal({ path: '/' });
  });

  it('招待参加で401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    floorMemberApi.createByInvite = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      router: createRouter(pushCalls),
      store: { dispatch: (type) => dispatchCalls.push(type) },
    });

    await wrapper.vm.joinFloorByInvite('f1', 'token');

    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls).to.deep.include({ name: 'Login' });
    expect(wrapper.vm.isError).to.equal(true);
  });
});
