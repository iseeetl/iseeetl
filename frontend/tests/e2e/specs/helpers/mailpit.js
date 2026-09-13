const axios = require('axios');

const DEFAULT_MAILPIT_API_URL = 'http://mailpit:8025';
const MAILPIT_HOSTS = ['mailpit', 'localhost', '127.0.0.1', '[::1]'];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const resolveMailpitBaseUrl = (environment = process.env) => {
  const configured = String(environment.E2E_MAILPIT_API_URL || DEFAULT_MAILPIT_API_URL).trim();
  let parsed;
  try {
    parsed = new URL(configured);
  } catch (_) {
    throw new Error('E2E用MailpitのAPI URLが不正です。');
  }
  const isDedicatedLocalApi =
    parsed.protocol === 'http:' &&
    MAILPIT_HOSTS.includes(parsed.hostname) &&
    parsed.port === '8025' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.pathname === '/' &&
    parsed.search === '' &&
    parsed.hash === '';
  if (!isDedicatedLocalApi) {
    throw new Error('E2E用MailpitのAPI URLにはmailpitまたはループバックのHTTP・8025番ポートを指定してください。');
  }
  return parsed.origin;
};

const resolveStatus = (error) => {
  const status = error && error.response ? Number(error.response.status) : 0;
  return Number.isFinite(status) && status > 0 ? status : null;
};

const mailpitFailure = (operation, error) => {
  const status = resolveStatus(error);
  return status ? `${operation}に失敗しました（HTTP ${status}）。` : `${operation}に失敗しました。`;
};

const ensureMailpitAvailable = async ({ baseUrl = resolveMailpitBaseUrl(), httpClient = axios } = {}) => {
  try {
    await httpClient.get(`${baseUrl}/api/v1/info`, { timeout: 5000 });
  } catch (error) {
    throw new Error(mailpitFailure('E2E用メールボックスの稼働確認', error));
  }
};

const clearMailpit = async ({ baseUrl = resolveMailpitBaseUrl(), httpClient = axios } = {}) => {
  try {
    await httpClient.delete(`${baseUrl}/api/v1/messages`, { timeout: 5000 });
  } catch (error) {
    throw new Error(mailpitFailure('E2E用メールボックスの初期化', error));
  }
};

const extractFlowLink = (messageText, { expectedOrigin, pathPrefix }) => {
  const normalizedExpectedOrigin = new URL(expectedOrigin).origin;
  const candidates = String(messageText || '').match(/https?:\/\/[^\s<>"')]+/g) || [];

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate.replace(/&amp;/g, '&'));
      if (parsed.origin === normalizedExpectedOrigin && parsed.pathname.startsWith(pathPrefix)) {
        return parsed.toString();
      }
    } catch (_) {
      // メール本文中のURLではない文字列は無視する。
    }
  }
  return null;
};

const waitForMailpitLink = async ({
  recipient,
  expectedOrigin,
  pathPrefix,
  baseUrl = resolveMailpitBaseUrl(),
  httpClient = axios,
  timeoutMs = 20000,
  pollIntervalMs = 400,
  sleep = delay,
  now = Date.now,
}) => {
  if (!recipient || !expectedOrigin || !pathPrefix) {
    throw new Error('E2Eのメール検索には宛先、想定オリジン、パスの接頭辞が必要です。');
  }

  const deadline = now() + timeoutMs;
  const requestUrl = `${baseUrl}/view/latest.html`;
  while (now() <= deadline) {
    let response;
    try {
      response = await httpClient.get(requestUrl, {
        params: { query: `to:${recipient}` },
        responseType: 'text',
        timeout: 5000,
        validateStatus: (status) => status === 200 || status === 404,
      });
    } catch (error) {
      throw new Error(mailpitFailure('E2E用メールの検索', error));
    }

    if (response.status === 200) {
      const link = extractFlowLink(response.data, { expectedOrigin, pathPrefix });
      if (link) return link;
    }

    if (now() >= deadline) break;
    await sleep(pollIntervalMs);
  }

  throw new Error('待機時間内に想定したE2E用メールのリンクを受信できませんでした。');
};

module.exports = {
  resolveMailpitBaseUrl,
  ensureMailpitAvailable,
  clearMailpit,
  extractFlowLink,
  waitForMailpitLink,
};
