const { clickSingleVisible, clickSingleVisibleAfterExactControls, waitForConfirmDialog } = require('./dialog-focus');

const confirmTimelineDownload = (browser, buttonSelector, spyName) => {
  browser.execute(
    function (selector) {
      const buttons = Array.from(document.querySelectorAll(selector)).filter(
        (button) => button.getClientRects().length && !button.disabled
      );
      const row = buttons.length === 1 ? buttons[0].closest('tr') : null;
      const title = row ? row.querySelector('td') : null;
      return { count: buttons.length, roomTitle: title ? title.textContent.trim() : '' };
    },
    [buttonSelector],
    (result) => {
      const selection = result && result.value ? result.value : {};
      browser.assert.equal(selection.count, 1, 'ルームのダウンロード操作が1件だけあります。');
      browser.assert.ok(!!selection.roomTitle, 'ダウンロード対象のルームを特定しています。');
      if (selection.count !== 1 || !selection.roomTitle) return;
      clickSingleVisible(browser, buttonSelector, 'ダウンロードの推定サイズを取得');
      waitForConfirmDialog(browser, '[data-testid="confirm-dialog"]', 'ダウンロードの推定サイズの確認');
      browser.execute(
        function (name) {
          const dialogs = Array.from(document.querySelectorAll('[data-testid="confirm-dialog"] [role="dialog"]'))
            .filter((dialog) => dialog.getClientRects().length);
          const paragraphs = dialogs.length === 1 ? Array.from(dialogs[0].querySelectorAll('p')) : [];
          return {
            estimateVisible: paragraphs.some((node) => /^概算サイズ: \d+(\.\d+)? (B|KiB|MiB|GiB)$/.test(node.textContent.trim())),
            downloadStarted: !window[name] || window[name].created !== false,
          };
        },
        [spyName],
        (estimateResult) => {
          const state = estimateResult && estimateResult.value ? estimateResult.value : {};
          browser.assert.equal(state.estimateVisible, true, 'ダウンロード前に推定サイズが表示されています。');
          browser.assert.equal(state.downloadStarted, false, 'ダウンロードは確認を待っています。');
        }
      );
      clickSingleVisibleAfterExactControls(browser, {
        rootSelector: '[data-testid="confirm-dialog"] [role="dialog"]',
        expectedControls: [
          { selector: 'h2', property: 'textContent', value: 'ダウンロードの確認' },
          { selector: 'p:first-of-type', property: 'textContent', value: selection.roomTitle },
        ],
        submitSelector: '[data-testid="confirm-dialog-confirm"]',
        label: '選択したルームのダウンロードを確定',
      });
    }
  );
};

module.exports = { confirmTimelineDownload };
