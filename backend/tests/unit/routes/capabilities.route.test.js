const request = require('supertest');
const express = require('express');
jest.mock('../../../config/featureFlags', () => ({
  ...jest.requireActual('../../../config/featureFlags'),
  getOneSignalConfig: () => ({ appId: 'public-test-app', restApiKey: 'synthetic-not-public', externalIdSecret: 'synthetic-not-public' }),
  getGoogleLoginConfig: () => ({ clientId: 'synthetic-client.apps.googleusercontent.com', privateValue: 'must-not-leak' }),
}));
const createRoute = require('../../../routes/capabilities.route');
describe('public Google login configuration route', () => {
  test.each([true, false])('works before authentication, enabled=%s', async (enabled) => {
    const app = express();
    app.use('/api/capabilities', createRoute({ capabilities: { googleLogin: enabled } }));
    const response = await request(app).get('/api/capabilities/google-login');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ clientId: enabled ? 'synthetic-client.apps.googleusercontent.com' : '' });
    const flags = await request(app).get('/api/capabilities');
    expect(flags.status).toBe(200);
    expect(Object.keys(flags.body)).toHaveLength(8);
    expect(flags.body.googleLogin).toBe(enabled);
  });
});

describe('public OneSignal configuration',()=>{
 test.each([true,false])('returns public ID only, enabled=%s',async(enabled)=>{
  const app=express();app.use('/api/capabilities',createRoute({capabilities:{oneSignalPush:enabled}}));
  const res=await request(app).get('/api/capabilities/onesignal');expect(res.status).toBe(200);expect(res.body).toEqual({appId:enabled?'public-test-app':''});expect(res.headers['cache-control']).toBe('no-store');
 });
});
