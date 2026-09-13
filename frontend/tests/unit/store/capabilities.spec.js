import { expect } from 'vitest';
import capabilitiesApi from '@/api/capabilities';
import {
  CAPABILITY_KEYS,
  capabilitiesDomain,
  createCapabilitiesState,
  createCapabilityValues,
  normalizeCapabilityValues,
} from '@/store/root/capabilities';

const LEGACY_CAPABILITY_KEYS = Object.freeze([
  'googleLogin',
  'lineLogin',
  'mailDelivery',
  'oneSignalPush',
  'googleTranslate',
  'openaiTranscription',
  'openaiAnalysis',
]);
const EXPECTED_CAPABILITY_KEYS = Object.freeze([...LEGACY_CAPABILITY_KEYS, 'googleAnalytics']);

const enabledCapabilities = () =>
  EXPECTED_CAPABILITY_KEYS.reduce((values, key) => {
    values[key] = true;
    return values;
  }, {});

const legacyCapabilities = () =>
  LEGACY_CAPABILITY_KEYS.reduce((values, key) => {
    values[key] = true;
    return values;
  }, {});

const createState = () => ({ capabilities: createCapabilitiesState() });

const createActionContext = (state) => ({
  commit(type, payload) {
    capabilitiesDomain.mutations[type](state, payload);
  },
});

describe('機能の有効状態の管理', () => {
  it('初期状態は全機能falseかつidleである', () => {
    expect(createCapabilitiesState()).to.deep.equal({
      status: 'idle',
      values: createCapabilityValues(),
    });
    expect([...CAPABILITY_KEYS]).to.deep.equal([...EXPECTED_CAPABILITY_KEYS]);
    expect(Object.keys(createCapabilityValues())).to.deep.equal([...EXPECTED_CAPABILITY_KEYS]);
    expect(Object.values(createCapabilityValues()).every((value) => value === false)).to.equal(true);
  });

  it('8項目の応答と互換用の7項目の応答を真偽値の形式で受け付ける', () => {
    const values = {
      ...enabledCapabilities(),
      lineLogin: false,
      openaiAnalysis: false,
    };
    const legacyValues = { ...values };
    delete legacyValues.googleAnalytics;

    expect(normalizeCapabilityValues(values)).to.deep.equal(values);
    expect(normalizeCapabilityValues(legacyValues)).to.deep.equal({
      ...legacyValues,
      googleAnalytics: false,
    });
    expect(() => normalizeCapabilityValues({ ...values, unknown: true })).to.throw(TypeError);
    expect(() => normalizeCapabilityValues({ ...values, googleLogin: 'true' })).to.throw(TypeError);
    expect(() => normalizeCapabilityValues({ ...values, googleAnalytics: 'true' })).to.throw(TypeError);
    const missing = { ...values };
    delete missing.lineLogin;
    expect(() => normalizeCapabilityValues(missing)).to.throw(TypeError);
  });

  it('旧7項目の取得成功時にgoogleAnalytics=falseを補完してreadyへ保存する', async () => {
    const legacyValues = legacyCapabilities();
    const normalizedValues = { ...legacyValues, googleAnalytics: false };
    vi.spyOn(capabilitiesApi, 'fetchCapabilities').mockResolvedValue({ data: legacyValues });
    const state = createState();

    const result = await capabilitiesDomain.actions.doLoadCapabilities(createActionContext(state));

    expect(result).to.deep.equal(normalizedValues);
    expect(state.capabilities).to.deep.equal({ status: 'ready', values: normalizedValues });
  });

  it('8項目を取得した場合は準備完了として応答値を保存する', async () => {
    const values = enabledCapabilities();
    vi.spyOn(capabilitiesApi, 'fetchCapabilities').mockResolvedValue({ data: values });
    const state = createState();

    const result = await capabilitiesDomain.actions.doLoadCapabilities(createActionContext(state));

    expect(result).to.deep.equal(values);
    expect(state.capabilities).to.deep.equal({ status: 'ready', values });
  });

  it('通信失敗時はエラーと全falseを保存して例外を送出しない', async () => {
    vi.spyOn(capabilitiesApi, 'fetchCapabilities').mockRejectedValue(new Error('timeout'));
    const state = createState();

    const result = await capabilitiesDomain.actions.doLoadCapabilities(createActionContext(state));

    expect(result).to.deep.equal(createCapabilityValues());
    expect(state.capabilities).to.deep.equal({ status: 'error', values: createCapabilityValues() });
  });

  it('スキーマ不正時もエラーと全falseへ戻す', async () => {
    vi.spyOn(capabilitiesApi, 'fetchCapabilities').mockResolvedValue({ data: { googleLogin: true } });
    const state = createState();

    await capabilitiesDomain.actions.doLoadCapabilities(createActionContext(state));

    expect(state.capabilities).to.deep.equal({ status: 'error', values: createCapabilityValues() });
  });

  it('GoogleとOneSignalはバックエンド capabilityとフロントエンド公開IDのANDで判定する', () => {
    const state = createState();
    state.capabilities.status = 'ready';
    state.capabilities.values = enabledCapabilities();
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'google-client-id');
    vi.stubEnv('VITE_ONESIGNAL_APP_ID', 'onesignal-app-id');

    expect(capabilitiesDomain.getters.googleLoginAvailable(state)).to.equal(true);
    expect(capabilitiesDomain.getters.oneSignalPushAvailable(state)).to.equal(true);

    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', '  ');
    vi.stubEnv('VITE_ONESIGNAL_APP_ID', '');
    expect(capabilitiesDomain.getters.googleLoginAvailable(state)).to.equal(false);
    expect(capabilitiesDomain.getters.oneSignalPushAvailable(state)).to.equal(false);
  });

  it('readyの場合だけバックエンドで有効なcapabilityをgetterで公開する', () => {
    const state = createState();
    state.capabilities.status = 'ready';
    state.capabilities.values = {
      ...createCapabilityValues(),
      lineLogin: true,
      mailDelivery: true,
      googleTranslate: true,
      openaiTranscription: true,
      openaiAnalysis: true,
      googleAnalytics: true,
    };

    expect(capabilitiesDomain.getters.capabilityStatus(state)).to.equal('ready');
    expect(capabilitiesDomain.getters.capabilitiesFailed(state)).to.equal(false);
    expect(capabilitiesDomain.getters.lineLoginAvailable(state)).to.equal(true);
    expect(capabilitiesDomain.getters.mailDeliveryAvailable(state)).to.equal(true);
    expect(capabilitiesDomain.getters.googleTranslateAvailable(state)).to.equal(true);
    expect(capabilitiesDomain.getters.openaiTranscriptionAvailable(state)).to.equal(true);
    expect(capabilitiesDomain.getters.openaiAnalysisAvailable(state)).to.equal(true);
    expect(capabilitiesDomain.getters.googleAnalyticsCapabilityEnabled(state)).to.equal(true);

    state.capabilities.status = 'error';
    expect(capabilitiesDomain.getters.capabilitiesFailed(state)).to.equal(true);
    expect(capabilitiesDomain.getters.lineLoginAvailable(state)).to.equal(false);
    expect(capabilitiesDomain.getters.mailDeliveryAvailable(state)).to.equal(false);
    expect(capabilitiesDomain.getters.googleTranslateAvailable(state)).to.equal(false);
    expect(capabilitiesDomain.getters.openaiTranscriptionAvailable(state)).to.equal(false);
    expect(capabilitiesDomain.getters.openaiAnalysisAvailable(state)).to.equal(false);
    expect(capabilitiesDomain.getters.googleAnalyticsCapabilityEnabled(state)).to.equal(false);
  });

  it('旧7項目応答では生のGoogle Analytics capabilityをfalseとして公開する', () => {
    const state = createState();
    state.capabilities.status = 'ready';
    state.capabilities.values = normalizeCapabilityValues(legacyCapabilities());

    expect(capabilitiesDomain.getters.googleAnalyticsCapabilityEnabled(state)).to.equal(false);
  });

  it('生のGoogle Analytics capabilityはreadyかつtrueの場合だけ有効になる', () => {
    const state = createState();

    expect(capabilitiesDomain.getters.googleAnalyticsCapabilityEnabled(state)).to.equal(false);

    state.capabilities.values.googleAnalytics = true;
    state.capabilities.status = 'loading';
    expect(capabilitiesDomain.getters.googleAnalyticsCapabilityEnabled(state)).to.equal(false);

    state.capabilities.status = 'ready';
    expect(capabilitiesDomain.getters.googleAnalyticsCapabilityEnabled(state)).to.equal(true);

    state.capabilities.values.googleAnalytics = false;
    expect(capabilitiesDomain.getters.googleAnalyticsCapabilityEnabled(state)).to.equal(false);

    state.capabilities.status = 'error';
    state.capabilities.values.googleAnalytics = true;
    expect(capabilitiesDomain.getters.googleAnalyticsCapabilityEnabled(state)).to.equal(false);
  });

});
