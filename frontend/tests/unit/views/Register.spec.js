import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import authApi from '@/api/auth';
import Register from '@/views/Register.vue';

import flushPromises from '../helpers/flushPromises';

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  props: {
    dialogVisible: Boolean,
    title: String,
    message: String,
    confirmLabel: String,
    cancelLabel: String,
    confirmTone: String,
    confirmIcon: String,
    confirmTestId: String,
    initialFocus: String,
    actionsAdjacent: Boolean,
    sending: Boolean,
  },
  template: '<div />',
};

const baseStubs = {
  BackButton: true,
  ConfirmDialog: ConfirmDialogStub,
  UiButton: true,
  UiField: true,
  UiIcon: true,
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a><slot /></a>',
  },
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    mailDeliveryAvailable: true,
    ...overrides.getters,
  },
  dispatch: overrides.dispatch || (() => {}),
});

const createWrapper = (overrides = {}) => {
  const route = overrides.route || { params: {}, query: {} };
  const router = overrides.router || { push: () => {}, replace: () => {} };
  const wrapper = shallowMount(Register, {
    stubs: baseStubs,
    mocks: {
      $store: overrides.store || createStoreMock(),
      $router: router,
      $route: route,
      $t: (key) => key,
      $i18n: { locale: 'en' },
      ...(overrides.mocks || {}),
    },
  });
  Object.defineProperty(wrapper.vm, '$route', { value: route, configurable: true });
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

describe('ユーザ登録画面', () => {
  let originalRegister;

  beforeEach(() => {
    originalRegister = authApi.register;
  });

  afterEach(() => {
    authApi.register = originalRegister;
  });

  it('ログインへの戻り先に入室先を渡し、規約類の別タブ表示を維持する', () => {
    const query = { floor_id: 'f1', room_id: 'r1' };
    const wrapper = createWrapper({ route: { query, params: {} } });
    expect(wrapper.findComponent({ name: 'BackButton' }).props('to')).toEqual({ name: 'Login', query });
    for (const link of wrapper.findAllComponents({ name: 'RouterLink' })) {
      expect(link.attributes('target')).toBe('_blank');
    }
  });

  it('メール配送が無効ならログインへ戻し登録APIを呼ばない', () => {
    const replaceCalls = [];
    let registerCalls = 0;
    authApi.register = () => {
      registerCalls += 1;
      return Promise.resolve();
    };
    const wrapper = createWrapper({
      route: { params: {}, query: { room_id: 'room-1' } },
      router: { push: () => {}, replace: (location) => replaceCalls.push(location) },
      store: createStoreMock({ getters: { mailDeliveryAvailable: false } }),
    });

    expect(wrapper.find('.view').exists()).to.equal(false);
    expect(replaceCalls).to.deep.equal([{ name: 'Login', query: { room_id: 'room-1' } }]);

    replaceCalls.length = 0;
    wrapper.vm.register({ preventDefault: () => {} });

    expect(replaceCalls).to.deep.equal([{ name: 'Login', query: { room_id: 'room-1' } }]);
    expect(registerCalls).to.equal(0);
  });

  it('パラメータを優先してroomContextQueryを組み立てる', () => {
    const wrapper = createWrapper({
      route: { params: { floor_id: 1, room_id: 'r1' }, query: { floor_id: 'f2', room_id: 'r2' } },
    });

    expect(wrapper.vm.roomContextQuery).to.deep.equal({ floor_id: '1', room_id: 'r1' });
  });

  it('入力前はエラーを出さず、submit後は各必須エラーを返す', async () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.validationUsernameError()).to.equal('');
    expect(wrapper.vm.validationMailError()).to.equal('');
    expect(wrapper.vm.validationPasswordError()).to.equal('');

    wrapper.vm.v$.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.validationUsernameError()).to.equal('ユーザ名の入力は必須です');
    expect(wrapper.vm.validationMailError()).to.equal('メールの入力は必須です');
    expect(wrapper.vm.validationPasswordError()).to.equal('パスワードの入力は必須です');
  });

  it('規約未同意なら登録を拒否する', async () => {
    const dispatchCalls = [];
    const wrapper = createWrapper({ store: createStoreMock({ dispatch: (t, p) => dispatchCalls.push({ t, p }) }) });

    wrapper.setData({ username: 'name', mail: 'user@example.com', password: 'password', terms: false });
    await wrapper.vm.$nextTick();

    wrapper.vm.register({ preventDefault: () => {} });

    expect(dispatchCalls.some((call) => call.t === 'doShowSnackbar')).to.equal(true);
  });

  it('Cookieポリシーを表示し必須同意ラベルとaria-labelへ含める', () => {
    const wrapper = createWrapper({
      route: {
        params: { floor_id: 'floor-1', room_id: 'room-1' },
        query: { floor_id: 'ignored-floor', room_id: 'ignored-room' },
      },
    });
    const cookiePolicyLink = wrapper
      .findAllComponents({ name: 'RouterLink' })
      .find((link) => link.attributes('data-testid') === 'register-cookie-policy-link');

    expect(cookiePolicyLink).not.to.equal(undefined);
    expect(cookiePolicyLink.text()).to.equal('Cookieポリシー');
    expect(cookiePolicyLink.props('to')).to.deep.equal({
      name: 'CookiePolicy',
      query: wrapper.vm.roomContextQuery,
    });
    const consentText =
      '利用許諾・著作権・禁止事項・免責事項、プライバシーポリシー及びCookieポリシーに同意する';
    expect(wrapper.get('label[for="terms"]').text()).to.equal(consentText);
    expect(wrapper.get('#terms').attributes('aria-label')).to.equal(consentText);
  });

  it('登録成功で完了ダイアログを開く', async () => {
    authApi.register = () => Promise.resolve({ data: {} });

    const wrapper = createWrapper();
    Object.defineProperty(wrapper.vm, '$route', {
      value: { params: {}, query: {} },
      configurable: true,
    });
    wrapper.setData({ username: 'name', mail: 'user@example.com', password: 'password', terms: true });
    await wrapper.vm.$nextTick();

    wrapper.vm.register({ preventDefault: () => {} });
    await flushPromises();

    expect(wrapper.vm.successDialogVisible).to.equal(true);
    expect(wrapper.vm.username).to.equal('');
    expect(wrapper.vm.mail).to.equal('');
  });

  it('仮登録完了ダイアログは明示タイトルとログインへの単一主要操作を示す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(ConfirmDialogStub);

    expect(dialog.props()).to.include({
      title: 'ユーザ仮登録完了',
      confirmLabel: 'ログインページへ',
      confirmTone: 'primary',
      confirmIcon: 'login',
      confirmTestId: 'register-complete-login',
      initialFocus: "[data-testid='register-complete-login']",
      actionsAdjacent: true,
    });
    expect(dialog.props('cancelLabel')).to.equal(undefined);
  });

  it('クエリに room_id がある場合は登録データに含める', async () => {
    const calls = [];
    authApi.register = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: {} });
    };

    const wrapper = createWrapper({ route: { params: {}, query: { room_id: ' room-1 ' } } });
    wrapper.setData({ username: 'name', mail: 'user@example.com', password: 'password', terms: true });
    await wrapper.vm.$nextTick();

    wrapper.vm.register({ preventDefault: () => {} });
    await flushPromises();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0]).to.deep.equal({
      username: 'name',
      mail: 'user@example.com',
      password: 'password',
      lang: 'en',
      room_id: 'room-1',
    });
  });

  it('登録失敗時はalertのスナックバーを表示しsendingを解除する', async () => {
    authApi.register = () => Promise.reject({ response: { status: 500 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      store: createStoreMock({ dispatch: (type, payload) => dispatchCalls.push({ type, payload }) }),
    });
    wrapper.setData({ username: 'name', mail: 'user@example.com', password: 'password', terms: true });
    await wrapper.vm.$nextTick();

    wrapper.vm.register({ preventDefault: () => {} });
    await flushPromises();

    const snackbar = dispatchCalls.find((call) => call.type === 'doShowSnackbar');
    expect(snackbar).to.not.equal(undefined);
    expect(snackbar.payload.role).to.equal('alert');
    expect(snackbar.payload.message).to.include('ユーザ登録に失敗しました');
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('sending中はregister APIを再実行しない', async () => {
    const calls = [];
    authApi.register = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: {} });
    };
    const wrapper = createWrapper();
    wrapper.setData({ username: 'name', mail: 'user@example.com', password: 'password', terms: true, sending: true });
    await wrapper.vm.$nextTick();

    wrapper.vm.register({ preventDefault: () => {} });
    await flushPromises();

    expect(calls).to.have.lengthOf(0);
  });

  it('onPressLoginButton はログイン画面へ遷移する', () => {
    const pushCalls = [];
    const wrapper = createWrapper({
      router: { push: (route) => pushCalls.push(route) },
    });

    wrapper.vm.onPressLoginButton();

    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });
});
