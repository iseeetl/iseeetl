const {
  buildPublicCapabilities,
  createGetCapabilities,
} = require('../../../controllers/capabilities.controller');

describe('機能の利用可否のコントローラ', () => {
  test('公開対象の機能フラグだけを真偽値へ正規化する', () => {
    const capabilities = buildPublicCapabilities({
      googleLogin: true,
      lineLogin: 'true',
      mailDelivery: false,
      oneSignalPush: false,
      googleTranslate: false,
      openaiTranscription: true,
      openaiAnalysis: false,
      googleAnalytics: false,
      internalSecret: 'must-not-leak',
    });

    expect(capabilities).toEqual({
      googleLogin: true,
      lineLogin: false,
      mailDelivery: false,
      oneSignalPush: false,
      googleTranslate: false,
      openaiTranscription: true,
      openaiAnalysis: false,
      googleAnalytics: false,
    });
    expect(Object.isFrozen(capabilities)).toBe(true);
  });

  test('キャッシュを禁止して機能フラグを200のJSONで返す', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const set = jest.fn();
    const handler = createGetCapabilities({ capabilities: {} });

    handler({}, { set, status });

    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      googleLogin: false,
      lineLogin: false,
      mailDelivery: false,
      oneSignalPush: false,
      googleTranslate: false,
      openaiTranscription: false,
      openaiAnalysis: false,
      googleAnalytics: false,
    });
  });

  test('機能設定の注入を必須にする', () => {
    expect(() => createGetCapabilities()).toThrow('createGetCapabilities requires capabilities');
  });
});
