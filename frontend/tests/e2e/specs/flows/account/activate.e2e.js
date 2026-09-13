// 有効化に成功する経路は、account-lifecycle.e2e.jsで登録メールの取得から検証する。
const { getBaseUrl } = require('../../helpers/login');
const { clickSingleVisible, waitForConfirmDialog } = require('../../helpers/dialog-focus');

const normalizeBase = (base) => base.replace(/\/$/, '');
const CONFIRM_DIALOG_ROOT = '[data-testid="confirm-dialog"]';
const CONFIRM_SELECTOR = `${CONFIRM_DIALOG_ROOT} [role="dialog"] [data-testid="activation-result-next"]:not([disabled])`;

const buildActivateUrl = (browser, token) => {
  const base = getBaseUrl(browser);
  return `${normalizeBase(base)}/user/activate/${encodeURIComponent(token)}`;
};

const waitForUrlMatch = (browser, matcher, label, attempt = 0) => {
  const maxAttempts = 10;
  browser.url((urlResult) => {
    const currentUrl = urlResult && urlResult.value ? urlResult.value : '';
    if (matcher(currentUrl)) {
      browser.assert.ok(true, `URLが${label}に一致しました: ${currentUrl}`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `URLが${label}に一致しません: ${currentUrl}`);
      return;
    }
    browser.pause(500, () => waitForUrlMatch(browser, matcher, label, attempt + 1));
  });
};

const clickConfirm = (browser) => {
  clickSingleVisible(browser, CONFIRM_SELECTOR, 'アカウント有効化の確定');
};

const isTopUrl = (url, base) => {
  const normalized = normalizeBase(base);
  if (!url.startsWith(normalized)) return false;
  const suffix = url.slice(normalized.length);
  return (
    suffix === '' ||
    suffix === '/' ||
    suffix.startsWith('/?') ||
    suffix.startsWith('/floor') ||
    suffix.startsWith('/page')
  );
};

module.exports = {
  '本登録のトークンが無効ならトップへ移動する': (browser) => {
    const base = getBaseUrl(browser);
    const url = buildActivateUrl(browser, 'invalid-token');

    browser.url(url);
    waitForConfirmDialog(browser, CONFIRM_DIALOG_ROOT, 'アカウント有効化の確認ダイアログ');
    clickConfirm(browser);
    waitForUrlMatch(browser, (current) => isTopUrl(current, base), 'top');
    browser.end();
  },
};
