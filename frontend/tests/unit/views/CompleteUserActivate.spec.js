import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import authApi from '@/api/auth';
import CompleteUserActivate from '@/views/CompleteUserActivate.vue';

const buildViewWithoutLifecycle = (view) => ({
  ...view,
  created() {},
  mounted() {},
  beforeUnmount() {},
});

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  props: {
    dialogVisible: Boolean,
    title: String,
    confirmLabel: String,
    cancelLabel: String,
    confirmTone: String,
    confirmIcon: String,
    confirmTestId: String,
    initialFocus: String,
    actionsAdjacent: Boolean,
    sending: Boolean,
  },
  template: '<div><slot /></div>',
};

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
  shallowMount(buildViewWithoutLifecycle(CompleteUserActivate), {
    stubs: { ConfirmDialog: ConfirmDialogStub },
    mocks: {
      $route: overrides.route || { params: {}, query: {} },
      $router: overrides.router || { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('ユーザ本登録の完了画面', () => {
  let originalActivate;

  beforeEach(() => {
    originalActivate = authApi.activate;
  });

  afterEach(() => {
    authApi.activate = originalActivate;
  });

  it('画面見出しに共通view-titleを使用する', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('h1.view-title').exists()).to.equal(true);
  });

  it('結果ダイアログは明示タイトルと遷移先を示す単一主要操作を使う', async () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(ConfirmDialogStub);

    expect(dialog.props()).to.include({
      title: 'ユーザアクティベーション結果',
      confirmLabel: 'ログインページへ',
      cancelLabel: null,
      confirmTone: 'primary',
      confirmIcon: 'login',
      confirmTestId: 'activation-result-next',
      initialFocus: "[data-testid='activation-result-next']",
      actionsAdjacent: true,
    });

    await wrapper.setData({ isError: true });
    expect(dialog.props('confirmLabel')).to.equal('トップページへ');
    expect(dialog.props('confirmIcon')).to.equal('home');
  });

  it('無効トークンはAPIを呼ばず即座にエラー扱いにする', async () => {
    let requestCount = 0;
    authApi.activate = () => {
      requestCount += 1;
      return Promise.resolve();
    };
    const wrapper = createWrapper({ route: { params: { invite_token: null }, query: {} } });
    wrapper.vm.initCompleteUserInvite();
    await wrapper.vm.$nextTick();

    expect(requestCount).to.equal(0);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.isError).to.equal(true);
    expect(wrapper.vm.confirmDialogVisible).to.equal(true);
    expect(wrapper.findComponent(ConfirmDialogStub).props('dialogVisible')).to.equal(true);
  });

  it('有効化中はダイアログを隠して多重実行を拒否し、成功後だけルームリンクを表示する', async () => {
    const request = createDeferred();
    let requestCount = 0;
    authApi.activate = () => {
      requestCount += 1;
      return request.promise;
    };

    const wrapper = createWrapper({ route: { params: { invite_token: 'token' }, query: {} } });
    const firstRequest = wrapper.vm.initCompleteUserInvite();
    const duplicateRequest = wrapper.vm.initCompleteUserInvite();
    await wrapper.vm.$nextTick();

    expect(requestCount).to.equal(1);
    expect(duplicateRequest).to.be.instanceOf(Promise);
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('true');
    expect(wrapper.find('[role="status"]').text()).to.equal('読み込み中です');
    expect(wrapper.findComponent(ConfirmDialogStub).props('dialogVisible')).to.equal(false);
    expect(wrapper.findComponent({ name: 'RouterLink' }).exists()).to.equal(false);
    expect(wrapper.text()).to.not.include('再試行');

    request.resolve({
      data: { floorId: 'f1', floorTitle: 'Floor', roomId: 'r1', roomTitle: 'Room' },
    });
    await firstRequest;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isError).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.confirmDialogVisible).to.equal(true);
    expect(wrapper.vm.message).to.equal(
      'アカウントを有効化しました。ログインページからログインしてください。'
    );
    expect(wrapper.vm.floorId).to.equal('f1');
    expect(wrapper.vm.roomId).to.equal('r1');
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('false');
    expect(wrapper.find('[role="status"]').exists()).to.equal(false);
    expect(wrapper.findComponent(ConfirmDialogStub).props('dialogVisible')).to.equal(true);
    expect(wrapper.findComponent({ name: 'RouterLink' }).props('to')).to.deep.equal({
      name: 'TimeLine',
      params: { floor_id: 'f1', room_id: 'r1' },
    });
  });

  it('有効化失敗後だけエラーダイアログを表示する', async () => {
    const request = createDeferred();
    authApi.activate = () => request.promise;
    const wrapper = createWrapper({ route: { params: { invite_token: 'token' }, query: {} } });

    const pendingRequest = wrapper.vm.initCompleteUserInvite();
    request.reject({ response: { status: 400 } });
    await pendingRequest;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.isError).to.equal(true);
    expect(wrapper.vm.confirmDialogVisible).to.equal(true);
    expect(wrapper.vm.message).to.include('アカウントのアクティベーションに失敗しました');
    expect(wrapper.find('[role="status"]').exists()).to.equal(false);
    expect(wrapper.findComponent({ name: 'RouterLink' }).exists()).to.equal(false);
    expect(wrapper.text()).to.not.include('再試行');
  });

  it('ルームリンクはフロアとルームのID・タイトルがすべて揃う場合だけ表示する', async () => {
    const wrapper = createWrapper();
    const completeState = {
      isError: false,
      floorId: 'f1',
      floorTitle: 'Floor',
      roomId: 'r1',
      roomTitle: 'Room',
    };

    await wrapper.setData(completeState);
    expect(wrapper.findComponent({ name: 'RouterLink' }).exists()).to.equal(true);

    for (const field of ['floorId', 'floorTitle', 'roomId', 'roomTitle']) {
      await wrapper.setData({ ...completeState, [field]: null });
      expect(wrapper.findComponent({ name: 'RouterLink' }).exists(), field).to.equal(false);
    }
  });

  it('確認操作で遷移先を切り替え、ログイン画面へフロア・ルームIDを引き継ぐ', () => {
    const pushes = [];
    const wrapper = createWrapper({
      router: {
        push: (route) => {
          pushes.push(route);
          return { catch: () => {} };
        },
      },
    });
    wrapper.vm.isError = true;
    wrapper.vm.onConfirmFromDialog();
    expect(pushes[0]).to.deep.equal({ name: 'Floor' });

    wrapper.vm.isError = false;
    wrapper.vm.floorId = 'f1';
    wrapper.vm.roomId = 'r1';
    wrapper.vm.floorTitle = null;
    wrapper.vm.roomTitle = null;
    wrapper.vm.onConfirmFromDialog();
    expect(pushes[1]).to.deep.equal({ name: 'Login', query: { floor_id: 'f1', room_id: 'r1' } });

    wrapper.vm.roomId = null;
    wrapper.vm.onConfirmFromDialog();
    expect(pushes[2]).to.deep.equal({ name: 'Login' });
  });
});
