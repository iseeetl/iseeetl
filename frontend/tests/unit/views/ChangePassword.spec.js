import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import userApi from '@/api/user';
import ChangePassword from '@/views/ChangePassword.vue';

import flushPromises from '../helpers/flushPromises';


const baseStubs = {
  BackButton: true,
  UiButton: true,
  UiField: true,
  UiIcon: true,
  'router-link': true,
};

const createWrapper = (overrides = {}) =>
  shallowMount(ChangePassword, {
    stubs: baseStubs,
    mocks: {
      $store: { getters: { mailDeliveryAvailable: true }, dispatch: () => {} },
      $router: { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('パスワード変更画面', () => {
  let originalChangePassword;

  beforeEach(() => {
    originalChangePassword = userApi.changePassword;
  });

  afterEach(() => {
    userApi.changePassword = originalChangePassword;
  });

  it('メール配送が無効でも変更フォームを維持し再設定リンクだけ隠す', () => {
    const wrapper = createWrapper({
      mocks: { $store: { getters: { mailDeliveryAvailable: false }, dispatch: () => {} } },
    });

    expect(wrapper.find('.view').exists()).to.equal(true);
    expect(wrapper.find('router-link-stub').exists()).to.equal(false);
  });

  it('パスワード表示切り替えで入力タイプが変わる', () => {
    const wrapper = createWrapper();
    wrapper.vm.toggleOldPasswordVisibility();
    expect(wrapper.vm.oldPasswordFieldType).to.equal('text');

    wrapper.vm.toggleNewPasswordVisibility();
    expect(wrapper.vm.newPasswordFieldType).to.equal('text');

    wrapper.vm.toggleConfirmPasswordVisibility();
    expect(wrapper.vm.confirmPasswordFieldType).to.equal('text');
  });

  it('入力前はエラーを出さず、不一致時は確認エラーを返す', async () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.validationPasswordError('oldPassword')).to.equal('');
    expect(wrapper.vm.validationConfirmPasswordError()).to.equal('');

    await wrapper.setData({ newPassword: 'newpass1', confirmPassword: 'different1' });
    wrapper.vm.v$.confirmPassword.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.validationConfirmPasswordError()).to.equal('新しいパスワードと一致しません');
  });

  it('変更送信後に入力欄をクリアする', async () => {
    const calls = [];
    const dispatchCalls = [];
    userApi.changePassword = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: {} });
    };

    const wrapper = createWrapper({
      mocks: {
        $store: {
          getters: { mailDeliveryAvailable: true },
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
        },
      },
    });
    wrapper.setData({
      oldPassword: 'oldpass1',
      newPassword: 'newpass1',
      confirmPassword: 'newpass1',
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.changePassword();
    await flushPromises();

    expect(calls).to.deep.equal([{ old_password: 'oldpass1', new_password: 'newpass1' }]);
    expect(dispatchCalls).to.deep.include({
      type: 'doLogout',
      payload: undefined,
    });
    expect(wrapper.vm.oldPassword).to.equal('');
    expect(wrapper.vm.newPassword).to.equal('');
    expect(wrapper.vm.confirmPassword).to.equal('');
  });

  it('ログアウト完了を待ってログイン画面へ遷移し、トークンを更新しない', async () => {
    userApi.changePassword = () => Promise.resolve({ data: {} });
    let finishLogout;
    const logout = new Promise((resolve) => { finishLogout = resolve; });
    const events = [];
    const wrapper = createWrapper({ mocks: {
      $store: { getters: { mailDeliveryAvailable: true }, dispatch: (type) => {
        events.push(type);
        if (type === 'doLogout') return logout;
      } },
      $router: { push: (target) => events.push(target) },
    } });
    await wrapper.setData({ oldPassword: 'oldpass1', newPassword: 'newpass1', confirmPassword: 'newpass1' });
    const pending = wrapper.vm.changePassword();
    await flushPromises();
    expect(events).to.deep.equal(['doLogout']);
    finishLogout();
    await pending;
    expect(events[1]).to.deep.equal({ name: 'Login' });
    expect(events).not.to.include('doUpdateUserToken');
  });

  it('確認用パスワードが一致しなければAPIを呼ばない', async () => {
    const calls = [];
    userApi.changePassword = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };

    const wrapper = createWrapper();
    wrapper.setData({
      oldPassword: 'oldpass1',
      newPassword: 'newpass1',
      confirmPassword: 'different1',
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.changePassword();
    await flushPromises();

    expect(calls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('sending中はAPIを再実行しない', async () => {
    const calls = [];
    userApi.changePassword = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };

    const wrapper = createWrapper();
    wrapper.setData({
      oldPassword: 'oldpass1',
      newPassword: 'newpass1',
      confirmPassword: 'newpass1',
      sending: true,
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.changePassword();
    await flushPromises();

    expect(calls).to.have.lengthOf(0);
  });

  it('API失敗時はalertのスナックバーを表示しsendingを解除する', async () => {
    userApi.changePassword = () => Promise.reject({ response: { status: 500 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: {
          getters: { mailDeliveryAvailable: true },
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
        },
      },
    });
    wrapper.setData({
      oldPassword: 'oldpass1',
      newPassword: 'newpass1',
      confirmPassword: 'newpass1',
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.changePassword();
    await flushPromises();

    const snackbar = dispatchCalls.find((call) => call.type === 'doShowSnackbar');
    expect(snackbar).to.not.equal(undefined);
    expect(snackbar.payload.role).to.equal('alert');
    expect(snackbar.payload.message).to.include('パスワード変更に失敗しました');
    expect(wrapper.vm.sending).to.equal(false);
  });
});
