const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');
const { getBaseUrl } = require('../../helpers/login');

const RECOVERY_SELECTOR = '#chunk-load-recovery .chunk-load-recovery';
const RETRY_SELECTOR = `${RECOVERY_SELECTOR} .chunk-load-recovery__panel button`;

const assertRecoveryState = (browser, label) => {
  browser.execute(
    function (recoverySelector, retrySelector) {
      const recovery = document.querySelector(recoverySelector);
      const retry = document.querySelector(retrySelector);
      const host = recovery ? recovery.closest('#chunk-load-recovery') : null;
      const background = Array.from(document.body.children).filter((element) => element !== host);
      const title = recovery && recovery.querySelector('#chunk-load-recovery-title');
      const message = recovery && recovery.querySelector('#chunk-load-recovery-message');
      return {
        found: !!recovery,
        role: recovery ? recovery.getAttribute('role') : '',
        modal: recovery ? recovery.getAttribute('aria-modal') : '',
        activeIsRetry: document.activeElement === retry,
        backgroundCount: background.length,
        isolatedBackgroundCount: background.filter(
          (element) => element.hasAttribute('inert') && element.getAttribute('aria-hidden') === 'true'
        ).length,
        bodyOverflow: document.body.style.overflow,
        documentLanguage: document.documentElement.lang || '',
        title: title ? title.textContent.trim() : '',
        message: message ? message.textContent.trim() : '',
        retry: retry ? retry.textContent.trim() : '',
      };
    },
    [RECOVERY_SELECTOR, RETRY_SELECTOR],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(state.found, `復旧用のダイアログが表示されています（${label}）。`);
      browser.assert.equal(state.role, 'alertdialog', `復旧用のダイアログのroleはalertdialogです（${label}）。`);
      browser.assert.equal(state.modal, 'true', `復旧用のダイアログはモーダルです（${label}）。`);
      browser.assert.ok(state.activeIsRetry, `復旧用の再試行ボタンにフォーカスがあります（${label}）。`);
      browser.assert.ok(state.backgroundCount > 0, `復旧用のダイアログの背景に内容があります（${label}）。`);
      browser.assert.equal(
        state.isolatedBackgroundCount,
        state.backgroundCount,
        `復旧用のダイアログが背景の各ルート要素を操作対象から除外しています（${label}）。`
      );
      browser.assert.equal(state.bodyOverflow, 'hidden', `復旧用のダイアログが背景のスクロールを抑止しています（${label}）。`);
      browser.assert.ok(!!state.documentLanguage, `ドキュメントの言語が設定されています（${label}）。`);
      browser.assert.ok(!!state.title && !!state.message && !!state.retry, `復旧用の文言が翻訳されています（${label}）。`);
    }
  );
};

module.exports = {
  '読込エラーの復旧ダイアログ内にフォーカスを留め、背面の操作を防ぐ': (browser) => {
    const base = getBaseUrl(browser).replace(/\/$/, '');
    browser
      .url(`${base}/login`)
      .waitForElementVisible('#app', 10000)
      .waitForElementVisible('#mail', 10000)
      .execute(
        function () {
          const focusTarget = document.querySelector('#mail');
          if (focusTarget) focusTarget.focus();
          try {
            Object.defineProperty(Navigator.prototype, 'onLine', {
              configurable: true,
              get: () => false,
            });
          } catch (_error) {
            return { triggered: false, reason: 'navigator-online-not-overridable' };
          }
          const event = new Event('vite:preloadError', { bubbles: false, cancelable: true });
          window.dispatchEvent(event);
          return { triggered: event.defaultPrevented, reason: '' };
        },
        [],
        (result) => {
          const state = result && result.value ? result.value : { triggered: false, reason: 'execute-failed' };
          browser.assert.ok(state.triggered, `チャンク読み込み失敗の復旧イベントを処理しました（${state.reason || 'ok'}）。`);
        }
      )
      .waitForElementVisible(RECOVERY_SELECTOR, 10000)
      .waitForElementVisible(RETRY_SELECTOR, 10000);

    assertRecoveryState(browser, '初期状態');
    assertAccessibilityIntegrity(browser, {
      rootSelector: '#chunk-load-recovery',
      label: 'チャンク読み込み失敗からの復旧',
      checkControlNames: true,
    });

    browser.keys(browser.Keys.TAB);
    assertRecoveryState(browser, 'Tabキーでフォーカスが循環');
    browser.keys([browser.Keys.SHIFT, browser.Keys.TAB, browser.Keys.NULL]);
    assertRecoveryState(browser, 'Shift+Tabキーでフォーカスが循環');

    browser.execute(
      function () {
        const outside = document.querySelector('#mail');
        if (outside) outside.focus();
      },
      []
    );
    assertRecoveryState(browser, '外部へ移ったフォーカスを戻す');
    browser.end();
  },
};
