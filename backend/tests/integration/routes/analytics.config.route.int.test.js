const express = require('express');
const request = require('supertest');

const { attachErrorHandler } = require('../_helpers/app');
const createAnalyticsRoute = require('../../../routes/analytics.route');

const MEASUREMENT_ID = 'G-INTEGRATION01';
const SECRET = 'analytics-config-private-dummy-secret';

const buildApp = ({ enabled = true } = {}) => {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/analytics',
    createAnalyticsRoute({
      capabilities: { googleAnalytics: enabled },
      analyticsConfig: {
        measurementId: enabled ? MEASUREMENT_ID : null,
        userIdSecret: enabled ? SECRET : null,
      },
    })
  );
  return attachErrorHandler(app);
};

describe('アクセス解析の公開設定API', () => {
  test('認証不要でno-store付きのMeasurement IDだけを返す', async () => {
    const response = await request(buildApp())
      .get('/api/analytics/config')
      .query({ include_secret: 'true' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).toEqual({ measurement_id: MEASUREMENT_ID });
    expect(Object.keys(response.body)).toEqual(['measurement_id']);
    expect(response.text).not.toContain(SECRET);
  });

  test('計測機能が無効なら認証と設定公開の前に機能名付きの503を返す', async () => {
    const response = await request(buildApp({ enabled: false }))
      .get('/api/analytics/config')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(503);
    expect(response.body?.error?.code).toBe('EXTERNAL_FEATURE_DISABLED');
    expect(response.body?.error?.details).toEqual({ feature: 'googleAnalytics' });
    expect(response.text).not.toContain(MEASUREMENT_ID);
    expect(response.text).not.toContain(SECRET);
  });
});
