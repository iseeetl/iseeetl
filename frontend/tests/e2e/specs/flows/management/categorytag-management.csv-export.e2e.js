const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');

const DOWNLOAD_URL = 'blob:e2e-categorytag-csv';

const openCategoryTagManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/categorytag`;
  navigateToApp(browser, url)
    .waitForElementPresent('#csvupload', 10000)
    .waitForElementVisible('[data-testid="management-categorytag-export"]', 10000)
    .waitForElementVisible('table.management-table', 10000);
};

const installCsvDownloadSpy = (browser, onReady) => {
  browser.execute(
    function (downloadUrl) {
      const state = {
        created: false,
        clicked: false,
        revoked: false,
        readComplete: false,
        readError: '',
        filename: '',
        href: '',
        revokedUrl: '',
        type: '',
        size: 0,
        firstBytes: [],
        content: '',
      };
      window.__categoryTagCsvDownloadSpy = state;

      URL.createObjectURL = function (blob) {
        state.created = true;
        state.type = blob.type;
        state.size = blob.size;

        const reader = new FileReader();
        reader.onload = function (event) {
          const bytes = new Uint8Array(event.target.result);
          state.firstBytes = Array.from(bytes.slice(0, 3));
          const csvBytes = bytes.slice(3);
          state.content = new TextDecoder('utf-8').decode(csvBytes);
          state.readComplete = true;
        };
        reader.onerror = function () {
          state.readError = 'blob-read-failed';
          state.readComplete = true;
        };
        reader.readAsArrayBuffer(blob);

        return downloadUrl;
      };

      URL.revokeObjectURL = function (url) {
        state.revoked = true;
        state.revokedUrl = url;
      };

      HTMLAnchorElement.prototype.click = function () {
        state.clicked = true;
        state.filename = this.download;
        state.href = this.href;
      };

      return { installed: true };
    },
    [DOWNLOAD_URL],
    (result) => {
      const installed = result && result.value ? result.value.installed : false;
      browser.assert.ok(installed, '共通タグのCSVダウンロードを記録する処理を設定しました。');
      onReady();
    }
  );
};

const clickCsvExportButton = (browser, onReady) => {
  browser.execute(
    function () {
      const buttons = Array.from(document.querySelectorAll('[data-testid="management-categorytag-export"]')).filter(
        (node) => node.getClientRects().length && !node.disabled && node.getAttribute('aria-disabled') !== 'true'
      );
      if (buttons.length !== 1) return { clicked: false, reason: 'export-button-not-unique' };
      const button = buttons[0];
      button.click();
      return { clicked: true };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'unknown' };
      if (!state.clicked) {
        browser.assert.ok(false, `共通タグのCSV出力ボタンをクリックできませんでした: ${state.reason}`);
      }
      onReady();
    }
  );
};

const isValidCsvContent = (content) => {
  if (content.length === 0) return true;
  if (!content.endsWith('\r\n')) return false;

  const lines = content.split('\r\n').filter(Boolean);
  return lines.every((line) => /^\d+,(?:"(?:[^"]|"")*"|[^",]*)$/.test(line));
};

const waitForCsvDownload = (browser, finish, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      return (
        window.__categoryTagCsvDownloadSpy || {
          created: false,
          clicked: false,
          revoked: false,
          readComplete: false,
          readError: 'spy-not-found',
        }
      );
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : null;
      const completed = state && state.created && state.clicked && state.revoked && state.readComplete;
      if (!completed && attempt < maxAttempts) {
        browser.pause(300, () => waitForCsvDownload(browser, finish, attempt + 1));
        return;
      }

      browser.assert.ok(completed, '共通タグのCSVダウンロードが完了しました。');
      if (completed) {
        browser.assert.equal(state.readError, '', '共通タグのCSVのBlobをエラーなく読み取りました。');
        browser.assert.equal(state.filename, 'categorytag.csv', '共通タグのCSVファイル名が正しいです。');
        browser.assert.equal(state.href, DOWNLOAD_URL, '共通タグのCSVリンクが生成したObject URLを使用しています。');
        browser.assert.equal(state.revokedUrl, DOWNLOAD_URL, '共通タグのCSVのObject URLを解放しました。');
        browser.assert.equal(state.type, 'text/csv', '共通タグのCSVのBlobの種類が正しいです。');
        browser.assert.ok(state.size >= 3, '共通タグのCSVのBlobに、少なくともUTF-8のBOMが含まれています。');
        browser.assert.equal(state.firstBytes.join(','), '239,187,191', '共通タグのCSVがUTF-8のBOMで始まります。');
        browser.assert.ok(isValidCsvContent(state.content), '共通タグのCSVの行が想定した形式です。');
      }
      finish();
    }
  );
};

module.exports = {
  '共通タグをCSVで出力できる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(browser, 'Category Tag Management CSV Export', ({ finish }) => {
      openCategoryTagManagement(browser);
      installCsvDownloadSpy(browser, () => {
        clickCsvExportButton(browser, () => waitForCsvDownload(browser, finish));
      });
    });
  },
};
