import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import authApi from '@/api/auth';
import SendResetPasswordLink from '@/views/SendResetPasswordLink.vue';

import flushPromises from '../helpers/flushPromises';


const baseStubs = {
  BackButton: true,
  UiButton: true,
  UiField: true,
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    mailDeliveryAvailable: true,
    ...overrides.getters,
  },
  dispatch: overrides.dispatch || (() => {}),
});

const createWrapper = (overrides = {}) =>
  shallowMount(SendResetPasswordLink, {
    stubs: baseStubs,
    mocks: {
      $route: { query: {} },
      $store: overrides.store || createStoreMock(),
      $router: overrides.router || { replace: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('パスワード再設定リンクの送信画面', () => {
  let originalSendLink;

  beforeEach(() => {
    originalSendLink = authApi.sendResetPasswordLink;
  });

  afterEach(() => {
    authApi.sendResetPasswordLink = originalSendLink;
  });

  it.each([
    [{}, false, { name: 'Login', query: {} }],
    [{ floor_id: 'f1', room_id: 'r1' }, false, { name: 'Login', query: { floor_id: 'f1', room_id: 'r1' } }],
    [{ from: 'ChangePassword' }, true, { name: 'ChangePassword' }],
    [{ from: 'ChangePassword' }, false, { name: 'Login', query: {} }],
    [{ from: 'unknown' }, true, { name: 'Login', query: {} }],
  ])('戻り先は開始元とログイン状態から決める（%j・%s）', (query, userIsLogin, expected) => {
    const wrapper = createWrapper({ mocks: { $route: { query } }, store: createStoreMock({ getters: { userIsLogin } }) });
    expect(wrapper.findComponent({ name: 'BackButton' }).props('to')).toEqual(expected);
  });

  it('メール配送が無効ならログインへ戻し送信APIを呼ばない', async () => {
    const replaceCalls = [];
    let apiCalls = 0;
    authApi.sendResetPasswordLink = () => {
      apiCalls += 1;
      return Promise.resolve();
    };
    const wrapper = createWrapper({
      store: createStoreMock({ getters: { mailDeliveryAvailable: false } }),
      router: { replace: (location) => replaceCalls.push(location) },
    });

    expect(wrapper.find('.view').exists()).to.equal(false);
    expect(replaceCalls).to.deep.equal([{ name: 'Login', query: {} }]);

    replaceCalls.length = 0;
    await wrapper.vm.sendResetPasswordLink();

    expect(replaceCalls).to.deep.equal([{ name: 'Login', query: {} }]);
    expect(apiCalls).to.equal(0);
  });

  it('リセットリンク送信後にメール入力をクリアする', async () => {
    authApi.sendResetPasswordLink = () => Promise.resolve();

    const wrapper = createWrapper();
    wrapper.setData({ mail: 'user@example.com' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.sendResetPasswordLink();
    await flushPromises();

    expect(wrapper.vm.mail).to.equal('');
  });

  it('入力前はエラーを出さず、submit後は必須エラーを返す', async () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.validationMailError()).to.equal('');
    wrapper.vm.v$.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.validationMailError()).to.equal('メールの入力は必須です');
  });

  it('入力不正のときはAPIを呼び出さない', async () => {
    const apiCalls = [];
    authApi.sendResetPasswordLink = (payload) => {
      apiCalls.push(payload);
      return Promise.resolve();
    };

    const wrapper = createWrapper();
    wrapper.setData({ mail: '' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.sendResetPasswordLink();
    await flushPromises();

    expect(apiCalls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('429エラー時は上限到達メッセージをalertで表示する', async () => {
    authApi.sendResetPasswordLink = () =>
      Promise.reject({
        response: {
          status: 429,
          data: { message: 'too many requests' },
        },
      });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      store: createStoreMock({
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      }),
    });
    wrapper.setData({ mail: 'user@example.com' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.sendResetPasswordLink();
    await flushPromises();

    const snackbar = dispatchCalls.find((call) => call.type === 'doShowSnackbar');
    expect(snackbar).to.not.equal(undefined);
    expect(snackbar.payload.role).to.equal('alert');
    expect(snackbar.payload.message).to.include('回数上限に達しました。時間をおいて再度お試しください');
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('通常エラー時は失敗メッセージをalertで表示する', async () => {
    authApi.sendResetPasswordLink = () => Promise.reject({ response: { status: 500 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      store: createStoreMock({
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      }),
    });
    wrapper.setData({ mail: 'user@example.com' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.sendResetPasswordLink();
    await flushPromises();

    const snackbar = dispatchCalls.find((call) => call.type === 'doShowSnackbar');
    expect(snackbar).to.not.equal(undefined);
    expect(snackbar.payload.role).to.equal('alert');
    expect(snackbar.payload.message).to.include('パスワード再設定メールの送信に失敗しました');
    expect(wrapper.vm.sending).to.equal(false);
  });
});
