const express = require('express');
const request = require('supertest');
const cookieParser = require('cookie-parser');

const ORIGINAL_GUEST_JWT_SECRET = process.env.GUEST_JWT_SECRET;
const ORIGINAL_GUEST_REFRESH_SECRET = process.env.GUEST_REFRESH_SECRET;

describe('guestのルーティング', () => {
  let app;

  beforeAll(() => {
    process.env.GUEST_JWT_SECRET = 'unit-test-guest-secret';
    process.env.GUEST_REFRESH_SECRET = 'unit-test-guest-refresh-secret';
  });

  afterAll(() => {
    if (ORIGINAL_GUEST_JWT_SECRET === undefined) {
      delete process.env.GUEST_JWT_SECRET;
    } else {
      process.env.GUEST_JWT_SECRET = ORIGINAL_GUEST_JWT_SECRET;
    }

    if (ORIGINAL_GUEST_REFRESH_SECRET === undefined) {
      delete process.env.GUEST_REFRESH_SECRET;
    } else {
      process.env.GUEST_REFRESH_SECRET = ORIGINAL_GUEST_REFRESH_SECRET;
    }
  });

  beforeEach(() => {
    jest.resetModules();
    const guestRoute = require('../../../routes/guest.route');
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/guest', guestRoute);
    app.use((err, req, res, next) => {
      const status = err?.status || err?.statusCode || 500;
      const code = err?.code || 'INTERNAL_SERVER_ERROR';
      res.status(status).json({ error: { code, status } });
      void next;
    });
  });

  test('POST /bootstrap は guest_name/lang を引き継ぎ guest_token を返す', async () => {
    const res = await request(app)
      .post('/api/guest/bootstrap')
      .send({ guest_name: 'GuestName', lang: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.guest_name).toBe('GuestName');
    expect(res.body.lang).toBe('en');
    expect(res.body.guest_token).toBeTruthy();
    expect(res.body.guest_id).toBeTruthy();
    expect(res.headers['set-cookie']?.some((cookie) => cookie.startsWith('guest_refresh='))).toBe(true);
  });

  test('POST /refresh は guest_id を維持したトークンを返す', async () => {
    const bootstrapRes = await request(app)
      .post('/api/guest/bootstrap')
      .send({ guest_name: 'GuestName', lang: 'ja' });

    const cookie = bootstrapRes.headers['set-cookie'];
    const guestId = bootstrapRes.body.guest_id;

    const refreshRes = await request(app).post('/api/guest/refresh').set('Cookie', cookie?.[0] ?? '');

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.guest_id).toBe(guestId);
    expect(refreshRes.body.guest_token).toBeTruthy();
  });

  test('POST /refresh は cookie 無しだと 401', async () => {
    const res = await request(app).post('/api/guest/refresh');

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });
});
