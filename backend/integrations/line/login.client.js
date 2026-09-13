const AppError = require('../../utils/appError');

const LINE_TOKEN_ENDPOINT = 'https://api.line.me/oauth2/v2.1/token';
const LINE_VERIFY_ENDPOINT = 'https://api.line.me/oauth2/v2.1/verify';

exports.exchangeLineToken = async ({ code, clientId, clientSecret, redirectUri }) => {
  if (!code) throw new AppError({ code: 'INVALID_PERMISSION' });
  if (!clientId || !clientSecret || !redirectUri) throw new AppError({ code: 'LINE_LOGIN_NOT_CONFIGURED' });
  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('redirect_uri', redirectUri);
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);
  const resp = await fetch(LINE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!resp.ok) throw new AppError({ code: 'INVALID_PERMISSION' });
  const json = await resp.json();
  return { id_token: json.id_token, access_token: json.access_token };
};
exports.verifyLineIdToken = async ({ id_token, clientId }) => {
  if (!id_token) throw new AppError({ code: 'INVALID_PERMISSION' });
  const v = new URLSearchParams();
  v.set('id_token', id_token);
  v.set('client_id', clientId);
  const resp = await fetch(LINE_VERIFY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: v.toString(),
  });
  if (!resp.ok) throw new AppError({ code: 'INVALID_PERMISSION' });
  return await resp.json();
};
// プロフィール取得失敗時は従来の表示名を返す。
exports.fetchLineDisplayName = async ({ access_token, fallback }) => {
  if (!access_token) return fallback || null;
  try {
    const resp = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!resp.ok) return fallback || null;
    const json = await resp.json();
    return json && json.displayName ? String(json.displayName).trim() : fallback || null;
  } catch (_error) {
    return fallback || null;
  }
};
