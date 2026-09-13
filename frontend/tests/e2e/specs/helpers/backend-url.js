const E2E_BACKEND_ORIGINS = Object.freeze({
  'http://localhost:3100': 'http://localhost:5100',
});

const resolveFrontendBaseUrl = (frontendBaseUrl) => {
  let parsed;
  try {
    parsed = new URL(String(frontendBaseUrl || '').replace('://0.0.0.0', '://localhost'));
  } catch (_) {
    throw new Error('フロントエンドのURLが不正です。');
  }
  if (!E2E_BACKEND_ORIGINS[parsed.origin]) {
    throw new Error('E2E用フロントエンドのURLにはlocalhostの3100番ポートを使用してください。');
  }
  return parsed.origin;
};

const resolveBackendBaseUrl = (frontendBaseUrl) => E2E_BACKEND_ORIGINS[resolveFrontendBaseUrl(frontendBaseUrl)];

module.exports = { resolveFrontendBaseUrl, resolveBackendBaseUrl };
