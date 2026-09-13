import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import GoogleLoginButton from '@/components/login/GoogleLoginButton.vue';

const baseStubs = {};

const createWrapper = (overrides = {}) =>
  shallowMount(GoogleLoginButton, {
    stubs: baseStubs,
    props: { lang: 'ja', oneTap: false, ...(overrides.props || {}) },
    mocks: { $t: (key) => key, ...(overrides.mocks || {}) },
  });

describe('Googleログインボタン', () => {
  let originalGoogle;

  beforeEach(() => {
    originalGoogle = window.google;
  });

  afterEach(() => {
    window.google = originalGoogle;
  });

  it('クライアントIDが未設定なら設定エラーを通知する', async () => {
    const consoleObject =
      (typeof window !== 'undefined' && window.console) || (typeof global !== 'undefined' && global.console);
    const originalConsoleError = consoleObject && consoleObject.error;
    const consoleErrors = [];
    if (consoleObject) {
      consoleObject.error = (...args) => {
        consoleErrors.push(args);
      };
    }
    window.google = {
      accounts: {
        id: {
          initialize: () => {},
          renderButton: () => {},
          prompt: () => {},
        },
      },
    };

    try {
      const wrapper = createWrapper({ props: { oneTap: true, clientId: '' } });
      await wrapper.vm.render();

      expect(wrapper.emitted().error.length).to.be.at.least(1);
      expect(wrapper.emitted().error[0][0].code).to.equal('GOOGLE_OAUTH_CLIENT_ID_MISSING');
      expect(wrapper.emitted().error[0][0].message).to.include('VITE_GOOGLE_OAUTH_CLIENT_ID');
      expect(consoleErrors.length).to.be.at.least(1);
    } finally {
      if (consoleObject) {
        consoleObject.error = originalConsoleError;
      }
    }
  });

  it('クライアントIDがあればGoogle SDKを初期化してボタンを描画する', async () => {
    const calls = { initialize: [], renderButton: [] };
    window.google = {
      accounts: {
        id: {
          initialize: (options) => calls.initialize.push(options),
          renderButton: (host, options) => {
            calls.renderButton.push([host, options]);
            host.appendChild(document.createElement('span'));
          },
          prompt: () => {},
        },
      },
    };

    const wrapper = createWrapper({ props: { clientId: ' client-id ' } });
    await wrapper.vm.render();

    expect(calls.initialize).to.have.lengthOf(1);
    expect(calls.initialize[0].client_id).to.equal('client-id');
    expect(calls.renderButton).to.have.lengthOf(1);
  });

  it('表示先に子要素がある場合は描画しない', async () => {
    const calls = { render: 0 };

    window.google = {
      accounts: {
        id: {
          renderButton: () => {
            calls.render += 1;
          },
        },
      },
    };

    const wrapper = createWrapper();
    const host = wrapper.vm.$refs.host;
    host.appendChild(document.createElement('span'));
    await wrapper.vm.render();

    expect(calls.render).to.equal(0);
  });

  it('ensureGsiLoaded が失敗した場合はエラーを通知する', async () => {
    const consoleObject =
      (typeof window !== 'undefined' && window.console) || (typeof global !== 'undefined' && global.console);
    const originalConsoleError = consoleObject && consoleObject.error;
    const consoleErrors = [];
    if (consoleObject) {
      consoleObject.error = (...args) => {
        consoleErrors.push(args);
      };
    }
    try {
      const wrapper = createWrapper();
      const err = new Error('load failed');
      wrapper.vm.ensureGsiLoaded = () => Promise.reject(err);

      await wrapper.vm.render();

      expect(wrapper.emitted().error[0][0]).to.equal(err);
      expect(consoleErrors.length).to.be.at.least(1);
    } finally {
      if (consoleObject) {
        consoleObject.error = originalConsoleError;
      }
    }
  });
});
