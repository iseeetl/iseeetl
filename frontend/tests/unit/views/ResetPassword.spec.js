import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import authApi from '@/api/auth';
import ResetPassword from '@/views/ResetPassword.vue';

import flushPromises from '../helpers/flushPromises';

const baseStubs = {
  BackButton: true,
  UiButton: true,
  UiField: true,
  UiIcon: true,
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
  shallowMount(buildViewWithoutLifecycle(ResetPassword), {
    stubs: baseStubs,
    mocks: {
      $store: { dispatch: () => {} },
      $route: overrides.route || { params: { reset_token: 'token' } },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('パスワード再設定画面', () => {
  let originalVerifyToken;
  let originalResetPassword;

  beforeEach(() => {
    originalVerifyToken = authApi.verifyResetPasswordToken;
    originalResetPassword = authApi.resetPassword;
  });

  afterEach(() => {
    authApi.verifyResetPasswordToken = originalVerifyToken;
    authApi.resetPassword = originalResetPassword;
  });

  it('トークン検証中は結果を隠して多重実行を拒否し、成功後にフォームを表示する', async () => {
    const request = createDeferred();
    let requestCount = 0;
    authApi.verifyResetPasswordToken = () => {
      requestCount += 1;
      return request.promise;
    };
    const wrapper = createWrapper();

    const firstRequest = wrapper.vm.verifyPasswordResetToken();
    const duplicateRequest = wrapper.vm.verifyPasswordResetToken();
    await wrapper.vm.$nextTick();

    expect(requestCount).to.equal(1);
    expect(duplicateRequest).to.be.instanceOf(Promise);
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('true');
    expect(wrapper.find('[role="status"]').text()).to.equal('読み込み中です');
    expect(wrapper.find('.password-field').exists()).to.equal(false);
    expect(wrapper.find('[role="alert"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="token-retry"]').exists()).to.equal(false);
    expect(wrapper.findComponent({ name: 'RouterLink' }).exists()).to.equal(false);

    request.resolve();
    await firstRequest;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('false');
    expect(wrapper.vm.isTokenSuccess).to.equal(true);
    expect(wrapper.vm.isTokenError).to.equal(false);
    expect(wrapper.find('.password-field').exists()).to.equal(true);
    expect(wrapper.find('[role="status"]').exists()).to.equal(false);
    expect(wrapper.find('[role="alert"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="token-retry"]').exists()).to.equal(false);
  });

  it('両方のパスワード表示を個別に切り替える', () => {
    const wrapper = createWrapper();

    wrapper.vm.togglePasswordVisibility();
    expect(wrapper.vm.passwordFieldType).to.equal('text');
    expect(wrapper.vm.passwordVisibilityIcon).to.equal('visibility_off');

    wrapper.vm.toggleConfirmPasswordVisibility();
    expect(wrapper.vm.confirmPasswordFieldType).to.equal('text');
    expect(wrapper.vm.confirmPasswordVisibilityIcon).to.equal('visibility_off');
  });

  it('入力前はエラーを出さず、不一致時は確認エラーを返す', async () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.validationPasswordError()).to.equal('');
    expect(wrapper.vm.validationConfirmPasswordError()).to.equal('');

    await wrapper.setData({ password: 'newpass1', confirmPassword: 'different1' });
    wrapper.vm.v$.confirmPassword.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.validationConfirmPasswordError()).to.equal('パスワードと一致しません');
  });

  it('パスワード再設定後にフォームをクリアする', async () => {
    authApi.resetPassword = () => Promise.resolve();

    const wrapper = createWrapper();
    const route = wrapper.vm.$route || {};
    route.params = { reset_token: 'token' };
    Object.defineProperty(wrapper.vm, '$route', { value: route, configurable: true });
    wrapper.setData({ password: 'newpass1', confirmPassword: 'newpass1', isTokenSuccess: true });
    await wrapper.vm.$nextTick();

    await wrapper.vm.resetPassword();
    await flushPromises();

    expect(wrapper.vm.isPasswordResetSuccess).to.equal(true);
    expect(wrapper.vm.password).to.equal(null);
    expect(wrapper.vm.confirmPassword).to.equal(null);
  });

  it('トークン検証失敗後に同じトークンを再検証し、再試行中の重複実行を拒否する', async () => {
    const retryRequest = createDeferred();
    let requestCount = 0;
    authApi.verifyResetPasswordToken = () => {
      requestCount += 1;
      return requestCount === 1 ? Promise.reject({ response: { status: 400 } }) : retryRequest.promise;
    };
    const wrapper = createWrapper();

    await wrapper.vm.verifyPasswordResetToken();
    await wrapper.vm.$nextTick();

    expect(requestCount).to.equal(1);
    expect(wrapper.vm.isTokenError).to.equal(true);
    expect(wrapper.vm.isTokenSuccess).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.find('[role="alert"]').text()).to.include(
      'パスワード再設定リンクが正しくないか、有効期限が切れています。新しいリンクを発行してください。'
    );
    expect(wrapper.find('[data-testid="token-retry"]').exists()).to.equal(true);
    expect(wrapper.findComponent({ name: 'RouterLink' }).props('to')).to.deep.equal({ name: 'Login' });
    expect(wrapper.find('.password-field').exists()).to.equal(false);

    await wrapper.find('[data-testid="token-retry"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(requestCount).to.equal(2);
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('true');
    expect(wrapper.find('[role="status"]').text()).to.equal('読み込み中です');
    expect(wrapper.find('[role="alert"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="token-retry"]').exists()).to.equal(false);
    expect(wrapper.findComponent({ name: 'RouterLink' }).exists()).to.equal(false);
    expect(wrapper.find('.password-field').exists()).to.equal(false);

    await wrapper.vm.verifyPasswordResetToken();
    expect(requestCount).to.equal(2);

    retryRequest.resolve();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.isTokenError).to.equal(false);
    expect(wrapper.vm.isTokenSuccess).to.equal(true);
    expect(wrapper.find('.view-content').attributes('aria-busy')).to.equal('false');
    expect(wrapper.find('.password-field').exists()).to.equal(true);
    expect(wrapper.find('[role="status"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="token-retry"]').exists()).to.equal(false);
  });

  it('resetPassword は入力不正時にAPIを呼ばない', async () => {
    const calls = [];
    authApi.resetPassword = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };
    const wrapper = createWrapper();
    wrapper.setData({ password: 'short', confirmPassword: 'short', isTokenSuccess: true });
    await wrapper.vm.$nextTick();

    await wrapper.vm.resetPassword();
    await flushPromises();

    expect(calls).to.have.lengthOf(0);
  });

  it('resetPassword 失敗時はalertのスナックバーを表示しsendingを解除する', async () => {
    authApi.resetPassword = () => Promise.reject({ response: { status: 500 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: { dispatch: (type, payload) => dispatchCalls.push({ type, payload }) },
      },
    });
    const route = wrapper.vm.$route || {};
    route.params = { reset_token: 'token' };
    Object.defineProperty(wrapper.vm, '$route', { value: route, configurable: true });
    wrapper.setData({ password: 'newpass1', confirmPassword: 'newpass1', isTokenSuccess: true });
    await wrapper.vm.$nextTick();

    await wrapper.vm.resetPassword();
    await flushPromises();

    const snackbar = dispatchCalls.find((call) => call.type === 'doShowSnackbar');
    expect(snackbar).to.not.equal(undefined);
    expect(snackbar.payload.role).to.equal('alert');
    expect(snackbar.payload.message).to.include('パスワード再設定に失敗しました');
    expect(wrapper.vm.sending).to.equal(false);
  });
});
