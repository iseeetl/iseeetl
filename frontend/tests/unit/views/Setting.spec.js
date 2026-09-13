import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import Setting from '@/views/Setting.vue';

const buildViewWithoutLifecycle = (view) => ({
  ...view,
  created() {},
  mounted() {},
  beforeUnmount() {},
});

const createWrapper = (overrides = {}) =>
  shallowMount(buildViewWithoutLifecycle(Setting), {
    stubs: { BackButton: true },
    mocks: {
      $router: overrides.router || { push: () => {} },
      $store: overrides.store || { dispatch: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

const createWrapperWithLifecycle = (overrides = {}) =>
  shallowMount(Setting, {
    stubs: { BackButton: true },
    mocks: {
      $router: overrides.router || { push: () => {} },
      $store: overrides.store || { dispatch: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('表示設定画面', () => {
  const settingStorageKey = 'iseeetl_setting';
  let originalSetting;
  let storageRef;

  beforeEach(() => {
    storageRef = window.localStorage;
    originalSetting = storageRef.getItem(settingStorageKey);
  });

  afterEach(() => {
    if (originalSetting === null) {
      storageRef.removeItem(settingStorageKey);
    } else {
      storageRef.setItem(settingStorageKey, originalSetting);
    }
  });

  it('共通見出しと自前UIの決定ボタンを使用する', () => {
    const wrapper = createWrapper();
    const button = wrapper.findComponent({ name: 'UiButton' });

    expect(wrapper.find('h1.view-title').exists()).to.equal(true);
    expect(button.exists()).to.equal(true);
    expect(button.props('appearance')).to.equal('filled');
    expect(button.props('tone')).to.equal('primary');
    expect(wrapper.find('[data-testid="analytics-preference-control"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="setting-cookie-policy-link"]').exists()).to.equal(false);
  });

  it('ローカルストレージから設定を読み込む', () => {
    storageRef.setItem(settingStorageKey, JSON.stringify({ timelineFontFamily: 'Arial', timelineFontSize: '18px' }));

    const wrapper = createWrapper();
    wrapper.vm.loadTimelineSettings();

    expect(wrapper.vm.timelineFontFamily).to.equal('Arial');
    expect(wrapper.vm.timelineFontSize).to.equal('18px');
  });

  it('ローカルストレージが不正JSONでもクラッシュせず既定値を維持する', () => {
    storageRef.setItem(settingStorageKey, '{');

    const wrapper = createWrapper();
    wrapper.vm.loadTimelineSettings();

    expect(wrapper.vm.timelineFontFamily).to.equal(null);
    expect(wrapper.vm.timelineFontSize).to.equal(null);
  });

  it('設定を保存してフロアへ遷移する', () => {
    const pushes = [];
    const wrapper = createWrapper({ router: { push: (route) => pushes.push(route) } });
    Object.defineProperty(wrapper.vm, '$router', {
      value: { push: (route) => pushes.push(route) },
      configurable: true,
    });
    wrapper.setData({ timelineFontFamily: 'Arial', timelineFontSize: '18px' });

    wrapper.vm.saveTimelineSettings();

    const storage = JSON.parse(storageRef.getItem(settingStorageKey));
    expect(storage.timelineFontFamily).to.equal('Arial');
    expect(storage.timelineFontSize).to.equal('18px');
    expect(pushes[0]).to.deep.equal({ name: 'Floor' });
  });

  it('OneSignal 未定義でも設定画面を描画できる', () => {
    const originalOneSignal = window.OneSignal;
    const originalOneSignalDeferred = window.OneSignalDeferred;

    delete window.OneSignal;
    delete window.OneSignalDeferred;

    try {
      const wrapper = createWrapperWithLifecycle();
      expect(wrapper.find('#timeline_font_family').exists()).to.equal(true);
      wrapper.unmount();
    } finally {
      if (typeof originalOneSignal === 'undefined') {
        delete window.OneSignal;
      } else {
        window.OneSignal = originalOneSignal;
      }
      if (typeof originalOneSignalDeferred === 'undefined') {
        delete window.OneSignalDeferred;
      } else {
        window.OneSignalDeferred = originalOneSignalDeferred;
      }
    }
  });
});
