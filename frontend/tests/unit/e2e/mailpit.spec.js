import { expect } from 'vitest';

const { resolveMailpitBaseUrl, extractFlowLink, waitForMailpitLink } = require('../../e2e/specs/helpers/mailpit');

describe('E2Eのメール確認（Mailpit）', () => {
  it('Mailpit URLの既定値として専用サービス名を使う', () => {
    expect(resolveMailpitBaseUrl({})).to.equal('http://mailpit:8025');
    expect(resolveMailpitBaseUrl({ E2E_MAILPIT_API_URL: 'http://mailpit:8025/' })).to.equal(
      'http://mailpit:8025'
    );
  });

  it.each(['mailpit', 'localhost', '127.0.0.1', '[::1]'])('専用Mailpitへのローカル接続を許可する: %s', (host) => {
    const url = `http://${host}:8025`;
    expect(resolveMailpitBaseUrl({ E2E_MAILPIT_API_URL: `${url}/` })).to.equal(url);
  });

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:5000',
    'http://localhost:18025',
    'http://127.0.0.2:8025',
    'http://mailpit.example.test:8025',
    'http://example.test:8025',
    'https://localhost:8025',
    'http://user:password@localhost:8025',
    'http://localhost:8025/api',
    'http://localhost:8025?query=value',
    'http://localhost:8025#fragment',
  ])('専用Mailpit API エンドポイント以外を拒否する: %s', (url) => {
    expect(() => resolveMailpitBaseUrl({ E2E_MAILPIT_API_URL: url })).to.throw(
      'mailpitまたはループバックのHTTP・8025番ポート'
    );
  });

  it('期待するフロントエンドオリジンとパスのリンクだけを取得する', () => {
    const text = [
      'https://example.invalid/user/activate/wrong',
      'http://localhost:3000/help',
      'http://localhost:3000/user/activate/expected-token',
    ].join('\n');

    expect(
      extractFlowLink(text, {
        expectedOrigin: 'http://localhost:3000',
        pathPrefix: '/user/activate/',
      })
    ).to.equal('http://localhost:3000/user/activate/expected-token');
  });

  it('対象メールが届くまで404を再試行してリンクを返す', async () => {
    const responses = [
      { status: 404, data: '' },
      {
        status: 200,
        data: 'http://localhost:3000/user/resetpassword/reset-token',
      },
    ];
    const calls = [];
    const httpClient = {
      get: async (url, options) => {
        calls.push({ url, options });
        return responses.shift();
      },
    };
    let currentTime = 0;

    const link = await waitForMailpitLink({
      recipient: 'account@example.invalid',
      expectedOrigin: 'http://localhost:3000',
      pathPrefix: '/user/resetpassword/',
      httpClient,
      timeoutMs: 1000,
      pollIntervalMs: 10,
      now: () => currentTime,
      sleep: async (milliseconds) => {
        currentTime += milliseconds;
      },
    });

    expect(link).to.equal('http://localhost:3000/user/resetpassword/reset-token');
    expect(calls).to.have.length(2);
    expect(calls[0].options.params.query).to.equal('to:account@example.invalid');
  });

  it('本文やトークンを含めずにタイムアウトを報告する', async () => {
    const httpClient = {
      get: async () => ({
        status: 200,
        data: 'http://localhost:3000/user/activate/sensitive-token',
      }),
    };
    let currentTime = 0;

    let caught;
    try {
      await waitForMailpitLink({
        recipient: 'account@example.invalid',
        expectedOrigin: 'http://localhost:3000',
        pathPrefix: '/user/resetpassword/',
        httpClient,
        timeoutMs: 10,
        pollIntervalMs: 10,
        now: () => currentTime,
        sleep: async (milliseconds) => {
          currentTime += milliseconds;
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(Error);
    expect(caught.message).not.to.include('sensitive-token');
  });
});
