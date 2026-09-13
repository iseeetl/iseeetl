// 送信内容を検証できるよう、直近のリクエストをhttps.__lastに保存する。
jest.mock('https', () => {
  const reqHandlers = {};
  const resHandlers = {};

  const buildReq = () => ({
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event, handler) => {
      reqHandlers[event] = handler;
    }),
    __emit: (event, payload) => {
      if (reqHandlers[event]) reqHandlers[event](payload);
    },
  });

  const buildRes = () => ({
    statusCode: 200,
    resume: jest.fn(),
    on: jest.fn((event, handler) => {
      resHandlers[event] = handler;
    }),
    __emit: (event, payload) => {
      if (resHandlers[event]) resHandlers[event](payload);
    },
  });

  const httpsMock = {
    request: jest.fn((options, cb) => {
      const req = buildReq();
      const res = buildRes();
      httpsMock.__last = { options, req, res, reqHandlers, resHandlers };
      if (typeof cb === 'function') cb(res);
      return req;
    }),
    __last: null,
  };

  return httpsMock;
});
const mockGetOneSignalConfig = jest.fn(() => ({
  restApiKey: 'rest_key_123',
  host: 'api.onesignal.test',
  port: '443',
  path: '/api/v1/notifications',
}));
jest.mock('../../../../config/featureFlags', () => ({
  getOneSignalConfig: mockGetOneSignalConfig,
}));

const https = require('https');
const { dispatchNotification } = require('../../../../integrations/onesignal/notification.client');

describe('OneSignalの通知クライアント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOneSignalConfig.mockReturnValue({
      restApiKey: 'rest_key_123',
      host: 'api.onesignal.test',
      port: '443',
      path: '/api/v1/notifications',
    });
  });

  test('HTTPS のオプション・ヘッダ・ボディが正しく設定される', () => {
    const payload = { app_id: 'app', include_external_user_ids: ['u1'], contents: { en: 'hi' } };

    dispatchNotification(payload);

    const { options, req } = https.__last;
    expect(options).toMatchObject({
      host: 'api.onesignal.test',
      port: '443',
      path: '/api/v1/notifications',
      method: 'POST',
    });
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: 'Basic rest_key_123',
    });

    expect(req.write).toHaveBeenCalledWith(JSON.stringify(payload));
    expect(req.end).toHaveBeenCalled();
  });

  test('レスポンス本文を読み捨てて接続を解放する', () => {
    dispatchNotification({ foo: 'bar' });

    const { res } = https.__last;
    expect(res.resume).toHaveBeenCalledTimes(1);
  });

  test('リクエストのエラーイベントを例外なく処理できる', () => {
    dispatchNotification({ foo: 'bar' });

    const { req } = https.__last;
    expect(() => req.__emit('error', new Error('network error'))).not.toThrow();
  });
});
