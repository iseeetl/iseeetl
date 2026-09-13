import { expect } from 'vitest';
const { resolveFrontendBaseUrl, resolveBackendBaseUrl } = require('../../e2e/specs/helpers/backend-url');

describe('E2E用バックエンドURLの決定', () => {
  it('E2E専用フロントエンド URLからlocalhostの専用バックエンド URLを解決する', () => {
    expect(resolveFrontendBaseUrl('http://localhost:3100/path')).to.equal('http://localhost:3100');
    expect(resolveFrontendBaseUrl('http://0.0.0.0:3100')).to.equal('http://localhost:3100');
    expect(resolveBackendBaseUrl('http://localhost:3100')).to.equal('http://localhost:5100');
  });

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3100',
    'http://127.0.0.1:5000',
    'https://localhost:3100',
    'https://example.test:8443/path',
  ])('通常開発・バックエンド直指定・外部オリジンを拒否する: %s', (url) => {
    expect(() => resolveFrontendBaseUrl(url)).to.throw(
      'E2E用フロントエンドのURLにはlocalhostの3100番ポートを使用してください。'
    );
    expect(() => resolveBackendBaseUrl(url)).to.throw(
      'E2E用フロントエンドのURLにはlocalhostの3100番ポートを使用してください。'
    );
  });
});
