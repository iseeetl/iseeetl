const { exchangeLineToken, verifyLineIdToken, fetchLineDisplayName } = require('../../../../integrations/line/login.client');

beforeEach(() => jest.spyOn(global, 'fetch').mockRejectedValue(new Error('unexpected fixture request')));
afterEach(() => jest.restoreAllMocks());

test('認可コード交換で必要なフォーム項目をエンコードして1回だけ送る', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ id_token: 'dummy-id', access_token: 'dummy-access' }) });
  await expect(exchangeLineToken({
    code: 'dummy+code', clientId: 'dummy-client', clientSecret: 'dummy-secret',
    redirectUri: 'https://example.com/callback?lang=ja',
  })).resolves.toEqual({ id_token: 'dummy-id', access_token: 'dummy-access' });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, request] = global.fetch.mock.calls[0];
  expect(url).toBe('https://api.line.me/oauth2/v2.1/token');
  expect(request.method).toBe('POST');
  expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
    grant_type: 'authorization_code', code: 'dummy+code', client_id: 'dummy-client',
    client_secret: 'dummy-secret', redirect_uri: 'https://example.com/callback?lang=ja',
  });
});

test('IDトークンとclient IDを検証先へ渡す', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ sub: 'line-fixture', nonce: 'dummy-nonce' }) });
  await expect(verifyLineIdToken({ id_token: 'dummy+token', clientId: 'dummy-client' }))
    .resolves.toEqual({ sub: 'line-fixture', nonce: 'dummy-nonce' });
  const [url, request] = global.fetch.mock.calls[0];
  expect(url).toBe('https://api.line.me/oauth2/v2.1/verify');
  expect(Object.fromEntries(new URLSearchParams(request.body)))
    .toEqual({ id_token: 'dummy+token', client_id: 'dummy-client' });
});

test('検証先が拒否した場合は認証エラーとし、再試行しない', async () => {
  global.fetch.mockResolvedValue({ ok: false });
  await expect(verifyLineIdToken({ id_token: 'invalid-dummy', clientId: 'dummy-client' }))
    .rejects.toMatchObject({ code: 'INVALID_PERMISSION' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('コードや設定の不足は外部送信前に拒否する', async () => {
  await expect(exchangeLineToken({ code: '' })).rejects.toMatchObject({ code: 'INVALID_PERMISSION' });
  await expect(exchangeLineToken({ code: 'dummy-code', clientId: 'dummy-client' }))
    .rejects.toMatchObject({ code: 'LINE_LOGIN_NOT_CONFIGURED' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('任意プロフィールの取得失敗時は既存の表示名を維持する', async () => {
  global.fetch.mockRejectedValue(new Error('fixture connection failure'));
  await expect(fetchLineDisplayName({ access_token: 'dummy-access', fallback: '既存の名前' }))
    .resolves.toBe('既存の名前');
  global.fetch.mockResolvedValue({ ok: false });
  await expect(fetchLineDisplayName({ access_token: 'dummy-access', fallback: '既存の名前' }))
    .resolves.toBe('既存の名前');
});
