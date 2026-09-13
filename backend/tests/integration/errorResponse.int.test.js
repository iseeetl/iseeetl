const express = require('express');
const request = require('supertest');

const AppError = require('../../utils/appError');
const Messages = require('../../constants/messages');
const { attachErrorHandler } = require('./_helpers/app');

describe('エラー応答の結合動作', () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      next();
    });

    app.get('/app-error', (req, res, next) => {
      return next(new AppError({ code: 'INVALID_PARAMS' }));
    });
    app.get('/unhandled-error', () => {
      throw new Error('boom');
    });

    return attachErrorHandler(app);
  };

  test('AppErrorの応答本文にrequestIdを含めない', async () => {
    const app = buildApp();
    const res = await request(app).get('/app-error');

    expect(res.status).toBe(400);
    expect(res.body.error.requestId).toBeUndefined();
    expect(res.body.error.code).toBe('INVALID_PARAMS');
    expect(res.body.error.status).toBe(400);
    expect(res.body.error.message).toBe(Messages.INVALID_PARAMS);
    expect(res.body.error.details).toBeUndefined();
  });

  test('未処理エラーの応答本文にrequestIdを含めない', async () => {
    const app = buildApp();
    const res = await request(app).get('/unhandled-error');

    expect(res.status).toBe(500);
    expect(res.body.error.requestId).toBeUndefined();
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.error.status).toBe(500);
    expect(res.body.error.message).toBe(Messages.INTERNAL_SERVER_ERROR);
    expect(res.body.error.details).toBeUndefined();
  });
});
