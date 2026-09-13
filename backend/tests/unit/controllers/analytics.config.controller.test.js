const {
  createGetAnalyticsConfig,
} = require('../../../controllers/analytics/config.controller');

describe('アクセス解析の公開設定コントローラ', () => {
  test('no-store付きで公開設定の指定項目だけを返す', () => {
    const set = jest.fn();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const handler = createGetAnalyticsConfig({ measurementId: 'G-UNITTEST01' });

    handler({}, { set, status });

    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ measurement_id: 'G-UNITTEST01' });
    expect(Object.keys(json.mock.calls[0][0])).toEqual(['measurement_id']);
  });

  test.each([undefined, null, '', 'UA-12345', 'g-lowercase'])(
    '妥当でないMeasurement ID %sではハンドラを構築しない',
    (measurementId) => {
      expect(() => createGetAnalyticsConfig({ measurementId })).toThrow(
        'createGetAnalyticsConfig requires a valid measurementId'
      );
    }
  );
});
